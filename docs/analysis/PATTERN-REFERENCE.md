# Pattern Reference: Vault Modules & E2E Tests
## Design patterns used in Engram codebase

---

## Vault Module Pattern

All vault-*.ts modules follow this structure:

### Module Structure

```typescript
// 1. Imports (only what's needed)
import fs from "node:fs/promises";
import path from "node:path";

// 2. Types/Interfaces (exported if used by consumers)
export interface VaultFact {
  _id?: string;
  content: string;
  // ... other fields
}

// 3. Pure functions (no side effects)
export function generateFrontmatter(fact: VaultFact): string {
  // Pure: input → output, no I/O
}

// 4. Async I/O functions
export async function writeFactToVault(
  vaultRoot: string,
  fact: VaultFact
): Promise<VaultWriteResult> {
  // I/O operations here
}

// 5. Helper functions (not exported if internal-only)
function extractKeywords(text: string): Set<string> {
  // Internal helper
}
```

### Characteristics

| Aspect | Pattern |
|--------|---------|
| **Responsibility** | Single concern (format, write, reconcile, or index) |
| **Exports** | Interfaces + public functions only |
| **Dependencies** | Minimal; vault-format is leaf module |
| **Error handling** | Try-catch or null returns; no throwing |
| **Side effects** | Only in async I/O functions |
| **Testing** | Unit-testable; I/O can be mocked |

### Dependency Graph

```
vault-format.ts (no dependencies)
    ↓
vault-writer.ts (depends on vault-format)
    ↓
vault-reconciler.ts (depends on vault-format + convex-client)
    ↓
vault-indexer.ts (depends on vault-format)

vault-sync.ts daemon (uses all above + chokidar)
```

**Key Rule:** No circular dependencies. Leaf modules have no dependencies on other vault modules.

---

## vault-git.ts Expected Pattern

Based on analysis, vault-git.ts should follow:

### Recommended Implementation

```typescript
// mcp-server/src/lib/vault-git.ts

import { execSync } from "node:child_process";
import fs from "node:fs/promises";

// 1. Option interface
export interface VaultGitOptions {
  vaultRoot: string;
  autoCommit: boolean;
  commitPrefix?: string;
}

// 2. Result interface with explicit error reasons
export interface GitOperationResult {
  success: boolean;
  sha?: string;
  reason?: string; // "no_changes" | "git_not_found" | "permission_denied" | ...
}

// 3. Pure functions
export function getHeadSha(vaultRoot: string): string | null {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: vaultRoot,
      encoding: "utf-8"
    }).trim();
  } catch {
    return null;
  }
}

// 4. Async I/O functions
export async function ensureGitRepo(vaultRoot: string): Promise<GitOperationResult> {
  try {
    const gitPath = `${vaultRoot}/.git`;
    try {
      await fs.stat(gitPath);
      return { success: true, reason: "already_initialized" };
    } catch {
      // Not initialized, create it
    }

    execSync("git init", { cwd: vaultRoot });
    execSync("git config user.email 'engram@localhost'", { cwd: vaultRoot });
    execSync("git config user.name 'Engram'", { cwd: vaultRoot });
    execSync("git add -A && git commit -m '[engram] Initial commit'", { cwd: vaultRoot });

    const sha = getHeadSha(vaultRoot);
    return { success: true, sha: sha ?? undefined };
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : "unknown_error"
    };
  }
}

export async function autoCommitChanges(opts: VaultGitOptions): Promise<GitOperationResult> {
  if (!opts.autoCommit) {
    return { success: false, reason: "auto_commit_disabled" };
  }

  try {
    const status = execSync("git status --porcelain", {
      cwd: opts.vaultRoot,
      encoding: "utf-8"
    });

    if (!status.trim()) {
      return { success: false, reason: "no_changes" };
    }

    execSync("git add *.md", { cwd: opts.vaultRoot });
    const prefix = opts.commitPrefix || "[engram]";
    const timestamp = new Date().toISOString();
    const msg = `${prefix} Sync ${timestamp}`;

    execSync(`git commit -m "${msg}"`, { cwd: opts.vaultRoot });

    const sha = getHeadSha(opts.vaultRoot);
    return { success: true, sha: sha ?? undefined };
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : "unknown_error"
    };
  }
}

export async function getLastSyncCommit(vaultRoot: string): Promise<string | undefined> {
  try {
    return execSync("git log --oneline | grep '\\[engram\\]' | head -1 | awk '{print $1}'", {
      cwd: vaultRoot,
      encoding: "utf-8"
    }).trim() || undefined;
  } catch {
    return undefined;
  }
}
```

