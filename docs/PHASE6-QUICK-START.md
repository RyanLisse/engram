# Phase 6 Quick Start Guide for Developers

**Start here to understand the 8 remaining tasks at a glance.**

---

## The 8 Tasks at a Glance

```
╔═ CLUSTER A: Testing ════════════════════════════════════════════════════════╗
║                                                                              ║
║  engram-7g0: Bootstrap E2E Tests                                            ║
║    Test full pipeline: sessions → extraction → dedup → Convex ingestion     ║
║    Status: Design questions needed (Q1.1-Q1.4)                              ║
║    Effort: 8-10 hours                                                       ║
║    Key files: mcp-server/test/bootstrap-sessions.test.ts                    ║
║                                                                              ║
║  engram-wxn: Filesystem Mirror Tests                                        ║
║    Test round-trip: create → export → edit → import                         ║
║    Status: Design questions needed (Q1.5-Q1.6)                              ║
║    Effort: 10-12 hours                                                      ║
║    Key files: mcp-server/test/vault-mirror-e2e.test.ts (NEW)                ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

╔═ CLUSTER B: Dashboard ═════════════════════════════════════════════════════════╗
║                                                                                ║
║  engram-7eb: Version Timeline Component                                        ║
║    React component showing fact version history                               ║
║    Status: Ready (no design questions)                                        ║
║    Effort: 4-6 hours                                                          ║
║    Key files: dashboard/src/components/VersionTimeline.tsx (NEW)              ║
║               mcp-server/test/version-history.test.ts (exists)                ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝

╔═ CLUSTER C: Filesystem Mirror (Phase 6) ═══════════════════════════════════════╗
║                                                                                ║
║  engram-uw7: Export Facts to Markdown                                         ║
║    MOSTLY DONE — just verify existing vault-writer.ts                        ║
║    Status: Ready (code exists)                                               ║
║    Effort: 2-3 hours (just tests)                                            ║
║    Key files: mcp-server/src/lib/vault-writer.ts ✓                           ║
║               mcp-server/test/vault-format.test.ts ✓                         ║
║                                                                                ║
║  engram-g3o: File Watcher Two-Way Sync                                        ║
║    ALREADY DONE — just test it                                              ║
║    Status: Ready (code exists)                                               ║
║    Effort: 4-6 hours (test only)                                             ║
║    Key files: mcp-server/src/daemons/vault-sync.ts ✓                         ║
║               mcp-server/src/lib/vault-reconciler.ts ✓                       ║
║                                                                                ║
║  engram-1vt: Git Integration (Auto-Init + Auto-Commit)                        ║
║    NEW — Build git daemon for auto-commits                                   ║
║    Status: Design questions needed (Q5.1-Q5.5)                               ║
║    Effort: 12-16 hours                                                       ║
║    Key files: mcp-server/src/daemons/git-sync.ts (NEW)                       ║
║               mcp-server/test/git-integration.test.ts (NEW)                   ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝

╔═ PARENT BEADS ═════════════════════════════════════════════════════════════════╗
║                                                                                ║
║  engram-1ob: Phase 6 Feature Parent                                           ║
║    AUTO-CLOSE when all 6 child tasks complete                               ║
║                                                                                ║
║  engram-w3u: Phase 6 Epic Parent                                             ║
║    AUTO-CLOSE when engram-1ob closes                                         ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

---

## Implementation Order (Recommended)

### Week 1: Low-Hanging Fruit (NO design questions)

1. **engram-7eb** (Dashboard) — 4-6h
   - Create `/dashboard/src/components/VersionTimeline.tsx`
   - Test: timeline rendering, diff view, rollback
   - No blockers, isolated

2. **engram-uw7** (Export) — 2-3h
   - Verify `/mcp-server/src/lib/vault-writer.ts`
   - Add bulk tests, special char tests
   - Measure performance

3. **engram-g3o** (Watcher tests) — 4-6h
   - Create tests in `/mcp-server/test/vault-mirror-e2e.test.ts`
   - Test file watcher, event dedup, conflicts
   - (Watcher daemon already implemented)

### Week 2: Design Clarity

4. **Answer critical questions** — 4h meeting + decision doc
   - Fill out `/docs/PHASE6-DESIGN-QUESTIONS-TEMPLATE.md`
   - Q1.1-Q1.6, Q5.1-Q5.5
   - Create `/docs/DESIGN-DECISIONS-PHASE6.md`

### Week 3: Heavy Implementation

5. **engram-7g0** (Bootstrap) — 8-10h
   - Extend `/mcp-server/test/bootstrap-sessions.test.ts`
   - Full pipeline test, dedup test, resume test

6. **engram-wxn** (Mirror tests) — 10-12h
   - Implement `/mcp-server/test/vault-mirror-e2e.test.ts`
   - Round-trip tests, conflict tests, scale tests

7. **engram-1vt** (Git) — 12-16h
   - Create `/mcp-server/src/daemons/git-sync.ts`
   - Init, auto-commit, dirty tree, merge handling
   - Write tests

### Week 4: Wrap-Up

8. **Close parent beads**
   - Mark engram-1ob complete
   - Mark engram-w3u complete
   - Update roadmap

---

## Key File Locations

### Already Exist (Verify + Test)
```
mcp-server/src/lib/vault-writer.ts           ✓ Export facts to markdown
mcp-server/src/lib/vault-reconciler.ts       ✓ Conflict detection
mcp-server/src/lib/vault-format.ts           ✓ Serialization (YAML)
mcp-server/src/daemons/vault-sync.ts         ✓ File watcher daemon
mcp-server/test/vault-format.test.ts         ✓ Format tests (basic)
mcp-server/test/vault-index.test.ts          ✓ Index tests
mcp-server/test/bootstrap-sessions.test.ts   ✓ Bootstrap tests (partial)
mcp-server/test/version-history.test.ts      ✓ Version history (tool tests)
convex/schema.ts                              ✓ fact_versions table (lines 471+)
dashboard/src/app/page.tsx                   ✓ Dashboard skeleton
```

### Need to Create
```
mcp-server/test/vault-mirror-e2e.test.ts     NEW Round-trip sync tests
mcp-server/src/daemons/git-sync.ts           NEW Git integration daemon
mcp-server/test/git-integration.test.ts      NEW Git tests
dashboard/src/components/VersionTimeline.tsx NEW Version timeline component
docs/PHASE6-DESIGN-QUESTIONS-TEMPLATE.md     NEW Decisions (fill in)
docs/DESIGN-DECISIONS-PHASE6.md              NEW Answers (create after decisions)
```

---

## Critical Design Questions (MUST ANSWER BEFORE CODING)

### Q1: Bootstrap Dedup Threshold
- **Q:** Cosine similarity for dedup: 0.75, 0.85, 0.95, or configurable?
- **Impact:** Affects duplicate fact creation in bootstrap

### Q2: Bootstrap Target Scope
- **Q:** Where should bootstrap facts go? (private-bootstrap, user-specified, session-per-scope?)
- **Impact:** Access control, fact discoverability

### Q3: Enrichment Blocking
- **Q:** Should bootstrap block until embeddings/importance/entities done, or async?
- **Impact:** Performance, test assertions

### Q4: Resume Checkpoint
- **Q:** How to detect already-processed sessions? (checkpoint file, query Convex, SHA hash, or reprocess all?)
- **Impact:** Recovery from partial failure

### Q5: File Deletion
- **Q:** User deletes .md file → delete Convex fact? (auto-delete, orphan, archive, or no-deletion?)
- **Impact:** Data consistency, user safety

### Q6: Watcher Dedup
- **Q:** Multiple edits in 100ms → multiple or single reconcile? (no dedup, debounce 500ms, or track mtime?)
- **Impact:** Database churn, test assertions

### Q7: Git Library
- **Q:** Use simple-git npm or shell git CLI?
- **Impact:** Dependency, error handling, cross-platform

### Q8: Author Mapping
- **Q:** How to map agentId → git author? (from agents table, config file, env var, or fallback chain?)
- **Impact:** Git history accuracy

### Q9: Dirty Tree
- **Q:** User has uncommitted changes → stash+retry, warn+skip, commit all, or fail?
- **Impact:** Safety, UX

### Q10: Merge/Rebase
- **Q:** Git merge/rebase in progress → skip, abort, retry, or fail?
- **Impact:** Data integrity

### Q11: Commit Message
- **Q:** Format? (simple, with-reason, full-metadata, or minimal?)
- **Impact:** Git history readability

**→ See `/docs/PHASE6-DESIGN-QUESTIONS-TEMPLATE.md` for full details**

---

## Quick Reference: Task Complexity Matrix

| Task | Size | Risk | Complexity | Deps | Priority |
|------|------|------|-----------|------|----------|
| engram-7eb | XS | LOW | LOW | None | P0 |
| engram-uw7 | S | LOW | LOW | None | P0 |
| engram-g3o | S | LOW | MED | None | P1 |
| engram-7g0 | M | MED | MED | Q1-Q4 | P1 |
| engram-wxn | L | MED | HIGH | Q5-Q6 | P1 |
| engram-1vt | L | MED | HIGH | Q7-Q11 | P1 |
| engram-1ob | — | — | — | All 6 | P2 |
| engram-w3u | — | — | — | 1ob | P2 |

---

## Running Tests

```bash
# Bootstrap tests
npm test -- bootstrap-sessions.test.ts
npm test -- bootstrap-parallel.test.ts

