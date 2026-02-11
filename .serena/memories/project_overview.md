# Engram — Project Overview

## Purpose
Unified multi-agent memory system for OpenClaw agents. Shared memory layer where agents store atomic facts, recall context via semantic search, and share knowledge across devices and sessions.

## Status
**Planning phase** — no implementation code yet. All design docs complete. Ready for Phase 1 build.

## Architecture (Three-Tier)
1. **Convex cloud backend** — Source of truth, 10 tables, async enrichment (6 actions), 7 cron jobs
2. **MCP server per agent** — 12 MCP tool primitives, ConvexHttpClient, stdio transport
3. **LanceDB local cache** — Sub-10ms vector search, synced from Convex every 30s

## Tech Stack
- **Convex** — Cloud backend (schema, CRUD, vector search, scheduled functions)
- **LanceDB** — Local vector database (`@lancedb/lancedb`, async API)
- **TypeScript** — All code (MCP server + Convex functions)
- **Cohere Embed 4** — Multimodal embeddings (1024-dim, text + images + code)
- **MCP SDK** — `@modelcontextprotocol/sdk` v1.x (stdio transport)
- **GPT-4o-mini** — Entity extraction (cheap, async in Convex actions)

## Key Design Patterns
- **Async enrichment pipeline**: Facts stored immediately (<50ms), compression/embeddings/entity extraction run asynchronously
- **Scope-based access control**: Memory scoped to private/team/project/public
- **Differential memory decay**: Decay rate varies by fact type + emotional weight
- **Memory lifecycle**: 5-state (active → dormant → merged → archived → pruned)
- **Merge before delete**: Never true-delete facts, always archive

## Repository
- Owner: RyanLisse
- URL: https://github.com/RyanLisse/engram
