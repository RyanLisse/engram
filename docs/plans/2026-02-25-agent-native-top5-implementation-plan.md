---
title: "feat: Agent-Native Top 5 Implementation Plan"
type: feat
date: 2026-02-25
status: ready
source: docs/brainstorms/2026-02-25-agent-native-top5-design.md
phases: 5
---

# Agent-Native Top 5 — Implementation Plan

## Overview

Implement the five high-impact recommendations from the agent-native audit to move Engram from 53% to 80%+ agent-native. Work is ordered by design doc: (1) UI integration, (2) new tools parity + CRUD, (3) context/discovery, (4) emit for mutations, (5) prompt-native config.

**Input:** `docs/brainstorms/2026-02-25-agent-native-top5-design.md`

---

## Phase 1: UI Integration (Dashboard sees store/observe/recall)

**Goal:** Fix event type mapping and polling so the dashboard event stream shows `fact_stored` and `recall` with correct counts.

### 1.1 Event type field and normalization (MCP server)

**File:** `mcp-server/src/index.ts`

- In the event-bus poll callback (where result is mapped), use `e.eventType` instead of `e.type`.
- Add a small normalizer so dashboard and subscription filters work:
  - `fact.stored` → `fact_stored`
  - `recall_completed` → `recall`
  - Pass through `eventType` for any other values (e.g. `signal_recorded`, `session_ended` once added).
- Emit the normalized `type` on the EngramEvent so SSE and `context-primitives` (get_activity_stats) see it.

**Current code (approx. lines 64–73):**
```ts
return (result?.events ?? []).map((e: any) => ({
  type: e.type ?? "unknown",
  ...
}));
```
**Change to:** Read `rawType = e.eventType ?? e.type ?? "unknown"`, then `type: normalizeEventType(rawType)` where `normalizeEventType` implements the mapping above.

### 1.2 Polling when dashboard connects (event bus + SSE)

**File:** `mcp-server/src/lib/event-bus.ts`

- Add **polling consumer** API so the SSE server can keep polling active when only the dashboard is connected:
  - `addPollingConsumer(id: string): void` — increment internal consumer count; if first consumer, call existing `schedulePoll()` logic (or ensure polling runs).
  - `removePollingConsumer(id: string): void` — decrement; if zero, call `pauseIfIdle()`.
- Change `hasActiveListeners()` to `true` when either `listenerCount("event") > 0` **or** polling consumer count > 0.
- Add a private `pollingConsumerCount = 0` and guard it so only these two methods change it.

**File:** `mcp-server/src/lib/sse-server.ts`

- When handling `GET /events/:agentId`: after registering the `agent:${agentId}` handler, call `eventBus.addPollingConsumer("sse:" + agentId)` (or a unique id per connection).
- In the `req.on("close")` cleanup, call `eventBus.removePollingConsumer("sse:" + agentId)` (same id used at connect).

**Result:** Dashboard SSE connection alone will trigger Convex polling; events will flow to `agent:${agentId}` and display with correct types.

### 1.3 Dashboard event type handling (optional)

**File:** `dashboard/src/app/page.tsx` (or wherever event stream is rendered)

- Ensure stats use `event.type === "fact_stored"` and `event.type === "recall"` (and optionally accept `fact.stored` / `recall_completed` during transition). After Phase 1.1, only normalized names will be sent.

### Verification

- Start MCP server with `ENGRAM_SSE_PORT` set; open dashboard; trigger `memory_store_fact` and `memory_recall` from CLI or another client. Dashboard should show "Facts Stored" and "Recalls" incrementing and events with type `fact_stored` / `recall`.

---

## Phase 2: New MCP Tools (Parity + CRUD)

**Goal:** Add missing tools so agents can achieve the same outcomes as CLI; add delete/update where entities are agent-managed.

### 2.1 Parity tools (Convex client already has the functions)

Add MCP tool handlers and registry entries. Resolve scope/agent as in existing tools (e.g. kv-store, memory-blocks). All call existing convex-client methods.

