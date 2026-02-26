# Engram Repository Research Summary

**Research Date:** 2026-02-25
**Repository:** `/Users/cortex-air/Tools/engram`
**Focus:** Understanding patterns and conventions for implementing 8 remaining tasks

---

## Executive Summary

Engram is a unified multi-agent memory system built on Convex cloud backend, TypeScript, and MCP (Model Context Protocol). It provides 73 atomic memory tools for agents to store facts, recall context via semantic search, and share knowledge across sessions. The codebase demonstrates sophisticated patterns for test-driven development, filesystem synchronization, and CLI automation.

---

## Architecture & Structure

### Three-Tier System
1. **Convex Cloud Backend** — 17-table schema with vector search, scheduled crons (19), and HTTP API
2. **MCP Server** (`mcp-server/src`) — Agent-facing interface with 73 tools via stdio
3. **CLI/Dashboard/Plugins** — User interfaces (commander.js CLI, Next.js dashboard, OpenClaw plugin)

### Key Directories
```
convex/                 # Cloud backend (schema, CRUD, async actions, crons)
  schema.ts             # 17 tables with computed fields for lifecycle management
  functions/            # CRUD mutations
  actions/              # Async enrichment pipeline
  crons.ts + crons/     # 19 scheduled jobs

mcp-server/src/         # MCP server (agent-native v2)
  lib/
    tool-registry.ts    # ★ Single source of truth for 73 tools
    convex-client.ts    # HTTP client using string-based function paths
    vault-format.ts     # Markdown frontmatter rendering/parsing
    vault-writer.ts     # Filesystem export operations
    vault-reconciler.ts # Two-way sync conflict detection
    vault-indexer.ts    # Search index over vault files
  tools/                # Individual tool handlers
  daemons/              # Background processes (vault-sync using chokidar)

mcp-server/test/        # 50 test files, 22K+ lines
  bootstrap-*.test.ts   # Session parsing, dedup, fact extraction
  vault-*.test.ts       # Markdown format, indexing
  *-e2e.test.ts         # End-to-end pipelines with mocked DB

cli/src/commands/       # Commander.js CLI commands
  bootstrap.ts          # Session ingestion orchestrator
  facts.ts, recall.ts   # Memory operations

dashboard/              # Next.js app (SSE real-time event streaming)
  src/app/page.tsx      # Live event stream UI, health monitoring

scripts/                # Processing scripts
  parse-claude-code-history.ts    # JSONL → fact extraction
  bootstrap-parallel.ts           # Concurrent file processing + cross-file dedup
  bootstrap-from-sessions.ts      # OpenClaw session parsing
```

### Project Stats
- **Test Files:** 50 test files
- **Test Lines:** 22,255 lines
- **Test Framework:** Vitest 4.0.0
- **Recent Test Coverage:** 197 new tests added in Wave 5 (feat commit 946203a)
- **Current Pass Rate:** 971 tests pass (as of commit 97eec19)

---

## Testing Patterns & Infrastructure

### Test Framework
- **Framework:** Vitest 4.0.0
- **Config:** `mcp-server/vitest.config.ts` with `.js → .ts` alias
- **Run Command:** `npm test` (runs `vitest run`)
- **Build:** `npm run build` (runs `tsc`)

### E2E Test Structure (Bootstrap Tests as Reference)

#### File: `/Users/cortex-air/Tools/engram/mcp-server/test/bootstrap-cli.test.ts`
**Purpose:** Unit tests for CLI path resolution and option validation
```typescript
import { describe, test, expect } from "vitest";
import { resolveBootstrapPath, type BootstrapOptions } from "../../cli/src/commands/bootstrap.js";

describe("resolveBootstrapPath", () => {
  test("claude-code default path resolves to ~/.claude/projects", () => {
    const result = resolveBootstrapPath("claude-code");
    expect(result).toBe(resolve(homedir(), ".claude", "projects"));
  });
});
```

