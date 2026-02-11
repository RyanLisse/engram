# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Engram is a unified multi-agent memory system for OpenClaw agents. It provides a shared memory layer where agents store atomic facts, recall context via semantic search, and share knowledge across devices and sessions. Local-first via LanceDB, cloud-synced through Convex. Multimodal embeddings via Cohere Embed 4.

**Status:** Planning phase — no implementation code yet. See PLAN.md for the 6-phase build plan. See `docs/research/` for architecture research and `docs/plans/` for the detailed implementation plan.

## Tech Stack

- **Convex** — Cloud backend (schema, CRUD, vector search, scheduled functions)
- **LanceDB** — Local vector database for sub-10ms offline search
- **TypeScript** — All code (MCP server + Convex functions)
- **Cohere Embed 4** — Multimodal embeddings (1024-dim, text + images + code)
- **MCP (Model Context Protocol)** — Agent-facing interface (12 tools)

## Architecture

Three-tier system: Convex cloud backend → MCP server per agent → local LanceDB cache.

Key architectural patterns:
- **Async enrichment pipeline**: Facts stored immediately (<50ms), compression/embeddings/entity extraction/synthesis/importance scoring run asynchronously via Convex actions. Agents never block on enrichment.
- **Scope-based access control**: Memory scoped to private/team/project/public — not per-fact ACLs. Agents query across all permitted scopes.
- **Differential memory decay**: Decay rate varies by fact type (decisions slow, notes fast). Emotional weight further resists decay. Never delete, always archive.
- **Memory lifecycle**: 5-state machine — active → dormant → merged → archived → pruned. Merge before delete.
- **Importance scoring**: Multi-factor formula + outcome-based learned utility (MemRL pattern).
- **Memory consolidation**: Related facts automatically merge into themes over time (SimpleMem/EverMemOS pattern).

## Schema (10 Convex tables)

The full schema definitions with indices are in PLAN.md. Key tables:
- `facts` — Atomic memory units with 1024-dim Cohere embeddings, importance scores, lifecycle state, emotional context, temporal links, and scope.
- `entities` — Named concepts (person/project/company/concept/tool) with relationship graph.
- `conversations` — Thread facts together with participant tracking and agent handoff context.
- `memory_scopes` — Access control groups with read/write policies, per-scope memory policies, and optional ISC criteria.
- `signals` — Feedback loop: explicit ratings + implicit sentiment capture (PAI pattern).
- `themes` — Thematic fact clusters for hierarchical memory (EverMemOS MemScenes pattern).
- `sync_log` — Tracks per-node LanceDB sync status.

## MCP Tools (12 primitives)

The MCP server exposes these tools to agents:
1. `memory_store_fact` — Store atomic fact, triggers async enrichment pipeline
2. `memory_recall` — Semantic vector search (primary retrieval), bumps access count, returns recallId
3. `memory_search` — Full-text + structured filters for precise lookups
4. `memory_link_entity` — Create/update entities and relationships
5. `memory_get_context` — Warm start with token-aware injection: facts + entities + themes + steering rules
6. `memory_observe` — Fire-and-forget passive observation storage
7. `memory_register_agent` — Agent self-registration with capabilities, scope, and telos
8. `memory_query_raw` — Escape hatch for direct Convex queries (read-only)
9. `memory_record_signal` — Record ratings/sentiment feedback on facts (PAI)
10. `memory_record_feedback` — Post-recall usefulness tracking (ALMA)
11. `memory_summarize` — Consolidate facts on a topic (AgeMem SUMMARY)
12. `memory_prune` — Agent-initiated cleanup of stale facts (AgeMem FILTER)

## Planned Directory Structure

```
convex/           # Convex backend
  schema.ts       # 10 table definitions
  functions/      # CRUD + search (facts, entities, conversations, sessions, agents, scopes, signals, themes, sync)
  actions/        # Async: embed (Cohere), compress, synthesize, extract entities, summarize, importance scoring
  crons/          # Scheduled: decay, forget, compact, consolidate, rerank, rules, cleanup
mcp-server/src/   # MCP server
  index.ts        # Entry point
  tools/          # 12 MCP tool implementations
  lib/            # convex-client, lance-sync daemon, embeddings wrapper (Cohere)
skill/            # OpenClaw skill package (SKILL.md + install.sh)
scripts/          # migrate.ts (MemoryLance import), seed.ts (initial entities)
```

## Build Phases

Implementation follows 6 phases (see PLAN.md for full checklist):
1. **Foundation** — Convex project setup, 10-table schema, basic CRUD, full-text search
2. **MCP Server** — TypeScript MCP server scaffold, 12 tools, Convex HTTP client
3. **Async Enrichment** — Cohere embeddings, compression, synthesis, entity extraction, importance scoring, vector search
4. **Multi-Agent** — Agent registration, scopes, multi-scope queries, handoff tracking, signals
5. **Local Sync** — LanceDB sync daemon, scope-aware sync, local vector search fallback
6. **Migration** — Import from existing MemoryLance + all 7 cron jobs configured

## Design Principles

- **Agent parity** — Every agent gets identical memory tools
- **Atomic primitives** — Granular operations, not workflow-shaped APIs
- **Composability** — New memory behaviors via prompts, not code changes
- **Emergent capability** — `query_raw` escape hatch for unanticipated use
- **Non-blocking** — Agents get immediate responses; enrichment is always async
- **Merge before delete** — Never true-delete facts; consolidate, then archive
- **Learn from outcomes** — Track which memories actually helped via feedback signals
