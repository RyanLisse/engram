# Engram Remaining 8 Tasks — Comprehensive UX Flow & Gap Analysis

**Analysis Date:** 2026-02-25
**Current State:** 1168 tests pass, vault infrastructure 90% complete, bootstrap pipeline partially implemented
**Scope:** Cluster A (2 tasks), Cluster B (1 task), Cluster C (3 tasks), Parent beads (2 tasks)

---

## Executive Summary

### Task Breakdown
| Cluster | Task | Status | Dependencies | Est. Complexity |
|---------|------|--------|--------------|-----------------|
| A (Testing) | engram-7g0: Bootstrap e2e | Planning | Blocking | Medium |
| A (Testing) | engram-wxn: Filesystem mirror tests | Planning | Blocking | High |
| B (Dashboard) | engram-7eb: Version timeline component | Design | Blocking | Low-Medium |
| C (Mirror) | engram-uw7: Export facts to markdown | Ready | Low | Low |
| C (Mirror) | engram-g3o: File watcher two-way sync | Ready | Low | Medium |
| C (Mirror) | engram-1vt: Git integration (auto-init + commit) | Design | High | High |
| Parent | engram-1ob: Phase 6 feature parent | Blocking | All tasks | - |
| Parent | engram-w3u: Phase 6 epic parent | Blocking | All tasks | - |

### Key Findings

**OVERLAP WITH EXISTING VAULT INFRASTRUCTURE (95% overlap):**
- `vault-writer.ts` already exports facts to markdown with YAML frontmatter ✅
- `vault-sync.ts` daemon already watches files and reconciles changes ✅
- `vault-reconciler.ts` handles conflict detection ✅
- `vault-format.ts` handles Markdown↔Convex serialization ✅

**CRITICAL GAPS:**
1. **engram-7g0 (Bootstrap e2e)** — Missing full pipeline test: sessions → facts → dedup → parallel ingestion
2. **engram-wxn (Mirror tests)** — No round-trip tests for vault sync (export→modify→import cycle)
3. **engram-7eb (Dashboard timeline)** — Next.js component missing for fact version history timeline
4. **engram-1vt (Git integration)** — No git auto-commit daemon; needs conflict resolution + dirty state handling

**NON-BLOCKING BUT NEEDED:**
- Phase 6 feature/epic parent beads should be closed after all child tasks complete
- Dashboard version timeline is isolated; doesn't block other tasks

---

## Part 1: Detailed User Flow Analysis

### Cluster A.1: engram-7g0 — Bootstrap E2E Tests

#### Flow Overview

The bootstrap pipeline has **5 distinct phases** that must be tested in sequence:

```
Phase 1: Locate Sessions
  ↓ (findSessionFiles)
  [Find .json, .jsonl files in directory tree]
  ↓
  Result: Array of file paths sorted by mtime (newest first)

Phase 2: Parse Sessions
  ↓ (parseOpenClawSession)
  [Read JSONL/JSON format → normalize to {role, content, timestamp}]
  ↓
  Result: Array of messages per session file

Phase 3: Extract Facts
  ↓ (extractFactsFromSession)
  [Apply heuristics to identify decisions, observations, etc.]
  ↓
  Result: Array of ParsedFact with type, content, confidence, entities

Phase 4: Deduplicate
  ↓ (deduplicateFacts)
  [Cross-session similarity comparison, merge/flag duplicates]
  ↓
  Result: Deduplicated fact array with merge tracking

Phase 5: Parallel Ingest
  ↓ (Upload to Convex, enrich, embed, link entities)
  [Batch facts into parallel chunks, store + async enrichment]
  ↓
  Result: Fact IDs in database with full enrichment pipeline triggered
```

#### Current Test Coverage

**Existing tests** in `/Users/cortex-air/Tools/engram/mcp-server/test/bootstrap-sessions.test.ts`:
- ✅ `findSessionFiles` — finds .jsonl/.json, ignores others, handles nested dirs
- ✅ `parseOpenClawSession` — parses JSONL and JSON array formats
- ✅ `extractFactsFromSession` — extracts facts from messages (partial coverage)

**MISSING E2E COVERAGE:**
- [ ] Full pipeline: sessions → storage → verification in Convex
- [ ] Parallel processing: Multiple sessions processed concurrently
- [ ] Deduplication: Cross-session duplicates are merged correctly
- [ ] Enrichment: Facts receive embeddings, importance scores, entities linked
- [ ] Rate limiting: Large session sets don't overwhelm Convex
- [ ] Error recovery: Corrupt/malformed sessions don't crash pipeline
- [ ] Atomic transactions: Partial failures roll back correctly

#### User Journeys for Bootstrap E2E

**Journey 1: First-Time Bootstrap (Happy Path)**
- User runs: `npx tsx scripts/bootstrap-from-sessions.ts /path/to/sessions`
- System finds 50 session files (1 week of history)
- Processes sequentially or parallel (depending on flag)
- Extracts ~2000 facts across decision/observation/lesson types
- Deduplicates down to ~1800 unique facts
- Uploads to Convex in batches of 100
- All facts receive embeddings, importance scores via enrichment pipeline
- User sees: progress bar, final count, sample fact IDs
- **Assertions:** All facts in DB, no duplicates in different sessions merged correctly, entities linked

**Journey 2: Resume From Checkpoint**
- User has ingested sessions 1-50
- User wants to ingest sessions 51-100 (new week)
- System detects already-ingested facts via `lastSeenFactIds` tracking
- Skips duplicates, only processes new facts
- **Assertions:** No double-ingestion, new facts stored, dedup handles cross-checkpoint merges

**Journey 3: Partial Failure Recovery**
- User ingests 50 sessions
- Network error occurs at session 25 during upload phase
- System has 20 sessions uploaded, 30 pending
- User re-runs script with `--resume-from 25`
- System:
  - Checks which facts were already stored (via convexId or dedup)
  - Skips stored facts
  - Re-processes pending sessions
  - Uploads new facts only
- **Assertions:** No crashes, no duplicates created, final count is correct

**Journey 4: Deduplication Across Multiple Sessions**
- Session A (day 1): "Chose TypeScript for CLI because of type safety"
- Session B (day 3): "Selected TypeScript over Python for better types"
- Both express same decision, different wording
- Dedup threshold (0.85 cosine similarity) triggers merge
- System:
  - Creates canonical fact from both
  - Merges tags and entities from both
  - Marks older version as superseded
  - Stores merge metadata (factA mergedInto factB, mergeReason: similarity)
- **Assertions:** Only 1 fact in DB, merge tracked, metadata complete

#### Permutation Matrix for Bootstrap E2E

| Dimension | Values | Coverage |
|-----------|--------|----------|
| Session Format | JSONL, JSON array, mixed | 3 paths |
| Session Scale | 1, 5, 50, 1000+ sessions | 4 paths |
| Fact Extraction | High confidence, mixed, low confidence | 3 paths |
| Network State | Perfect, timeout mid-batch, persistent failure | 3 paths |
| Dedup Threshold | 0.75, 0.85, 0.95 | 3 paths |
| Parallel Degree | Sequential, 2x, 5x parallel | 3 paths |
| **Total Paths** | — | **81 scenarios** |
| **Critical Paths** | Happy path, resume, dedup merge, network failure | 4 critical |

#### Missing Specifications