### Integration Pattern

```typescript
// mcp-server/src/daemons/vault-sync.ts

export class VaultSyncDaemon {
  private readonly vaultRoot: string;
  private gitModule?: VaultGit; // Optional dependency injection

  constructor(
    options: VaultSyncOptions,
    gitModule?: VaultGit
  ) {
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

    // Call git if module is available and exported facts
    if (this.gitModule && exported > 0) {
      const result = await this.gitModule.autoCommitChanges();
      if (!result.success) {
        console.warn("[vault-sync] git auto-commit failed:", result.reason);
        // Continue even if git fails; sync is not dependent on git
      }
    }

    return { exported };
  }
}

// Usage:
const daemon1 = new VaultSyncDaemon(opts); // No git
const daemon2 = new VaultSyncDaemon(opts, new VaultGit()); // With git
```

**Key Design Decisions:**
- ✅ VaultGit is optional (injected, not required)
- ✅ Failures in git don't block vault sync
- ✅ Result type has explicit reason field
- ✅ No configuration coupling in daemon
- ✅ Follows vault module structure (interface + async functions)

---

## E2E Test Pattern

All e2e-*.test.ts files follow this structure:

### Test Structure

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";

// 1. Mock hoisting (required for module mocks)
const {
  mockGetFact,
  mockUpdateFact,
} = vi.hoisted(() => ({
  mockGetFact: vi.fn(),
  mockUpdateFact: vi.fn(),
}));

// 2. Module mock declaration (at top level)
vi.mock("../src/lib/convex-client.js", () => ({
  getFact: mockGetFact,
  updateFact: mockUpdateFact,
}));

// 3. Import real code AFTER mock declaration
import { myToolFunction } from "../src/tools/my-tool.js";

// 4. Test fixtures (helper functions)
const AGENT_ID = "test-agent";
const SCOPE_ID = "test-scope";

function makeFact(overrides?: Partial<Fact>) {
  return {
    _id: "jfact001",
    content: "Test fact",
    importance: 0.5,
    ...overrides,
  };
}

// 5. Test suite
describe("E2E: Feature Name", () => {
  // 6. Setup
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFact.mockResolvedValue(makeFact());
  });

  // 7. Test groups
  describe("Feature A", () => {
    test("case 1", async () => {
      const result = await myToolFunction({ ... }, AGENT_ID);
      expect(result).toMatchObject({ success: true });
    });

    test("case 2: error handling", async () => {
      mockGetFact.mockResolvedValue(null);
      const result = await myToolFunction({ ... }, AGENT_ID);
      expect(result).toMatchObject({ isError: true });
    });
  });
});
```

### Mocking Pattern

**Key rule:** Mock at the boundary, test the real logic

```typescript
// ✅ CORRECT: Mock Convex boundary
vi.mock("../src/lib/convex-client.js", () => ({
  getFact: vi.fn(),
  updateFact: vi.fn(),
}));

// Then test your tool logic against mocked Convex

// ❌ WRONG: Don't mock internal functions
vi.mock("../src/tools/helpers.js", () => ({
  helperFunction: vi.fn(), // This defeats the purpose!
}));
```

### Fixture Pattern

```typescript
// Helper functions that create test data
function makeScope(overrides?: Partial<Scope>) {
  return {
    _id: "jscope001",
    name: "private-agent",
    ...overrides,
  };
}

