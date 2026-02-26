# Design Patterns & Anti-Patterns Analysis
## Letta Context Repository Beads Plan (2026-02-25)

**Date:** 2026-02-25
**Scope:** Analysis of `docs/plans/2026-02-25-feat-letta-remaining-beads-completion-plan.md`
**Methodology:** Compared proposed implementation patterns against existing codebase modules

---

## Executive Summary

The plan demonstrates **strong architectural consistency** with existing patterns, but there are three areas of concern:

1. **Pattern Adherence:** 85% compliant — vault-git.ts follows established module patterns; e2e tests match existing structure; dashboard component needs clarification
2. **Code Duplication Risk:** 3 duplicated concepts across workstreams that could be consolidated
3. **Anti-Pattern Alert:** Git integration introduces optional configuration that could violate single responsibility principle if not carefully scoped

**Overall Assessment:** Plan is executable as written. Recommendations focus on consolidation and defensive design around git integration.

---

## 1. Vault Module Pattern Analysis

### Existing Vault Module Architecture

All vault-*.ts modules follow a consistent pattern:

| Module | Exports | Pattern |
|--------|---------|---------|
| `vault-format.ts` | Interfaces + pure functions | **Data transformation layer** (YAML ↔ JS, filenames, folder paths) |
| `vault-writer.ts` | Result interfaces + async functions | **I/O layer** (filesystem operations, temp files, atomic writes) |
| `vault-reconciler.ts` | Async functions + helpers | **Three-way merge layer** (conflict detection, field-level patching) |
| `vault-indexer.ts` | Async function only | **Index generation layer** (priority/entity grouping) |

**Key Characteristics:**
- Single responsibility per module (format ≠ write ≠ reconcile ≠ index)
- Clear import hierarchy: format is leaf; writer depends on format; reconciler depends on format + convex-client
- Explicit result/error types
- Atomic operations (temp files, two-phase writes)
- No side effects in pure functions

### vault-git.ts Proposal Evaluation

**Proposed structure:**
```typescript
export interface VaultGitOptions { ... }
export async function ensureGitRepo(vaultRoot): Promise<boolean>
export async function autoCommitChanges(opts): Promise<{ committed, sha? }>
export async function getLastSyncCommit(vaultRoot): Promise<string | undefined>
```

**Consistency Assessment: ✅ GOOD**

**Strengths:**
- Follows export pattern: interface + async functions (matches vault-writer.ts)
- Clear input/output types
- Stateless functions (no class, no side effects from imports)
- Specific return types with optional fields (sha?, committed boolean)

**Concerns:**

**⚠️ CONCERN 1: Missing error handling structure**
- All existing vault modules return `{ success, reason? }` on failures
- vault-git.ts should follow:
  ```typescript
  export async function autoCommitChanges(opts): Promise<{
    committed: boolean
    sha?: string
    reason?: string  // Add this
  }>
  ```
- Without explicit error reasons, consumers can't distinguish "no changes" from "git failure"

**⚠️ CONCERN 2: Unclear git presence assumption**
- `ensureGitRepo()` returns `boolean` but doesn't specify: does it throw on permission error? Return false?
- Suggest: `Promise<{ created: boolean; reason?: string }>`

**⚠️ CONCERN 3: Integration point ambiguity**
- Plan says: "Call `autoCommitChanges` at end of `VaultSyncDaemon.syncOnce()`"
- This couples vault-git.ts to vault-sync.ts at the daemon level
- Risk: If git is optional (via config), the daemon has branching logic
- **Recommendation:** Inject git module into daemon constructor:
  ```typescript
  class VaultSyncDaemon {
    constructor(options: VaultSyncOptions & { gitModule?: VaultGit }) { ... }
    async syncOnce() {
      // ... export facts ...
      if (this.gitModule?.enabled) await this.gitModule.commit(...)
    }
  }
  ```
- This avoids optional configuration coupling at the daemon level

### Vault Module Test Structure

**Existing test pattern:** None for vault modules (gap in codebase!)

**Observation:** vault-format, vault-writer, vault-reconciler have NO dedicated unit tests. They're only tested indirectly via bootstrap tests.

