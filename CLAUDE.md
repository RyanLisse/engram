# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Engram is a unified multi-agent memory system. It provides a shared memory layer where agents store atomic facts, recall context via semantic search, and share knowledge across devices and sessions. Cloud-synced through Convex. Multimodal embeddings via Cohere Embed 4.

**Architecture:** Agent-native — tools are atomic primitives, not workflow wrappers. See `docs/plans/2026-02-14-refactor-mcp-tools-agent-native-architecture-plan.md`.

## Tech Stack

- **Convex** — Cloud backend (schema, CRUD, vector search, scheduled functions)
- **TypeScript** — All code (MCP server + Convex functions + CLI + plugins)
- **Cohere Embed 4** — Multimodal embeddings (1024-dim, text + images + code)
- **MCP (Model Context Protocol)** — Agent-facing interface (69 tools)
- **SSE HTTP Server** — Real-time event streaming (optional, via `ENGRAM_SSE_PORT`)
- **Next.js** — Agent dashboard (real-time monitoring)
- **Commander.js** — CLI framework

## Architecture

Three-tier system: Convex cloud backend → MCP server per agent → CLI/plugins.

Agent-Native Principles:
1. **Tools as Primitives** — Each tool is a single atomic operation. Agents compose them.
2. **Prompt-Native Config** — All weights, rates, thresholds tunable via `memory_set_config` without code.
3. **Action Parity** — Full CRUD on all 7 entity types. Agents can do everything users can.
4. **Agent Identity Context** — `memory_get_agent_context` returns capabilities, scopes, health for system prompt injection.
5. **Real-Time Events** — Event bus + SSE streaming + subscription tools for push-based notifications.
6. **Self-Discovery** — `memory_list_capabilities` for runtime tool introspection.

Key patterns:
- **Async enrichment pipeline**: Facts stored immediately (<50ms), enrichment runs async.
- **Scope-based access control**: Memory scoped to private/team/project/public.
- **Differential memory decay**: Decay rate varies by fact type (decisions slow, notes fast).
- **Memory lifecycle**: 5-state machine — active → dormant → merged → archived → pruned.

## Claude Code Hooks (6 lifecycle automations)

Defined in `.claude/settings.json`. Also distributable via `plugins/claude-code/hooks/hooks.json`.

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start.sh` | `SessionStart` | Inject agent context (identity, scopes, notifications) |
| `auto-recall.sh` | `UserPromptSubmit` | Auto-recall top-3 relevant memories per prompt |
| `post-tool-observe.sh` | `PostToolUse` | Record file edit observations as passive memory events (async) |
| `auto-handoff.sh` | `Stop` | Record turn completion events (async) |
| `pre-compact-checkpoint.sh` | `PreCompact` | Checkpoint state before context compaction |
| `session-end.sh` | `SessionEnd` | Create a durable session checkpoint fact |

## Convex Cron Jobs (14)

| Schedule | Job | Purpose |
|----------|-----|---------|
| Daily 0:30 | `usage-analytics` | Per-agent daily stats rollup |
| Daily 1:30 | `notification-cleanup` | Expire old notifications |
| Daily 2:00 | `cleanup` | Garbage collection |
| Daily 2:30 | `dedup` | Cross-agent deduplication |
| Daily 3:00 | `decay` | Differential relevance decay |
| Daily 3:30 | `forget` | Active forgetting |
| Daily 4:00 | `compact` | Conversation compaction |
| Daily 7:00 | `rules` | Steering rule extraction |
| Weekly Sun 5:00 | `consolidate` | Fact → theme consolidation |
| Weekly Sun 6:00 | `rerank` | Importance recalculation |
| Every 5m | `vault-sync-heartbeat` | Mirror sync heartbeat |
| Every 5m | `vault-regenerate-indices` | Vault index regeneration |
| Every 15m | `embedding-backfill` | Re-embed failed facts |
| Every 30m | `agent-health` | Stale agent detection + notifications |

## MCP Tools (69 primitives)

All tools live in a shared registry: `mcp-server/src/lib/tool-registry.ts`.
Full reference: `docs/API-REFERENCE.md` (auto-generated via `npx tsx scripts/generate-api-reference.ts`).

### Core (6): store_fact, recall, search, observe, link_entity, get_context
### Fact Lifecycle (6): update_fact, archive_fact, boost_relevance, list_stale_facts, mark_facts_merged, mark_facts_pruned
### Signals (3): record_signal, record_feedback, record_recall
### Agent (5): register_agent, end_session, get_agent_info, get_agent_context, get_system_prompt
### Events (3): poll_events, get_notifications, mark_notifications_read
### Subscriptions (4): subscribe, unsubscribe, list_subscriptions, poll_subscription
### Config (4): get_config, list_configs, set_config, set_scope_policy
### Retrieval (11): vector_search, text_search, rank_candidates, bump_access, get_observations, get_entities, get_themes, get_handoffs, search_facts, search_entities, search_themes
### Context (7): resolve_scopes, load_budgeted_facts, search_daily_notes, get_graph_neighbors, get_activity_stats, get_workspace_info, build_system_prompt
### Delete (5): delete_entity, delete_scope, delete_conversation, delete_session, delete_theme
### Composition (4): summarize, prune, create_theme, query_raw
### Vault (9): vault_sync, vault_export, vault_import, vault_list_files, vault_reconcile, query_vault, export_graph, checkpoint, wake
### Discovery (1): list_capabilities
### Health (1): health

## Directory Structure

```
convex/               # Convex backend
  schema.ts           # 14 table definitions with indexes
  functions/          # CRUD + search
  actions/            # Async: enrich, embed, importance, vectorSearch
  crons.ts            # 14 cron job definitions
  crons/              # 13 cron implementations
