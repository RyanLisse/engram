# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Engram is a unified multi-agent memory system for OpenClaw agents. It provides a shared memory layer where agents store atomic facts, recall context via semantic search, and share knowledge across devices and sessions. Local-first via LanceDB, cloud-synced through Convex.

**Status:** Planning phase — no implementation code yet. See PLAN.md for the 6-phase build plan and RESEARCH.md for architecture research.

## Tech Stack

- **Convex** — Cloud backend (schema, CRUD, vector search, scheduled functions)
- **LanceDB** — Local vector database for sub-10ms offline search
- **TypeScript** — All code (MCP server + Convex functions)
- **OpenAI Embeddings** — `text-embedding-3-small` for 1536-dim vectors
- **MCP (Model Context Protocol)** — Agent-facing interface (8 tools)

## Architecture

Three-tier system: Convex cloud backend → MCP server per agent → local LanceDB cache.

Key architectural patterns:
- **Async enrichment pipeline**: Facts stored immediately (<50ms), embeddings/entity extraction/importance scoring run asynchronously via Convex actions. Agents never block on enrichment.
- **Scope-based access control**: Memory scoped to private/team/project/public — not per-fact ACLs. Agents query across all permitted scopes.
- **Memory decay**: `relevanceScore *= 0.99^days` with floor at 0.1. Old memories deprioritize but never delete.
- **Importance scoring**: Multi-factor formula — `(content × 0.4) + (centrality × 0.3) + (temporal × 0.2) + (access × 0.1)`. Ported from MemoryLance's ImportanceCalculator.

## Schema (7 Convex tables)

The full schema definitions with indices are in PLAN.md. Key tables:
- `facts` — Atomic memory units with 1536-dim embeddings, importance scores, and scope. Has full-text search index on `content` and vector index on `embedding`.
- `entities` — Named concepts (person/project/company/concept/tool) with relationship graph. Relationships are structured objects with `targetId`, `relationType`, `since`.
- `conversations` — Thread facts together with participant tracking and agent handoff context.
- `memory_scopes` — Access control groups with read/write policies and optional retention periods.
- `sync_log` — Tracks per-node LanceDB sync status.

## MCP Tools (8 primitives)

The MCP server exposes these tools to agents:
1. `memory_store_fact` — Store atomic fact, triggers async enrichment
2. `memory_recall` — Semantic vector search (primary retrieval), bumps access count
3. `memory_search` — Full-text + structured filters for precise lookups
4. `memory_link_entity` — Create/update entities and relationships
5. `memory_get_context` — Warm start: returns facts + entities + sessions for a topic
6. `memory_observe` — Fire-and-forget passive observation storage
7. `memory_register_agent` — Agent self-registration with capabilities and default scope
8. `memory_query_raw` — Escape hatch for direct Convex queries

## Planned Directory Structure

```
convex/           # Convex backend
  schema.ts       # 7 table definitions
  functions/      # CRUD + search (facts, entities, conversations, sessions, agents, scopes, sync)
  actions/        # Async: embed, extract entities, summarize, importance scoring
  crons/          # Scheduled: decay (daily), rerank (weekly), cleanup (daily)
mcp-server/src/   # MCP server
  index.ts        # Entry point
  tools/          # 8 MCP tool implementations
  lib/            # convex-client, lance-sync daemon, embeddings wrapper
skill/            # OpenClaw skill package (SKILL.md + install.sh)
scripts/          # migrate.ts (MemoryLance import), seed.ts (initial entities)
```

## Build Phases

Implementation follows 6 phases (see PLAN.md for full checklist):
1. **Foundation** — Convex project setup, schema, basic CRUD, full-text search
2. **MCP Server** — TypeScript MCP server scaffold, 8 tools, Convex HTTP client
3. **Async Enrichment** — Embeddings, entity extraction, importance scoring, vector search
4. **Multi-Agent** — Agent registration, scopes, scope-aware queries, handoff tracking
5. **Local Sync** — LanceDB sync daemon, local vector search fallback
6. **Migration** — Import from existing MemoryLance (entities.json, facts_schema.json, daily logs)

## Design Principles

- **Agent parity** — Every agent gets identical memory tools
- **Atomic primitives** — Granular operations, not workflow-shaped APIs
- **Composability** — New memory behaviors via prompts, not code changes
- **Emergent capability** — `query_raw` escape hatch for unanticipated use
- **Non-blocking** — Agents get immediate responses; enrichment is always async