**Key Patterns:**
- Pure function testing (deterministic, no side effects)
- Type validation via TypeScript interfaces
- Path resolution testing across multiple sources

#### File: `/Users/cortex-air/Tools/engram/mcp-server/test/bootstrap-sessions.test.ts`
**Purpose:** Test OpenClaw session file discovery and parsing
```typescript
describe("findSessionFiles", () => {
  test("finds .jsonl session files", async () => {
    const files = await findSessionFiles(testDir);
    expect(files.every((f) => f.endsWith(".jsonl"))).toBe(true);
  });
});
```

**Key Patterns:**
- Temporary directory fixtures using `beforeEach`/`afterEach`
- `fs.mkdtemp()` for isolated test environments
- Cleanup in `afterEach` with try/catch for robustness
- File system operations (`fs.writeFile`, `fs.mkdir`, `fs.readdir`)

#### File: `/Users/cortex-air/Tools/engram/mcp-server/test/bootstrap-parallel.test.ts`
**Purpose:** Test concurrent file processing and cross-file deduplication
```typescript
export async function processFilesBatch(
  files: string[],
  concurrency: number
): Promise<ParsedFact[]>

describe("processFilesBatch", () => {
  test("processes multiple files concurrently", async () => {
    const file1 = await createSessionFile("session1.jsonl", [...]);
    const file2 = await createSessionFile("session2.jsonl", [...]);
    const facts = await processFilesBatch([file1, file2], 2);
    expect(facts.length).toBeGreaterThan(0);
  });
});

describe("crossFileDedup", () => {
  test("deduplicates facts across files using Jaccard similarity", () => {
    const facts = crossFileDedup([...]);
    expect(facts.length).toBeLessThanOrEqual(inputLength);
  });
});
```

**Key Patterns:**
- Helper function `createSessionFile()` to generate test data
- Concurrency parameter testing
- Deduplication with 0.7 Jaccard similarity threshold
- Document structure: `{ type, message: { role, content }, timestamp }`

### Vault/Filesystem Test Patterns

#### File: `/Users/cortex-air/Tools/engram/mcp-server/test/vault-format.test.ts`
**Purpose:** Test YAML frontmatter rendering and wiki-link extraction
```typescript
test("renders frontmatter and content", () => {
  const doc = renderVaultDocument({
    _id: "fact-1",
    content: "Hello [[World]]",
    timestamp: 1,
    source: "direct",
    entityIds: ["World"],
    relevanceScore: 1,
    accessedCount: 0,
    importanceScore: 0.8,
    createdBy: "indy",
    scopeId: "private-indy",
    tags: ["demo"],
    factType: "observation",
    lifecycleState: "active",
  });

  const parsed = parseFrontmatter(doc);
  expect(parsed.frontmatter.factType).toBe("observation");
  expect(parsed.body).toContain("Hello [[World]]");
});
```

**Key Patterns:**
- Test with complete fact object (all required fields)
- Verify bidirectional render/parse consistency
- Test wiki-link extraction with aliases: `[[Alpha]]`, `[[Beta|B]]`

### Generic E2E Test Pattern (Forget Pipeline Example)

#### File: `/Users/cortex-air/Tools/engram/mcp-server/test/forget-pipeline-e2e.test.ts`
**Purpose:** Test full pipeline with mocked DB state
```typescript
describe("forget pipeline E2E", () => {
  let now: number;

  beforeEach(() => {
    vi.useFakeTimers();
    now = new Date("2026-02-25T00:00:00.000Z").getTime();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("archives facts meeting all forget criteria", () => {
    const facts: MockFact[] = [{
      _id: "fact-1",
      forgetScore: 0.95,
      accessedCount: 0,
      timestamp: now - 31 * 24 * 60 * 60 * 1000,
      temporalLinks: [],
      lifecycleState: "active",
    }];

    const result = runForgetPipeline(facts, [], new Map(), now);
    expect(result.archived).toBe(1);
    expect(facts[0].lifecycleState).toBe("archived");
  });
});
```