| Category | Gap | Impact | Current Ambiguity |
|----------|-----|--------|-------------------|
| **Dedup Logic** | Exact cosine similarity threshold | P0 - affects duplicate creation | "Use 0.85" but no test confirms exact behavior |
| **Parallel Limits** | Max concurrent uploads, batch size | P0 - prevents OOM | Currently hardcoded to 100, no tuning |
| **Resume Behavior** | How to detect already-stored facts? | P1 - resume correctness | No checkpointing mechanism defined |
| **Error Handling** | What causes skip vs. rollback vs. crash? | P1 - failure recovery | No error taxonomy |
| **Enrichment Blocking** | Does bootstrap wait for embeddings or fire-and-forget? | P1 - test assertions | Likely async but unspecified |
| **Memory Isolation** | Which scope gets bootstrap facts? | P0 - access control | Likely `private-bootstrap` but undefined |
| **Entity Linking** | How are entities matched to existing entities? | P1 - entity dedup | "Link mentions" but no exact algorithm |

---

### Cluster A.2: engram-wxn — Filesystem Mirror Tests

#### Flow Overview

Two-way sync creates a **closed-loop system** with competing write sources (Convex ↔ Vault):

```
Source 1: Convex → Vault (Export Path)
  storeFact() in Convex
    ↓
  writeFactToVault() (vault-writer.ts)
    ↓
  Create/update markdown file with YAML frontmatter
    ↓
  Update fact.vaultPath and fact.vaultSyncedAt
  ↓
  Result: File on disk matches Convex record

Source 2: Vault → Convex (Import Path)
  Human edits markdown file in editor
    ↓
  Chokidar file watcher detects change (watch interval: 5s default)
    ↓
  reconcileFileEdit() (vault-reconciler.ts)
    ↓
  Parse frontmatter, merge human edits, detect conflicts
    ↓
  applyVaultEdit() updates Convex fact
    ↓
  Result: Convex record matches edited file

Source 3: Concurrent Edits (Conflict)
  Convex: Fact updated at T=100 (via agent), written to vault at T=110
  Vault:  Human edits file at T=105, starts watching at T=115
    ↓
  detectConflicts() compares updatedAt timestamps
    ↓
  Write .conflict.md file, halt import
    ↓
  User manually resolves conflict file
    ↓
  Re-run sync
```

#### Current Implementation Status

**FULLY IMPLEMENTED:**
- ✅ `writeFactToVault()` — exports facts with YAML frontmatter
- ✅ `vault-sync.ts` daemon — 5s interval polling + file watcher
- ✅ `reconcileFileEdit()` — parses files, merges human edits
- ✅ Conflict detection — `detectConflicts()` uses updatedAt timestamps
- ✅ Conflict file writing — `.conflict.md` files for manual resolution

**PARTIALLY IMPLEMENTED:**
- ⚠️ File watcher — basic chokidar setup, no deduplication of events
- ⚠️ Conflict resolution — detects, but doesn't auto-resolve
- ⚠️ Vault path tracking — `vaultPath` stored but not used for round-trip verification

**MISSING:**
- [ ] End-to-end round-trip tests
- [ ] Watcher event deduplication (prevents double-reconcile)
- [ ] Performance tests under load (1000+ files)
- [ ] Symbolic link handling
- [ ] Vault path collision detection (two facts → same file)
- [ ] `.conflict.md` cleanup after resolution
- [ ] Dirty file detection after system crash

#### User Journeys for Mirror Tests

**Journey 1: Create-Export-Read (Happy Path)**
- Store fact in Convex: `"Chose TypeScript"`
- Vault sync daemon exports to `private-indy/decisions/chose-typescript-abc123.md`
- User opens file in Obsidian, reads content
- File has correct frontmatter + body
- **Assertions:**
  - File exists at correct path
  - Frontmatter parses correctly
  - Body matches fact.content
  - vaultPath in Convex matches file location
  - vaultSyncedAt is set to export timestamp

**Journey 2: Read-Edit-Reimport (Happy Path)**
- User opens existing vault file in editor
- Edits body: "Chose TypeScript for CLI" → "Chose TypeScript for CLI and tests"
- Adds tags: [] → [typescript, testing]
- Saves file
- Watcher detects change within 5s
- reconcileFileEdit() parses new frontmatter/body
- applyVaultEdit() updates fact in Convex
- **Assertions:**
  - Fact.content updated in Convex
  - Fact.tags merged (maintains system tags, adds human tags)
  - Fact.updatedAt is new timestamp
  - createdBy is still original agent (preserved)
  - vaultSyncedAt updated to sync time

**Journey 3: Fast Double Edit (Watcher Dedup)**
- User edits file twice in quick succession (within 500ms)
- Saves at T=0, saves again at T=300ms
- File watcher queues two "change" events
- System should deduplicate:
  - First change queued
  - Second change queued before first is processed
  - Process once with final state (not intermediate)
  - Only one reconcileFileEdit() call
- **Assertions:**
  - Only one Convex update
  - updatedAt timestamp is from final state
  - No intermediate states in fact_versions

**Journey 4: Concurrent System+Human Edit (Conflict)**
- System stores fact at T=100: "Chose TypeScript"
- Exports to vault at T=110, sets vaultSyncedAt=110
- Human edits file at T=105: "Chose Rust" (before sync)
- Watcher detects at T=115
- detectConflicts() sees: fileFact.updatedAt=105 < dbFact.updatedAt=100 (system is newer)
- Writes `chose-typescript-abc123.conflict.md`
- File contains both versions (DB + human)
- **Assertions:**
  - Conflict file created
  - Both versions preserved
  - Original file unchanged
  - Convex fact unchanged (still has system version)
  - vaultPath not updated

**Journey 5: Resolve Conflict File**
- User reviews conflict file
- Edits to keep human version: "Chose Rust (with better performance)"
- Deletes `.conflict` marker
- Renames to original filename
- Watcher detects
- reconcileFileEdit() now has no conflict (timestamps aligned)
- applyVaultEdit() succeeds
- **Assertions:**
  - Fact updated with human version
  - Conflict file cleaned up (deleted)
  - vaultPath and vaultSyncedAt updated
  - No duplicate records in fact_versions

**Journey 6: Vault Path Collision (Error Case)**
- Two facts exist: factA and factB
- Both export to same vault path (due to slug collision)
- System detects: `writeFactToVault()` returns `"already exists"`
- System:
  - Option A: Append suffix to filename (factA → factA-1, factB → factB-2)
  - Option B: Raise error and require manual resolution
  - Option C: Use fact ID in filename to guarantee uniqueness
- **Assertions:** No data loss, collision handled deterministically

**Journey 7: Symbolic Links / Vault Aliases (Edge Case)**
- Vault folder contains symlink: `vault/decisions → vault/important-decisions`
- File written to `vault/important-decisions/fact.md`
- Watcher detects via symlink path OR canonical path?
- System should normalize paths before comparing
- **Assertions:** No double-reconcile, canonical path used

#### Permutation Matrix for Mirror Tests

| Dimension | Values | Coverage |
|-----------|--------|----------|
| Edit Source | Convex, Vault, Concurrent | 3 paths |
| Scale | 1 file, 100, 1000 files | 3 paths |
| Sync Interval | 100ms, 5s, 30s | 3 paths |
| Conflict Type | Timestamp mismatch, collision, encoding | 3 paths |
| File Ops | Create, update, delete (vault only), rename | 4 paths |
| Encoding | UTF-8, UTF-16, with emoji, special chars | 4 paths |
| Network | Online, offline, intermittent | 3 paths |
| **Total Paths** | — | **2,916 scenarios** |
| **Critical Paths** | Create→read, edit→import, conflict, dedup watcher events | 4 critical |

