# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Engram is a unified multi-agent memory system. It provides a shared memory layer where agents store atomic facts, recall context via semantic search, and share knowledge across devices and sessions. Cloud-synced through Convex. Multimodal embeddings via Cohere Embed 4.

**Architecture:** Agent-native — tools are atomic primitives, not workflow wrappers. See `docs/plans/2026-02-14-refactor-mcp-tools-agent-native-architecture-plan.md`.

## Tech Stack

- **Convex** — Cloud backend (schema, CRUD, vector search, scheduled functions)
- **TypeScript** — All code (MCP server + Convex functions + CLI + plugins)
- **Cohere Embed 4** — Multimodal embeddings (1024-dim, text + images + code)
- **MCP (Model Context Protocol)** — Agent-facing interface (52 tools)
- **Commander.js** — CLI framework

## Architecture

Three-tier system: Convex cloud backend → MCP server per agent → CLI/plugins.

Agent-Native Principles:
1. **Tools as Primitives** — Each tool is a single atomic operation. Agents compose them.
2. **Prompt-Native Config** — All weights, rates, thresholds tunable via `memory_set_config` without code.
3. **Action Parity** — Full CRUD on all 7 entity types. Agents can do everything users can.
4. **Agent Identity Context** — `memory_get_agent_context` returns capabilities, scopes, health for system prompt injection.
5. **Real-Time Events** — `memory_poll_events` for watermark-based incremental state awareness.

Key patterns:
- **Async enrichment pipeline**: Facts stored immediately (<50ms), enrichment runs async.
- **Scope-based access control**: Memory scoped to private/team/project/public.
- **Differential memory decay**: Decay rate varies by fact type (decisions slow, notes fast).
- **Memory lifecycle**: 5-state machine — active → dormant → merged → archived → pruned.

## MCP Tools (52 primitives)

All tools live in a shared registry: `mcp-server/src/lib/tool-registry.ts`.

### Core (6): store_fact, recall, search, observe, link_entity, get_context
### Fact Lifecycle (6): update_fact, archive_fact, boost_relevance, list_stale_facts, mark_facts_merged, mark_facts_pruned
### Signals (3): record_signal, record_feedback, record_recall
### Agent (5): register_agent, end_session, get_agent_info, get_agent_context, get_system_prompt
### Events (3): poll_events, get_notifications, mark_notifications_read
### Config (4): get_config, list_configs, set_config, set_scope_policy
### Retrieval (10): vector_search, text_search, bump_access, get_observations, get_entities, get_themes, get_handoffs, search_facts, search_entities, search_themes
### Delete (5): delete_entity, delete_scope, delete_conversation, delete_session, delete_theme
### Composition (4): summarize, prune, create_theme, query_raw
### Vault (5): vault_sync, query_vault, export_graph, checkpoint, wake
### Health (1): health

## Directory Structure

```
convex/               # Convex backend
  schema.ts           # 14 table definitions with indexes
  functions/          # CRUD + search
  actions/            # Async: enrich, embed, importance, vectorSearch
  crons.ts            # Cron job configuration
  crons/              # Cron implementations
mcp-server/src/       # MCP server (v2 agent-native)
  index.ts            # Entry point (113 lines — transport + rate limiter only)
  lib/
    tool-registry.ts  # ★ Single source of truth for all 52 tools
    convex-client.ts  # Convex HTTP client (string-based paths)
    embeddings.ts     # Cohere Embed 4 client
  tools/              # 21 tool handler modules
cli/src/              # Interactive CLI (commander.js)
  commands/           # 15 command modules (store, facts, signal, events, config, etc.)
  lib/client.ts       # CLI Convex HTTP client (47 functions)
plugins/
  claude-code/        # Claude Code plugin (.mcp.json + setup.sh)
  openclaw/           # OpenClaw native extension (imports tool-registry)
skill/                # OpenClaw skill package (SKILL.md + install.sh)
```

## Key Implementation Details

### Tool Registry (Single Source of Truth)
`mcp-server/src/lib/tool-registry.ts` defines all 52 tools declaratively:
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
