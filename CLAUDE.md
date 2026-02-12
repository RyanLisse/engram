# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Engram is a unified multi-agent memory system for OpenClaw agents. It provides a shared memory layer where agents store atomic facts, recall context via semantic search, and share knowledge across devices and sessions. Local-first via LanceDB, cloud-synced through Convex. Multimodal embeddings via Cohere Embed 4.

**Status:** Phases 1-6 complete. Core system operational (Convex backend + MCP server + crons + LanceDB sync daemon). See PLAN.md for the build checklist and `docs/research/` for architecture research.

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

## Directory Structure

```
convex/           # Convex backend
  schema.ts       # 10 table definitions with indexes
  functions/      # CRUD + search (facts, entities, conversations, sessions, agents, scopes, signals, themes, sync, seed)
  actions/        # Async: enrich, embed (Cohere Embed 4), importance, vectorSearch
  crons.ts        # 7 cron job configuration
  crons/          # Cron implementations: decay, forget, compact, consolidate, rerank, rules, cleanup
mcp-server/src/   # MCP server
  index.ts        # Entry point (12 tools, stdio transport)
  tools/          # 12 MCP tool implementations
  lib/            # convex-client (string-based paths), lance-sync daemon, embeddings (Cohere Embed 4)
skill/            # OpenClaw skill package (SKILL.md + install.sh)
```

## Key Implementation Details

### Convex Integration from MCP Server
The MCP server is a separate TypeScript package that cannot import Convex generated types. All Convex calls use string-based function paths (e.g., `"functions/facts:storeFact"`) wrapped in typed helper functions in `mcp-server/src/lib/convex-client.ts`. The `as any` cast is isolated to that one file.

### Scope Resolution Convention
Scope names follow the pattern `private-{agentId}` (e.g., `private-indy`). Tools resolve scope names to Convex document IDs via `getScopeByName()`. The agent's `defaultScope` field stores the scope name, not the ID.

### Embedding Model
Cohere Embed 4 (`embed-v4.0`, 1024 dimensions) is used in both:
- `convex/actions/embed.ts` — Enrichment pipeline (runs in Convex Node.js runtime)
- `mcp-server/src/lib/embeddings.ts` — MCP server client (for future local use)

## Design Principles

- **Agent parity** — Every agent gets identical memory tools
- **Atomic primitives** — Granular operations, not workflow-shaped APIs
- **Composability** — New memory behaviors via prompts, not code changes
- **Emergent capability** — `query_raw` escape hatch for unanticipated use
- **Non-blocking** — Agents get immediate responses; enrichment is always async
- **Merge before delete** — Never true-delete facts; consolidate, then archive
- **Learn from outcomes** — Track which memories actually helped via feedback signals