function makeObservationSession(overrides?: Partial<ObsSession>) {
  return {
    pendingTokenEstimate: 800,
    summaryTokenEstimate: 200,
    bufferReady: false,
    ...overrides,
  };
}

// Usage in tests:
test("...", async () => {
  const scope = makeScope({ name: "private-special" });
  const session = makeObservationSession({ bufferReady: true });
});
```

---

## Expected E2E Tests for Plan

### e2e-bootstrap-pipeline.test.ts

Should follow e2e-reflection-pipeline.test.ts structure:

```typescript
// 1. Mock bootstrap script functions
const {
  mockParseSessionLine,
  mockExtractFacts,
  mockDeduplicateFacts,
} = vi.hoisted(() => ({...}));

vi.mock("../scripts/parse-claude-code-history.js", () => ({
  parseSessionLine: mockParseSessionLine,
  extractFacts: mockExtractFacts,
  deduplicateFacts: mockDeduplicateFacts,
}));

// 2. Mock filesystem
const { mockReadFile } = vi.hoisted(() => ({...}));
vi.mock("node:fs/promises", () => ({
  readFile: mockReadFile,
}));

// 3. Import real tool
import { bootstrapFromSessions } from "../scripts/bootstrap-parallel.js";

// 4. Fixtures
function makeSessionLine(overrides?) { ... }
function makeBootstrapResult() { ... }

// 5. Tests
describe("E2E: Bootstrap Pipeline", () => {
  test("parses Claude Code JSONL → facts", async () => {
    mockReadFile.mockResolvedValue("...\n...");
    const result = await bootstrapFromSessions(["file.jsonl"]);
    expect(result.factsAfterDedup).toBeGreaterThan(0);
  });

  test("cross-file dedup removes near-duplicates", async () => {
    // Two files with similar facts
    const result = await bootstrapFromSessions(["file1.jsonl", "file2.jsonl"]);
    // Verify dedup worked
  });

  test("malformed file skips with error", async () => {
    mockReadFile.mockResolvedValueOnce("invalid\n{bad}");
    // Should continue processing other files
  });
});
```

### e2e-filesystem-mirror.test.ts

Should focus on vault-specific operations:

```typescript
describe("E2E: Filesystem Mirror", () => {
  describe("Vault export/import", () => {
    test("exports fact → markdown with YAML frontmatter", async () => {
      const fact = makeVaultFact();
      const result = await writeFactToVault(tempDir, fact);
      // Verify file exists, has YAML, correct content
    });

    test("imports markdown → fact in Convex", async () => {
      // Create markdown file with YAML
      const result = await reconcileFileEdit(filePath);
      // Verify fact created in DB
    });
  });

  describe("Round-trip", () => {
    test("export → edit file → reconcile → verify DB updated", async () => {
      // 1. Export fact
      // 2. Edit file on disk
      // 3. Trigger reconciliation
      // 4. Verify DB has updated content
    });
  });

  describe("Git integration", () => {
    test("auto-init creates .git on first sync", async () => {
      const result = await ensureGitRepo(vaultRoot);
      expect(fs.existsSync(`${vaultRoot}/.git`)).toBe(true);
    });

    test("auto-commit creates git commit after sync", async () => {
      await writeFactToVault(vaultRoot, fact);
      const result = await autoCommitChanges({ ... });
      expect(result.success).toBe(true);
      expect(result.sha).toBeDefined();
    });
  });

  describe("File watcher", () => {
    test("chokidar change event → reconciliation", async () => {
      // Simulate file change
      // Verify reconciliation called
    });
  });
});
```

---

## Naming Conventions

### Vault Modules
- File names: `vault-{operation}.ts` (vault-format, vault-writer, vault-git)
- Functions: verb-noun (writeFact, parseYaml, reconcileFile)
- Interfaces: noun (VaultFact, VaultGitOptions, GitOperationResult)

### Test Files
- Pattern: `e2e-{feature}.test.ts` or `{feature}.test.ts`
- Examples: e2e-bootstrap-pipeline.test.ts, bootstrap-parallel.test.ts

### Component Files
- Pattern: `PascalCase.tsx` for React components
- Example: VersionTimeline.tsx, StatCard.tsx

### Functions in Tools
- API functions: verb-noun (storeFact, recallFacts, getContext)
- Helpers: descriptive (resolveScopeId, computeImportance)

---

## Anti-Patterns to Avoid

### ❌ Pattern 1: God Objects

```typescript
// BAD: One class does too much
class VaultManager {
  exportFacts() { ... }
  importFacts() { ... }
  reconcileConflicts() { ... }
  watchFiles() { ... }
  commitGit() { ... }  // Too many concerns!
}