| Tool | Handler / Convex client | Registry entry file | Notes |
|------|-------------------------|---------------------|--------|
| `memory_list_scope_policies` | `convex.listScopePolicies(scopeId)` | events-entries or new scope-entries | Args: scopeId (optional, resolve to default). Return list of policies. |
| `memory_create_scope` | `convex.createScope(...)` | scope-entries or lifecycle | Args: name, description, members, readPolicy, writePolicy, retentionDays?. |
| `memory_create_session` | `convex.createSession(...)` | lifecycle or sessions-entries | Args: contextSummary, parentSession?, nodeId?; agentId from context. |
| `memory_create_conversation` | `convex.createConversation(...)` | lifecycle or new conversations-entries | Args: sessionId, participants, contextSummary, tags, importance?. |
| `memory_add_fact_to_conversation` | `convex.addFactToConversation(...)` | same | Args: conversationId, factId. |
| `memory_add_handoff` | `convex.addHandoff(...)` | same | Args: conversationId, fromAgent, toAgent, contextSummary. |

**Implementation:**

- **New file (recommended):** `mcp-server/src/tools/scope-session-conversation.ts` — thin handlers that resolve scope/agent and call convex-client. Zod schemas for each tool.
- **New registry file:** `mcp-server/src/lib/tool-registry/parity-entries.ts` (or add to lifecycle-entries / events-entries). Register the 6 tools and add to index + discovery categories.

Convex paths and client methods already exist: `PATHS.config.listScopePolicies`, `PATHS.scopes.create`, `PATHS.sessions.create`, `PATHS.conversations.create`, `PATHS.conversations.addFact`, `PATHS.conversations.addHandoff`.

### 2.2 CRUD: Delete / Update tools

**Backend (Convex) — add if missing:**

- **Episodes:** Add `deleteEpisode` mutation in `convex/functions/episodes.ts` (delete by episodeId; check scope/agent if needed). Add to PATHS and convex-client.
- **Memory blocks:** Add `blockDelete` mutation in `convex/functions/memoryBlocks.ts` (by scopeId + label, or blockId). Add to PATHS and convex-client memory-blocks.
- **Agents:** Add `updateAgent` mutation in `convex/functions/agents.ts` (agentId, name?, capabilities?, defaultScope?, telos?, settings?) for agent-updatable fields. Add to PATHS and convex-client.

**Existing:** `themes.update`, `subspaces.deleteSubspace` — ensure PATHS and convex-client expose them (themes: update; subspaces: deleteSubspace).

**MCP tools to add:**

| Tool | Convex | Handler |
|------|--------|---------|
| `memory_delete_episode` | episodes.deleteEpisode | episodes.ts or new file; args episodeId, agentId from context. |
| `memory_delete_subspace` | subspaces.deleteSubspace | subspace tool handler; args subspaceId or name+scopeId. |
| `memory_block_delete` | memoryBlocks.blockDelete | memory-blocks.ts; args label, scopeId?. |
| `memory_update_theme` | themes.update | lifecycle or themes; args themeId, name?, description?, factIds?, entityIds?, importance?. |
| `memory_update_agent` | agents.updateAgent | admin or agents; args agentId?, name?, capabilities?, defaultScope?, telos?, settings?. |

**Files to create/update:**

- Convex: `episodes.ts` (deleteEpisode), `memoryBlocks.ts` (blockDelete), `agents.ts` (updateAgent).
- MCP: convex-paths.ts, convex-client (episodes, memory-blocks, agents-scopes), tool handlers, registry entries. discovery-entries categories if new group.

### Verification

- For each new tool, call from CLI or MCP tester; verify Convex state changes. `bd`/`bv` or manual checklist.

---

## Phase 3: Context and Discovery (Single full-block contract + capability hint)

**Goal:** One canonical “full system prompt” source; `memory_get_system_prompt` and optionally `memory_get_agent_context` return it; add one-line capability hint.

### 3.1 memory_get_system_prompt returns full block

**File:** `mcp-server/src/tools/admin-primitives.ts`

- Replace the current short template (`You are ${name}. Telos: ...`) with a call to the same builder used by `memory_build_system_prompt`.
- Import `buildFullSystemPrompt` (or equivalent) from `system-prompt-builder.ts`; call it with agentId and a default token budget (e.g. 4000). Return `{ prompt: result.prompt }` (or the shape the tool currently returns).

**File:** `mcp-server/src/tools/system-prompt-builder.ts`

- Ensure `buildFullSystemPrompt` is exported and can be called with (agentId, options?: { tokenBudget?: number }). If it currently only runs via the tool, refactor so both the build_system_prompt tool and get_system_prompt can call it.

