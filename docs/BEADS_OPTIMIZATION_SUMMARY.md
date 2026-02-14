# Beads Optimization Summary
## Engram Vault Integration - Task Structure Analysis

**Date:** 2026-02-14
**Status:** Optimized and Ready for Execution

---

## Executive Summary

Verified and optimized 17 beads for Engram vault integration project. All beads now include detailed implementation specifications, file paths, performance targets, and proper dependency chains. Added missing npm dependency bead. Fixed circular dependency between file watcher and reconciliation logic.

**Key Changes:**
- ✅ Updated 14 beads with comprehensive implementation details from VAULT_INTEGRATION_PLAN.md
- ✅ Created 1 new bead for npm dependencies (engram-46g)
- ✅ Fixed circular dependency: engram-uah now correctly depends on engram-8nz
- ✅ Added proper dependency chains for reconciliation logic
- ✅ Verified 3 beads ready to start immediately

---

## Beads Overview

### Priority Distribution
- **P0 (Critical):** 1 epic
- **P1 (High):** 6 tasks
- **P2 (Medium):** 7 tasks
- **P3 (Low):** 2 tasks
- **P4 (Backlog):** 1 task

### Status Distribution
- **Open:** 17 beads
- **Ready to work:** 3 beads (no blockers)
- **Blocked:** 14 beads (have dependencies)
- **In progress:** 0 beads
- **Closed:** 19 beads (from previous work)

---

## Detailed Bead Analysis

### Phase 1: Foundation (P0-P1) - Week 1, Days 1-4

#### ✅ Ready Now (No Blockers)

**[P0] engram-2ui: Obsidian-Compatible Vault Mirror (EPIC)**
- **Type:** Epic container for all vault integration work
- **Description:** Add bidirectional markdown mirror layer
- **Blocks:** All other vault integration tasks
- **Status:** Ready to start (no blockers)

**[P1] engram-ywx: Schema Changes**
- **Files:** `convex/schema.ts`
- **Changes:**
  - Add vaultPath (v.optional(v.string()))
  - Add vaultSyncedAt (v.optional(v.number()))
  - Add observation.tier, observation.compressed, observation.originalContent
  - Add indices: by_vault_path, by_vault_synced, by_observation_tier, unmirrored
- **Performance:** Schema migration <1s, zero downtime
- **Blocks:** engram-waf, engram-ri0, engram-doo
- **Status:** Ready to start

**[P1] engram-46g: Install npm Dependencies**
- **Packages:** chokidar, js-yaml, marked, slugify + @types
- **Command:** `cd mcp-server && bun add chokidar js-yaml marked slugify && bun add -d @types/js-yaml @types/marked`
- **Blocks:** engram-waf, engram-7yr
- **Status:** Ready to start

#### Blocked - Foundation Layer

**[P1] engram-waf: Create vault-format.ts**
- **File:** `mcp-server/src/lib/vault-format.ts`
- **Functions:**
  - generateFrontmatter(fact) — Fact to YAML
  - generateMarkdownBody(fact) — Fact to markdown prose
  - parseFrontmatter(fileContent) — YAML + body to fact
  - generateFilename(fact) — Slugified filename
  - computeFolderPath(fact, vaultRoot) — Type-based routing
  - extractWikiLinks(content) — Parse [[Name]] links
- **Dependencies:** js-yaml, slugify
- **Performance:** Format/parse <10ms per fact
- **Depends on:** engram-46g (npm), engram-ywx (schema)
- **Blocks:** engram-7yr, engram-8nz
- **Status:** Blocked by 2 dependencies

**[P1] engram-7yr: Create vault-sync.ts**
- **Files:**
  - `mcp-server/src/lib/vault-writer.ts` — File system operations
  - `mcp-server/src/daemons/vault-sync.ts` — Daemon process
- **Responsibilities:**
  - Poll Convex for unmirrored facts (5s interval)
  - Write markdown files atomically
  - Watch vault/ with chokidar for changes
  - Update vaultPath in Convex after success
  - Graceful shutdown, exponential backoff
