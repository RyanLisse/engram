# Engram Current State

**Last Updated:** 2026-02-25 (embedding fallback + audit sweep)

This document provides the authoritative count of all engram components. Use this as the single source of truth when updating documentation.

---

## Component Counts

| Component | Count | Location | Notes |
|-----------|-------|----------|-------|
| **Convex Tables** | 17 | `convex/schema.ts` | facts, entities, conversations, sessions, agents, memory_scopes, scope_memberships, signals, themes, sync_log, notifications, recall_feedback, system_config, memory_policies, memory_events, agent_performance, observation_sessions |
| **Cron Jobs** | 19 | `convex/crons.ts` | 10 daily, 2 weekly, 5 interval-based |
| **MCP Tools** | 73 | `mcp-server/src/lib/tool-registry.ts` | All `memory_*` tools |
| **Claude Code Hooks** | 8 events | `.claude/settings.json` | SessionStart, UserPromptSubmit, PostToolUse, Notification, PreToolUse, Stop, PreCompact, SessionEnd |
| **Hook Scripts** | 9 scripts | `.claude/hooks/` | Including validation hooks |
| **Embedding Model** | Cohere Embed v4 | `mcp-server/src/lib/embeddings.ts` | 1024-dim via MRL, Ollama fallback |

---

## Detailed Breakdowns

### Convex Tables (17)

```typescript
// Core Memory
1. facts                 — Atomic memory units (embeddings, lifecycle, metadata)
2. entities             — Named concepts with relationship graph
3. conversations        — Thread facts together with handoff tracking
4. sessions             — Agent session tracking
5. agents               — Agent registry with capabilities and telos
6. memory_scopes        — Scope-based access control with policies
7. scope_memberships    — Join table for O(memberships) scope lookup (by_agent index)

// Signals & Learning
8. signals              — Feedback loop (ratings + sentiment)
9. recall_feedback      — Recall outcome tracking, by_created index (ALMA)
10. themes              — Thematic fact clusters (consolidated memory)

// Configuration & Events
11. system_config       — Runtime configuration (prompt-native)
12. memory_policies     — Scope-level policy overrides
13. memory_events       — Watermark-ordered event stream

// Infrastructure
14. sync_log            — Per-node LanceDB sync tracking
15. notifications       — Agent-routing notifications

// Performance & Quality
16. agent_performance   — Task outcome tracking for golden principle synthesis
17. observation_sessions — Per-scope observer/reflector compression state
```

### Cron Jobs (19)

| Time | Job | Description |
|------|-----|-------------|
| **Daily 0:30 UTC** | usage-analytics | Per-agent daily stats rollup |
| **Daily 1:00 UTC** | quality-scan | Fact quality scoring |
| **Daily 1:30 UTC** | notification-cleanup | Clean expired notifications |
| **Daily 2:00 UTC** | cleanup | Garbage collection + sync log cleanup |
| **Daily 2:30 UTC** | dedup | Cross-agent deduplication in shared scopes |
| **Daily 3:00 UTC** | decay | Differential relevance decay by fact type |
| **Daily 3:30 UTC** | forget | Active forgetting (archive stale facts) |
| **Daily 4:00 UTC** | compact | Conversation compaction |
| **Daily 5:00 UTC** | learning-synthesis | Extract learning patterns |
| **Daily 7:00 UTC** | rules | Steering rule extraction |
| **Weekly Sun 5:00 UTC** | consolidate | Fact consolidation into themes |
| **Weekly Sun 6:00 UTC** | rerank | Importance score recalculation |
| **Weekly Mon 4:00 UTC** | update-golden-principles | Refresh golden rules |
| **Every 5 min** | vault-sync-heartbeat | Mirror sync heartbeat |
| **Every 5 min** | vault-regenerate-indices | Vault index regeneration trigger |
| **Every 10 min** | observer-sweep | Observer/Reflector threshold check |
| **Every 15 min** | embedding-backfill | Re-embed failed facts |
| **Every 15 min** | action-recommendations | Suggest actions from recent facts |
| **Every 30 min** | agent-health | Stale agent detection + notifications |

### MCP Tools (73 primitives)

