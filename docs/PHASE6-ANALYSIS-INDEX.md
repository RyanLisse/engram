# Phase 6 Analysis Index — Complete Documentation Package

**Analysis Date:** 2026-02-25
**Status:** COMPLETE — Ready for implementation planning
**Audience:** Project lead, architects, developers

---

## Overview

This is a **comprehensive UX flow and gap analysis** for Engram's Phase 6 implementation covering 8 remaining tasks across 3 clusters (Testing, Dashboard, Filesystem Mirror). The analysis identifies every possible user journey, edge case, and ambiguity that must be resolved before implementation.

**Key Finding:** 95% of infrastructure already exists. Remaining work is primarily testing and filling architectural gaps.

---

## Documents at a Glance

### 1. ANALYSIS-REMAINING-8-TASKS.md (54 KB) — Full Deep-Dive

**Read this for:** Complete understanding of all flows, gaps, and questions
**Contains:**
- Detailed user flow analysis (3 journey per task, 81-19,683 permutations)
- Missing specifications by category (error handling, validation, security, etc.)
- 100+ critical questions organized by priority (P0, P1, P2)
- Gap identification matrix with impact assessment
- Recommended implementation order and dependencies
- Full context on vault infrastructure overlap

**Chapters:**
- Part 1: Detailed User Flow Analysis (engram-7g0, engram-wxn, engram-7eb, engram-uw7, engram-g3o, engram-1vt)
- Part 2: Gap Identification & Critical Questions
- Part 3: Comprehensive Testing Strategy
- Part 4: Implementation Priority & Dependencies
- Part 5: Recommended Next Steps
- Appendix A: File Paths & Code References
- Appendix B: Test Fixture Templates

**Reading Time:** 45 minutes (full coverage) or 15 minutes (critical questions only)

**Key Insight:** Each task has 4-5 critical user journeys plus 2,000+ edge cases. All identified and documented.

---

### 2. PHASE6-EXECUTIVE-SUMMARY.md (6.8 KB) — Stakeholder Brief

**Read this for:** High-level overview, timeline, risk, resource requirements
**Contains:**
- 8 tasks mapped to status, complexity, effort
- 95% infrastructure completion finding
- 11 critical questions blocking 3 tasks
- 8-9 day timeline, 50-60 engineering hours
- Risk assessment (LOW, MEDIUM risk tasks identified)
- Success metrics
- Next actions (immediate, sprint 1-4)

**Audience:** Project leads, sponsors, architects

**Reading Time:** 5 minutes

**Decision Required:** Approve timeline, answer 11 critical questions

---

### 3. PHASE6-DESIGN-QUESTIONS-TEMPLATE.md (18 KB) — Decision Worksheet

**Read this for:** Detailed design questions that MUST be answered before coding
**Contains:**
- 11 critical questions with full options (A/B/C/D)
- Why each question matters
- Example scenarios
- Acceptance criteria for each decision
- Current implementation status
- Recommendations for each

**Questions Covered:**
- Q1.1: Dedup threshold (0.75 vs 0.85 vs 0.95?)
- Q1.2: Bootstrap scope (where to ingest?)
- Q1.3: Enrichment blocking (sync or async?)
- Q1.4: Resume checkpoint (how to track?)
- Q1.5: File deletion (delete fact or orphan?)
- Q1.6: Watcher dedup (how many reconciles?)
- Q5.1: Git library (simple-git vs CLI?)
- Q5.2: Author mapping (how to map agentId?)
- Q5.3: Dirty tree (stash, warn, or fail?)
- Q5.4: Merge/rebase (skip or abort?)
- Q5.5: Commit message (format?)

**Action Required:** Fill in selected options and rationale for each question

**Reading Time:** 20 minutes to understand, 30 minutes to fill in

**Approval Gate:** All questions must be answered before implementation starts

---

### 4. PHASE6-QUICK-START.md (16 KB) — Developer Reference

**Read this for:** Quick orientation as a developer, task breakdown, key APIs
**Contains:**
- 8 tasks at a glance with status and file locations
- Implementation order (Week 1-4)
- Complexity matrix (XS to L)
- Key code snippets (vault export, sync daemon, reconciliation, version history)
- Testing patterns and fixtures
- Common pitfalls to avoid
- Success criteria checklist

**Audience:** Developers implementing Phase 6

**Reading Time:** 10 minutes

**Start Here:** If you're assigned one of the 8 tasks

---

## How to Use This Analysis

### For Project Leads
1. Read PHASE6-EXECUTIVE-SUMMARY.md (5 min)
2. Schedule decision meeting on critical questions (1 hour)
3. Assign PHASE6-DESIGN-QUESTIONS-TEMPLATE.md to architect for filling in
4. Approve timeline and resource allocation
5. Link full analysis doc for team reference

