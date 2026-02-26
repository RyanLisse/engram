---
date: 2026-02-25
topic: agent-native-top5-recommendations
---

# Agent-Native Top 5: Design Capture

## What We're Building

Five changes to move Engram’s agent-native score from 53% toward 80%+:

1. **UI integration** — Dashboard reliably shows agent actions (store/observe/recall and eventually update/archive/session_ended). Today events don’t reach the UI because of a wrong field mapping, polling gated only on MCP subscriptions, and backend/dashboard event name mismatch.

2. **Emit events for mutations** — Convex (or MCP-visible path) emits to `memory_events` for high-value mutations so the event bus → SSE can stream them. Today only `fact.stored` and `recall_completed` are emitted; update/archive/forget/session_ended/theme created etc. are silent.

3. **CRUD + parity** — Add missing MCP tools so agents have the same outcomes as CLI: create scope/session/conversation, add fact to conversation, list scope policies, standalone handoff; add delete/update where entities are agent-managed (episodes, subspaces, memory_blocks, themes, agents).

4. **Context and discovery** — One canonical “full context” path: session-start and/or `memory_get_system_prompt` / `memory_get_agent_context` expose the same block as `memory_build_system_prompt` (or a slim variant), plus a one-line capability hint (“Use memory_list_capabilities to discover tools”).

5. **Prompt-native tuning** — Auto-recall (limit, RRF k, strategy), system-prompt section order/titles, and ranking/budget weights read from config (e.g. `memory_get_config` / `memory_set_config`) so behavior can change without code edits.

Out of scope for this design: workflow-tool documentation, dashboard “Capabilities” section, suggested prompts in GETTING-STARTED (lower impact; can be separate work).

---

## Why This Approach

- **UI first** — Fixing mapping and polling is low effort and unblocks the dashboard; emitting more events is the natural next step so “agent did X” is visible.
- **Parity and CRUD together** — Convex client already has createScope, createSession, createConversation, addFactToConversation; we add MCP wrappers and the missing list_scope_policies and handoff. Delete/update tools close the CRUD gaps the audit found.
- **Single context contract** — Today session-start, get_agent_context, and get_system_prompt each build different blobs; docs imply a “full block”. We pick one source of truth (build_system_prompt or a slim variant) and have the others return or link to it so integrations get a consistent contract.
- **Config over code** — Align with existing pattern: Convex already uses getConfig for decay/importance; we extend that to recall/builder/ranking so operators and agents tune behavior via memory_set_config.

---

## Key Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| **Event type field** | Map from Convex `eventType` (not `e.type`) when building events in the MCP poll callback. | Convex schema and poll response use `eventType`; code used `e.type` so every event became `"unknown"`. |
| **Event type names** | Normalize to dashboard vocabulary: `fact.stored` → `fact_stored`, `recall_completed` → `recall`. Accept both in dashboard if needed. | context-primitives and dashboard expect `fact_stored`, `recall`, `signal_recorded`, `session_ended`; backend emits `fact.stored`, `recall_completed`. |
| **Polling when dashboard connects** | When an SSE client subscribes (GET /events/:agentId), trigger polling (e.g. call `eventBus.ensurePolling()` or register as “polling consumer”). | Today polling runs only when `listenerCount("event") > 0` (MCP subscriptions). Dashboard only listens on `agent:${agentId}`, so polling never starts and no events reach it. |
| **hasActiveListeners** | Treat SSE connections as polling consumers: either extend `hasActiveListeners()` to include agent-scoped listeners or add explicit register/unregister from SSE on connect/close. | Ensures Convex is polled when the dashboard is open even if no agent has called memory_subscribe. |
| **New Convex emits** | Add emit (or callable path) for: fact.updated, fact.archived, fact.forgotten (fix forget path), session_ended, theme.created; optionally config.updated, entity.deleted. | Removes “silent action” anti-pattern for high-value mutations; dashboard can show them in the stream. |
| **New MCP tools** | Add: memory_list_scope_policies, memory_create_scope, memory_create_session, memory_create_conversation, memory_add_fact_to_conversation, memory_add_handoff (standalone). Wire to existing Convex client where it exists. | Closes action-parity gaps; no new backend logic, only tool registry + handlers. |
| **Delete/update tools** | Add: memory_delete_episode, memory_delete_subspace (or archive), memory_block_delete, memory_update_theme, memory_update_agent (and optionally memory_delete_agent / deactivate). | Per audit; entities that are agent-managed get full CRUD. |
| **Full system prompt source** | Have `memory_get_system_prompt` return the same content as `memory_build_system_prompt` (with a default token budget), or document that “full block” is only from memory_build_system_prompt. | Current get_system_prompt returns a short fixed string; docs/hooks imply a full block. Single contract avoids confusion. |
| **get_agent_context and prompt** | Either add `systemPromptBlock` (or `prompt`) to get_agent_context by calling buildFullSystemPrompt, or remove references to systemPromptBlock from hooks/docs and point to memory_build_system_prompt / memory_get_system_prompt. | Hooks/examples that expect `.systemPromptBlock` from get_agent_context currently get nothing. |
| **Session-start vs full prompt** | Either have session-start call memory_build_system_prompt (or a slim variant) and inject that, or document that session-start only injects identity/scopes/notifications and full context requires the client to call memory_build_system_prompt. | Unifies “what the agent sees at session start” with “what’s in the full block.” |
| **Capability hint** | Add one line to the injected context (session-start and/or build_system_prompt): “To list all memory tools, use memory_list_capabilities.” Optional: “N tools in M categories.” | Improves capability discovery without heavy onboarding. |
| **Config keys for tuning** | Introduce (or document) config keys for: auto_recall_limit, auto_recall_rrf_k, auto_recall_strategy; system_prompt_sections (order/titles); recall_ranking_weights; budget/intent thresholds. Read in recall-for-hook, system-prompt-builder, ranking.ts, budget-aware-loader. | Behavior changes via memory_set_config instead of code; same pattern as decay/importance. |

---

## Open Questions

- **Event bus “polling consumer”** — Prefer (a) extending `hasActiveListeners()` to count agent: (and scope:) listeners, or (b) SSE server calling something like `eventBus.addPollingConsumer()` / `removePollingConsumer()` on connect/close? (b) is explicit but adds API surface.
- **memory_forget emit** — Audit says emit for forget is internalMutation only. Do we add an HTTP-callable Convex action that performs archive + emit, or keep forget as-is and only add emits for mutations that already have HTTP paths?
- **Scope of “full block” in session-start** — Should session-start inject the full build_system_prompt output (could be large) or a slim variant (identity + scopes + capabilities hint + last N notifications)? Token budget and hook runtime matter.
- **Config key schema** — Should new keys (auto_recall_limit, ranking_weights, etc.) live in existing system_config with documented keys, or in a dedicated “agent_behavior” category?

---

## Next Steps

- **Planning** → Run `/workflows:plan` (or equivalent) with this doc as input to get implementation steps, file-level changes, and tests.
- **Phasing** — Consider implementing in order: (1) UI integration fixes, (2) new tools (parity + CRUD), (3) context/discovery contract, (4) emit for mutations, (5) prompt-native config keys.
- **Validation** — After each phase: dashboard shows store/recall with correct types; bd/bv or CLI confirms new tools; session-start or get_system_prompt returns expected block; config changes alter recall/builder behavior.