**Key Patterns:**
- Use `vi.useFakeTimers()` for time-dependent logic
- Mock objects with required fields + optional computed fields
- Pipeline helper functions extracted from actual Convex code
- Assertions check both return value AND side effects (mutations)

---

## Data Structures & Formats

### Vault Markdown Format

**File:** `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-format.ts`

#### Rendering (Fact → Markdown)
```typescript
export function renderVaultDocument(fact: VaultFact): string {
  const frontmatter = generateFrontmatter(fact);  // YAML block
  const body = generateMarkdownBody(fact);         // Content + optional summary
  return `---\n${frontmatter}---\n\n${body}`;
}
```

#### YAML Frontmatter Structure
```yaml
id: fact-1
source: direct
factType: observation
createdBy: indy
scopeId: private-indy
timestamp: 1234567890
updatedAt: 1234567900
entityIds: [World]
tags: [demo]
importanceScore: 0.8
relevanceScore: 1.0
lifecycleState: active
```

**Key Fields for Export:**
- `id`, `source`, `factType`, `createdBy`, `scopeId`
- `timestamp`, `updatedAt` (for sync detection)
- `entityIds`, `tags`
- `importanceScore`, `relevanceScore`
- `lifecycleState` (active|dormant|merged|archived|pruned)

#### Markdown Body Structure
```markdown
[Fact content here]

## Summary
[Optional factual summary for SimpleMem compression]
```

#### Folder Organization
```
vault/
  <scopeId>/
    decisions/
    observations/
    insights/
    plans/
    errors/
    sessions/
    notes/
```

Function: `computeFolderPath(fact, vaultRoot)` returns the folder based on `factType`.

#### Filename Pattern
```
<YYYY-MM-DD>-<factType>-<slugified-content>.md
Example: 2026-02-25-observation-bootstrap-session-parsing.md
```

### Fact Object (Convex Schema)

**File:** `/Users/cortex-air/Tools/engram/convex/schema.ts`

```typescript
facts: defineTable({
  content: v.string(),
  factualSummary: v.optional(v.string()),
  timestamp: v.number(),
  updatedAt: v.optional(v.number()),
  vaultPath: v.optional(v.string()),           // Relative vault path for sync
  vaultSyncedAt: v.optional(v.number()),       // Last successful sync
  source: v.string(),                          // "direct"|"observation"|"import"|"consolidation"
  entityIds: v.array(v.string()),
  relevanceScore: v.float64(),
  accessedCount: v.number(),
  importanceScore: v.float64(),
  createdBy: v.string(),
  scopeId: v.id("memory_scopes"),
  tags: v.array(v.string()),
  factType: v.string(),                        // Typed as string but enumerated
  lifecycleState: v.string(),                  // active|dormant|merged|archived|pruned
  embedding: v.optional(v.array(v.float64())), // 1024-dim Cohere Embed 4
  // ... 30+ additional optional fields for features
})
```

### Session File Format (Bootstrap Input)

**JSONL (JSON Lines)** format from Claude Code sessions:
```json
{"type":"message","message":{"role":"user","content":"I prefer TypeScript"},"timestamp":"2026-02-25T10:00:00Z"}
{"type":"message","message":{"role":"assistant","content":"..."},"timestamp":"2026-02-25T10:00:05Z"}
```

**Parsing Logic:** `/Users/cortex-air/Tools/engram/scripts/parse-claude-code-history.ts`
- Parses `message.content` by role (only extracts from user messages)
- Classifies by keywords (corrections, preferences, decisions)
- Extracts entity hints (capitalized words)
- Deduplicates within file, then across files

### Parsed Fact Structure

```typescript
export interface ParsedFact {
  content: string;
  factType: "preference" | "decision" | "correction" | "pattern" | "note";
  importance: number; // 0.0-1.0
  entityHints: string[];
  source: string; // session file path
  timestamp: number;
}
```