### For Architects
1. Read PHASE6-EXECUTIVE-SUMMARY.md (5 min)
2. Read ANALYSIS-REMAINING-8-TASKS.md sections on your assigned cluster (15 min)
3. Fill in PHASE6-DESIGN-QUESTIONS-TEMPLATE.md with decisions (30 min)
4. Create DESIGN-DECISIONS-PHASE6.md from answers
5. Review with team and get sign-off

### For Developers
1. Read PHASE6-QUICK-START.md (10 min)
2. Find your assigned task in ANALYSIS-REMAINING-8-TASKS.md
3. Read your task's section for user flows, gaps, and critical paths
4. Check PHASE6-DESIGN-QUESTIONS-TEMPLATE.md for blockers
5. Review key files and APIs in Quick Start
6. Reference Appendix B for test fixtures
7. Start implementation

### For Testers
1. Read PHASE6-QUICK-START.md sections on testing
2. Read ANALYSIS-REMAINING-8-TASKS.md Part 3: Comprehensive Testing Strategy
3. Review critical paths matrix for your task
4. Read Appendix B: Test Fixture Templates
5. Create test fixtures and e2e test structure

---

## Critical Questions Summary

**11 questions must be answered before implementation can begin:**

| Q# | Question | Impact | Status |
|----|----------|--------|--------|
| Q1.1 | Dedup threshold: 0.75, 0.85, 0.95? | Affects bootstrap duplicates | PENDING |
| Q1.2 | Bootstrap scope: where to ingest? | Access control, discoverability | PENDING |
| Q1.3 | Enrichment: blocking or async? | Performance, test assertions | PENDING |
| Q1.4 | Resume: how to track progress? | Recovery from partial failure | PENDING |
| Q1.5 | File delete: delete fact or orphan? | Data consistency, user safety | PENDING |
| Q1.6 | Watcher: multiple edits → multiple updates? | Database churn | PENDING |
| Q5.1 | Git library: simple-git or CLI? | Dependencies, error handling | PENDING |
| Q5.2 | Author mapping: agents table, config, env? | Git history accuracy | PENDING |
| Q5.3 | Dirty tree: stash, warn, or fail? | Safety of concurrent edits | PENDING |
| Q5.4 | Merge/rebase: skip or abort? | Git state integrity | PENDING |
| Q5.5 | Commit message: format? | Git history readability | PENDING |

**→ See PHASE6-DESIGN-QUESTIONS-TEMPLATE.md to answer and document decisions**

---

## Task Complexity & Effort

| Task | Size | Risk | Effort | Status | Priority |
|------|------|------|--------|--------|----------|
| engram-7eb | XS | LOW | 4-6h | Ready | P0 |
| engram-uw7 | S | LOW | 2-3h | Ready | P0 |
| engram-g3o | S | LOW | 4-6h | Ready | P1 |
| engram-7g0 | M | MED | 8-10h | Blocked (Q1.1-Q1.4) | P1 |
| engram-wxn | L | MED | 10-12h | Blocked (Q1.5-Q1.6) | P1 |
| engram-1vt | L | MED | 12-16h | Blocked (Q5.1-Q5.5) | P1 |
| engram-1ob | — | — | — | Awaits 6 children | P2 |
| engram-w3u | — | — | — | Awaits 1ob | P2 |

**Total Effort:** 50-60 engineering hours
**Timeline:** 8-9 calendar days (2-3 developers recommended)
**Critical Path:** Answer questions → engram-7eb + uw7 + g3o → answers → 7g0/wxn/1vt → parent beads

---

## Key Findings

### Infrastructure Completeness

**95% Done:**
- ✓ vault-writer.ts (fact export to markdown)
- ✓ vault-sync.ts daemon (file watcher)
- ✓ vault-reconciler.ts (conflict detection)
- ✓ vault-format.ts (YAML serialization)
- ✓ fact_versions table (version history)
- ✓ Bootstrap infrastructure (session parsing, dedup)

**5% Missing:**
- ✗ React timeline component (engram-7eb)
- ✗ Git integration daemon (engram-1vt)
- ✗ Comprehensive e2e tests (engram-7g0, engram-wxn)

### Most Critical Issues

1. **Design Questions Block 3 Tasks** — 11 questions must be answered before coding
2. **Dedup Behavior Undefined** — 0.85 vs 0.95 threshold affects all bootstrap jobs
3. **Git Author Mapping Unspecified** — How to map agentId to git commit author?
4. **Dirty Tree Safety Unclear** — What's the safe default for concurrent edits?
5. **File Deletion Semantics Undefined** — User deletes vault file → delete fact?

### Recommended Next Actions

**This Week:**
1. Schedule 1-hour decision meeting
2. Fill in PHASE6-DESIGN-QUESTIONS-TEMPLATE.md
3. Start engram-7eb (no blockers)

**Week 2:**
4. Complete engram-uw7 and engram-g3o tests
5. Answer all critical questions
6. Create DESIGN-DECISIONS-PHASE6.md