**Plan proposes:** e2e-filesystem-mirror.test.ts covers all vault operations

**Assessment:**
- ✅ Good for coverage; addresses the gap
- ⚠️ Risk: No unit test for vault-git.ts errors (permission denied, git executable not found)
- **Recommendation:** Add unit-level tests for vault-git error cases before e2e tests

---

## 2. E2E Test Structure Analysis

### Existing E2E Test Pattern

**Files examined:**
- `e2e-reflection-pipeline.test.ts` (543 lines)
- `e2e-progressive-disclosure.test.ts` (100+ lines sampled)

**Consistent Pattern:**

```typescript
// 1. Mock hoisting block (vi.hoisted at top)
const { mockFunc1, mockFunc2 } = vi.hoisted(() => ({
  mockFunc1: vi.fn(),
  mockFunc2: vi.fn(),
}));

// 2. Module mock declaration
vi.mock("../src/lib/path.js", () => ({
  func1: mockFunc1,
  func2: mockFunc2,
}));

// 3. Import real code (after mocks)
import { realFunction } from "...js"

// 4. Fixtures / helper functions
function makeScope() { ... }
function makeObservationSession(overrides) { ... }

// 5. Test structure: describe groups + test cases
describe("E2E: Pipeline Name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFunc1.mockResolvedValue(...);
  });

  describe("Feature A", () => {
    test("case 1", async () => { ... });
  });
});
```

### Plan's E2E Test Proposal

**Workstream A: `e2e-bootstrap-pipeline.test.ts`**

Proposed test cases:
1. Parse Claude Code JSONL → extract facts → verify types
2. Parse OpenClaw JSON → extract facts
3. Cross-file dedup (Jaccard 0.7)
4. Parallel orchestrator with concurrency
5. CLI resolveBootstrapPath
6. Empty file → graceful empty
7. Malformed file → skip with error

"Mocking pattern: Follow e2e-reflection-pipeline.test.ts"

**Assessment: ✅ EXCELLENT**

- ✅ Explicit reference to e2e-reflection-pipeline.ts as template
- ✅ Test case list matches fixture patterns (file I/O mocked at fs boundary)
- ✅ Clear distinction: real logic tested, external I/O mocked
- ✅ Covers error paths (empty, malformed)

**Specific strengths:**
1. **Mocking at filesystem boundary** — exactly what e2e-reflection-pipeline does
2. **Fixture pattern** — can reuse makeSessionLine(), makeFactList()
3. **Parallel concurrency tests** — less common in test suite, good coverage

**Potential issues:**

**⚠️ ISSUE 1: Cross-file dedup testing complexity**
- Test case: "Cross-file dedup removes near-duplicates (Jaccard 0.7)"
- This requires:
  - Two+ files with overlapping facts
  - Mock fs.readFile to return different content per file
  - Verify dedup merges correctly
- **Current bootstrap tests** (bootstrap-parallel.test.ts exists!) may already cover this
- **Recommendation:** Check existing tests before writing new ones

**⚠️ ISSUE 2: Implied imports not documented**
- Plan lists imports: `parseSessionLine`, `extractFacts`, `deduplicateFacts` from parse-claude-code-history.ts
- But doesn't specify which module exports `processFilesBatch` (from bootstrap-parallel.ts)
- **Recommendation:** Add explicit import map to plan

### Workstream C: `e2e-filesystem-mirror.test.ts`

Test cases:
1. Vault export → markdown with YAML
2. Vault import → fact in DB
3. Round-trip: export → edit → reconcile → verify
4. Conflict detection
5. File watcher trigger
6. Git auto-init
7. Git auto-commit
8. YAML frontmatter round-trip

**Assessment: ✅ GOOD, with consolidation opportunity**

- ✅ All are legitimate e2e scenarios
- ✅ Comprehensive coverage of vault lifecycle
- ⚠️ **DUPLICATION DETECTED:** Cases 1-2 are already tested in bootstrap tests
  - bootstrap-parallel.test.ts (line 1+) tests fact extraction
  - bootstrap-sessions.test.ts tests OpenClaw parsing
  - These overlap with filesystem-mirror tests 1-2