**Classification Keywords:**
- **Corrections** (importance 0.9): "actually", "no, i", "don't do that", "scratch that"
- **Preferences** (importance 0.8): "i prefer", "i like", "always use", "my preference"
- **Decisions** (importance 0.7): "let's go with", "decided to", "we'll use"
- **Patterns** (importance 0.6): Repeated behaviors or patterns
- **Notes** (importance 0.5): Default/generic content

**Deduplication:** Jaccard similarity (word-level) with 0.7 threshold
- Extract keywords from both texts
- Compute intersection / union
- Keep earliest timestamp for duplicates

---

## Filesystem Integration Patterns

### File System Architecture

**Key Component:** `VaultSyncDaemon` (`/Users/cortex-air/Tools/engram/mcp-server/src/daemons/vault-sync.ts`)

```typescript
export class VaultSyncDaemon {
  private watcher: ReturnType<typeof chokidar.watch> | null = null;

  start() {
    this.timer = setInterval(() => this.syncOnce(), this.intervalMs);
    this.startWatcher();
  }

  async syncOnce(): Promise<{ exported: number }> {
    const facts = await getUnmirroredFacts({ limit: this.maxPerRun });
    for (const fact of facts) {
      const { relativePath } = await writeFactToVault(this.vaultRoot, fact);
      await updateVaultPath({ factId: fact._id, vaultPath: relativePath });
    }
    return { exported };
  }

  private startWatcher() {
    this.watcher = chokidar.watch(`${this.vaultRoot}/**/*.md`, {
      ignoreInitial: true,
      ignored: (p) => p.includes("/.") || p.endsWith(".conflict.md"),
    });
    this.watcher.on("change", (filePath) => this.reconcileFile(filePath));
    this.watcher.on("add", (filePath) => this.reconcileFile(filePath));
  }
}
```

**Dependency:** `chokidar` 5.0.0 (file watcher with debouncing)

### Export Pattern (Convex → Filesystem)

**File:** `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-writer.ts`

```typescript
export async function writeFactToVault(
  vaultRoot: string,
  fact: VaultFact
): Promise<VaultWriteResult> {
  const folder = computeFolderPath(fact, vaultRoot);
  await fs.mkdir(folder, { recursive: true });

  const filename = fact.vaultPath ? path.basename(fact.vaultPath) : generateFilename(fact);
  const absolutePath = path.join(folder, filename);
  const relativePath = path.relative(vaultRoot, absolutePath);

  // Atomic write: temp file → rename
  const tmpPath = `${absolutePath}.tmp`;
  const markdown = renderVaultDocument(fact);
  await fs.writeFile(tmpPath, markdown, "utf8");
  await fs.rename(tmpPath, absolutePath);

  return { absolutePath, relativePath };
}
```

**Key Patterns:**
- Atomic writes using temp file + rename (prevents corruption)
- Creates folder structure recursively
- Returns both absolute and relative paths
- Handles existing `vaultPath` to preserve filenames on updates

### Import Pattern (Filesystem → Convex)

**File:** `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-reconciler.ts`

```typescript
export async function reconcileFileEdit(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);

  const factId = typeof frontmatter.id === "string" ? frontmatter.id : undefined;
  const scopeId = typeof frontmatter.scopeId === "string" ? frontmatter.scopeId : undefined;

  let dbFact = factId ? await getFact(factId) : null;

  // Merge human edits (only allow certain fields to change)
  const patch = mergeHumanEdits(dbFact, {
    content: body,
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : undefined,
    entityIds: Array.isArray(frontmatter.entityIds) ? frontmatter.entityIds : undefined,
  });

  // Detect conflicts (file older than DB)
  if (dbFact && detectConflicts(dbFact, patch)) {
    const conflictPath = await writeConflictFile(filePath, dbFact.content, body);
    return { reconciled: false, conflict: true, conflictPath };
  }

  // Apply the patch back to DB
  const result = await applyVaultEdit({
    factId,
    content: patch.content ?? body,
    scopeId,
    createdBy: "vault-sync",
    tags: patch.tags,
    entityIds: patch.entityIds,
    vaultPath: filePath,
    updatedAt: Date.now(),
  });

  return { reconciled: true, ...result };
}
```