### 3.2 memory_get_agent_context and systemPromptBlock

**Decision (from design):** Either add `systemPromptBlock` to get_agent_context by calling buildFullSystemPrompt, or document that the full block is only from memory_build_system_prompt / memory_get_system_prompt.

**Option A (implement):** In `getAgentContext`, after assembling agent/permittedScopes/systemHealth, call buildFullSystemPrompt(agentId, { tokenBudget: 2000 }) and add `systemPromptBlock: result.prompt` to the return object. Document that this may be large.

**Option B (document only):** In AGENTS.md, HOOKS.md, and API reference, state that `memory_get_agent_context` does not return a prompt string; use `memory_get_system_prompt` or `memory_build_system_prompt` for the full block.

**Recommendation:** Option A for consistency; use a smaller token budget (e.g. 2000) for the context response to avoid huge payloads.

### 3.3 Capability hint in builder

**File:** `mcp-server/src/tools/system-prompt-builder.ts`

- In the section that builds the final prompt string (or a “Discovery” section), append a single line: “To list all memory tools, use memory_list_capabilities.” Optional: “N tools in M categories” (read from tool registry length/categories).

### 3.4 Session-start and full prompt (document or implement)

- **Document:** In docs (HOOKS.md, GETTING-STARTED), state that session-start injects identity/scopes/notifications only; for the full system prompt block, the client should call `memory_get_system_prompt` or `memory_build_system_prompt` and inject the result.
- **Optional implement:** If session-start runs in an environment that can call the MCP server, have it call `memory_get_system_prompt` and inject the returned prompt; otherwise leave as-is and document.

### Verification

- Call `memory_get_system_prompt`; response should be the full block (identity, pinned, activity, config, workspace, notifications, handoffs, capability hint). Call `memory_get_agent_context`; if Option A, response should include `systemPromptBlock` with the same content (or a slim variant).

---

## Phase 4: Emit Events for Mutations

**Goal:** Convex writes to `memory_events` for high-value mutations so the event bus can stream them to the dashboard.

### 4.1 Convex events.emit usage

- Convex already has `memory_events` and an emit path. Determine how mutations currently emit (e.g. `internal.functions.events.emit` or a public mutation). The MCP server uses HTTP, so only **public** Convex mutations/actions can be called from the MCP server. If emit is internal-only, either:
  - Add a public Convex action or mutation that accepts (eventType, payload) and inserts into `memory_events` and is callable from HTTP, or
  - Have each mutation that should emit call a shared internal helper that inserts into `memory_events` (same process as today for `fact.stored`).

### 4.2 Mutations that must emit

| Mutation / path | Event type (normalized) | When |
|-----------------|--------------------------|------|
| facts.updateFact | `fact_updated` | After successful update. |
| facts.archiveFactPublic | `fact_archived` | After archive. |
| forget (memory_forget) | `fact_forgotten` | After archive + emit; ensure HTTP path can trigger emit (see design open question). |
| Session summary stored (end_session) | `session_ended` | When session summary fact is stored or handoff recorded. |
| themes.create | `theme_created` | After create. |
| entities.deleteEntity | `entity_deleted` | Optional. |
| config.setConfig | `config_updated` | Optional. |

**Files to modify:**

- `convex/functions/facts.ts` — after updateFact and archiveFactPublic, call the same emit helper used for fact.stored (or insert into memory_events). Use eventType `fact.updated`, `fact.archived` (then normalize in MCP to `fact_updated`, `fact_archived`).
- `convex/functions/forget.ts` or the path called by memory_forget — ensure emit runs (e.g. expose an action that archives and then calls emit, or have the mutation that archives call an internal emit).
- Session end: wherever the session summary fact is stored (e.g. in end-session tool or Convex), emit `session_ended` (or `session.ended` and normalize).
- `convex/functions/themes.ts` — after create, emit `theme_created` / `theme.created`.
- Optionally: entities delete, config set — same pattern.

### 4.3 Normalizer update

- In Phase 1.1, extend the event type normalizer to map `fact.updated` → `fact_updated`, `fact.archived` → `fact_archived`, `fact.forgotten` → `fact_forgotten`, `session.ended` → `session_ended`, `theme.created` → `theme_created`, etc., so the dashboard and subscription filters work.

### Verification

- Trigger memory_update_fact, memory_archive_fact, memory_end_session, memory_create_theme from MCP; dashboard event stream should show the corresponding events with correct types.

