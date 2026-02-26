# Phase 6 Implementation — Executive Summary

**Status:** 7/8 tasks are implementation-ready; 1/8 needs design decisions
**Timeline:** 8-9 calendar days (2-3 developers)
**Effort:** ~50-60 engineering hours
**Risk Level:** LOW (95% of infrastructure already exists)

---

## The 8 Tasks

### Already ~90% Complete (Verify & Test)
| Task | What | Status | Work Left |
|------|------|--------|-----------|
| **engram-uw7** | Export facts to markdown with YAML | ✅ Code done | 2-3h tests |
| **engram-g3o** | File watcher for two-way sync | ✅ Code done | 4-6h tests |
| **engram-7eb** | Dashboard version timeline | 🟡 Design only | 4-6h React |

### Ready for Implementation (Need Design Answers)
| Task | What | Blocker | Effort |
|------|------|---------|--------|
| **engram-7g0** | Bootstrap e2e tests | Q1.1-Q1.4 | 8-10h |
| **engram-wxn** | Mirror round-trip tests | Q1.5-Q1.6 | 10-12h |
| **engram-1vt** | Git auto-commit daemon | Q5.1-Q5.5 | 12-16h |

### Parent Beads (Auto-Close After Children)
| Task | What |
|------|------|
| **engram-1ob** | Feature parent (6 children) |
| **engram-w3u** | Epic parent |

---

## Key Finding: No Major Gaps

**95% of vault infrastructure already exists:**
- ✅ `vault-writer.ts` — Convex → Markdown export
- ✅ `vault-sync.ts` daemon — File watcher + import
- ✅ `vault-reconciler.ts` — Conflict detection
- ✅ `vault-format.ts` — Serialization
- ✅ `fact_versions` table — Version history tracking
- ✅ Schema fields — vaultPath, vaultSyncedAt, lifecycleState

**What's missing:**
1. **Test coverage** — No round-trip tests (export→edit→import)
2. **Dashboard component** — Timeline not yet rendered
3. **Git integration** — No auto-commit daemon
4. **Design clarity** — 8 critical questions need answers

---

## Critical Questions Needing Answers

### Design Questions (blocking implementation)

**Bootstrap Pipeline (Q1.1-Q1.4):**
1. **Dedup threshold:** 0.85 or 0.95 cosine similarity? (affects duplicate creation)
2. **Target scope:** Where to ingest bootstrap facts? (`private-bootstrap` or user-specified?)
3. **Enrichment blocking:** Wait for embeddings or async ingestion?
4. **Resume checkpoint:** How to detect already-processed sessions?

**Mirror Sync (Q1.5-Q1.6):**
5. **Delete handling:** User deletes .md file → delete Convex fact? (assume: no)
6. **Watcher dedup:** Multiple file edits → multiple DB updates? (assume: yes, but test)

**Git Integration (Q5.1-Q5.5):**
7. **Git library:** Use `simple-git` npm or shell `git` CLI? (MUST specify)
8. **Author mapping:** How to map agentId → git author? (read from config or agents table?)
9. **Dirty tree:** Stash + retry or warn + skip? (assume: warn + skip for safety)
10. **Merge handling:** Skip auto-commit or abort merge? (assume: skip)
11. **Commit message:** Format? Example: `"Memory: Chose TypeScript (Type safety)"`

---

## Implementation Roadmap

### Sprint 1: Low-Risk (Days 1-2)

**engram-7eb: Dashboard Timeline Component**
- Create React component for version history timeline
- Show version timestamps, agent names, change reasons
- Diff view (side-by-side or inline)
- Rollback button + confirmation
- Time: 4-6 hours
- Risk: LOW (isolated, no dependencies)

**engram-uw7: Export Tests**
- Verify existing vault-writer.ts works correctly
- Add tests: bulk export, special characters, encodings
- Measure performance (<1s per fact)
- Time: 2-3 hours
- Risk: LOW (code already exists, just verify)

### Sprint 2: Design Clarity (Day 3)