- **Performance:** Mirror lag <5s p95, sync reliability 99.99%
- **Depends on:** engram-46g (chokidar), engram-waf (format)
- **Blocks:** engram-dxj, engram-43e, engram-gxr
- **Status:** Blocked by 2 dependencies

**[P1] engram-ri0: Convex mirror integration**
- **New files:**
  - `convex/actions/mirrorToVault.ts` — Signal for vault write
  - `convex/actions/reconcileFromVault.ts` — Three-way merge
- **Convex changes:**
  - `convex/functions/facts.ts`: Add updateVaultPath, getUnmirrored
  - Modify storeFact to call mirrorToVault (non-blocking)
- **Field classification:** HUMAN_FIELDS vs MACHINE_FIELDS vs IMMUTABLE_FIELDS
- **Performance:** Reconcile <200ms p95
- **Depends on:** engram-ywx (schema)
- **Blocks:** engram-8nz
- **Status:** Blocked by 1 dependency

**[P1] engram-dxj: Add MCP tool: memory_vault_sync**
- **File:** `mcp-server/src/tools/vault-sync.ts`
- **Modes:** export (Convex→Vault), import (Vault→Convex), both
- **Parameters:** direction, force, dryRun
- **Use cases:** Initial population, manual sync, batch import, dry run preview
- **Performance:** Export 1000 facts <10s, import 1000 files <15s
- **Depends on:** engram-7yr (vault-writer)
- **Blocks:** engram-uah, engram-0ro
- **Status:** Blocked by 1 dependency (through chain)

---

### Phase 2: Graph & Auto-Linking (P2) - Week 1, Days 5-7

**[P2] engram-43e: Knowledge graph + wiki-link auto-linking**
- **New files:**
  - `mcp-server/src/lib/wiki-link-parser.ts` — Extract [[Name]] links
  - `mcp-server/src/lib/auto-linker.ts` — Auto-wrap entity mentions
  - `mcp-server/src/lib/graph-exporter.ts` — Obsidian graph JSON
- **Schema:** Add backlinks array to entities table
- **Integration:** Auto-link before storeFact, update entity backlinks after
- **Performance:** Auto-link <50ms, graph export <2s for 10k facts
- **Depends on:** engram-7yr (needs vault-sync running)
- **Blocks:** engram-gxr, engram-sll, engram-vj6, engram-ykh
- **Status:** Blocked by 1 dependency (through chain)

**[P2] engram-ykh: Entity backlinks consistency**
- **File:** `convex/functions/entities.ts`
- **Functions:**
  - updateBacklinks(factId, entityNames) — Maintain backlinks
  - validateBacklinks() — Periodic validation
  - rebuildBacklinks() — Full rebuild
- **Integration:** Call updateBacklinks on storeFact/updateFact/deleteFact
- **Performance:** Update <50ms, full rebuild <30s for 10k entities
- **Depends on:** engram-43e (entity structure)
- **Status:** Blocked by 1 dependency (through chain)

---

### Phase 3: Index & Retrieval (P2) - Week 2, Days 8-9

**[P2] engram-gxr: Vault index pipeline**
- **File:** `mcp-server/src/lib/vault-indexer.ts`
- **Indices generated:**
  - `vault/.index/vault-index.md` — Master TOC (recent + by-type)
  - `vault/.index/by-priority.md` — Grouped by P0-P4
  - `vault/.index/by-entity.md` — Grouped by entity mentions
- **Recall enhancement:** Index-first pass in `recall.ts` (scan index before semantic)
- **Cron:** `convex/crons/regenerateIndices.ts` every 5 minutes
- **Performance:** Index scan <100ms p95, hit rate >65%, relevance@5 >0.85
- **Depends on:** engram-43e (graph structure), engram-7yr (vault exists)
- **Blocks:** engram-vj6
- **Status:** Blocked by 2 dependencies (through chain)

**[P2] engram-vj6: MCP tools: query_vault + memory_export_graph**
- **New tools:**
  - `memory_query_vault` — Direct vault queries (no Convex)
  - `memory_export_graph` — Export to vault/.obsidian/graph.json
- **Use cases:** Fast local queries, Obsidian graph visualization
- **Performance:** Query vault <150ms, graph export <2s for 10k facts
- **Depends on:** engram-43e (graph-exporter), engram-gxr (index)
- **Status:** Blocked by 2 dependencies (through chain)