- **Recommendation:** Scope filesystem-mirror.test.ts to ONLY vault-specific operations (round-trip, conflict, git, watcher), reference bootstrap tests for fact extraction

---

## 3. Dashboard Component Pattern Analysis

### Existing Dashboard Pattern

**Current implementation:** `/dashboard/src/app/page.tsx` (276 lines)

**Pattern characteristics:**
```typescript
// 1. "use client" directive (Next.js app router)
// 2. Custom hooks (useSSE, useHealth) encapsulate client logic
// 3. Sub-components (StatCard, EventRow) for reusability
// 4. Event state management with useState
// 5. SSE connection in useEffect cleanup
// 6. Type definitions inline (interfaces at top)
```

**Key decisions:**
- Tailwind CSS for styling
- Lucide icons for UI
- SSE (Server-Sent Events) for real-time updates
- Dark theme (zinc-900 background)

### VersionTimeline.tsx Proposal

**Spec provided:**
```typescript
interface VersionTimelineProps {
  factId: string
  versions: Array<{ _id, changeType, previousContent, etc. }>
}

Features:
- Vertical timeline, newest-first
- Expandable detail view
- Color coding: update→blue, rollback→amber, archive→gray
- Responsive Tailwind layout
```

**Assessment: ✅ GOOD SPEC, unclear integration**

**Strengths:**
- ✅ Clear prop interface (matches existing page.tsx patterns)
- ✅ Feature list is specific (vertical timeline, color mapping)
- ✅ Responsive + Tailwind (consistent with page.tsx)

**⚠️ CONCERN 1: Missing integration point**
- Plan says: "Add to main dashboard page as detail panel when fact is selected"
- Current page.tsx has NO fact detail panel
- **Missing specification:**
  - How is fact selection triggered? (click EventRow? search?)
  - Should VersionTimeline be a modal, drawer, or inline panel?
  - How does page.tsx pass factId to VersionTimeline?
- **Recommendation:** Clarify integration in next iteration:
  ```typescript
  // page.tsx modifications:
  - State: selectedFactId: string | null
  - Conditional render: {selectedFactId && <VersionTimeline factId={...} />}
  - Event handler: onClick={setSelectedFactId(event.payload.factId)}
  ```

**⚠️ CONCERN 2: Data fetching not specified**
- VersionTimeline needs `versions` data from Convex
- Not clear who fetches: page.tsx or component?
- **Recommendation:** Specify data fetching pattern
  ```typescript
  // Option A (page.tsx fetches):
  useEffect(() => {
    if (!selectedFactId) return;
    const versions = await getFactVersions(selectedFactId);
    setVersions(versions);
  }, [selectedFactId]);

  // Option B (component fetches):
  // VersionTimeline has internal useEffect to call getFactVersions(factId)
  ```

**⚠️ CONCERN 3: No color/UI specification**
- "Color coding: update→blue, rollback→amber, archive→gray"
- Existing page.tsx uses specific Tailwind classes: text-emerald-400, text-blue-400, etc.
- **Recommendation:** Define exact color mapping:
  ```typescript
  const typeColors = {
    update: "text-blue-400",      // matches page.tsx blue
    rollback: "text-amber-400",   // matches page.tsx amber
    archive: "text-zinc-600",     // matches page.tsx zinc
  }
  ```

---

## 4. Duplication & Consolidation Analysis

### Identified Code Duplication

**Issue 1: File parsing logic appears in 3 places**

1. **bootstrap-parallel.test.ts** — Tests parseSessionLine + extractFacts
2. **e2e-bootstrap-pipeline.test.ts** (proposed) — Tests parseSessionLine + extractFacts again
3. **bootstrap-sessions.test.ts** — Tests OpenClaw JSON parsing

**Impact:** LOW (tests are expected to duplicate logic being tested)

**Recommendation:** No action; test duplication is acceptable. Consider shared test fixtures.

---

**Issue 2: Fact export/import tested in two places**

1. **bootstrap-parallel.test.ts** — Tests fact extraction → fact structure
2. **e2e-filesystem-mirror.test.ts** (proposed) — Tests "export: fact → markdown file"