**Week 3-4:**
7. Implement engram-7g0, engram-wxn, engram-1vt
8. Close parent beads

---

## Document Cross-References

### When You Need...

**To understand a specific task:**
→ Go to ANALYSIS-REMAINING-8-TASKS.md and find the corresponding section

**To see all user flows:**
→ ANALYSIS-REMAINING-8-TASKS.md Part 1 (User Flow Overview)

**To understand testing strategy:**
→ ANALYSIS-REMAINING-8-TASKS.md Part 3 (Comprehensive Testing Strategy)

**To get quick overview:**
→ PHASE6-EXECUTIVE-SUMMARY.md or PHASE6-QUICK-START.md

**To see design options:**
→ PHASE6-DESIGN-QUESTIONS-TEMPLATE.md

**To start coding:**
→ PHASE6-QUICK-START.md + your task's section in ANALYSIS-REMAINING-8-TASKS.md

**To understand infrastructure:**
→ ANALYSIS-REMAINING-8-TASKS.md Appendix A (File Paths)

**To see test fixtures:**
→ ANALYSIS-REMAINING-8-TASKS.md Appendix B (Test Fixtures)

---

## File Locations

All analysis documents are in: `/Users/cortex-air/Tools/engram/docs/`

```
docs/
├── ANALYSIS-REMAINING-8-TASKS.md          (54 KB) ← Full deep-dive
├── PHASE6-EXECUTIVE-SUMMARY.md            (6.8 KB) ← Stakeholder brief
├── PHASE6-DESIGN-QUESTIONS-TEMPLATE.md    (18 KB) ← Decision worksheet
├── PHASE6-QUICK-START.md                  (16 KB) ← Developer reference
├── PHASE6-ANALYSIS-INDEX.md               (this file) ← Navigation
├── DESIGN-DECISIONS-PHASE6.md             (TBD) ← To be created after decisions
└── (other docs...)
```

---

## Approval Checklist

- [ ] Project lead reviews PHASE6-EXECUTIVE-SUMMARY.md
- [ ] Architect reviews ANALYSIS-REMAINING-8-TASKS.md
- [ ] Team discusses and fills PHASE6-DESIGN-QUESTIONS-TEMPLATE.md
- [ ] All 11 design questions answered and documented
- [ ] DESIGN-DECISIONS-PHASE6.md created
- [ ] Timeline approved (8-9 days)
- [ ] Resource allocation approved (2-3 developers)
- [ ] Implementation begins

---

## Success Criteria

Phase 6 implementation is successful when:

- [ ] All 11 design questions answered and documented
- [ ] engram-7eb: Dashboard timeline component working, 8+ tests pass
- [ ] engram-uw7: Export verified, bulk test passes, <1s per fact
- [ ] engram-g3o: Watcher tests pass, dedup verified
- [ ] engram-7g0: Bootstrap e2e test passes, resume works
- [ ] engram-wxn: Round-trip tests pass, conflicts handled
- [ ] engram-1vt: Git daemon works, dirty tree/merge handled
- [ ] All 1168+ existing tests still passing
- [ ] Parent beads (1ob, w3u) marked complete
- [ ] Zero P0 gaps remaining

---

## Questions or Issues?

If you find:
- **Unclear requirements** → Check PHASE6-DESIGN-QUESTIONS-TEMPLATE.md
- **Missing details** → Search ANALYSIS-REMAINING-8-TASKS.md for your task
- **Testing approach** → See PHASE6-QUICK-START.md testing patterns
- **File locations** → ANALYSIS-REMAINING-8-TASKS.md Appendix A
- **Edge cases** → Look up your task's permutation matrix in Part 1

---

## Document Statistics

| Document | Size | Lines | Sections | Questions |
|----------|------|-------|----------|-----------|
| ANALYSIS-REMAINING-8-TASKS.md | 54 KB | 2,500+ | 50+ | 100+ |
| PHASE6-EXECUTIVE-SUMMARY.md | 6.8 KB | 250 | 10 | 5 |
| PHASE6-DESIGN-QUESTIONS-TEMPLATE.md | 18 KB | 800 | 11 | 11 |
| PHASE6-QUICK-START.md | 16 KB | 600 | 15 | — |
| **TOTAL** | **95 KB** | **4,150+** | **86** | **116** |

---

## Revision History

| Date | Author | Change | Status |
|------|--------|--------|--------|
| 2026-02-25 | Analysis Agent | Initial comprehensive analysis | COMPLETE |
| — | Architecture | Decision approval | PENDING |
| — | Project Lead | Timeline approval | PENDING |
| — | Implementation Team | Execution | PENDING |

---

**Analysis Complete:** 2026-02-25
**Status:** READY FOR REVIEW AND APPROVAL
**Next Review:** After design questions answered
**Timeline Target:** Implementation starts 2026-02-26

All analysis documents are ready for implementation planning. Proceed with decision meeting.