---

## Phase 5: Prompt-Native Config Keys

**Goal:** Auto-recall (limit, RRF k, strategy), system-prompt section order/titles, and ranking/budget weights read from config so behavior can change without code edits.

### 5.1 Config keys (seed or document)

- Add to Convex seed or document in API/config docs the following keys (and shapes) in `system_config`:
  - `auto_recall_limit` (number, default 3)
  - `auto_recall_rrf_k` (number, default 60)
  - `auto_recall_strategy` (string, e.g. "hybrid" | "vector-only")
  - `system_prompt_sections` (optional JSON: array of { id, title, includeByDefault }) for section order/titles
  - `recall_ranking_weights` (optional JSON: semantic, lexical, importance, freshness, outcome, emotional)
  - Budget/intent keys used by loadBudgetedFacts (e.g. intent regex or thresholds) — document or add keys used in budget-aware-loader.

**File:** `convex/migrations/001_seed_system_config.ts` or a new migration — insert defaults for the new keys if they don’t exist.

### 5.2 MCP/server reads config

**File:** `mcp-server/src/recall-for-hook.ts`

- Instead of hardcoded `limit = 3`, `k = 60`, read from Convex config: call `getConfig` (or the MCP equivalent) for `auto_recall_limit`, `auto_recall_rrf_k`, `auto_recall_strategy`. Use defaults if missing. Requires convex-client to support reading config from the hook context (or pass agentId and read via existing config tool path).

**File:** `mcp-server/src/tools/system-prompt-builder.ts`

- If `system_prompt_sections` is present in config, use it to order/specify section titles; otherwise keep current hardcoded order and titles.

**File:** `mcp-server/src/lib/ranking.ts` (or wherever recall ranking weights live)

- Read `recall_ranking_weights` from config (via convex-client or a shared config fetcher); apply to blend formula. Fall back to current hardcoded weights if key is missing.

**File:** `mcp-server/src/lib/budget-aware-loader.ts` (and context-primitives if it uses thresholds)

- Read intent thresholds / strategy thresholds from config keys; fall back to current literals if missing.

### 5.3 Convex config resolver

- Ensure `convex/lib/configResolver.ts` (or equivalent) includes the new keys in `HARDCODED_DEFAULTS` or that they are documented so `getConfig` returns a known shape.

### Verification

- Set `auto_recall_limit` to 5 via `memory_set_config`; trigger auto-recall (e.g. UserPromptSubmit); verify only 5 facts are returned. Change ranking weights and run recall; verify order changes (or add a small test).

---

## Implementation Order Summary

| Phase | Focus | Key files |
|-------|--------|-----------|
| 1 | UI integration | mcp-server/src/index.ts, event-bus.ts, sse-server.ts |
| 2 | New tools | mcp-server/src/tools/*.ts, tool-registry/*.ts, convex/functions (episodes, memoryBlocks, agents) |
| 3 | Context/discovery | admin-primitives.ts, system-prompt-builder.ts, docs |
| 4 | Emit for mutations | convex/functions/facts.ts, themes.ts, forget path, session end path |
| 5 | Prompt-native config | configResolver, recall-for-hook.ts, system-prompt-builder.ts, ranking.ts, budget-aware-loader.ts |

---

## Open Questions (from design) — Resolve During Implementation

1. **Polling consumer:** Use explicit `addPollingConsumer` / `removePollingConsumer` (chosen in plan).
2. **memory_forget emit:** Add HTTP-callable path that archives + emits, or keep forget as-is and only add emits for other mutations.
3. **Session-start full block:** Document only vs. call build_system_prompt from session-start (document first; implement later if needed).
4. **Config key schema:** Use existing `system_config` with documented keys; category can be `agent_behavior` or `tool_defaults`.

---

## Success Criteria

- Dashboard shows fact_stored and recall events and increments stats when agents store/recall.
- All 6 parity tools and 5 CRUD tools (delete/update) are callable via MCP and match CLI behavior.
- `memory_get_system_prompt` returns the full block; optional: `memory_get_agent_context.systemPromptBlock`; capability hint present in builder output.
- Key mutations (update, archive, session_ended, theme created) produce events visible in the dashboard.
- Auto-recall limit and (optionally) ranking weights are configurable via memory_set_config and take effect without code deploy.