.claude/
  settings.json       # 6 Claude Code hook definitions
  hooks/              # Hook scripts (session-start, auto-recall, etc.)
mcp-server/src/       # MCP server (v2 agent-native)
  index.ts            # Entry point — stdio + event bus + optional SSE
  lib/
    tool-registry.ts  # ★ Single source of truth for all 69 tools
    convex-client.ts  # Convex HTTP client (string-based paths)
    embeddings.ts     # Cohere Embed 4 client
    event-bus.ts      # Internal pub/sub event bus
    subscription-manager.ts  # Agent subscription tracking
    sse-server.ts     # SSE HTTP server + webhook endpoints
  tools/              # Tool handler modules
    context-primitives.ts   # Decomposed from get_context
    vault-primitives.ts     # Decomposed from vault_sync
    rank-candidates.ts      # Exposed ranking algorithm
    subscriptions.ts        # Real-time subscription tools
    system-prompt-builder.ts # Full system prompt aggregator
cli/src/              # Interactive CLI (commander.js)
plugins/
  claude-code/        # Claude Code plugin (.mcp.json + setup.sh)
  openclaw/           # OpenClaw native extension (imports tool-registry)
skill/                # OpenClaw skill package (SKILL.md + install.sh)
dashboard/            # Next.js agent dashboard (real-time monitoring)
scripts/
  generate-api-reference.ts  # Auto-gen docs/API-REFERENCE.md from registry
docs/
  API-REFERENCE.md    # Auto-generated full API reference
```

## Key Implementation Details

### Tool Registry (Single Source of Truth)
`mcp-server/src/lib/tool-registry.ts` defines all 69 tools declaratively:
- `TOOL_REGISTRY` — array of `{ tool, zodSchema, handler }` entries
- `routeToolCall(name, args, agentId)` — validates + dispatches any tool
- `getToolDefinitions()` — returns MCP `Tool[]` for ListTools
Both the MCP server and OpenClaw plugin import from this file.

### Convex Integration
The MCP server uses string-based function paths (`"functions/facts:storeFact"`) in `mcp-server/src/lib/convex-client.ts`. The `as any` cast is isolated there.

### Scope Resolution
Scope names: `private-{agentId}`. Tools resolve names to IDs via `getScopeByName()`.

### Embedding Model
Cohere Embed 4 (`embed-v4.0`, 1024 dimensions).

## Design Principles

- **Agent parity** — Every agent gets identical memory tools
- **Atomic primitives** — Granular operations, not workflow-shaped APIs
- **Composability** — New memory behaviors via prompts, not code changes
- **Emergent capability** — `query_raw` escape hatch for unanticipated use
- **Non-blocking** — Agents get immediate responses; enrichment is always async
- **Merge before delete** — Never true-delete facts; consolidate, then archive
- **Learn from outcomes** — Track which memories actually helped via feedback signals