#### Missing Specifications

| Category | Gap | Impact | Current Ambiguity |
|----------|-----|--------|-------------------|
| **File Ops** | Delete in vault — should delete in Convex? | P0 - data loss risk | Not specified; assume no deletion for safety |
| **Rename Behavior** | User renames file — should Convex fact rename? | P0 - linkage | vaultPath tracking exists but rename not tested |
| **Watcher Dedup** | Multiple events for single edit — how many reconciles? | P1 - performance | No dedup mechanism defined; likely causes N reconciles |
| **Performance SLA** | Max files synced per interval? | P1 - scalability | maxPerRun=100 hardcoded, no tuning |
| **Stale File Cleanup** | Files without convexId or vaultSyncedAt > 30d? | P1 - vault bloat | No cleanup defined |
| **Encoding Handling** | YAML frontmatter with non-UTF8 metadata? | P2 - edge case | Assume UTF-8 only? |
| **Conflict Resolution UX** | Auto-resolve or manual? Merge or pick one? | P1 - UX | Manual only (conflict file) specified |
| **Symlink Handling** | Should watch symlinked directories? | P2 - vault structure | Not specified; likely skipped |
| **Fact Deletion** | If fact deleted in Convex, what happens to vault file? | P0 - consistency | Currently vault file stays (orphaned) |

---

### Cluster B.1: engram-7eb — Dashboard Version Timeline Component

#### Flow Overview

A **React Next.js component** displaying fact version history as a timeline:

```
User navigates to dashboard
  ↓
Selects a fact or search result
  ↓
Dashboard calls: GET /api/facts/{factId}/versions
  ↓
Convex query: getFactVersions(factId, limit=20)
  ↓
Returns: [
    {id: v3, timestamp: T3, changedBy: agent2, previousContent: "v2", reason: "Fixed typo"},
    {id: v2, timestamp: T2, changedBy: agent1, previousContent: "v1", reason: "Initial"},
    {id: v1, timestamp: T1, changedBy: system, previousContent: null}
  ]
  ↓
Component renders:
  Timeline line (vertical axis = time)
  ├─ v1 (T1): System created — "Chose TypeScript"
  ├─ v2 (T2): agent1 updated — "Chose TypeScript for CLI"
  └─ v3 (T3): agent2 updated — "Chose TypeScript for CLI and tests"

User interactions:
  Hover on version → show tooltip with reason, changedBy
  Click on version → show diff view (v2 → v3)
  Click "Rollback" → revert to this version
```

#### Current Implementation Status

**FULLY IMPLEMENTED:**
- ✅ `fact_versions` table in Convex schema (lines 471+)
- ✅ `getFactVersions()` query in convex-client
- ✅ `factHistory` tool in mcp-server (retrieves versions)
- ✅ `factRollback` tool in mcp-server (reverts to version)
- ✅ Version tracking in enrichment pipeline

**MISSING:**
- [ ] React timeline component in dashboard
- [ ] Version diff view (side-by-side or inline)
- [ ] Rollback UI button + confirmation dialog
- [ ] Timestamp formatting (relative + absolute)
- [ ] Agent name/avatar display
- [ ] Change reason display
- [ ] Performance: lazy-load for 100+ versions
- [ ] Mobile responsiveness

#### User Journeys for Dashboard Timeline

**Journey 1: View Fact History (Happy Path)**
- User opens dashboard
- Searches for fact: "Chose TypeScript"
- Clicks on result
- Sidebar opens showing "Version History" tab
- Timeline shows:
  - v1 (2026-01-15): "Chose TypeScript" by system (gray dot)
  - v2 (2026-01-20): "Chose TypeScript for CLI" by indy (blue dot)
  - v3 (2026-02-10): "Chose TypeScript for CLI and tests" by claude (blue dot)
- Each version shows:
  - Timestamp (relative: "5 days ago")
  - Agent avatar/name
  - Change reason: "Fixed typo", "Added tests"
  - Word count or character delta
- **Assertions:** All versions displayed, timestamps correct, ordering newest-first

**Journey 2: View Version Diff**
- User hovers over v2 in timeline
- Tooltip shows: "indy updated 5 days ago — Added reason"
- User clicks on v2
- Diff panel opens showing:
  - **Before (v1):** "Chose TypeScript"
  - **After (v2):** "Chose TypeScript for CLI"
  - **Highlighted changes:** "+ for CLI" in green
- **Assertions:** Diff accurate, highlighting correct, previous version shown

**Journey 3: Rollback to Previous Version**
- User viewing timeline, wants to revert to v1
- Clicks "Restore v1" button on that version card
- Confirmation modal: "Rollback to version from 2026-01-15?"
- User confirms
- System:
  - Creates new fact_version record (linking to current)
  - Reverts fact.content to v1 content
  - Sets changeType="rollback", reason="Manual rollback to v1"
  - Triggers re-enrichment (importance, entities, etc.)
- Timeline updates: v4 appears at top = rollback record
- **Assertions:** Rollback creates version record, content matches v1, timeline updated

**Journey 4: Many Versions (Pagination)**
- Fact has 150 versions (edited 150 times)
- Timeline shows latest 20 by default
- User scrolls down
- Loads next 20
- Load indicator shows while fetching
- **Assertions:** Pagination works, no N+1 queries, smooth UX

**Journey 5: Version from Different Agent**
- v1: system (orange)
- v2: indy (blue)
- v3: claude (purple)
- Timeline uses agent colors to distinguish
- User hovers over v3, sees: "claude-opus 2 hours ago"
- **Assertions:** Agent identification correct, colors applied

#### Permutation Matrix for Dashboard Timeline

| Dimension | Values | Coverage |
|-----------|--------|----------|
| Version Count | 1, 5, 20, 100+ | 4 paths |
| Change Types | update, rollback, merge | 3 paths |
| Device | Mobile, tablet, desktop | 3 paths |
| Time Range | Same day, week, month, year | 4 paths |
| Agents | 1, 3, 10 agents | 3 paths |
| Timezone | UTC, EST, JST, custom | 4 paths |
| Network | Fast, slow, offline (cached) | 3 paths |
| **Total Paths** | — | **2,016 scenarios** |
| **Critical Paths** | View history, diff view, rollback, pagination | 4 critical |

#### Missing Specifications

| Category | Gap | Impact | Current Ambiguity |
|----------|-----|--------|-------------------|
| **Diff Algorithm** | How to compute diff? | P1 - UX | Line-by-line? Word? Char? |
| **Rollback Semantics** | Does rollback preserve linked entities/tags? | P0 - data integrity | Only content reverts? Or full fact? |
| **Timestamp Display** | Absolute (ISO) or relative ("2 hours ago")? | P1 - UX | Both? Hover for absolute? |
| **Agent Attribution** | Map convexId to agent name/avatar? | P1 - UX | How to get agent display info? |
| **Change Reason** | Where does reason come from? | P0 - completeness | fact_versions.reason field; who fills it? |
| **Performance Target** | Max versions per page load? | P1 - performance | Unspecified; assume 20-50 |
| **Delete Version** | Can users delete versions? | P0 - safety | Assume soft-delete only? |
| **Search Integration** | Can search by "show me edits by indy"? | P2 - discoverability | Not specified; nice-to-have |
| **Mobile Responsiveness** | Timeline vertical on mobile? | P1 - UX | Unspecified |

---

### Cluster C.1: engram-uw7 — Export Facts to Markdown

#### Flow Overview

This task is **90% complete** (vault-writer.ts exists). Current implementation:

