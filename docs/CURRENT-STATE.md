# Engram Current State

**Last Updated:** 2026-02-17 (optimization sweep)

This document provides the authoritative count of all engram components. Use this as the single source of truth when updating documentation.

---

## 🔢 Component Counts

| Component | Count | Location | Notes |
|-----------|-------|----------|-------|
| **Convex Tables** | 16 | `convex/schema.ts` | facts, entities, conversations, sessions, agents, memory_scopes, scope_memberships, signals, themes, sync_log, notifications, recall_feedback, system_config, memory_policies, memory_events, agent_performance |
| **Cron Jobs** | 14 | `convex/crons.ts` | 10 daily, 2 weekly, 2 interval-based |
| **MCP Tools** | 69 | `mcp-server/src/lib/tool-registry.ts` | All `memory_*` tools |
| **Claude Code Hooks** | 8 events | `.claude/settings.json` | SessionStart, UserPromptSubmit, PostToolUse, Notification, PreToolUse, Stop, PreCompact, SessionEnd |
| **Hook Scripts** | 9 scripts | `.claude/hooks/` | Including validation hooks |

---

## 📊 Detailed Breakdowns

### Convex Tables (16)

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
```

### Cron Jobs (14)

| Time | Job | Description |
|------|-----|-------------|
| **Daily 0:30 UTC** | usage-analytics | Per-agent daily stats rollup |
| **Daily 1:30 UTC** | notification-cleanup | Clean expired notifications |
| **Daily 2:00 UTC** | cleanup | Garbage collection + sync log cleanup |
| **Daily 2:30 UTC** | dedup | Cross-agent deduplication in shared scopes |
| **Daily 3:00 UTC** | decay | Differential relevance decay by fact type |
| **Daily 3:30 UTC** | forget | Active forgetting (archive stale facts) |
| **Daily 4:00 UTC** | compact | Conversation compaction |
| **Daily 7:00 UTC** | rules | Steering rule extraction (runs daily, executes monthly) |
| **Weekly Sun 5:00 UTC** | consolidate | Fact consolidation into themes |
| **Weekly Sun 6:00 UTC** | rerank | Importance score recalculation |
| **Every 5 min** | vault-sync-heartbeat | Mirror sync heartbeat (MCP daemon performs IO) |
| **Every 5 min** | vault-regenerate-indices | Vault index regeneration trigger |
| **Every 15 min** | embedding-backfill | Re-embed failed facts |
| **Every 30 min** | agent-health | Stale agent detection + notifications |

### MCP Tools (72 primitives)

**Categories:**
- **Core (6):** store_fact, recall, search, observe, link_entity, get_context
- **Fact Lifecycle (6):** update_fact, archive_fact, boost_relevance, list_stale_facts, mark_facts_merged, mark_facts_pruned
- **Signals (3):** record_signal, record_feedback, record_recall
- **Agent (5):** register_agent, end_session, get_agent_info, get_agent_context, get_system_prompt
- **Events (3):** poll_events, get_notifications, mark_notifications_read
- **Subscriptions (4):** subscribe, unsubscribe, list_subscriptions, poll_subscription
- **Config (4):** get_config, list_configs, set_config, set_scope_policy
- **Retrieval (11):** vector_search, text_search, rank_candidates, bump_access, get_observations, get_entities, get_themes, get_handoffs, search_facts, search_entities, search_themes
- **Context (7):** resolve_scopes, load_budgeted_facts, search_daily_notes, get_graph_neighbors, get_activity_stats, get_workspace_info, build_system_prompt
- **Delete (5):** delete_entity, delete_scope, delete_conversation, delete_session, delete_theme
- **Composition (4):** summarize, prune, create_theme, query_raw
- **Vault (9):** vault_sync, vault_export, vault_import, vault_list_files, vault_reconcile, query_vault, export_graph, checkpoint, wake
- **Discovery (1):** list_capabilities
- **Health (1):** health

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

**Additional validation hook (not in active config):**
- `check-scope-permission.sh` — Validates scope access permissions

---

## 📈 Version History

### v2.0.0 (Current - Agent-Native Architecture)
- **Tools:** 72 (was 52 → 65 → 69 → 72)
- **Tables:** 16 (+2: scope_memberships join table, agent_performance)
- **Crons:** 14 (was 11 → 14)
- **Hooks:** 8 events, 9 scripts (new in v2.0)
- **Architecture:** Refactored to agent-native primitives

**Key Changes:**
- Decomposed workflow tools into atomic primitives
- Added real-time event subscriptions (4 tools)
- Added agent context tools (3 tools)
- Added configuration tools (4 tools)
- Integrated Claude Code lifecycle hooks (8 events)

---

## 🔄 Update Protocol

When updating component counts:

1. **Count actual implementations** (not comments or docs)
2. **Update this file first** (single source of truth)
3. **Then update:**
   - `README.md` — user-facing overview
   - `CLAUDE.md` — Claude Code context
   - `mcp-server/src/index.ts` — header comment
   - `docs/API-REFERENCE.md` — tool reference (auto-generated)
4. **Verify diagrams** still reflect current architecture
5. **Update `Last Updated` timestamp** at top of this file

---

## 📍 Key File Locations

### Source of Truth Files
- **Tables:** `convex/schema.ts` (defineTable calls)
- **Crons:** `convex/crons.ts` (crons.daily/weekly/interval)
- **Tools:** `mcp-server/src/lib/tool-registry.ts` (TOOL_REGISTRY array)
- **Hooks:** `.claude/settings.json` (hooks object keys)

### Documentation Files
- **Main README:** `README.md`
- **Claude Context:** `CLAUDE.md`
- **API Reference:** `docs/API-REFERENCE.md` (auto-generated)
- **Hooks Docs:** `docs/HOOKS-*.md` (3 files)
- **Current State:** `docs/CURRENT-STATE.md` (this file)

---

## 🎯 Quick Verification Commands

```bash
# Count tables
grep "defineTable" convex/schema.ts | wc -l

# Count crons
grep -E "crons\.(daily|weekly|interval)" convex/crons.ts | wc -l

# Count MCP tools
grep -c "name: \"memory_" mcp-server/src/lib/tool-registry.ts

# Count hook events
jq '.hooks | keys | length' .claude/settings.json

# Count hook scripts
ls -1 .claude/hooks/*.sh | wc -l
```

---

**Maintained by:** Engram development team
**Automation:** Consider creating a CI check that verifies these counts match
