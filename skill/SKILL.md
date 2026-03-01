---
name: engram
description: Unified multi-agent memory system. Store atomic facts, recall context via semantic search, share knowledge across agents, devices, and sessions.
version: 1.0.0
author: Ryan Lisse
license: MIT
repository: https://github.com/RyanLisse/engram
keywords:
  - memory
  - multi-agent
  - mcp
  - convex
  - vector-search
  - embeddings
  - knowledge-graph
platforms:
  - claude-code
  - openclaw
transport: mcp
---

# Engram — Unified Multi-Agent Memory

A shared memory layer for AI agents. Store atomic facts, recall context via semantic search, and share knowledge across agents, devices, and sessions.

## Quick Start

### Prerequisites

- Node.js 18+
- A Convex deployment (`npx convex dev`)
- Cohere API key (optional — falls back to zero vectors without it)

### Install

```bash
git clone https://github.com/RyanLisse/engram.git
cd engram
npm install
cd mcp-server && npm install && npm run build
npx convex dev   # deploy backend
```

### Configure

Add to your Claude Code MCP settings (`.mcp.json`):

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["PATH_TO_ENGRAM/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "your-agent-id",
        "COHERE_API_KEY": "your-cohere-api-key"
      }
    }
  }
}
```

## CLI (Agent-Native)

Engram ships with a full-featured CLI that supports `--json` output for agent consumption. All commands can be run directly from the shell.

### Installation

```bash
cd ~/Tools/engram/cli
npm run build
npm link  # makes `engram` available globally
```

### Core Commands (All Support --json)

- `engram store <content>` — Store a fact
  - Options: `-t|--type`, `-s|--scope`, `--tags`, `--source`, `--emotion`, `--json`
- `engram recall <query>` — Semantic search (deprecated, use primitives)
  - Options: `-n|--limit`, `-s|--scope`, `-t|--type`, `--json`
- `engram search <text>` — Full-text search
  - Aliases: `text-search`, `search`
  - Options: `-n|--limit`, `-t|--type`, `--tags`, `--json`
- `engram vector-search <query>` — Semantic vector search
  - Options: `-n|--limit`, `-s|--scope`, `-t|--type`, `--json`
- `engram context <topic>` — Get warm-start context
  - Options: `-n|--max-facts`, `-s|--scope`, `--entities`, `--themes`, `--json`
- `engram status` — System health and stats
  - Options: `--json`, `--robot` (machine-readable with health check)

### Facts Lifecycle

- `engram facts get <factId>` — Get a single fact (`--json`)
- `engram facts update <factId>` — Update fact content/tags/type
- `engram facts archive <factId>` — Soft delete
- `engram facts bump <factId>` — Signal usefulness to ALMA
- `engram facts boost <factId>` — Boost relevance score
- `engram facts stale` — List stale facts (`--json`, `-s|--scope`, `-d|--days`, `-n|--limit`)
- `engram facts prune <factIds...>` — Mark facts as pruned
- `engram facts merge <targetId> <sourceIds...>` — Merge facts
- `engram facts signals <factId>` — View quality signals (`--json`)

### Entities

- `engram entities search <query>` — Search entities (`--json`, `-t|--type`, `-n|--limit`)
- `engram entities create <id> <name>` — Create/update entity (`-t|--type`)

### Agent-Friendly Output

All commands support `--json` for machine-readable output. Use this for agent automation:

```bash
# Store and capture fact ID
FACT_ID=$(engram store "Ryan prefers voice for stories" --json | jq -r .factId)

# Get status health check
engram status --robot | jq .healthy  # → true/false