```
1. Store fact in Convex
2. Async enrichment completes
3. Trigger: writeFactToVault(vaultRoot, fact)
   ├─ Determine folder from factType (decisions/, observations/, etc.)
   ├─ Generate filename from title + ID
   ├─ Build YAML frontmatter from fact fields
   ├─ Render body (content + optional summary)
   ├─ Atomic write (write to .tmp, rename to .md)
   ├─ Return {absolutePath, relativePath}
4. Update fact.vaultPath and fact.vaultSyncedAt
5. Result: ~/vault/private-indy/decisions/chose-typescript-abc123.md
```

#### Current Implementation Status

**FULLY IMPLEMENTED:**
- ✅ `writeFactToVault()` in vault-writer.ts
- ✅ `vault-format.ts` with frontmatter serialization
- ✅ Folder taxonomy (factType → folder mapping)
- ✅ Filename generation (date + slug + ID)
- ✅ YAML rendering with `js-yaml`
- ✅ Atomic writes (.tmp + rename pattern)
- ✅ Convex schema support (vaultPath, vaultSyncedAt)

**NEEDS VERIFICATION:**
- ⚠️ Large fact content (> 1MB) handling
- ⚠️ Special characters in frontmatter YAML escaping
- ⚠️ Entity linking in markdown (auto-linking mentions)
- ⚠️ Performance with 10k+ facts

#### User Journeys for Export

**Journey 1: Simple Fact Export**
- Store fact: `{content: "Chose TypeScript", factType: "decision"}`
- Enrichment complete
- writeFactToVault() called
- File created: `vault/private-indy/decisions/2026-02-25-decision-chose-typescript-abc1d2.md`
- Content:
  ```yaml
  ---
  id: abc1d2e3f4g5
  source: direct
  factType: decision
  createdBy: indy
  scopeId: private-indy
  timestamp: 1740422400000
  updatedAt: 1740422400000
  entityIds: []
  tags: []
  importanceScore: 0.85
  relevanceScore: 0.9
  lifecycleState: active
  ---

  Chose TypeScript
  ```
- **Assertions:** File exists, frontmatter valid YAML, body correct

**Journey 2: Fact with Summary**
- Fact: `{content: "...", factualSummary: "Core decision", factType: "insight"}`
- File includes Summary section:
  ```markdown
  Detailed content here...

  ## Summary

  Core decision
  ```
- **Assertions:** Summary section present, formatting correct

**Journey 3: Fact with Tags and Entities**
- Fact: `{tags: ["typescript", "testing"], entityIds: ["tool:ts", "project:engram"]}`
- Frontmatter includes:
  ```yaml
  tags:
    - typescript
    - testing
  entityIds:
    - tool:ts
    - project:engram
  ```
- **Assertions:** YAML lists valid, entities preserved

**Journey 4: Special Characters in Content**
- Content: `"Chose TypeScript (with 'single' and \"double\" quotes)"`
- YAML escaping handles quotes
- Markdown body renders correctly
- **Assertions:** No YAML parse errors, content readable

**Journey 5: Bulk Export (1000+ facts)**
- Export loop processes 1000 facts sequentially
- Each write is atomic (.tmp → rename)
- Performance target: < 1 second per fact
- Total time: < 17 minutes for 1000 facts
- **Assertions:** All files created, no partial writes, no concurrency issues

#### Permutation Matrix for Export

| Dimension | Values | Coverage |
|-----------|--------|----------|
| factType | decision, observation, insight, plan, error, etc. | 8 paths |
| Content Size | Small (<100 chars), medium, large (>1MB) | 3 paths |
| Metadata | Minimal, rich (tags, entities, summary) | 3 paths |
| Encoding | UTF-8, with emoji, special chars | 3 paths |
| Disk State | Folder exists, doesn't exist, read-only | 3 paths |
| Scale | 1, 100, 1000+ facts | 3 paths |
| **Total Paths** | — | **1,944 scenarios** |
| **Critical Paths** | Simple export, with summary, bulk export, special chars | 4 critical |

#### Missing Specifications

| Category | Gap | Impact | Current Ambiguity |
|----------|-----|--------|-------------------|
| **Entity Auto-Linking** | Should mentions of entities auto-link? | P1 - UX | Currently not implemented; "Consider for Phase 7" |
| **Size Limits** | Max content size to export? | P2 - edge case | Currently unbounded |
| **Filename Collisions** | Two facts slug to same name? | P1 - correctness | Current: uses fact ID to ensure uniqueness ✓ |
| **Atomic Failure** | What if .tmp→ rename fails? | P1 - data integrity | Assume transaction rolls back; verify |
| **Archive Facts** | Export archived/pruned facts? | P0 - scope | Current: lifecycleState field preserved |
| **Vault Path Updates** | Does Convex fact.vaultPath always get updated? | P0 - consistency | Should be synchronous in transaction |

---

### Cluster C.2: engram-g3o — File Watcher Two-Way Sync

#### Flow Overview

**ALREADY FULLY IMPLEMENTED** in vault-sync.ts daemon:

```
Daemon (every 5s interval):
  ├─ getUnmirroredFacts(limit=100) — facts with vaultPath=null
  │  └─ For each: writeFactToVault(), update vaultPath
  └─ File watcher (chokidar):
     ├─ On 'change' or 'add': reconcileFileEdit(filePath)
     ├─ Parse frontmatter + body
     ├─ Detect conflicts (updateAt timestamps)
     ├─ Merge human edits (content, tags, entityIds)
     ├─ applyVaultEdit() to Convex
     └─ Track vaultPath in fact record
```

#### Current Implementation Status

**FULLY IMPLEMENTED:**
- ✅ `VaultSyncDaemon` class
- ✅ Interval-based polling (5s default)
- ✅ File watcher with chokidar
- ✅ Conflict detection and .conflict.md files
- ✅ Human edit merging (HUMAN_FIELDS set)

**NEEDS TESTING:**
- ⚠️ Watcher event deduplication
- ⚠️ Large vault performance (1000+ files)
- ⚠️ Timeout handling for slow I/O
- ⚠️ Stale file cleanup

**MISSING:**
- [ ] Git integration (see engram-1vt)
- [ ] Delete handling (when vault file deleted)
- [ ] Performance metrics/monitoring

#### User Journeys for Watcher (Reference)

See **Cluster A.2** for full watcher test flows.

#### Critical Questions for Watcher

| Question | Impact | Current State |
|----------|--------|---|
| **Double-reconcile prevention** | If watcher fires 2 "change" events for 1 edit | No dedup mechanism |
| **Delete handling** | User deletes .md file — delete fact in Convex? | Not specified; assume no |
| **Stale files** | .md files without convexId or old vaultSyncedAt | No cleanup cron |
| **Performance SLA** | Max files per sync run? | maxPerRun=100 hardcoded |

---

### Cluster C.3: engram-1vt — Git Integration (Auto-Init + Auto-Commit)

#### Flow Overview

New git daemon that mirrors filesystem sync events to git:

