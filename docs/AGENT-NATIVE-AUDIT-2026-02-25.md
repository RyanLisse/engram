# Agent-Native Architecture Review: Engram

**Date:** 2026-02-25  
**Scope:** Convex backend, MCP server (~98 tools), Next.js dashboard, CLI, hooks.

---

## Overall Score Summary

| Core Principle         | Score    | Percentage | Status |
|------------------------|----------|------------|--------|
| Action Parity          | 41/47    | 87%        | ✅     |
| Tools as Primitives    | 84/101   | 83%        | ✅     |
| Context Injection      | 4/6      | 67%        | ⚠️     |
| Shared Workspace       | 24/24    | 100%       | ✅     |
| CRUD Completeness      | 3/15     | 20%        | ❌     |
| UI Integration         | 0/40     | 0%         | ❌     |
| Capability Discovery   | 3.5/7    | 50%        | ⚠️     |
| Prompt-Native Features | 3/17     | 18%        | ❌     |

**Overall Agent-Native Score: 53%**

### Status Legend

- ✅ **Excellent** (80%+)
- ⚠️ **Partial** (50–79%)
- ❌ **Needs Work** (<50%)

---

## Top 10 Recommendations by Impact

| Priority | Action | Principle | Effort |
|----------|--------|-----------|--------|
| 1 | Fix event type mapping (`e.eventType`), start polling when dashboard SSE connects, normalize event names (`fact.stored`→`fact_stored`, `recall_completed`→`recall`) | UI Integration | Low |
| 2 | Emit Convex events for high-value mutations (fact.updated, fact.archived, session_ended, theme.created, etc.) and expose callable emit path for `memory_forget` | UI Integration | Medium |
| 3 | Add full CRUD where missing: `memory_delete_episode`, `memory_delete_subspace`, `memory_block_delete`, `memory_update_theme`, `memory_update_agent`; add Create: `memory_create_scope`, `memory_create_session`, `memory_create_conversation`, `memory_add_fact_to_conversation`, `memory_add_handoff` | CRUD + Action Parity | Medium |
| 4 | Add missing tools: `memory_list_scope_policies`, `memory_create_scope`, `memory_create_session`, `memory_create_conversation`, `memory_add_fact_to_conversation`, standalone handoff tool | Action Parity | Low |
| 5 | Unify session-start with full system prompt (or call `memory_build_system_prompt`); fix `memory_get_system_prompt` to return full block; add `systemPromptBlock` to `memory_get_agent_context` or document alternative | Context Injection | Medium |
| 6 | Add optional “available capabilities” block to system prompt (or “use memory_list_capabilities to discover tools”) | Context Injection + Capability Discovery | Low |
| 7 | Document 17 workflow tools as convenience; decompose `memory_get_context`, `memory_defrag`, `memory_prune` into primitives + docs; add `primitive`/`workflow` metadata to tool registry | Tools as Primitives | Medium |
| 8 | Make auto-recall and hook templates config-driven: `auto_recall_limit`, `auto_recall_rrf_k`, section titles/order in builder, ranking weights and budget thresholds via `memory_set_config` | Prompt-Native Features | Medium |
| 9 | Dashboard: add “Capabilities” section or link to API reference; empty-state guidance (“No events yet – use memory_store_fact from your agent”); suggested prompts in GETTING-STARTED | Capability Discovery | Low |
| 10 | Drive ranking (recall weights, freshness) and budget-aware-loader (intent regex, thresholds) from config keys | Prompt-Native Features | Medium |

---

## What’s Working Well

1. **Shared workspace (100%)** — Single Convex app; dashboard and agents use the same tables and function paths. No sandbox isolation; scope-based access only.
2. **Action parity (87%)** — Most CLI and dashboard actions have a corresponding MCP tool or composition; only five missing tools (list scope policies, create scope/session/conversation, add fact to conversation) and one partial (handoff).
3. **Tools as primitives (83%)** — Majority of tools are atomic (store, read, update, delete, list). Workflow tools are identified and can be documented or decomposed over time.
4. **Strong docs and discovery** — Auto-generated API reference (98 tools, 15 categories), README “I want to” table, `memory_list_capabilities` with categories/list/table/json.
5. **Config-driven backend** — Convex decay and importance use `getConfig()`; config get/set/list and scope policies are prompt-native levers for operators and agents.

---

## Principle Summaries (from sub-agents)

### Action Parity (87%)

- **41/47** user actions (CLI + dashboard) have agent tool coverage.
- **Missing:** `memory_list_scope_policies`, `memory_create_scope`, `memory_create_session`, `memory_create_conversation`, `memory_add_fact_to_conversation`, standalone add-handoff.
- Convex client already has `createScope`, `createSession`, `createConversation`, `addFactToConversation`; they need MCP tool wrappers.

### Tools as Primitives (83%)

- **84/101** tools classified as primitives; **17** as workflow (get_context, end_session, summarize, prune, observe_compress, reflect, get_manifest, hierarchical_recall, chain_recall, defrag, forget, load_budgeted_facts, build_system_prompt, get_system_prompt, vault_sync, recall_episodes, search_episodes).
- Recommendation: keep workflow tools as convenience, document primitives for composition, add registry metadata.

### Context Injection (67%)

- **4/6** context types injected in at least one path: resources (scopes), preferences (identity/config in build_system_prompt), recent activity (auto-recall), session history and workspace partial (handoffs, other agents).
- **Missing:** available capabilities in prompt; full block in session-start; `memory_get_system_prompt` and `memory_get_agent_context` contract (systemPromptBlock) need fix or doc.

### Shared Workspace (100%)

- **24/24** Convex tables are shared; no agent-only store. Dashboard reads via MCP SSE and REST (fact-history); same Convex backend.

### CRUD Completeness (20%)

- **3/15** agent-facing entities have full CRUD: facts, entities, key_value_facts.
- Gaps: no Delete for themes (only create_theme/delete_theme), episodes, subspaces, memory_blocks; no Update for themes, agents; no Create for scopes, sessions, conversations; partial for signals, notifications, config, memory_policies.

### UI Integration (0%)

- Agent mutations do not reliably reach the dashboard: polling is gated by `memory_subscribe` (dashboard doesn’t start it), event type is `e.type` (undefined) instead of `e.eventType` (so all show as "unknown"), and only two actions emit today (`fact.stored`, `recall_completed`). Naming mismatch between backend and dashboard expectations.
- Fixing mapping, starting polling on SSE connect, and adding emits for key mutations would remove the “silent actions” anti-pattern.

### Capability Discovery (50%)

- **3.5/7:** Help docs and `memory_list_capabilities` are strong; agent self-describes (identity/scopes only); empty state is connection-only. Missing: onboarding flow, dashboard capability hints, suggested prompts, slash commands.

### Prompt-Native Features (18%)

- **3/17** areas prompt-native: agent context (data), config get/set/list, and data-driven parts of build_system_prompt. System prompt template, hook text, auto-recall N/k/strategy, builder structure, ranking weights, and budget logic are code-defined. Moving templates and tunables to config would raise this.

---

## Success Criteria Checklist

- [x] All 8 sub-agents completed
- [x] Each principle has numeric score (X/Y)
- [x] Summary table with status indicators
- [x] Top 10 recommendations by impact
- [x] Strengths and gaps identified

---

*Generated from parallel explore-agent audits. Raw outputs available from subagent IDs in the session.*