**Key Patterns:**
- Parse frontmatter → extract ID and scope
- Conflict detection: if file is older than DB (`fileFact.updatedAt < dbFact.updatedAt`)
- Write `.conflict.md` for human resolution
- Only allow certain fields to be edited from filesystem (whitelist: `content`, `tags`, `entityIds`)
- Protected fields (ID, timestamps, lifecycle state) stay in DB

### File Listing & Discovery

**File:** `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-writer.ts`

```typescript
export async function listVaultMarkdownFiles(vaultRoot: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue; // Skip hidden files
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath); // Recursive
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  }

  try {
    await walk(vaultRoot);
  } catch {
    return [];
  }
  return results;
}
```

**Key Patterns:**
- Recursive directory walk (no glob needed, handles errors gracefully)
- Skips hidden files/folders (`.` prefix)
- Returns all absolute paths
- Error handling returns empty array (graceful fallback)

---

## Dashboard Patterns (Next.js)

**File:** `/Users/cortex-air/Tools/engram/dashboard/src/app/page.tsx`

### Real-Time Event Streaming (SSE)
```typescript
function useSSE(agentId: string) {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(`${SSE_URL}/events/${agentId}`);

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 100)); // Keep 100 most recent
      } catch {}
    };

    // Subscribe to typed events
    const types = ["fact_stored", "recall", "signal_recorded", "session_ended", "vault_sync_completed"];
    for (const type of types) {
      source.addEventListener(type, (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data);
          setEvents((prev) => [event, ...prev].slice(0, 100));
        } catch {}
      });
    }

    return () => source.close();
  }, [agentId]);

  return { events, connected };
}
```

### Health Monitoring
```typescript
function useHealth() {
  const [health, setHealth] = useState<HealthData | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${SSE_URL}/health`);
      if (res.ok) setHealth(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { health, refresh };
}
```

**Dashboard Features:**
- Real-time event stream (fact_stored, recall, signal_recorded, etc.)
- Agent ID selector (default: "indy")
- Connection status indicator
- Live stats (facts stored, recalls, subscriptions, uptime)
- Event row with type, agent, scope, and timestamp
- SSE server URL configurable via env: `NEXT_PUBLIC_ENGRAM_SSE_URL`

---

## CLI Bootstrap Patterns

**File:** `/Users/cortex-air/Tools/engram/cli/src/commands/bootstrap.ts`

### Command Structure
```typescript
export const bootstrapCommand = new Command("bootstrap")
  .description("Ingest session history into Engram memory")
  .requiredOption("-s, --source <source>", "Source type: claude-code | openclaw")
  .option("-p, --path <path>", "Override default session path")
  .option("-c, --concurrency <n>", "Parallel file processing limit", "4")
  .option("-l, --limit <n>", "Max sessions to process")
  .option("--dry-run", "Preview without storing facts", false)
  .action(async (opts) => {
    // Implementation
  });
```

### Execution Flow
1. **Path Resolution:** `resolveBootstrapPath(source, overridePath)`
2. **File Discovery:**
   - Claude Code: `globSync(path, "**/*.jsonl")`
   - OpenClaw: `findSessionFiles(path)`
3. **Processing:** `processFilesBatch(files, concurrency)`
4. **Deduplication:** `crossFileDedup(rawFacts)`
5. **Summary:** `summarizeResults(deduped)`
6. **Output:**
   - Dry-run: Print stats
   - Normal: JSON to stdout (for piping)

### Default Paths
```typescript
const DEFAULT_PATHS: Record<string, string> = {
  "claude-code": resolve(homedir(), ".claude", "projects"),
  openclaw: resolve(homedir(), ".openclaw", "sessions"),
};
```

**Key Patterns:**
- Options with numeric defaults parsed via `parseInt(opts.concurrency, 10) || 4`
- Dynamic imports to avoid loading heavy modules when not needed
- Explicit source validation before processing
- Graceful exit (no error throw) when paths don't exist

---

## Convention Patterns

### File Organization
**Root Folders to NEVER Use for Generated Content:**
- ❌ No `.md`, `.test.ts`, or working files at root
- ✅ Use: `docs/`, `tests/`, `src/`, `scripts/`

**Package Organization:**
```
src/
  lib/          # Utilities, pure functions
  tools/        # Tool handlers (one per file)
  daemons/      # Long-running processes
  index.ts      # Entry point