# Vault tests
npm test -- vault-format.test.ts
npm test -- vault-index.test.ts

# Version history tests
npm test -- version-history.test.ts

# Run ALL tests
npm test

# Watch mode
npm test -- --watch

# Specific test case
npm test -- bootstrap-sessions.test.ts -t "findSessionFiles"
```

---

## Code Snippets: Key APIs

### Vault Export (Already Works)
```typescript
import { writeFactToVault } from '../lib/vault-writer.js';

const fact = {
  _id: 'fact_123',
  content: 'Chose TypeScript',
  timestamp: Date.now(),
  source: 'direct',
  entityIds: [],
  relevanceScore: 0.9,
  accessedCount: 0,
  importanceScore: 0.85,
  createdBy: 'indy',
  scopeId: 'private-indy',
  tags: ['decision'],
  factType: 'decision',
  lifecycleState: 'active'
};

const { absolutePath, relativePath } = await writeFactToVault(vaultRoot, fact);
console.log('Exported to:', relativePath); // "private-indy/decisions/chose-typescript-abc123.md"
```

### Vault Sync Daemon (Already Works)
```typescript
import { VaultSyncDaemon } from '../daemons/vault-sync.js';

const daemon = new VaultSyncDaemon({
  vaultRoot: '/path/to/vault',
  intervalMs: 5000,  // 5s polling
  maxPerRun: 100     // Batch size
});