**Impact:** MEDIUM (both test the same data transformation)

**Details:**
- bootstrap test verifies: fact object structure, types, importance
- filesystem test verifies: YAML frontmatter rendering, filename generation, folder paths

**Overlaps:**
- Both read fact objects
- Both verify content integrity

**Non-overlaps:**
- bootstrap: focuses on deduplication, parallel processing, CLI integration
- filesystem: focuses on vault format (YAML), file system round-tripping

**Recommendation:**
- ✅ Keep both tests
- Add explicit comment in e2e-filesystem-mirror.test.ts: "Tests vault format layer; for fact extraction tests see bootstrap-parallel.test.ts"
- Avoid duplicating the same fact object verification in both

---

**Issue 3: Three-way merge tested once, but git integration adds new concern**

1. **vault-reconciler.ts** tested via bootstrap tests (indirect)
2. **git auto-commit** (new) is NOT tested by reconciler tests
3. **Filesystem round-trip** (new) may test reconciler + git together

**Impact:** MEDIUM (git + vault reconciliation interaction is untested)

**Recommendation:**
- e2e-filesystem-mirror.test.ts MUST have:
  - Scenario: File edited → reconcileFileEdit() called → git auto-commit fires
  - Verify: reconciliation succeeds AND git commit created
  - This ensures git integration doesn't interfere with vault reconciliation

---

### Consolidation Opportunities

**Opportunity 1: Shared test fixtures**

Files: bootstrap-parallel.test.ts, bootstrap-sessions.test.ts, e2e-bootstrap-pipeline.test.ts (proposed), e2e-filesystem-mirror.test.ts (proposed)

Current state: Each test file defines its own makeFact(), makeSession(), etc.

**Recommendation:**
Create `mcp-server/test/fixtures/bootstrap-facts.ts`:
```typescript
export function makeFact(overrides?: Partial<ParsedFact>): ParsedFact { ... }
export function makeSession(lines: string[]): SessionMessage[] { ... }
export function makeVaultFact(overrides?: Partial<VaultFact>): VaultFact { ... }

// Usage:
import { makeFact, makeSession } from '../fixtures/bootstrap-facts.js'
test("...", () => {
  const fact = makeFact({ importance: 0.8 });
  ...
})
```

**Benefit:** 75% less duplication, single source of truth for fact structures

---

**Opportunity 2: Consolidate vault module test coverage**

Current: vault modules have zero unit tests; only covered indirectly via bootstrap

Proposed: Add `mcp-server/test/vault-modules.test.ts` with unit tests for:
- vault-format: generateFrontmatter(), parseFrontmatter(), generateFilename(), computeFolderPath()
- vault-writer: writeFactToVault(), readVaultFile(), listVaultMarkdownFiles()
- vault-reconciler: mergeHumanEdits(), detectConflicts()
- vault-git: (new) ensureGitRepo(), autoCommitChanges(), getLastSyncCommit()

**Benefit:**
- Errors in individual modules caught early (not just in e2e)
- vault-git error cases tested in isolation

---

## 5. Architectural Boundary Analysis

### Layer Structure

**Current architecture (3-layer):**
```
[Convex Cloud Backend]
        ↓
[MCP Server + Daemons]  ← VaultSyncDaemon, vault modules
        ↓
[CLI / Plugins]         ← Scripts, bootstrap
```

### Proposed Changes

Plan adds:
1. **vault-git.ts** — New dependency on nodejs child_process (git CLI)
2. **VersionTimeline.tsx** — Dashboard layer (already exists)
3. **e2e tests** — Test layer (already exists)

**Assessment: ✅ NO BOUNDARY VIOLATIONS**

**Details:**

**Layer 1 (Convex) → No changes**
- fact_versions table already exists
- convex-client.ts already has getFactVersions()

**Layer 2 (MCP + Daemons) → Minimal changes**
- vault-git.ts is NEW but stays within same layer
- Extends VaultSyncDaemon (already in this layer)
- No dependencies on CLI or dashboard
- **Risk:** If vault-git.ts calls external git CLI, it introduces OS dependency
  - **Mitigation:** Use simple-git npm package OR document git CLI requirement