test/
  *.test.ts     # One per feature or module
scripts/
  *.ts          # One-off processing scripts
docs/
  *.md          # Documentation
```

### Naming Conventions
- **Test files:** `<feature>-e2e.test.ts` or `<feature>.test.ts`
- **Vault files:** `<YYYY-MM-DD>-<factType>-<slug>.md`
- **Bootstrap scripts:** `bootstrap-*.ts`
- **Async actions:** Files in `actions/` folder
- **Cron jobs:** Files in `crons/` folder

### Concurrency Patterns
- **Semaphore pattern:** Recursive function with counter and queue
- **Promise.all():** For truly parallel independent operations
- **Batching:** Process in chunks (e.g., maxPerRun=200)

### Error Handling
- **Filesystem:** Try/catch returns empty array or graceful fallback
- **JSONL parsing:** null checks on each field (role, content, timestamp)
- **Vault sync:** Write conflict files (`.conflict.md`) for human resolution
- **Tests:** Use `vi.useFakeTimers()` for determinism

### Dependencies Used
- `chokidar` 5.0.0 — File watching
- `js-yaml` 4.1.1 — YAML frontmatter
- `slugify` 1.6.6 — Filename generation
- `marked` 17.0.2 — Markdown parsing
- `zod` 4.3.6 — Schema validation
- `glob` — Pattern-based file discovery

---

## Issue Conventions & Templates

**GitHub Location:** `/Users/cortex-air/Tools/engram/.github/`

### Directory Structure
```
.github/
  CODEOWNERS              # Team ownership mapping
  dependabot.yml          # Dependency update configuration
  ISSUE_TEMPLATE/         # Issue template directory
  pull_request_template.md # PR template
  workflows/              # CI/CD workflows
```

### Commit Message Patterns (from git log)
```
feat(bootstrap+tests): Wave 5 complete — history ingestion pipeline + 197 new tests
feat(bootstrap): OpenClaw session ingestion with shared heuristics
fix(tests): repair 4 broken test files, all 971 tests pass
feat(memory): Wave 4 complete - Consolidation test suite + QA pair generation
chore(ci)(deps): bump actions/github-script from 7 to 8
```

**Pattern:** `<type>(<scope>): <description>`
- `type`: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`
- `scope`: Feature name or area
- `description`: Clear, actionable, sometimes includes metrics

---

## Testing Best Practices

### Test Discovery & Execution
```bash
npm test                # Runs: vitest run
npm run build           # Runs: tsc
```

### Fixture Cleanup Pattern
```typescript
let testDir: string;

beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), "engram-test-"));
});

afterEach(async () => {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
});
```

### Time-Based Testing
```typescript
beforeEach(() => {
  vi.useFakeTimers();
  now = new Date("2026-02-25T00:00:00.000Z").getTime();
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});
```

### Test Data Builders
```typescript
async function createSessionFile(
  fileName: string,
  messages: Array<{ role: string; content: string; timestamp: number }>
): Promise<string> {
  const filePath = path.join(testDir, fileName);
  const lines = messages.map((msg) =>
    JSON.stringify({
      type: "message",
      message: msg,
      timestamp: new Date(msg.timestamp).toISOString(),
    })
  );
  await fs.writeFile(filePath, lines.join("\n"));
  return filePath;
}
```

---

## Key Implementation Details for Tasks