// GOOD: Separate modules by concern
vault-writer.ts (export/import)
vault-reconciler.ts (conflict resolution)
vault-sync.ts (watching)
vault-git.ts (git operations)
```

### ❌ Pattern 2: Optional Configuration Coupling

```typescript
// BAD: Daemon knows about git config
class VaultSyncDaemon {
  constructor(opts: VaultSyncOptions & { autoCommit?: boolean }) {
    this.autoCommit = opts.autoCommit;
  }
  async syncOnce() {
    if (this.autoCommit) { /* git logic */ }
  }
}

// GOOD: Dependency injection
class VaultSyncDaemon {
  constructor(opts: VaultSyncOptions, gitModule?: VaultGit) {
    this.gitModule = gitModule;
  }
  async syncOnce() {
    if (this.gitModule) { /* git logic */ }
  }
}
```

### ❌ Pattern 3: Silent Failures

```typescript
// BAD: No reason for failure
async function autoCommit(): Promise<{ committed: boolean }> {
  if (!status.trim()) return { committed: false }; // Why?
}

// GOOD: Explicit reasons
async function autoCommit(): Promise<{
  committed: boolean;
  reason?: "no_changes" | "git_not_found" | string;
}> {
  if (!status.trim()) return { committed: false, reason: "no_changes" };
}
```

### ❌ Pattern 4: Circular Dependencies

```typescript
// BAD: vault-writer imports vault-reconciler, vault-reconciler imports vault-writer
// (hypothetically)

// GOOD: One-way dependency
vault-format (no deps)
↓
vault-writer (uses vault-format)
↓
vault-reconciler (uses vault-format)
```

---

## Checklist for Implementation

- [ ] **vault-git.ts**
  - [ ] Follows vault module structure (interface + async functions)
  - [ ] Has GitOperationResult with reason field
  - [ ] No hardcoded config; uses VaultGitOptions
  - [ ] Functions are stateless
  - [ ] Error handling is explicit

- [ ] **VaultSyncDaemon integration**
  - [ ] VaultGit is optional (injected)
  - [ ] No branching logic in daemon for git
  - [ ] Failures in git don't block sync
  - [ ] Example: `new VaultSyncDaemon(opts, new VaultGit())`

- [ ] **E2E tests**
  - [ ] Mock at boundary (filesystem, Convex)
  - [ ] Test real logic, not mocks
  - [ ] Fixtures for test data (makeFact, etc.)
  - [ ] beforeEach clears mocks
  - [ ] Error cases tested

- [ ] **VersionTimeline component**
  - [ ] Follows page.tsx pattern (Tailwind, Lucide, hooks)
  - [ ] Props interface defined
  - [ ] Color mapping specified
  - [ ] Integration point with page.tsx clear

---

**Reference Document Version:** 1.0
**Last Updated:** 2026-02-25
**For:** Implementation of vault-git.ts, e2e tests, dashboard component