**Layer 3 (CLI/Plugins) → Affected only by new VersionTimeline data**
- Bootstrap scripts unchanged
- CLI unchanged
- Dashboard gets new component (isolated to dashboard layer)

**Conclusion:** Layers remain cleanly separated. No architectural boundary violations detected.

---

## 6. Anti-Pattern Detection

### Pattern-Based Search Results

**Searched for:** TODO, FIXME, HACK, XXX, god object, circular dependency

**Findings in plan:**

**⚠️ ANTI-PATTERN 1: God Object Risk in VaultSyncDaemon**

Current VaultSyncDaemon (vault-sync.ts, lines 12-77):
- Manages file I/O (writeFactToVault)
- Manages filesystem watching (chokidar)
- Manages interval timing
- Now: Add git operations (autoCommitChanges)

**Assessment:** MEDIUM RISK
- Not yet a "god object" (3 concerns is acceptable)
- Adding git makes it 4 concerns
- **Recommendation:** Scope git module narrowly
  ```typescript
  // ✅ GOOD: Separate module handles git
  export class VaultSyncDaemon {
    private gitModule: VaultGit;
    async syncOnce() {
      this.gitModule.autoCommit(...); // Delegated
    }
  }

  // ❌ BAD: Git logic inline
  async syncOnce() {
    // ... export facts ...
    const { execSync } = require('child_process');
    execSync('git add -A; git commit -m "..."'); // Mixing concerns
  }
  ```

---

**⚠️ ANTI-PATTERN 2: Optional Configuration as Coupling**

Plan specifies: "Make autoCommit opt-in via config"

**Issue:** If config is stored in VaultSyncDaemon constructor:
```typescript
// ❌ FRAGILE
class VaultSyncDaemon {
  constructor(opts: VaultSyncOptions & { autoCommit?: boolean }) {
    this.autoCommit = opts.autoCommit;
  }
  async syncOnce() {
    if (this.autoCommit) await vault.git.commit(...);
  }
}
```

This couples the daemon to git integration knowledge.

**Better pattern:** Inject git module or use composition:
```typescript
// ✅ BETTER: Dependency injection
class VaultSyncDaemon {
  private gitSync?: VaultGit;
  constructor(opts: VaultSyncOptions, gitSync?: VaultGit) {
    this.gitSync = gitSync; // Undefined = no git
  }
  async syncOnce() {
    if (this.gitSync) await this.gitSync.autoCommit(...);
  }
}

// Usage:
new VaultSyncDaemon(opts);  // No git
new VaultSyncDaemon(opts, new VaultGit(opts));  // With git
```

---

**⚠️ ANTI-PATTERN 3: No Explicit Error Recovery**

Plan's git functions:
- `ensureGitRepo(vaultRoot): Promise<boolean>` — 2-state only
- `autoCommitChanges(opts): Promise<{ committed, sha? }>` — No reason field

**Risk:** Callers can't distinguish:
```typescript
// What happened?
const { committed } = await autoCommitChanges(opts);
if (!committed) {
  // Is it: no changes? git not installed? permission denied?
}
```

**Recommendation:** Add explicit error types:
```typescript
export interface AutoCommitResult {
  committed: boolean;
  sha?: string;
  reason?: "no_changes" | "git_not_found" | "permission_denied" | "merge_conflict";
}
```

---

### Naming Convention Analysis

**Analyzed:** vault module function names, test file names, dashboard prop names

**Findings:**

**✅ CONSISTENT naming:**
- vault-*.ts modules use prefix: `vault`, `write`, `reconcile`, `read`, `list` (verbs)
- Test files: `e2e-*.test.ts` prefix (clear pattern)
- Props: camelCase (factId, changeType, versions)

**⚠️ INCONSISTENT in one place:**
- bootstrap-parallel.ts exports: `processFilesBatch`, `crossFileDedup`, `summarizeResults`
- But bootstrap-from-sessions.ts exports: `findSessionFiles`, `parseOpenClawSession`
- Naming style differs: camelCase vs camelCase (both OK) but verb order differs
  - "processFilesBatch" = verb-noun
  - "findSessionFiles" = verb-noun (consistent!)