```
Precondition: User has configured vault folder as git repo

Option A: Auto-Init Mode
  User calls: vaultInitializeGit(vaultRoot)
  ├─ Check if .git exists
  ├─ If not: git init
  ├─ Create .gitignore for .engram/ and .conflict.md
  ├─ Create initial commit: "Initialize Engram vault"
  └─ Result: vaultRoot is now git-managed

Option B: Manual Mode
  User has already: cd vault && git init
  System assumes git repo exists
  Proceeds with auto-commit

Auto-Commit Cycle:
  After reconcileFileEdit() completes successfully
  ├─ Check git status
  ├─ Stage changed file: git add <file>
  ├─ If git status has changes:
  │  └─ Create commit:
  │     ├─ Author: fact.createdBy
  │     ├─ Message: "Memory: {content snippet} ({reason})"
  │     └─ git commit
  └─ Push to origin (optional, async)

Conflict Handling During Git Ops:
  Scenario A: Git merge conflict (if pulling)
    ├─ Detect git status = MERGING
    ├─ Abort auto-commit
    ├─ Notify user: "Git merge in progress"
    └─ Wait for user to resolve

  Scenario B: Dirty working tree (uncommitted changes)
    ├─ Before auto-commit: detect dirty state
    ├─ Option 1: Stash + commit + unstash
    ├─ Option 2: Skip commit, log warning
    └─ Configuration: user choice

  Scenario C: Rebase in progress
    ├─ Detect .git/rebase-merge or .git/rebase-apply
    ├─ Abort auto-commit
    └─ Notify user
```

#### Current Implementation Status

**MISSING (ALL):**
- [ ] `gitInitializeRepo()` function
- [ ] `gitAutoCommit()` function
- [ ] Git status detection
- [ ] Dirty state handling
- [ ] Conflict resolution (merge, rebase in progress)
- [ ] Author mapping (Convex agentId → git author)
- [ ] Push mechanism (optional, async)
- [ ] Tests for all above

**ARCHITECTURAL CHALLENGES:**
1. **Git binary availability** — Assume `git` CLI installed on system? Or use node-git library (simple-git)?
2. **Author mapping** — How to map agentId="indy" to git author "Indy User <indy@example.com>"?
3. **Commit message format** — How much detail in message? Just snippet, or full metadata?
4. **Stash/pop for dirty state** — Safe? Or just log warning?
5. **Push authentication** — SSH keys, personal tokens, or skipped?
6. **Merge conflict resolution** — User-driven or auto (takes remote/local)?

#### User Journeys for Git Integration

**Journey 1: Initialize Vault as Git Repo**
- User: `await gitInitializeRepo(vaultRoot)`
- System:
  - Checks: `.git` exists?
  - If not: `git init`, creates `.gitignore`, first commit
  - If yes: assumes user configured it
- **Assertions:** `.git` directory created, can run `git log`

**Journey 2: Auto-Commit on Fact Edit**
- Fact stored: `{content: "Chose TypeScript", reason: "Type safety"}`
- writeFactToVault() creates `decisions/chose-typescript.md`
- Post-sync hook: gitAutoCommit()
  - `git status` shows: `??  decisions/chose-typescript.md`
  - `git add decisions/chose-typescript.md`
  - `git commit -m "Memory: Chose TypeScript (Type safety)"`
  - Author: `Indy <indy@localhost>` (from config)
- **Assertions:**
  - Commit created with correct message
  - Author set to fact creator
  - File now staged and committed

**Journey 3: Auto-Commit on Fact Update**
- User edits vault file: "Chose TypeScript" → "Chose TypeScript for CLI"
- reconcileFileEdit() updates fact in Convex
- gitAutoCommit() runs:
  - `git status` shows: `M  decisions/chose-typescript.md`
  - `git add decisions/chose-typescript.md`
  - `git commit -m "Memory: Chose TypeScript for CLI (Human edit)"`
- **Assertions:** Update commit created, diff shows change

**Journey 4: Dirty Working Tree (Stash Strategy)**
- User has uncommitted work: `decisions/manual-notes.md`
- System tries to auto-commit `decisions/chose-typescript.md`
- Option A (Stash):
  - `git stash` (saves manual-notes.md)
  - `git add decided-typescript.md`
  - `git commit ...`
  - `git stash pop` (restores manual-notes.md)
  - Result: commit only has fact change
- **Assertions:** Commit clean, user work preserved

**Journey 5: Dirty Working Tree (Log Warning Strategy)**
- Same setup
- Option B (Warn):
  - Detect dirty state
  - Log warning: "Dirty working tree, skipping auto-commit"
  - Skip commit, return
- **Assertions:** No commit created, warning logged

**Journey 6: Git Merge in Progress**
- User started: `git pull origin main` (merge conflict)
- User has not resolved yet
- System tries to auto-commit new fact
- Detect: `.git/MERGE_HEAD` exists
- Actions:
  - Option A (Skip): Log "Merge in progress", skip commit
  - Option B (Abort): `git merge --abort`, continue with commit
- **Assertions:** No corruption, clear messaging

**Journey 7: Git Rebase in Progress**
- Similar to Journey 6
- Detect: `.git/rebase-merge` or `.git/rebase-apply` exists
- Action: Skip or abort
- **Assertions:** No corruption

**Journey 8: Push to Remote (Optional, Async)**
- Auto-commit succeeds
- If configured `git.pushAfterCommit=true`:
  - Fire-and-forget: `git push origin main`
  - On failure: log error, don't block memory operations
- **Assertions:**
  - Memory operations always succeed (push is async)
  - Push failures logged separately
  - Graceful degradation if push fails

#### Permutation Matrix for Git Integration

| Dimension | Values | Coverage |
|-----------|--------|----------|
| Repo State | Not initialized, initialized, has commits | 3 paths |
| Working Tree | Clean, dirty, has stashes | 3 paths |
| Git Operations | None, merge in progress, rebase in progress | 3 paths |
| Dirty Strategy | Stash, warn, abort-merge | 3 paths |
| Push Config | Disabled, enabled, auth fails | 3 paths |
| Author Mapping | Default, custom, missing config | 3 paths |
| Commit Message | Short, detailed, malformed | 3 paths |
| Scale | 1 commit, 100 bulk commits, 1000 | 3 paths |
| **Total Paths** | — | **19,683 scenarios** |
| **Critical Paths** | Init, simple commit, dirty tree, merge conflict, push | 5 critical |

#### Missing Specifications

| Category | Gap | Impact | Current Ambiguity |
|----------|-----|--------|-------------------|
| **Git Library** | Use node CLI or simple-git npm? | P0 - design | Unspecified |
| **Author Mapping** | How to config agentId → git author? | P0 - design | Likely from `git config user.name`, or override? |
| **Commit Message Format** | "Memory: X (reason)" or detailed? | P1 - UX | Unspecified; assume brief |
| **Dirty Tree Handling** | Stash, warn, or abort? | P0 - robustness | Unspecified; assume warn + skip |
| **Merge/Rebase Behavior** | Skip commit or abort operation? | P0 - safety | Unspecified; assume skip |
| **Push Strategy** | Async, sync, or disabled? | P1 - performance | Likely async + fire-and-forget |
| **Auth Method** | SSH, HTTPS token, or local only? | P0 - security | Unspecified; likely SSH (pre-configured) |
| **Rollback Scenario** | If commit fails, retry or skip? | P0 - consistency | Unspecified |
| **Initial Commit Message** | What should init commit say? | P2 - UX | Unspecified |
| **Monorepo Support** | Multiple vaults in one repo? | P2 - advanced | Unspecified; assume single vault |

---

## Part 2: Gap Identification & Critical Questions

### A. Testing Gaps (engram-7g0, engram-wxn)

#### Critical Questions (P0 — Blocks Implementation)