daemon.start();
// ... when done:
await daemon.stop();
```

### File Reconciliation (Already Works)
```typescript
import { reconcileFileEdit } from '../lib/vault-reconciler.js';

// User edits vault file, watcher detects it
const result = await reconcileFileEdit('/path/to/vault/decisions/chose-typescript.md');
// result = { reconciled: true, factId: 'fact_123', ... }
// OR:     = { reconciled: false, reason: 'missing_scope_id' }
// OR:     = { reconciled: false, conflict: true, conflictPath: '...' }
```

### Version History Query (Already Works)
```typescript
import { getFactVersions } from '../lib/convex-client.js';

const versions = await getFactVersions('fact_123', { limit: 20 });
// [
//   {
//     _id: 'version_3',
//     previousContent: 'Content v2',
//     changedBy: 'agent-2',
//     changeType: 'update',
//     reason: 'Corrected mistake',
//     createdAt: now
//   },
//   ...
// ]
```

---

## Testing Patterns to Use

### E2E Test Template
```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

let testDir: string;

beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'engram-test-'));
});

afterEach(async () => {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
});

describe('Feature Name', () => {
  test('happy path scenario', async () => {
    // ARRANGE
    const input = { /* ... */ };

    // ACT
    const result = await functionUnderTest(input);

    // ASSERT
    expect(result).toMatchObject({ /* ... */ });
  });
});
```

---

## Common Pitfalls to Avoid

1. **Don't start coding before answering design questions** — They block 3 major tasks

2. **Don't skip watcher dedup tests** — This is where sync bugs hide

3. **Don't auto-delete vault files** — Always preserve data (at least archive)

4. **Don't block memory ops on git** — Git must fail silently, memory succeeds always

5. **Don't merge dedup threshold changes without test** — Even 0.80 vs 0.85 matters

6. **Don't forget roundtrip tests** — Export→edit→import is the core feature

7. **Don't hardcode git author names** — Must be configurable or queried from Convex

---

## Where to Get Help

| Topic | File | Contact |
|-------|------|---------|
| Vault format specs | `docs/specs/VAULT_INTEGRATION_PLAN.md` | @architect |
| Bootstrap pipeline | `specs/obsidian-mirror-plan.md` (Phase 1-3) | @researcher |
| Git patterns | (TBD) | @cicd-engineer |
| Dashboard design | `/dashboard/src/app/page.tsx` | @frontend-dev |
| Test infrastructure | `mcp-server/test/*.test.ts` | @tester |

---

## Success Criteria Checklist

- [ ] All 11 design questions answered (PHASE6-DESIGN-QUESTIONS-TEMPLATE.md)
- [ ] engram-7eb: Dashboard timeline renders, diff works, rollback works
- [ ] engram-uw7: Export tests pass, bulk export <1s per fact
- [ ] engram-g3o: Watcher tests pass, dedup verified
- [ ] engram-7g0: Bootstrap full pipeline tested, resume works
- [ ] engram-wxn: Round-trip tests pass, conflicts detected
- [ ] engram-1vt: Git daemon works, dirty tree safe, merge/rebase handled
- [ ] All 1168+ tests still passing
- [ ] Parent beads (1ob, w3u) marked complete

---

**Status:** Ready for implementation (pending design questions)
**Next Step:** Answer design questions → Start implementation
**Full Details:** See `/docs/ANALYSIS-REMAINING-8-TASKS.md`