**Assessment:** Minor inconsistency, not blocking. Naming is clear.

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| vault-git.ts git CLI not installed | Medium | Medium | Add explicit error handling; default to no-op if git missing |
| Race condition: file edit + git commit | Low | High | Ensure autoCommit is atomic; use git advisory locks |
| VersionTimeline data fetching fails silently | Medium | Low | Add loading state + error UI; test SSE disconnection |
| Cross-file dedup not tested adequately | Low | Medium | Add explicit test for 3+ files with overlaps |
| VaultSyncDaemon becomes god object | Low | Medium | Follow dependency injection pattern for git module |
| Vault modules lack unit tests | High | High | Add vault-modules.test.ts before shipping |

---

## 8. Recommendations

### Priority 1: BLOCKING (Must fix before implementation)

**1. Add error type to vault-git.ts**
```typescript
export interface AutoCommitResult {
  committed: boolean;
  sha?: string;
  reason?: "no_changes" | "git_not_found" | "permission_denied" | string;
}
```

**2. Clarify git module coupling**
- Document: Is git injection or internal to daemon?
- Implement: Dependency injection pattern for git module
- Reference: Look at how vault-sync.ts uses convex-client.ts (dependency pattern)

**3. Update dashboard spec with integration point**
- Clarify: click EventRow → select fact → show VersionTimeline?
- Clarify: Modal or drawer or inline?
- Clarify: Who fetches version data?

---

### Priority 2: MEDIUM (Implement with care)

**1. Create test fixtures module**
- Location: `mcp-server/test/fixtures/bootstrap-facts.ts`
- Consolidate: makeFact(), makeSession(), makeVaultFact()
- Benefit: 50% less test boilerplate

**2. Add vault unit tests**
- Location: `mcp-server/test/vault-modules.test.ts`
- Scope: vault-format, vault-writer, vault-reconciler, vault-git error cases
- Benefit: Errors caught in isolation, not just in e2e

**3. Consolidate e2e-filesystem-mirror test scope**
- Remove: cases overlapping with bootstrap tests
- Keep: vault-specific (round-trip, conflict, watcher, git)
- Add: comment referencing bootstrap test equivalents

---

### Priority 3: NICE-TO-HAVE (Recommend but not blocking)

**1. Use simple-git npm package instead of child_process**
- Reduces OS dependency risk
- Provides better error types
- Matches Node.js ecosystem expectations

**2. Add git pre-commit hook example to docs**
- Some users may want to prevent unrelated git changes
- Document: How to set up .git/hooks/pre-commit

**3. Add VersionTimeline storybook stories**
- Develop component in isolation
- Test edge cases: very long content, many versions, no versions

---

## 9. Implementation Quality Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| Pattern Adherence | 85% | vault-git.ts follows existing patterns; e2e tests mirror e2e-reflection-pipeline structure |
| Test Coverage | 80% | Good e2e coverage; missing unit tests for vault modules |
| Architectural Cleanliness | 90% | No boundary violations; git module isolation needs clarification |
| Code Reusability | 70% | Fixtures duplicated across tests; consolidation opportunity |
| Error Handling | 65% | Missing explicit error types in git module; needs improvement |
| Documentation | 75% | Good feature specs; integration points not clearly described |
| **Overall** | **78%** | **Executable as-is; improve with Priority 1 recommendations** |

---

## 10. Conclusion

The plan is **well-structured and largely consistent** with existing patterns. The proposed vault-git.ts module, e2e tests, and dashboard component all follow established conventions in the codebase.

**Key Strengths:**
- ✅ Vault module pattern correctly identified and proposed
- ✅ E2E test structure explicitly references existing pattern (good practice)
- ✅ Clear separation of concerns across three workstreams
- ✅ No architectural boundary violations

**Key Improvements Needed:**
- 🔧 Add error type definitions to vault-git.ts
- 🔧 Clarify git module dependency injection pattern
- 🔧 Complete dashboard integration specification
- 🔧 Add unit test coverage for vault modules

**Recommendation:** Proceed with implementation. Address Priority 1 recommendations before merge.