**Q1.1: Bootstrap Deduplication Threshold**
- **Question:** Exact cosine similarity value for dedup in bootstrap pipeline?
- **Why it matters:** Affects duplicate fact creation; 0.85 vs 0.95 produces very different results
- **Current state:** Code references 0.85, but no test confirms this behavior
- **Assumption if unanswered:** Use 0.85 (from dedup plan)
- **Example:**
  - Fact A: "Chose TypeScript for type safety"
  - Fact B: "Selected TypeScript over Python for better types"
  - Similarity = 0.87 (cosine)
  - With 0.85 threshold: merged
  - With 0.95 threshold: separate
  - **MUST SPECIFY:** Which behavior is correct?

**Q1.2: Bootstrap Memory Scope**
- **Question:** Which scope should bootstrapped facts be stored in?
- **Why it matters:** Affects access control; private vs. shared scope
- **Current state:** Not specified
- **Assumption if unanswered:** `private-bootstrap` (new scope, requires owner agent)
- **Options:**
  - Option A: Create temporary `private-bootstrap` scope, ingest there, user can move later
  - Option B: User specifies target scope as parameter
  - Option C: Facts ingest to `private-{agentId}` where agentId="bootstrap-agent"
  - **MUST SPECIFY:** Which option?

**Q1.3: Enrichment Blocking in Bootstrap**
- **Question:** Should bootstrap block until enrichment (embedding, importance, entities) completes?
- **Why it matters:** Affects test assertions and performance
- **Current state:** Likely async (fire-and-forget), but unspecified
- **Assumption if unanswered:** Async; test should poll until enrichment done
- **Example:**
  - Fact stored at T=0
  - Enrichment starts (async)
  - Bootstrap returns immediately: "1800 facts ingested"
  - Test polls `/api/facts?enrichmentStatus=completed` until 1800 complete
  - **MUST SPECIFY:** Blocking or async? How to verify completion?

**Q1.4: Resume From Checkpoint**
- **Question:** How to resume bootstrap after partial failure?
- **Why it matters:** Large bootstraps (1000+ sessions) need recovery
- **Current state:** No checkpoint mechanism
- **Assumption if unanswered:** Track dedup across restarts via Convex query
- **Design options:**
  - Option A: Write checkpoint file (sessionId, fact count) after each session
  - Option B: Query Convex for last `source="bootstrap"` fact timestamp, resume after
  - Option C: Reprocess all, rely on dedup to merge duplicates
  - **MUST SPECIFY:** How to detect already-processed sessions?

**Q1.5: Filesystem Mirror — File Deletion Semantics**
- **Question:** When user deletes `.md` file in vault, should corresponding Convex fact be deleted?
- **Why it matters:** Affects data consistency; deletion could be accidental
- **Current state:** vault-reconciler.ts does NOT handle deletions
- **Assumption if unanswered:** No auto-deletion; files are one-way export only
- **Options:**
  - Option A: Auto-delete fact in Convex when .md deleted
  - Option B: Create archive/soft-delete entry, user must confirm
  - Option C: No deletion support; facts are durable, orphaned files ignored
  - **MUST SPECIFY:** Safety-first = no auto-delete, but UX requires explicit handling

**Q1.6: Watcher Event Deduplication**
- **Question:** If user edits file twice in 100ms, how many reconcile calls?
- **Why it matters:** Affects database update counts, performance, test assertions
- **Current state:** vault-sync.ts has no debounce mechanism
- **Assumption if unanswered:** Multiple events → multiple reconciles (current behavior)
- **Design:**
  - Option A: No debounce; accept N updates per N edit events
  - Option B: 500ms debounce; batch changes
  - Option C: Track file modification time, skip if reconcile already done
  - **MUST SPECIFY:** For tests, how many concurrent edits are acceptable?

#### Important Questions (P1 — Affects UX/Maintainability)

**Q2.1: Conflict File Cleanup**
- **Question:** Should `.conflict.md` files be auto-deleted after user resolves?
- **Why it matters:** Vault cleanliness; leftover conflict files accumulate
- **Current state:** User must manually delete
- **Assumption:** Assume no auto-cleanup; user responsible

**Q2.2: Parallel Bootstrap Degree**
- **Question:** How many sessions to process in parallel?
- **Why it matters:** Performance vs. memory usage
- **Current state:** `maxPerRun=100` hardcoded for Convex uploads
- **Assumption:** Respect Convex rate limits; parallel safe if batch size <= 100

**Q2.3: Vault Path Collision**
- **Question:** Two facts slug to same filename — how to resolve?
- **Why it matters:** Data loss prevention
- **Current state:** vault-writer.ts uses fact ID to ensure uniqueness
- **Assumption:** Filename format includes short ID; collision impossible

### B. Dashboard Gaps (engram-7eb)

#### Critical Questions (P0)

**Q3.1: Rollback Semantics**
- **Question:** When rolling back, do we revert only `content` or entire fact?
- **Why it matters:** Determines if rolled-back fact keeps tags, entities, importance
- **Current state:** Unspecified
- **Assumption:** Revert only `content`; metadata (tags, entities, importance) preserved
- **Options:**
  - Option A: Full revert (content + tags + entities + importance)
  - Option B: Content only
  - Option C: User chooses what to revert
  - **MUST SPECIFY:** Prevents rollback surprises

**Q3.2: Diff Algorithm**
- **Question:** How to compute diff for display?
- **Why it matters:** Affects rendering performance and UX
- **Current state:** Unspecified
- **Assumption:** Word-level diff (via `diff-match-patch` npm package)
- **Options:**
  - Option A: Line-by-line (fast, coarse)
  - Option B: Word-level (medium, common)
  - Option C: Character-level (slow, precise)
  - **MUST SPECIFY:** For MVP, assume word-level

**Q3.3: Change Reason Source**
- **Question:** Who/what populates `fact_versions.reason` field?
- **Why it matters:** Reason display in timeline depends on this
- **Current state:** Field exists, but source unclear
- **Assumption:**
  - Human-initiated: from UX input ("Fixed typo")
  - System-initiated: auto-generated ("Auto-enrichment", "Deduplication merge")
  - **MUST SPECIFY:** Validation rules for reason field

#### Important Questions (P1)

**Q4.1: Timestamp Display Format**
- **Question:** Show relative ("2 hours ago") or absolute ("2026-02-25 14:30 UTC")?
- **Why it matters:** UX clarity and scannability
- **Assumption:** Relative primary, absolute on hover tooltip

**Q4.2: Version Limit**
- **Question:** Max versions to show before pagination?
- **Why it matters:** Performance; 1000+ versions would cause slow renders
- **Assumption:** Load 20 by default, pagination for more

### C. Git Integration Gaps (engram-1vt)

#### Critical Questions (P0)

**Q5.1: Git Library Choice**
- **Question:** Use simple-git npm package or shell out to `git` CLI?
- **Why it matters:** Dependency complexity, error handling, cross-platform
- **Current state:** Unspecified
- **Assumption:** Use `simple-git` (popular, well-maintained, handles errors)
- **Decision required:** Simple-git vs. child_process spawn

**Q5.2: Author Mapping**
- **Question:** How to map Convex agentId to git author?
- **Why it matters:** Git history accuracy
- **Current state:** Unspecified
- **Assumption:**
  - Read from `convex/schema.ts` agents table (name, email fields)
  - Fall back to `indy <indy@localhost>` if not set
  - **MUST SPECIFY:** Config location and format

**Q5.3: Dirty Tree Strategy**
- **Question:** On dirty working tree, stash, warn, or abort?
- **Why it matters:** Risk of losing user changes if stashed incorrectly
- **Current state:** Unspecified
- **Assumption:** Warn + skip (safest); let user resolve manually
- **Rationale:** Stashing is dangerous without user consent