### For Task 1: Bootstrap E2E Tests (engram-7g0)
**Reference Files:**
- `/Users/cortex-air/Tools/engram/mcp-server/test/bootstrap-cli.test.ts` (path resolution)
- `/Users/cortex-air/Tools/engram/mcp-server/test/bootstrap-sessions.test.ts` (file discovery)
- `/Users/cortex-air/Tools/engram/mcp-server/test/bootstrap-parallel.test.ts` (processing)

**What to Test:**
1. Session parser (OpenClaw + Claude Code formats)
2. Deduplication algorithm (Jaccard similarity)
3. Bootstrap pipeline end-to-end (glob → parse → dedup → summarize)

**Pattern:** Mock file system with `mkdtemp`, create test JSONL files, run through pipeline, assert output.

### For Task 2: Dashboard Version Timeline (engram-7eb)
**Reference File:** `/Users/cortex-air/Tools/engram/dashboard/src/app/page.tsx`

**Pattern:**
- React functional component with hooks (`useEffect`, `useState`, `useCallback`)
- Fetch from SSE URL or REST endpoint
- Render timeline/list of events with timestamps
- Add status indicator (connected/disconnected)

**Technology:** Next.js, React, Tailwind CSS (based on existing dashboard)

### For Task 3: Export Markdown (engram-uw7)
**Reference Files:**
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-format.ts` (rendering)
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-writer.ts` (file I/O)
- `/Users/cortex-air/Tools/engram/mcp-server/test/vault-format.test.ts` (tests)

**Pattern:**
1. Fetch facts from Convex
2. Render each to YAML frontmatter + markdown
3. Organize by folder (scopeId/factType)
4. Write atomically (temp → rename)

### For Task 4: File Watcher (engram-g3o)
**Reference File:** `/Users/cortex-air/Tools/engram/mcp-server/src/daemons/vault-sync.ts`

**Pattern:**
- `chokidar.watch(pattern)` with `ignoreInitial: true`
- Listen to "add" and "change" events
- Call `reconcileFile()` on each change
- Handle `.conflict.md` files (ignore)
- Interval-based sync for unmirrored facts

