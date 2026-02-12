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

## MCP Tools (12)

| Tool | Description |
|------|-------------|
| `memory_store_fact` | Store an atomic fact with scope, entities, and tags |
| `memory_recall` | Semantic vector search across permitted scopes |
| `memory_search` | Full-text + structured filters for precise lookups |
| `memory_observe` | Fire-and-forget passive observation storage |
| `memory_link_entity` | Create/update entities and relationships |
| `memory_get_context` | Warm start with facts + entities + themes |
| `memory_register_agent` | Self-register with capabilities and scope |
| `memory_query_raw` | Direct Convex queries (read-only escape hatch) |
| `memory_record_signal` | Record ratings/sentiment feedback on facts |
| `memory_record_feedback` | Post-recall usefulness tracking |
| `memory_summarize` | Consolidate facts on a topic into themes |
| `memory_prune` | Agent-initiated cleanup of stale facts |

## Usage Pattern

```
1. Register your agent     →  memory_register_agent
2. Store facts as you work →  memory_store_fact / memory_observe
3. Recall when needed      →  memory_recall (semantic query)
4. Get full context        →  memory_get_context (warm starts)
5. Provide feedback        →  memory_record_signal / memory_record_feedback
```

## Architecture

- **Convex Cloud** — 10 tables, native vector search, 7 cron jobs, async enrichment
- **MCP Server** — 12 tools over stdio, TypeScript, Convex HTTP client
- **Cohere Embed 4** — 1024-dim multimodal embeddings (text + images + code)
- **Async Pipeline** — Facts stored in <50ms, enrichment runs asynchronously
- **Memory Lifecycle** — 5-state machine: active → dormant → merged → archived → pruned