**Q5.4: Merge/Rebase Handling**
- **Question:** On merge/rebase in progress, skip or abort operation?
- **Why it matters:** Data integrity; don't corrupt git state
- **Current state:** Unspecified
- **Assumption:** Skip auto-commit; log warning; let user finish merge first
- **Rationale:** Never abort user operations

**Q5.5: Commit Message Format**
- **Question:** What should auto-commit messages look like?
- **Why it matters:** Git history readability
- **Current state:** Unspecified
- **Assumption:** `"Memory: {content-snippet} ({reason-or-agent})"`
- **Example:** `"Memory: Chose TypeScript (indy)"`
- **Length:** < 72 characters for subject line

#### Important Questions (P1)

**Q6.1: Push Strategy**
- **Question:** Auto-push after commit, or manual?
- **Why it matters:** Sync to remote repo
- **Assumption:** Optional (config flag); async if enabled
- **Rationale:** Never block memory ops on git push

**Q6.2: Error Handling**
- **Question:** If git commit fails, retry or skip?
- **Why it matters:** Prevents memory ingestion from blocking on git failures
- **Assumption:** Log error, skip commit, continue memory ops
- **Rationale:** Git is optional; memory is primary

### D. Specification Gaps (All Clusters)

#### Cross-Cutting Issues

**Q7.1: Performance Baselines**
- Bootstrap: 1800 facts in < 5 minutes?
- Vault export: < 1 second per fact?
- Mirror sync: < 100ms per file?
- Git commit: < 500ms per commit?
- **MUST SPECIFY:** SLAs for all operations

**Q7.2: Error Taxonomy**
- Which errors are retryable? (network, timeout, rate-limit)
- Which are fatal? (schema mismatch, permission denied)
- Which should be silent? (benign, informational)
- **MUST SPECIFY:** Error categories and handling per operation

**Q7.3: Rollback Consistency**
- If bootstrap fails at session 25 of 50, is DB state clean?
- If mirror sync fails mid-reconcile, is fact update rolled back?
- If git commit fails, are files staged?
- **MUST SPECIFY:** Transactional boundaries for all operations

---

## Part 3: Comprehensive Testing Strategy

### Test Suite Structure

```
tests/
├── engram-7g0-bootstrap-e2e/
│   ├── pipeline.test.ts — Full sessions → ingestion
│   ├── dedup.test.ts — Cross-session duplicate merging
│   ├── parallel.test.ts — N-session parallel processing
│   ├── resume.test.ts — Recovery from checkpoint
│   ├── encoding.test.ts — Malformed sessions, UTF-8 handling
│   └── performance.test.ts — Throughput baselines
├── engram-wxn-mirror-tests/
│   ├── export-import.test.ts — Round-trip create→edit→sync
│   ├── conflicts.test.ts — Concurrent edit detection
│   ├── watcher.test.ts — File change detection + dedup
│   ├── vault-paths.test.ts — Path tracking, collisions
│   ├── scale.test.ts — 1000+ file vault
│   └── integration.test.ts — With git sync
├── engram-7eb-dashboard/
│   ├── timeline.test.tsx — Component rendering
│   ├── diff.test.tsx — Version diff view
│   ├── rollback.test.tsx — Rollback UX
│   ├── pagination.test.tsx — Load more versions
│   └── e2e.test.ts — Full dashboard flow (Playwright)
├── engram-uw7-export/
│   ├── basic.test.ts — Simple fact export
│   ├── metadata.test.ts — Frontmatter + summary
│   ├── special-chars.test.ts — YAML escaping
│   ├── bulk.test.ts — 1000+ facts
│   └── encoding.test.ts — UTF-8, emoji, special chars
├── engram-g3o-watcher/
│   ├── (covered by engram-wxn)
└── engram-1vt-git/
    ├── init.test.ts — Repository initialization
    ├── auto-commit.test.ts — Single + bulk commits
    ├── dirty-tree.test.ts — Stash / warn strategies
    ├── merge-rebase.test.ts — In-progress operations
    ├── push.test.ts — Remote sync (optional)
    └── author.test.ts — Author mapping
```

### Minimal Critical Test Set (MVP)

For each task, implement ONLY critical paths:

**engram-7g0 (Bootstrap E2E):**
1. Single session → facts → Convex (happy path)
2. Multiple sessions → cross-session dedup (core feature)
3. Resume from checkpoint (recovery)
4. Malformed session handling (robustness)

**engram-wxn (Mirror Tests):**
1. Create → export → read round-trip (happy path)
2. Edit → import → Convex update (happy path)
3. Concurrent edits → conflict detection (core feature)
4. Watcher event deduplication (performance)

**engram-7eb (Dashboard):**
1. Render version timeline (component basic)
2. Diff view (core UX)
3. Rollback (core UX)

**engram-uw7 (Export):**
1. Simple fact export (happy path)
2. Bulk export 1000 facts (performance)
3. Special characters handling (robustness)

**engram-1vt (Git):**
1. Initialize repo (setup)
2. Auto-commit new fact (happy path)
3. Dirty tree handling (error case)
4. Merge in progress (error case)

**TOTAL CRITICAL TESTS:** ~40-50 core tests covering MVP functionality

---

## Part 4: Implementation Priority & Dependencies

### Dependency Graph

```
engram-7eb (Dashboard)
  ↑ (no blockers)
  └─ Uses: fact_versions table (✓ exists)

engram-uw7 (Export)
  ↑ (no blockers)
  └─ Uses: vault-writer.ts (✓ exists)

engram-g3o (Watcher)
  ↑ (no blockers)
  └─ Uses: vault-reconciler.ts (✓ exists)
  └─ TESTS: engram-wxn depends on this

engram-1vt (Git)
  ↑ (no blockers, independent)
  └─ Consumes: vault-sync daemon output

engram-7g0 (Bootstrap E2E)
  ↑ (design questions: Q1.1-Q1.4)
  ├─ Uses: bootstrap-from-sessions.ts (✓ partial)
  ├─ Uses: deduplicateFacts() (✓ exists)
  └─ Needs: Convex schema support (✓ exists)

engram-wxn (Mirror Tests)
  ↑ (design questions: Q1.5-Q1.6, Q2.1-Q2.3)
  ├─ Uses: vault-writer.ts (✓ exists)
  ├─ Uses: vault-reconciler.ts (✓ exists)
  └─ Uses: vault-sync daemon (✓ exists)

engram-1ob (Phase 6 Parent)
  ↑ (blocks: all 6 child tasks)

engram-w3u (Phase 6 Epic)
  ↑ (blocks: engram-1ob)
```

### Implementation Order (Recommended)

**Phase 1: Low-Hanging Fruit (No Design Questions)**
1. **engram-7eb** (Dashboard) — Isolated, design complete, just needs React component
2. **engram-uw7** (Export) — Already 90% done, just needs verification tests
3. **engram-g3o** (Watcher) — Tests only; implementation complete

**Phase 2: Answer Design Questions (P0 Blockers)**
- **Questions to resolve:**
  - Q1.1: Dedup threshold
  - Q1.2: Bootstrap scope
  - Q1.3: Enrichment blocking
  - Q5.1: Git library choice
  - Q5.2: Author mapping
  - Q5.3: Dirty tree strategy

**Phase 3: Implement with Clarity**
4. **engram-7g0** (Bootstrap E2E) — After Q1.1-Q1.4 answered
5. **engram-wxn** (Mirror Tests) — After Q1.5-Q1.6, Q2.1-Q2.3 answered
6. **engram-1vt** (Git) — After Q5.1-Q5.5 answered

