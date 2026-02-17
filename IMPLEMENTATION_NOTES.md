# Implementation Notes — Engram Optimizations

**Date:** 2026-02-17

## Files Changed

### Fix 1: Parallel vector search (`convex/actions/vectorSearch.ts`)
- Replaced the sequential `for` loop in `vectorRecallAction` with `Promise.all()`.
- Fixed the under-fetching bug: now over-fetches **1.5× per scope** before merging and trimming to `limit`.
- Result: vector search across N scopes now runs in parallel instead of N sequential round-trips.

### Fix 2: `scope_memberships` join table

#### `convex/schema.ts`
- Added new `scope_memberships` table with indexes `by_agent`, `by_scope`, `by_agent_scope`.
- Added `lastContradictionCheck: v.optional(v.number())` and `contradictsWith: v.optional(v.array(v.id("facts")))` fields to the `facts` table (used by Fix 3).

#### `convex/functions/scopes.ts`
- Replaced `getPermitted` query: now uses the join table (`scope_memberships`) for O(memberships) lookup instead of scanning all scopes.
- Updated `create` mutation: inserts a `scope_memberships` row for each initial member (first member gets `role: "creator"`, rest get `role: "member"`).
- Updated `addMember` mutation: inserts a `scope_memberships` row (idempotent check via `by_agent_scope` index).
- Updated `removeMember` mutation: deletes the corresponding `scope_memberships` row.

### Fix 3: Forget cron — three-part fix

#### `convex/crons/forget.ts` (rewritten)
- Batches scope-level DB queries upfront: loads all active facts per scope once into `scopeFactsMap`, eliminating O(facts) individual DB queries during the main loop.
- Uses pre-computed `contradictsWith` field (from enrichment pipeline) for O(1) contradiction lookup; falls back to in-memory scan only when unset or stale (>7 days).
- Expanded polarity pairs: added `["active", "inactive"]` and `["on", "off"]`.
- Uses a single `now` timestamp throughout instead of repeated `Date.now()` calls.

#### `convex/functions/facts.ts`
- Added `checkContradictions` internal mutation: queries same-scope facts with higher importance score, detects contradictions via polarity-pair matching, and patches the fact with `contradictsWith` and `lastContradictionCheck`.

#### `convex/actions/enrich.ts`
- Added step 5 in `enrichFact` action: calls `internal.functions.facts.checkContradictions` after importance scoring and before writing enrichment results back.
- This pre-computes contradictions at write time so the forget cron gets O(1) lookups.

## TypeScript Status
- `tsc --noEmit` on the project: pre-existing errors in unrelated files (`embed.ts`, `reconcileFromVault.ts`, `regenerateIndices.ts`, `crons/consolidate.ts`, `seed.ts`, `scripts/`). **No new errors introduced.**
- `mcp-server/npm run build` (tsc): **clean, zero errors.**