---

### Phase 4: Observation Pipeline (P2) - Week 2, Days 10-11

**[P2] engram-doo: Observation pipeline with LLM classification**
- **New actions:**
  - `convex/actions/classifyObservation.ts` — Tier classifier (Haiku)
  - `convex/actions/compressBackground.ts` — Background summarizer
- **Tiers:** CRITICAL (P0), NOTABLE (P1), BACKGROUND (P4)
- **Flow:** Store as pending → classify → full enrichment OR compress+archive
- **MCP change:** `observe.ts` stores as pending, triggers classification
- **Performance:** Classification <2s, compression <1s, noise reduction >80%
- **Depends on:** engram-ywx (schema for observation.tier)
- **Blocks:** engram-4ul, engram-sll
- **Status:** Blocked by 1 dependency

---

### Phase 5: Context Budget (P2) - Week 2, Days 12-13

**[P2] engram-sll: Context-budgeted recall**
- **File:** `mcp-server/src/lib/budget-aware-loader.ts`
- **Functions:**
  - loadBudgetAwareContext(query, budget, convex) — Token-aware loading
  - detectQueryIntent(query) — Adaptive allocation
  - getInclusionReason(fact) — Explainability
- **Budget tiers:** Critical 40%, Notable 40%, Background 10%, Entities 10%
- **MCP change:** `get-context.ts` uses budget-aware loader
- **Performance:** Context load <200ms, token efficiency 30% better, overflow <2%
- **Depends on:** engram-43e (graph), engram-doo (tiers)
- **Status:** Blocked by 2 dependencies (through chain)

**[P2] engram-4ul: Checkpoint/wake tools**
- **Purpose:** Context death resilience (not in VAULT_INTEGRATION_PLAN.md)
- **Value:** Allows agents to save/restore state across sessions
- **Depends on:** engram-doo (observation pipeline)
- **Status:** Blocked by 1 dependency (through chain)

---

### Phase 6: Reconciliation & Auditability (P3) - Week 2, Day 13

**[P3] engram-8nz: Auditability & three-way merge**
- **File:** `mcp-server/src/lib/vault-reconciler.ts`
- **Functions:**
  - reconcileFileEdit(filePath, convex) — Three-way merge
  - detectConflicts(dbFact, fileFact) — Field-level conflict detection
  - mergeHumanEdits(dbFact, fileFact, body) — Human vs machine fields
  - writeConflictFile() — Create .conflict.md for manual resolution
- **Field classification:** HUMAN_FIELDS vs MACHINE_FIELDS
- **Performance:** Reconcile <200ms p95, zero data loss over 10k ops
- **Depends on:** engram-waf (parse), engram-ri0 (reconcileFromVault action)
- **Blocks:** engram-uah
- **Status:** Blocked by 2 dependencies (through chain)

**[P3] engram-uah: Vault file watcher**
- **Integration:** Part of `mcp-server/src/daemons/vault-sync.ts`
- **Chokidar config:** Watch vault/**/*.md, ignore dot files, ignoreInitial
- **Events:** change, add (not delete)
- **Flow:** File edited → chokidar detects → reconcileFromVault → DB updated OR conflict
- **Performance:** Event handling <100ms, reconciliation <200ms p95
- **Depends on:** engram-dxj (vault-sync tool), engram-8nz (reconciler)
- **Status:** Blocked by 2 dependencies (through chain)

---

### Phase 7: Validation (P4) - Week 2, Day 14