**Phase 4: Parent Beads**
7. **engram-1ob** (Feature parent) — Close after all 6 child tasks done
8. **engram-w3u** (Epic parent) — Close after engram-1ob

---

## Part 5: Recommended Next Steps

### Immediate Actions (This Sprint)

1. **Create decision document:** Answer all P0 questions (Q1.1-Q1.4, Q5.1-Q5.5)
   - File: `docs/DESIGN-DECISIONS-PHASE6.md`
   - Owners: @lead architect, @team

2. **Implement engram-7eb (Dashboard):**
   - Create `/dashboard/src/components/VersionTimeline.tsx`
   - Implement pagination, diff view, rollback button
   - Write 8 component tests
   - Est: 4-6 hours

3. **Verify engram-uw7 (Export):**
   - Run existing vault-format.test.ts
   - Add tests for bulk export, special chars
   - Measure performance (target: < 1s per fact)
   - Est: 2-3 hours

4. **Write engram-wxn test skeleton:**
   - Create `/mcp-server/test/vault-mirror-e2e.test.ts`
   - Outline 4 critical test cases (don't implement yet)
   - Identify missing mocks/fixtures
   - Est: 2 hours

### Week 2 Actions

5. **Decision questions resolution:**
   - Technical spike: Git library evaluation (simple-git vs. CLI)
   - Design session: Bootstrap checkpoint mechanism
   - Document findings in DESIGN-DECISIONS

6. **Implement engram-7g0 (Bootstrap E2E):**
   - Extend `/mcp-server/test/bootstrap-sessions.test.ts`
   - Add pipeline e2e test (sessions → Convex → verification)
   - Add dedup test (cross-session merging)
   - Add resume test (checkpoint recovery)
   - Est: 8-10 hours

7. **Implement engram-wxn (Mirror Tests):**
   - Fill in `/mcp-server/test/vault-mirror-e2e.test.ts`
   - Create fixtures (vault folder with test files)
   - Test round-trip: create → export → edit → import
   - Test conflict detection and resolution
   - Test watcher deduplication
   - Est: 10-12 hours

### Week 3 Actions

8. **Implement engram-1vt (Git Integration):**
   - Create `/mcp-server/src/daemons/git-sync.ts`
   - Implement functions: `gitInitializeRepo()`, `gitAutoCommit()`
   - Handle dirty tree, merge/rebase, author mapping
   - Write 6-8 tests covering critical paths
   - Est: 12-16 hours

9. **Close parent beads:**
   - Mark engram-1ob complete (all 6 tasks done)
   - Mark engram-w3u complete (epic closed)

### Success Criteria

Each task is done when:
- [ ] All critical tests (≥4) pass
- [ ] Design questions answered and documented
- [ ] No P0 gaps remain
- [ ] Performance baselines met
- [ ] Code reviewed and merged
- [ ] Parent bead updated

---

## Appendix A: File Paths & Code References

### Key Files to Examine/Modify

**Already Complete:**
- `/mcp-server/src/daemons/vault-sync.ts` — Core sync daemon (lines 1-77)
- `/mcp-server/src/lib/vault-writer.ts` — Fact export (lines 1-57)
- `/mcp-server/src/lib/vault-reconciler.ts` — Conflict detection (lines 1-81)
- `/mcp-server/src/lib/vault-format.ts` — Serialization (lines 1-119)
- `/mcp-server/test/bootstrap-sessions.test.ts` — Bootstrap tests (lines 1-300+)
- `/mcp-server/test/vault-format.test.ts` — Format tests (lines 1-32)
- `/convex/schema.ts` — fact_versions table (lines 471+)
- `/dashboard/src/app/page.tsx` — Dashboard skeleton (lines 1-276)

**To Create:**
- `/mcp-server/src/daemons/git-sync.ts` — Git integration (NEW)
- `/mcp-server/test/vault-mirror-e2e.test.ts` — Round-trip tests (NEW)
- `/mcp-server/test/bootstrap-e2e.test.ts` — Full pipeline (NEW or extend)
- `/dashboard/src/components/VersionTimeline.tsx` — Timeline component (NEW)
- `/docs/DESIGN-DECISIONS-PHASE6.md` — Answers to gap questions (NEW)

**To Update:**
- `/mcp-server/test/bootstrap-sessions.test.ts` — Add full pipeline, dedup, resume tests
- `/mcp-server/src/lib/vault-format.test.ts` — Add bulk, special chars tests
- `/dashboard/src/app/page.tsx` — Wire up version timeline component

### Schema Fields

**fact_versions table (convex/schema.ts):**
```typescript
fact_versions: defineTable({
  factId: v.id("facts"),
  previousContent: v.string(),
  previousImportance: v.optional(v.float64()),
  previousTags: v.optional(v.array(v.string())),
  changedBy: v.string(),
  changeType: v.union(v.literal("update"), v.literal("rollback"), v.literal("merge")),
  reason: v.optional(v.string()),
  createdAt: v.number(),
})
```

**facts table additions (convex/schema.ts):**
```typescript
vaultPath: v.optional(v.string()), // Line 16
vaultSyncedAt: v.optional(v.number()), // Line 17
```

---

## Appendix B: Test Fixture Templates

### Bootstrap Session Fixture

```json
{
  "messages": [
    {
      "role": "user",
      "content": "I need to choose a CLI language",
      "timestamp": 1740422400000
    },
    {
      "role": "assistant",
      "content": "I've decided to use TypeScript because of type safety and Convex SDK compatibility.",
      "timestamp": 1740422500000
    }
  ]
}
```

### Vault File Fixture

```markdown
---
id: abc1d2e3
source: direct
factType: decision
createdBy: indy
scopeId: private-indy
timestamp: 1740422400000
updatedAt: 1740422400000
entityIds: ["tool:typescript"]
tags: ["decision", "architecture"]
importanceScore: 0.85
relevanceScore: 0.9
lifecycleState: active
---

Chose TypeScript for CLI because of type safety and Convex SDK compatibility.
```

---

## Summary: 8 Tasks → 1-2 Week Implementation

| Task | Status | Complexity | Est. Hours | Blocker? | Priority |
|------|--------|-----------|-----------|----------|----------|
| engram-7g0 | Design → Ready | Medium | 8-10 | Q1.1-Q1.4 | P1 |
| engram-wxn | Design → Ready | High | 10-12 | Q1.5-Q1.6 | P1 |
| engram-7eb | Design → Ready | Low-Med | 4-6 | None | P0 |
| engram-uw7 | Ready | Low | 2-3 | None | P0 |
| engram-g3o | Ready (tests) | Medium | 4-6 | None | P1 |
| engram-1vt | Design → Ready | High | 12-16 | Q5.1-Q5.5 | P1 |
| engram-1ob | Awaiting children | — | — | All 6 | P2 |
| engram-w3u | Awaiting children | — | — | engram-1ob | P2 |

**Critical Path (on the happy path):**
1. Answer Q1.1-Q1.4, Q5.1-Q5.5 (1 day)
2. engram-7eb (1 day)
3. engram-uw7 + verify (0.5 day)
4. engram-7g0 (2 days)
5. engram-wxn (2 days)
6. engram-1vt (2 days)
7. Close parents (0.5 day)

**Total: ~8-9 days with 2-3 developers**

---

**Analysis Completed:** 2026-02-25
**Next Review Date:** After design decisions answered
**Maintenance:** Update this document as ambiguities are resolved
