# Engram — Unimplemented Items

Audit date: 2026-02-14
Source: All specs in `specs/` and plans in `docs/plans/`

---

## 1. Smart Routing via Enrichment Pipeline

**Source:** `docs/plans/2026-02-14-feat-phase-2-smart-routing-plan.md`

- [x] Add `notifications` table to `convex/schema.ts` (agentId, factId, reason, read, createdAt, expiresAt + indexes)
- [x] Create `convex/actions/embedAgentCapabilities.ts` — embed agent capabilities+telos via Cohere, store in `agents.capabilityEmbedding`
- [x] Create `convex/actions/route.ts` — after enrichment, match fact embedding against agent capability embeddings, create notifications for relevant agents (similarity > 0.3, importance > 0.5)
- [x] Create `convex/functions/notifications.ts` — `getUnreadByAgent`, `markRead`, `markAllRead`, `deleteExpired`
- [x] Extend `convex/actions/enrich.ts` — after importance scoring, schedule `route.routeToAgents` (fire-and-forget)
- [x] Extend `mcp-server/src/tools/get-context.ts` — fetch unread notifications, include in response (max 10), auto-mark as read
- [x] Extend `mcp-server/src/tools/register-agent.ts` — trigger capability embedding after registration
- [x] Add notification cleanup cron to `convex/crons.ts` — daily at 1:30 UTC, delete expired (30-day TTL)
- [x] Add `cleanExpiredNotifications` to `convex/crons/cleanup.ts` — batch 500, self-schedule

---

## 2. Cross-Agent Deduplication

**Source:** `docs/plans/2026-02-14-feat-phase-3-deduplication-plan.md`

- [x] Add `mergedContent: v.optional(v.string())` to facts table in `convex/schema.ts`
- [x] Add `dedupThreshold: v.optional(v.float64())` to scope `memoryPolicy` object in `convex/schema.ts`
- [x] Create `convex/crons/dedup.ts` — daily cron: get shared scopes, compare recent facts (48h) from different agents, merge if cosine similarity > threshold (default 0.88)
- [x] Register dedup cron in `convex/crons.ts` — daily at 2:30 UTC

---

## 3. Security Hardening

**Source:** `docs/plans/2026-02-14-feat-phase-4-security-hardening-plan.md`

- [x] Extend `convex/functions/scopes.ts` `removeMember` — clean up notifications for facts in that scope when agent is removed
- [x] Add `getByName` as a public query in `convex/functions/scopes.ts` (already exists — ✅ verified present)
- [x] Create `tests/security-audit.ts` — test routing respects scope access, outer ring isolation, private scope dedup isolation
- [x] Create `SECURITY.md` — document scope access model
- [x] Create `SCOPES.md` — document admin policy options

---

## 4. Scope Safety (Multi-Scope Recall)

**Source:** `docs/plans/SCOPE-SAFETY-SPEC.md`

- [x] Add `searchFactsMulti(scopeIds[])` query to `convex/functions/facts.ts` — fan-out per scope, merge results
- [x] Add `vectorRecall(scopeIds[], embedding)` query to `convex/functions/facts.ts` — fan-out vector search per scope
- [x] Wire multi-scope recall into `mcp-server/src/tools/recall.ts` so it passes `scopeIds[]` instead of single `scopeId`
- [x] Add tests: agent A cannot recall from agent B's private scope; empty scopeIds returns empty; multi-scope merges only permitted scopes

---

## 5. Hybrid Ranking Engine

**Source:** `docs/plans/ROADMAP-2026.md` (Pillar 2: Hybrid Retrieval)

- [x] Implement ranking formula: `0.45*semantic + 0.15*lexical + 0.20*importance + 0.10*freshness + 0.10*outcome`
- [x] Create `mcp-server/src/lib/ranking.ts` — normalize signals, weighted merge, top-k selection
- [x] Add `searchStrategy` parameter to `memory_recall` tool (vector-only, text-only, hybrid)
- [x] Batch `bumpAccess` after recall (currently done per-fact)

---

## 6. Feedback → Learning Loop

**Source:** `docs/plans/ROADMAP-2026.md` (Pillar 3: Feedback → Learning)

- [x] Wire `outcomeScore` updates from signals — `convex/functions/facts.ts` `updateOutcomeFromFeedback` mutation (EMA or bounded average)
- [x] Integrate usefulness signals into `convex/crons/rerank.ts` — boost facts with positive outcome, demote negative
- [x] Track `recallId` → fact usage mapping for feedback loop

---

## 7. Context Profiles (ClawVault Pattern)

**Source:** `specs/clawvault-learnings.md` (Phase 4: Context-Budgeted Recall)

- [x] Add `profile` parameter to `memory_get_context` tool — `default`, `planning`, `incident`, `handoff`
- [x] Implement profile-based source ordering in `mcp-server/src/tools/get-context.ts`
- [x] Wire `budget-aware-loader.ts` into `get-context.ts` with token budget parameter (default 4000 tokens)
- [x] Multi-source gathering: observations (by importance tier), daily notes, search results, graph neighbors (BFS 1-2 hops)

---

## 8. Context Death Resilience (ClawVault Pattern)

**Source:** `specs/clawvault-learnings.md` (Phase 5) + `specs/obsidian-mirror-plan.md` (Phase 6)

- [x] Implement dirty-death flag in `memory_checkpoint` — write flag on checkpoint, clear on `memory_end_session`
- [x] Implement temporal decay in `memory_wake` — today: all structural+potential; yesterday: structural + top 5 potential; 2-3 days: structural only; 4-6 days: top 3 structural
- [x] Generate "Who I Was" session recap from handoffs, active projects, pending commitments, recent decisions/lessons

---

## 9. Rust/WASM Acceleration (DEFERRED)

**Source:** `docs/plans/RUST-WASM-ACCELERATION.md`

*Intentionally deferred — build after milestones 1-3 are working in TypeScript.*

- [ ] Create `rust/` crate (`engram-accel`)
- [ ] Implement `rank_candidates` — weighted multi-signal top-k selection
- [ ] Implement `detect_duplicates` — batch cosine similarity, pair detection
- [ ] Expose via napi-rs (primary) or WASM (fallback)
- [ ] Integration in `mcp-server/src/lib/ranking.ts` with TS fallback

---

## Priority Order

| # | Item | Value | Effort | Dependencies |
|---|------|-------|--------|-------------|
| 1 | Scope Safety (multi-scope recall) | Critical | Low | None |
| 2 | Smart Routing (notifications) | High | Medium | Schema change |
| 3 | Cross-Agent Deduplication | High | Medium | Notifications (for cleanup) |
| 4 | Security Hardening | High | Low | #2, #3 |
| 5 | Hybrid Ranking Engine | High | Medium | None |
| 6 | Feedback → Learning Loop | Medium | Low | Hybrid ranking |
| 7 | Context Profiles | Medium | Low | None |
| 8 | Context Death Resilience | Medium | Low | None |
| 9 | Rust/WASM Acceleration | Low | High | #5 |