**[P4] engram-0ro: Validation suite**
- **Test structure:**
  - Unit tests (9 files): vault-writer, vault-reader, vault-reconciler, wiki-link-parser, auto-linker, vault-indexer, budget-aware-loader, frontmatter-generator, slug-generator
  - Integration tests (7 files): write-through-e2e, reconcile-e2e, conflict-e2e, auto-linking-e2e, index-first-e2e, observation-compression-e2e, budget-aware-context-e2e
  - Golden tests (4 files): format/*.golden.md, retrieval/evaluate-relevance
  - Benchmarks (1 file): before-after.test.ts
  - Regression (5 files): core-api, enrichment, decay, consolidation, sync
- **Golden query set:** 20+ queries with expected results, min relevance thresholds
- **Performance targets:** Retrieval <200ms, relevance@5 >0.85, token efficiency 30% better
- **CI:** Run on every PR, block merge if fails, coverage >80%, regression gate <10%
- **Depends on:** engram-dxj (vault-sync tool for integration tests)
- **Status:** Blocked by 1 dependency (through chain)

---

## Dependency Graph

### Execution Order (Critical Path)

```
Start → engram-ywx (schema) ┐
                           ├→ engram-ri0 (Convex actions) → engram-8nz (reconciler) → engram-uah (file watcher)
                           │
                           └→ engram-waf (format) ┐
                                                  ├→ engram-7yr (vault-sync) ┐
                                                  │                          ├→ engram-dxj (MCP tool) → engram-0ro (tests)
                                                  │                          │
                                                  └──────────────────────────┤
                                                                             │
Start → engram-46g (npm deps) ────────────────────────────────────────────┤
                                                                             │
                                                                             ├→ engram-43e (wiki-links) ┐
                                                                             │                          ├→ engram-ykh (backlinks)
                                                                             │                          ├→ engram-gxr (index) → engram-vj6 (tools)
                                                                             │                          │
engram-doo (observations) ←── engram-ywx (schema)                           │
                           ├→ engram-4ul (checkpoint)                       │
                           └→ engram-sll (budget) ←─────────────────────────┘
```

### Parallel Work Tracks

**Track 1 (Schema → Convex → Reconciliation):**
1. engram-ywx (schema)
2. engram-ri0 (Convex actions)
3. engram-8nz (reconciler)
4. engram-uah (file watcher)

**Track 2 (Dependencies → Format → Sync → Tools):**
1. engram-46g (npm deps)
2. engram-waf (vault-format)
3. engram-7yr (vault-sync)
4. engram-dxj (MCP vault-sync tool)
5. engram-0ro (validation)

**Track 3 (Graph & Auto-Linking):**
1. engram-7yr (needs vault running)
2. engram-43e (wiki-links + graph)
3. engram-ykh (backlinks)
4. engram-gxr (index)
5. engram-vj6 (query_vault + export_graph tools)

**Track 4 (Observations & Context Budget):**
1. engram-ywx (schema)
2. engram-doo (observation pipeline)
3. engram-4ul (checkpoint)
4. engram-sll (budget-aware context) ← also depends on engram-43e

---

## Recommended Execution Order

### Week 1: Foundation

**Days 1-2: Core Infrastructure**
1. ✅ Start: engram-ywx (schema) + engram-46g (npm deps) in parallel
2. engram-waf (vault-format) — Can start after both complete
3. engram-ri0 (Convex actions) — Can start after engram-ywx

**Days 3-4: Sync & Reconciliation**
4. engram-7yr (vault-sync daemon) — After engram-waf + engram-46g
5. engram-dxj (MCP vault-sync tool) — After engram-7yr
6. engram-8nz (reconciler) — After engram-waf + engram-ri0
7. engram-uah (file watcher) — After engram-dxj + engram-8nz

**Days 5-7: Graph & Auto-Linking**
8. engram-43e (wiki-links + graph) — After engram-7yr
9. engram-ykh (backlinks) — After engram-43e
10. engram-gxr (vault index) — After engram-43e
11. engram-vj6 (MCP tools) — After engram-gxr

### Week 2: Optimization & Validation

**Days 8-9: Observations**
12. engram-doo (observation pipeline) — After engram-ywx (can parallel with graph work)
13. engram-4ul (checkpoint) — After engram-doo

**Days 10-11: Context Budget**
14. engram-sll (budget-aware context) — After engram-43e + engram-doo

**Day 12-14: Validation**
15. engram-0ro (validation suite) — After engram-dxj (run continuously as other tasks complete)

---

## Gap Analysis: Beads vs Comprehensive Plan

### Files Covered by Beads

**Convex (7 new files):**
- ✅ convex/actions/mirrorToVault.ts (engram-ri0)
- ✅ convex/actions/reconcileFromVault.ts (engram-ri0)
- ✅ convex/actions/classifyObservation.ts (engram-doo)
- ✅ convex/actions/compressBackground.ts (engram-doo)
- ✅ convex/actions/regenerateIndices.ts (engram-gxr)
- ✅ convex/crons/sync.ts (engram-gxr)
- ✅ convex/crons/regenerateIndices.ts (engram-gxr)

**MCP Server (14+ new files consolidated):**
- ✅ mcp-server/src/lib/vault-writer.ts (engram-7yr)
- ✅ mcp-server/src/lib/vault-format.ts (engram-waf - combines frontmatter-generator, markdown-body-generator, frontmatter-parser, vault-reader)
- ✅ mcp-server/src/lib/vault-indexer.ts (engram-gxr)
- ✅ mcp-server/src/lib/vault-reconciler.ts (engram-8nz)
- ✅ mcp-server/src/lib/wiki-link-parser.ts (engram-43e)
- ✅ mcp-server/src/lib/auto-linker.ts (engram-43e)
- ✅ mcp-server/src/lib/graph-exporter.ts (engram-43e)
- ✅ mcp-server/src/lib/budget-aware-loader.ts (engram-sll)
- ✅ mcp-server/src/daemons/vault-sync.ts (engram-7yr)
- ✅ mcp-server/src/tools/query-vault.ts (engram-vj6)
- ✅ mcp-server/src/tools/export-graph.ts (engram-vj6)
- ✅ mcp-server/src/tools/vault-sync.ts (engram-dxj)

**Tests (22+ files):**
- ✅ All covered by engram-0ro (validation suite)
- ✅ Unit, integration, golden, benchmarks, regression tests

**Schema modifications:**
- ✅ convex/schema.ts (engram-ywx)
- ✅ convex/functions/facts.ts (engram-ri0)
- ✅ convex/crons.ts (engram-gxr)

**MCP Server modifications:**
- ✅ mcp-server/src/index.ts (engram-vj6)
- ✅ mcp-server/src/tools/store-fact.ts (engram-43e - auto-linking)
- ✅ mcp-server/src/tools/recall.ts (engram-gxr - index-first)
- ✅ mcp-server/src/tools/get-context.ts (engram-sll - budget-aware)
- ✅ mcp-server/src/tools/observe.ts (engram-doo - classification)
- ✅ mcp-server/package.json (engram-46g - dependencies)

### Coverage Summary

**Total files in plan:** 40 (29 new + 11 modified)
**Total files in beads:** 40+ (consolidated into 17 logical tasks)

**Coverage:** ✅ 100% — All files from plan are covered by beads

**Consolidation approach:** Beads group related files into logical tasks rather than creating one bead per file. This is superior for task management because:
- Reduces coordination overhead (17 tasks vs 40 tasks)
- Groups related work that should be done together
- Maintains clear dependencies between logical units
- Easier to understand the big picture

---

## Performance Targets

All beads updated with performance targets from VAULT_INTEGRATION_PLAN.md:

| Metric | Target | Bead |
|--------|--------|------|
| Schema migration | <1s, zero downtime | engram-ywx |
| Format/parse | <10ms per fact | engram-waf |
| Vault write | <500ms p95 | engram-7yr |
| Mirror lag | <5s p95 | engram-7yr |
| Sync reliability | 99.99% | engram-7yr |
| Reconcile | <200ms p95 | engram-ri0, engram-8nz |
| Auto-link | <50ms | engram-43e |
| Graph export | <2s for 10k facts | engram-43e |
| Backlink update | <50ms | engram-ykh |
| Index scan | <100ms p95 | engram-gxr |
| Index hit rate | >65% | engram-gxr |
| Relevance@5 | >0.85 (priority), >0.70 (all) | engram-gxr, engram-0ro |
| Classification | <2s | engram-doo |
| Compression | <1s | engram-doo |
| Context load | <200ms | engram-sll |
| Token efficiency | 30% better | engram-sll |
| Overflow rate | <2% | engram-sll |
| Query vault | <150ms | engram-vj6 |
| File watcher event | <100ms | engram-uah |
| Vault sync export | 1000 facts <10s | engram-dxj |
| Vault sync import | 1000 files <15s | engram-dxj |

---

## Risk Mitigation

All beads include error handling and rollback strategies:

1. **Data Loss Prevention:**
   - Convex is SoR (engram-ri0)
   - Atomic file writes (engram-7yr)
   - Conflict files for manual resolution (engram-8nz)
   - Exponential backoff retries (engram-7yr)

2. **Performance Degradation:**
   - Index-first retrieval avoids semantic search for 65% of queries (engram-gxr)
   - Budget-aware loader prevents context overflow (engram-sll)
   - Background observations compressed immediately (engram-doo)
   - Benchmarks on every PR (engram-0ro)

3. **Human Edit Conflicts:**
   - Three-way merge (engram-8nz)
   - Field-level merge (HUMAN vs MACHINE fields)
   - Conflict files with instructions
   - Timestamp-based LWW

4. **Obsidian Integration:**
   - Standard markdown + YAML frontmatter (engram-waf)
   - Obsidian-compatible graph JSON (engram-43e)
   - Golden tests for format validation (engram-0ro)

---

## Success Criteria

**Must Have (P0-P1):**
- ✅ All facts mirrored to markdown vault
- ✅ Bidirectional sync (DB ↔ files) working
- ✅ Zero data loss on 10,000 sync operations
- ✅ Vault readable/editable in Obsidian
- ✅ Index-first retrieval operational

**Should Have (P2):**
- ✅ Wiki-link auto-linking
- ✅ Obsidian graph export
- ✅ Priority-tiered observations
- ✅ Budget-aware context assembly
- ✅ Relevance@5 >0.85 for priority facts
- ✅ Token efficiency 30% better

**Nice to Have (P3-P4):**
- ✅ Provenance tracking
- ✅ Comprehensive test suite
- ✅ CI/CD integration
- ✅ Performance benchmarks
- ✅ Regression prevention

---

## Next Steps

### Immediate Actions (Can Start Now)

1. **Start engram-ywx** (schema changes) — No blockers
2. **Start engram-46g** (npm deps) — No blockers
3. **Review engram-2ui** (epic) — Ensure alignment with plan

### Week 1 Sprint Planning

**Day 1:**
- Complete engram-ywx + engram-46g
- Start engram-waf + engram-ri0 in parallel

**Day 2:**
- Complete engram-waf + engram-ri0
- Start engram-7yr

**Day 3:**
- Complete engram-7yr
- Start engram-dxj + engram-8nz in parallel

**Day 4:**
- Complete engram-dxj + engram-8nz
- Start engram-uah + engram-43e in parallel

**Day 5:**
- Complete engram-uah + engram-43e
- Start engram-ykh + engram-gxr in parallel

**Day 6-7:**
- Complete engram-ykh + engram-gxr
- Start engram-vj6 + engram-doo in parallel

### Week 2 Sprint Planning

**Day 8-9:**
- Complete engram-vj6 + engram-doo
- Start engram-4ul + engram-sll in parallel
- Begin golden tests in engram-0ro

**Day 10-11:**
- Complete engram-4ul + engram-sll
- Continue engram-0ro (integration tests)

**Day 12-13:**
- Complete engram-0ro (benchmarks + regression)
- Run full test suite
- Fix any issues found

**Day 14:**
- Final validation
- Performance benchmarking
- Documentation updates
- Ship v1

---

## Conclusion

All 17 beads are now optimized with:
- ✅ Comprehensive implementation details from VAULT_INTEGRATION_PLAN.md
- ✅ File paths and function signatures
- ✅ Performance targets and acceptance criteria
- ✅ Proper dependency chains
- ✅ Error handling and rollback strategies
- ✅ Test coverage requirements
- ✅ Integration points clearly defined

**No gaps identified** between comprehensive plan and beads structure. The beads consolidate the 40 files from the plan into 17 logical tasks, which is optimal for task management and parallel execution.

**Ready to execute:** 3 beads can start immediately (engram-ywx, engram-46g, engram-2ui), with clear paths for the remaining 14 blocked beads to unblock progressively.

**Estimated completion:** 2 weeks following the sprint plan above.
