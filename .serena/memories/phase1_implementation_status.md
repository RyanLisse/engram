# Phase 1 Foundation — Implementation Status

## Status: Starting Implementation (2026-02-11)

## Completed Pre-Work
- Full Phase 1 plan at `docs/plans/2026-02-11-feat-engram-phase1-foundation-plan.md`
- 13 beads created (1 epic + 12 tasks) in `.beads/issues.jsonl`
- PLAN.md synced with latest research (Cohere Embed 4, 12 MCP tools, 10 tables)
- Institutional learnings documented at `docs/INSTITUTIONAL_LEARNINGS.md`

## Key Schema Decisions
- Use full PLAN.md schema with all `v.optional()` fields
- Use `lifecycleState` (5 states: active|dormant|merged|archived|pruned), NOT `status`
- 1024 dimensions for Cohere Embed 4 vector index
- Write permission enforcement on storeFact (scope-based: all|members|creator)
- Comment out enrichment scheduler in Phase 1 (action doesn't exist yet)

## Bead Execution Order
1. engram-u51.1: Init Convex (P0, no deps)
2. engram-u51.2: Schema 10 tables (P0, deps: u51.1)
3. engram-u51.3: Scopes CRUD (P1, deps: u51.2) — needed by Facts for write permission
4. engram-u51.4: Facts CRUD + search (P0, deps: u51.2, u51.3)
5. engram-u51.5: Entities CRUD (P1, deps: u51.2)
6. engram-u51.6: Agents CRUD (P1, deps: u51.2)
7. engram-u51.7-11: Remaining CRUD (P2, deps: u51.2)
8. engram-u51.12: Seed Script (P1, deps: u51.3, u51.4, u51.5, u51.6)
9. engram-u51.13: E2E Verification (P1, deps: all)

## Critical Patterns
- Batch inserts in single mutation (not N separate mutations)
- Vector search only in actions (not queries/mutations)
- Actions are at-most-once (design idempotent)
- Full-text search with scopeId filter field in search index
- Shared helper pattern for public + internal queries