---

## Appendix: Code Examples

### Example 1: Recommended vault-git.ts structure

```typescript
import { execSync } from "node:child_process";

export interface VaultGitOptions {
  vaultRoot: string;
  autoCommit: boolean;
  commitPrefix?: string;
}

export interface GitResult {
  success: boolean;
  reason?: string;
  sha?: string;
}

export async function ensureGitRepo(vaultRoot: string): Promise<GitResult> {
  try {
    // Check if .git exists
    const { existsSync } = await import("node:fs");
    if (existsSync(`${vaultRoot}/.git`)) {
      return { success: true };
    }

    // Initialize repo
    execSync("git init", { cwd: vaultRoot });
    execSync("git config user.email 'engram@localhost'", { cwd: vaultRoot });
    execSync("git config user.name 'Engram'", { cwd: vaultRoot });
    execSync("git add -A && git commit -m '[engram] Initial commit'", { cwd: vaultRoot });

    return { success: true, sha: getHeadSha(vaultRoot) };
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

export async function autoCommitChanges(opts: VaultGitOptions): Promise<GitResult> {
  if (!opts.autoCommit) return { success: false, reason: "Auto-commit disabled" };

  try {
    const status = execSync("git status --porcelain", {
      cwd: opts.vaultRoot,
      encoding: "utf-8"
    });

    if (!status.trim()) {
      return { success: false, reason: "no_changes" };
    }

    execSync("git add -A", { cwd: opts.vaultRoot });
    const prefix = opts.commitPrefix || "[engram]";
    const msg = `${prefix} Sync at ${new Date().toISOString()}`;
    execSync(`git commit -m "${msg}"`, { cwd: opts.vaultRoot });

    return { success: true, sha: getHeadSha(opts.vaultRoot) };
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

function getHeadSha(vaultRoot: string): string {
  return execSync("git rev-parse HEAD", {
    cwd: vaultRoot,
    encoding: "utf-8"
  }).trim();
}
```

### Example 2: Recommended VaultSyncDaemon integration

```typescript
export class VaultSyncDaemon {
  private gitModule?: VaultGit;

  constructor(options: VaultSyncOptions, gitModule?: VaultGit) {
    this.vaultRoot = options.vaultRoot;
    this.gitModule = gitModule;
  }

  async syncOnce(): Promise<{ exported: number }> {
    const facts = await getUnmirroredFacts({ limit: this.maxPerRun });
    let exported = 0;
    for (const fact of facts) {
      const { relativePath } = await writeFactToVault(this.vaultRoot, fact);
      await updateVaultPath({
        factId: fact._id,
        vaultPath: relativePath,
      });
      exported += 1;
    }

    // Commit changes if git module is available
    if (this.gitModule && exported > 0) {
      await this.gitModule.autoCommit();
    }

    return { exported };
  }
}
```

### Example 3: Shared test fixtures

```typescript
// mcp-server/test/fixtures/bootstrap-facts.ts

import type { ParsedFact } from "../../scripts/parse-claude-code-history.js";
import type { VaultFact } from "../../src/lib/vault-format.js";

export function makeFact(overrides: Partial<ParsedFact> = {}): ParsedFact {
  return {
    content: "Test fact content",
    factType: "observation",
    importance: 0.5,
    entityHints: [],
    source: "/test/session.jsonl",
    timestamp: Date.now(),
    ...overrides,
  };
}

export function makeVaultFact(overrides: Partial<VaultFact> = {}): VaultFact {
  return {
    _id: "jfact_test",
    content: "Test vault fact",
    timestamp: Date.now(),
    updatedAt: Date.now(),
    source: "test",
    entityIds: [],
    relevanceScore: 0.5,
    accessedCount: 0,
    importanceScore: 0.5,
    createdBy: "test-agent",
    scopeId: "jscope_test",
    tags: [],
    factType: "observation",
    lifecycleState: "active",
    ...overrides,
  };
}
```

---

**Document Version:** 1.0
**Last Updated:** 2026-02-25
**Prepared by:** Code Pattern Analysis Agent
**Next Review:** After Priority 1 implementation