**Categories:**
- **Core (6):** store_fact, recall, search, observe, link_entity, get_context
- **Fact Lifecycle (6):** update_fact, archive_fact, boost_relevance, list_stale_facts, mark_facts_merged, mark_facts_pruned
- **Signals (3):** record_signal, record_feedback, record_recall
- **Agent (5):** register_agent, end_session, get_agent_info, get_agent_context, get_system_prompt
- **Events (3):** poll_events, get_notifications, mark_notifications_read
- **Subscriptions (4):** subscribe, unsubscribe, list_subscriptions, poll_subscription
- **Config (4):** get_config, list_configs, set_config, set_scope_policy
- **Retrieval (12):** vector_search, text_search, rank_candidates, bump_access, get_observations, get_entities, get_themes, get_handoffs, search_facts, search_entities, search_themes, hierarchical_recall
- **Context (7):** resolve_scopes, load_budgeted_facts, search_daily_notes, get_graph_neighbors, get_activity_stats, get_workspace_info, build_system_prompt
- **Delete (5):** delete_entity, delete_scope, delete_conversation, delete_session, delete_theme
- **Observation Memory (3):** om_status, observe_compress, reflect
- **Composition (4):** summarize, prune, create_theme, query_raw
- **Vault (9):** vault_sync, vault_export, vault_import, vault_list_files, vault_reconcile, query_vault, export_graph, checkpoint, wake
- **Discovery (1):** list_capabilities
- **Health (1):** health

### Embedding Providers

Graceful fallback chain (automatic, zero-config):

| Priority | Provider | Dimensions | Quality | Requirement |
|----------|----------|-----------|---------|-------------|
| 1 | Cohere Embed v4 | 1024 (MRL) | Best | `COHERE_API_KEY` env var |
| 2 | Ollama mxbai-embed-large | 1024 (native) | Good | `ollama pull mxbai-embed-large` |
| 3 | Zero vector | N/A | Text-only | None (always available) |

Environment variables:
- `COHERE_API_KEY` — Cohere API key (optional)
- `OLLAMA_URL` — Ollama endpoint (default: `http://localhost:11434`)
- `ENGRAM_OLLAMA_EMBED_MODEL` — Ollama model (default: `mxbai-embed-large`)

### Claude Code Hooks (8 events)

| Event | Matcher | Hook Script | Async | Timeout |
|-------|---------|-------------|-------|---------|
| SessionStart | `startup\|resume` | session-start.sh | No | 10s |
| UserPromptSubmit | `*` | auto-recall.sh | No | 5s |
| PostToolUse | `Edit\|Write\|MultiEdit\|apply_patch` | post-tool-observe.sh | Yes | 5s |
| Notification | `*` | notification-alert.sh | Yes | 5s |
| PreToolUse | `memory_delete_.*\|memory_prune` | validate-memory-ops.sh | No | 10s |
| Stop | `*` | auto-handoff.sh | Yes | 10s |
| PreCompact | `*` | pre-compact-checkpoint.sh | No | 10s |
| SessionEnd | `*` | session-end.sh | Yes | 10s |

---

## Version History

### v2.1.0 (Current)
- **Tools:** 73 (was 52 → 65 → 69 → 72 → 73)
- **Tables:** 17 (+3 from v1: scope_memberships, agent_performance, observation_sessions)
- **Crons:** 19 (was 11 → 14 → 19)
- **Hooks:** 8 events, 9 scripts
- **Embeddings:** Cohere → Ollama → zero vector fallback chain
- **Architecture:** Agent-native primitives + demand-driven event polling

---

## Quick Verification Commands

```bash
# Count tables (subtract 1 for import line)
grep -c "defineTable" convex/schema.ts && echo "(subtract 1 for import)"

# Count crons
grep -cE "crons\.(daily|weekly|interval)" convex/crons.ts

# Count MCP tools
grep -c "name: \"memory_" mcp-server/src/lib/tool-registry.ts

# Count hook events
jq '.hooks | keys | length' .claude/settings.json

# Check embedding provider
CONVEX_URL=... node -e "import('./mcp-server/dist/lib/embeddings.js').then(m => console.log(m.getEmbeddingProvider()))"
```