# Search and parse results
engram search "OpenClaw" --json | jq '.[].content'
```

### Robot Mode

`engram status --robot` outputs a machine-readable JSON status:

```json
{
  "healthy": true,
  "agentId": "cammy",
  "agentRegistered": true,
  "convexUrl": "https://accurate-cardinal-287.convex.cloud",
  "factCount": 142,
  "scopeCount": 8,
  "sessionCount": 3,
  "lastActivity": 1708876543210,
  "timestamp": 1708876800000
}
```

## MCP Tools (69)

### Core (6)
`memory_store_fact` · `memory_recall` · `memory_search` · `memory_observe` · `memory_link_entity` · `memory_get_context`

### Retrieval Primitives (11)
`memory_vector_search` · `memory_text_search` · `memory_rank_candidates` · `memory_bump_access` · `memory_get_observations` · `memory_get_entities` · `memory_get_themes` · `memory_get_handoffs` · `memory_search_facts` · `memory_search_entities` · `memory_search_themes`

### Context Primitives (7)
`memory_resolve_scopes` · `memory_load_budgeted_facts` · `memory_search_daily_notes` · `memory_get_graph_neighbors` · `memory_get_activity_stats` · `memory_get_workspace_info` · `memory_build_system_prompt`

### Fact Lifecycle (6)
`memory_update_fact` · `memory_archive_fact` · `memory_boost_relevance` · `memory_list_stale_facts` · `memory_mark_facts_merged` · `memory_mark_facts_pruned`

### Agent (5)
`memory_register_agent` · `memory_end_session` · `memory_get_agent_info` · `memory_get_agent_context` · `memory_get_system_prompt`

### Signals (3)
`memory_record_signal` · `memory_record_feedback` · `memory_record_recall`

### Events (3)
`memory_poll_events` · `memory_get_notifications` · `memory_mark_notifications_read`

### Subscriptions (4)
`memory_subscribe` · `memory_unsubscribe` · `memory_list_subscriptions` · `memory_poll_subscription`

### Config (4)
`memory_get_config` · `memory_list_configs` · `memory_set_config` · `memory_set_scope_policy`

### Vault (9)
`memory_vault_sync` · `memory_vault_export` · `memory_vault_import` · `memory_vault_list_files` · `memory_vault_reconcile` · `memory_query_vault` · `memory_export_graph` · `memory_checkpoint` · `memory_wake`

### Composition (4)
`memory_summarize` · `memory_prune` · `memory_create_theme` · `memory_query_raw`

### Delete (5)
`memory_delete_entity` · `memory_delete_scope` · `memory_delete_conversation` · `memory_delete_session` · `memory_delete_theme`

### Discovery & Health (2)
`memory_list_capabilities` · `memory_health`

## Usage Pattern

```
1. Register your agent       →  memory_register_agent
2. Build system prompt       →  memory_build_system_prompt (full context injection)
3. Store facts as you work   →  memory_store_fact / memory_observe
4. Recall when needed        →  memory_recall (hybrid) or memory_vector_search + memory_rank_candidates (composable)
5. Get context               →  memory_get_context (wrapper) or compose: resolve_scopes + load_budgeted_facts + get_entities + get_themes
6. Provide feedback          →  memory_record_signal / memory_record_feedback
7. Check workspace           →  memory_get_workspace_info / memory_get_activity_stats
8. Subscribe to events       →  memory_subscribe + memory_poll_subscription
9. Discover tools            →  memory_list_capabilities
```

## Architecture

- **Convex Cloud** — 14 tables, native vector search, 11 cron jobs, async enrichment
- **MCP Server** — 69 tools over stdio + optional SSE, TypeScript, Convex HTTP client
- **SSE Server** — Real-time event streaming via `ENGRAM_SSE_PORT` (webhooks + SSE)
- **Dashboard** — Next.js agent monitoring UI (`dashboard/`)
- **Tool Registry** — Single source of truth: `mcp-server/src/lib/tool-registry.ts`
- **Cohere Embed 4** — 1024-dim multimodal embeddings (text + images + code)
- **Async Pipeline** — Facts stored in <50ms, enrichment runs asynchronously
- **Memory Lifecycle** — 5-state machine: active → dormant → merged → archived → pruned