**Decision Document**
- Answer all 11 critical questions
- Create: `docs/DESIGN-DECISIONS-PHASE6.md`
- Owner: Lead architect
- Time: 4 hours
- Risk: LOW (requires discussion, no coding)

### Sprint 3: Testing (Days 4-7)

**engram-7g0: Bootstrap E2E Tests**
- Full pipeline: sessions → extraction → dedup → Convex ingestion
- Test parallel processing, resume from checkpoint, error recovery
- Time: 8-10 hours
- Risk: MEDIUM (touches production ingestion)

**engram-wxn: Mirror Round-Trip Tests**
- Create → export → edit → import cycle
- Conflict detection, watcher dedup, scale tests
- Time: 10-12 hours
- Risk: MEDIUM (tests critical sync path)

**engram-g3o: Watcher Tests** (included in engram-wxn)

### Sprint 4: Git Integration (Days 8-9)

**engram-1vt: Git Auto-Commit Daemon**
- Initialize repo (git init, .gitignore)
- Auto-commit on fact creation/update
- Handle dirty tree (stash or warn)
- Handle merge/rebase in progress
- Author mapping from config
- Time: 12-16 hours
- Risk: MEDIUM (git state manipulation)

### Sprint 5: Wrap-Up (Day 10)

**Close Parent Beads**
- Mark engram-1ob (feature parent) complete
- Mark engram-w3u (epic parent) complete
- Update documentation
- Time: 1 hour

---

## Risk Assessment

### LOW-RISK Tasks
- ✅ engram-7eb (Dashboard) — isolated, no side effects
- ✅ engram-uw7 (Export) — code exists, just verify
- ✅ engram-g3o (Watcher) — code exists, just test

### MEDIUM-RISK Tasks
- ⚠️ engram-7g0 (Bootstrap) — touches data ingestion; needs careful testing
- ⚠️ engram-wxn (Mirror) — bidirectional sync; needs conflict testing
- ⚠️ engram-1vt (Git) — git state manipulation; needs robust error handling

### Mitigation
- Answer design questions BEFORE implementation
- All tests must include error cases
- Git integration should be safely reversible
- Use feature flags to roll out incrementally

---

## Success Metrics

| Metric | Target | Baseline |
|--------|--------|----------|
| Test coverage | ≥90% for Phase 6 code | Currently: N/A (no Phase 6 tests) |
| Bootstrap throughput | 1800 facts in <5 minutes | Unknown |
| Mirror sync latency | <100ms per file | Unknown |
| Git commit latency | <500ms per commit | Unknown |
| All tests passing | 100% | Current: 1168/1168 (100%) |

---

## Next Actions

### IMMEDIATE (This Week)
1. **Schedule 1-hour design meeting** to answer 11 critical questions
2. **Start engram-7eb** (dashboard) — lowest complexity
3. **Verify engram-uw7** — test existing code
4. **Document decisions** in DESIGN-DECISIONS-PHASE6.md

### THIS SPRINT
5. **Implement engram-7g0** (bootstrap tests)
6. **Implement engram-wxn** (mirror tests)
7. **Implement engram-1vt** (git daemon)
8. **Close parent beads**

### AFTER PHASE 6
- Phase 7: AI-powered auto-linking, smart entity dedup
- Phase 8: Multi-agent collaborative memory with consensus
- Phase 9: Rust/WASM acceleration for ranking

---

## Questions Before Starting?

1. **Git integration:** Approve simple-git npm package + simple error handling?
2. **Bootstrap scope:** Should bootstrap facts go to `private-bootstrap` or user-specified scope?
3. **Timeline:** Is 8-9 day estimate acceptable? (can parallelize to ~5 days with 3 devs)
4. **Priority:** Implement all 6 tasks or phase them?

---

**Prepared:** 2026-02-25
**Full Analysis:** See `docs/ANALYSIS-REMAINING-8-TASKS.md`
**Review By:** Lead architect
**Approval From:** Project sponsor