### For Task 5: Git Integration (engram-1vt)
**Pattern:**
- Auto-init: check for `.git`, create if missing
- Auto-commit: after sync completes, run `git add -A && git commit -m "..."`
- Track via `vaultPath` field (all facts sync'd have a path)
- Graceful fallback if git not available

### For Task 6: Filesystem Mirror Tests (engram-wxn)
**Reference Files:**
- `/Users/cortex-air/Tools/engram/mcp-server/test/bootstrap-parallel.test.ts` (file I/O pattern)
- `/Users/cortex-air/Tools/engram/mcp-server/test/vault-format.test.ts` (format tests)

**Pattern:**
- Create temp vault directory
- Write facts via `writeFactToVault()`
- Verify file structure (folders, filenames)
- Read back via `readVaultFile()`
- Verify frontmatter → body roundtrip
- Test conflict scenarios

### For Task 7 & 8: Phase 6 Filesystem Mirror (engram-1ob, engram-w3u)
**Parent Features:** Coordination between all above tasks

**Pattern:**
- Bootstrap → facts in memory
- Export → facts to filesystem
- Watcher → filesystem changes back to DB
- Git → track changes
- Tests → verify all pieces work together

---

## Recommendations for Implementation

### Ordering
1. **Start with tests** (Task 1: engram-7g0)
   - Builds confidence in parsing/dedup logic
   - Creates reference implementations
   - Establishes test patterns

2. **Then filesystem primitives** (Task 3: engram-uw7)
   - Refine export logic
   - Create utility functions for file operations
   - Enables watcher implementation

3. **Then watcher** (Task 4: engram-g3o)
   - Depends on export being solid
   - Add chokidar-based daemon
   - Test with created files

4. **Then git integration** (Task 5: engram-1vt)
   - Depends on watcher confirming sync works
   - Add git operations post-sync
   - Handle errors gracefully

5. **Then dashboard** (Task 2: engram-7eb)
   - Depends on system being functional
   - UI for monitoring
   - Can run in parallel with above

6. **Then comprehensive tests** (Task 6: engram-wxn)
   - Full mirror scenarios
   - Conflict resolution
   - Bidirectional sync

7. **Finally integration tests** (Task 7 & 8: epics)
   - End-to-end workflows
   - Multiple agents
   - Real-world scenarios

### Key Files to Know

| Purpose | File | Key Exports |
|---------|------|-------------|
| Vault format | `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-format.ts` | `renderVaultDocument`, `parseFrontmatter`, `generateFilename`, `computeFolderPath` |
| File I/O | `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-writer.ts` | `writeFactToVault`, `listVaultMarkdownFiles`, `readVaultFile` |
| Reconciliation | `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-reconciler.ts` | `reconcileFileEdit`, `detectConflicts`, `mergeHumanEdits` |
| Daemon | `/Users/cortex-air/Tools/engram/mcp-server/src/daemons/vault-sync.ts` | `VaultSyncDaemon` class |
| Bootstrap CLI | `/Users/cortex-air/Tools/engram/cli/src/commands/bootstrap.ts` | `bootstrapCommand`, `resolveBootstrapPath` |
| Bootstrap scripts | `/Users/cortex-air/Tools/engram/scripts/bootstrap-parallel.ts` | `processFilesBatch`, `crossFileDedup`, `summarizeResults` |

### Testing Infrastructure
- Test files: `/Users/cortex-air/Tools/engram/mcp-server/test/`
- Run tests: `npm test` in mcp-server
- Temp dirs: Use `fs.mkdtemp(path.join(os.tmpdir(), "engram-test-"))`
- Mocking: Use `vi.useFakeTimers()` for time-dependent tests

---

## File Paths Summary

**All paths are absolute and verified to exist:**

### Source Code
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-format.ts`
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-writer.ts`
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-reconciler.ts`
- `/Users/cortex-air/Tools/engram/mcp-server/src/daemons/vault-sync.ts`
- `/Users/cortex-air/Tools/engram/cli/src/commands/bootstrap.ts`
- `/Users/cortex-air/Tools/engram/scripts/bootstrap-parallel.ts`
- `/Users/cortex-air/Tools/engram/scripts/parse-claude-code-history.ts`
- `/Users/cortex-air/Tools/engram/dashboard/src/app/page.tsx`

### Tests
- `/Users/cortex-air/Tools/engram/mcp-server/test/bootstrap-cli.test.ts`
- `/Users/cortex-air/Tools/engram/mcp-server/test/bootstrap-sessions.test.ts`
- `/Users/cortex-air/Tools/engram/mcp-server/test/bootstrap-parallel.test.ts`
- `/Users/cortex-air/Tools/engram/mcp-server/test/vault-format.test.ts`
- `/Users/cortex-air/Tools/engram/mcp-server/test/forget-pipeline-e2e.test.ts`

### Configuration
- `/Users/cortex-air/Tools/engram/mcp-server/vitest.config.ts`
- `/Users/cortex-air/Tools/engram/mcp-server/package.json`
- `/Users/cortex-air/Tools/engram/convex/schema.ts`
- `/Users/cortex-air/Tools/engram/CLAUDE.md`

### Documentation
- `/Users/cortex-air/Tools/engram/docs/API-REFERENCE.md` (auto-generated)
- `/Users/cortex-air/Tools/engram/IMPLEMENTATION_NOTES.md`

---

## Summary

The Engram codebase demonstrates:
1. **Sophisticated test patterns** with vitest, mocking, fixtures, and time control
2. **Atomic filesystem operations** with temp files and renames
3. **Well-organized scaling patterns** (batching, concurrency semaphores, pagination)
4. **Clean separation of concerns** (format, I/O, reconciliation, daemon)
5. **Type-safe patterns** throughout (TypeScript, Zod for validation)
6. **Real-time event streaming** via SSE and Next.js hooks

The 8 remaining tasks build on these patterns to create a complete filesystem mirror with Git integration and comprehensive monitoring.
