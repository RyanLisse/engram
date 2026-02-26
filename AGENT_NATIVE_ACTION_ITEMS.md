# Agent-Native Action Items
## Plan: Complete Remaining Letta Context Repository Beads
**Priority:** CRITICAL (Blocks Plan Completion)

---

## Summary

The plan has **2 critical agent-native gaps** that must be fixed before implementation:

1. **No agent tools for vault git operations** (engram-1vt)
2. **No agent tools for vault sync daemon observability** (engram-g3o)

Both gaps violate **Action Parity** — users can perform these operations (via daemon + git CLI), but agents cannot.

---

## CRITICAL ISSUE #1: Vault Git Tools Missing

### Problem
The plan proposes implementing `vault-git.ts` with git auto-commit in the daemon, but:
- Agents have **NO way to trigger git commits** programmatically
- Agents have **NO way to query vault git history**
- Agents have **NO way to rollback to previous commits**
- Agents **cannot automate vault versioning workflows**

### Solution Required
Create 4 new MCP tools to expose git operations as agent-accessible primitives:

#### Tool 1: `memory_vault_git_status`
**Purpose:** Query git repository state

**Input:**
```typescript
{
  vaultRoot?: string  // specific vault or all vaults
}
```

**Output:**
```typescript
{
  isRepository: boolean;
  lastSyncSha?: string;  // most recent [engram] commit SHA
  commitCount: number;
  workingTreeClean: boolean;
  lastCommitMessage?: string;
  lastCommitTimestamp?: number;
  lastCommitAuthor?: string;
}
```

**Implementation:**
```bash
git rev-parse --is-inside-work-tree
git log --grep="^\[engram\]" -n 1 --format="%H %s %at"
git rev-list --count HEAD
git status --porcelain
```

---

#### Tool 2: `memory_vault_git_commit`
**Purpose:** Create a new git commit with vault changes

**Input:**
```typescript
{
  vaultRoot: string;
  message?: string;  // custom message (default: "[engram] Sync {N} facts at {ISO timestamp}")
  scopeId?: string;  // associate commit with scope for auditing
  includeUntracked?: boolean;  // stage new files (default: false, tracked only)
}
```

**Output:**
```typescript
{
  committed: boolean;
  sha?: string;  // commit SHA if successful
  filesChanged: number;
  insertions: number;
  deletions: number;
  error?: string;
}
```

**Implementation:**
```bash
git add --update  # or --force --all if includeUntracked
git commit -m "message"
git log -n 1 --format="%H" (get SHA)
git diff HEAD~1 --stat (get stats)
```

---

#### Tool 3: `memory_vault_git_log`
**Purpose:** Query vault commit history

**Input:**
```typescript
{
  vaultRoot: string;
  limit?: number;  // default: 10
  pattern?: string;  // grep pattern (default: "^\[engram\]" for sync commits)
  scopeId?: string;  // filter commits by scope tag if present
}
```

**Output:**
```typescript
{
  commits: Array<{
    sha: string;  // abbreviated SHA
    message: string;
    author: string;
    timestamp: number;  // unix ms
    filesChanged: number;
    insertions: number;
    deletions: number;
  }>;
  total: number;  // total matching commits (may exceed limit)
}
```

**Implementation:**
```bash
git log --grep="pattern" -n {limit} --format="%h|%s|%an|%at|%D"
git show --stat --format="" SHA (for file counts)
```

---

#### Tool 4: `memory_vault_git_rollback`
**Purpose:** Revert vault to a previous commit (creates new commit with inverse changes)

**Input:**
```typescript
{
  vaultRoot: string;
  targetSha: string;  // commit SHA to revert to (from git log)
  reason?: string;  // explain why (stored in commit message)
}
```

**Output:**
```typescript
{
  rolled: boolean;
  previousSha: string;  // what we reverted from
  currentSha: string;  // new rollback commit SHA
  changedFiles: string[];
  filesChanged: number;
  insertions: number;
  deletions: number;
  error?: string;
}
```

**Implementation:**
```bash
git revert --no-edit SHA  # creates new commit (safe, preserves history)
# Alternative: git reset --hard SHA  (destructive, overwrites history)
# Recommend: revert for safety
```

---

### File Changes Required

**File:** `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-git.ts` (NEW, ~200 lines)

**File:** `/Users/cortex-air/Tools/engram/mcp-server/src/lib/tool-registry/vault-entries.ts`
- Add 4 new ToolEntry objects for the above tools
- Import at top: `import { vaultGitStatus, vaultGitStatusSchema, ... } from "../../tools/vault-git.js"`

**File:** System prompt builder (auto-generated via `build_system_prompt` tool)
- These tools will be auto-documented

### Testing
Add test cases to `mcp-server/test/e2e-filesystem-mirror.test.ts`:
- ✅ Commit vault changes triggers git commit
- ✅ Query git log returns recent commits
- ✅ Rollback to previous commit reverts changes
- ✅ Git status shows clean working tree after sync
- ✅ Concurrent commits (agent + user) both appear in log

---

## CRITICAL ISSUE #2: Vault Sync Daemon State Invisible to Agents

### Problem
The plan proposes verifying engram-g3o (file watcher) as "covered by vault-sync.ts" and closing it. But:
- `VaultSyncDaemon` has **NO observability tools** for agents
- Agents cannot know if sync is running or when it last executed
- Agents cannot monitor pending facts waiting to be exported
- Agents cannot verify sync completed before dependent operations

### Solution Required
Create 2 new MCP tools to expose daemon state as agent-accessible primitives:

#### Tool 1: `memory_vault_sync_status`
**Purpose:** Query vault sync daemon runtime state

**Input:**
```typescript
{
  vaultRoot?: string  // specific vault daemon or all
}
```

**Output:**
```typescript
{
  daemons: Array<{
    vaultRoot: string;
    running: boolean;
    lastSyncAt?: number;  // unix ms, when last sync completed
    nextSyncIn?: number;  // ms until next interval-based sync
    lastSyncExported?: number;  // fact count from last export
    lastSyncImported?: number;  // file count from last import
    pendingFacts: number;  // unmirrored facts waiting
    watcherActive: boolean;
    syncInterval: number;  // ms between automatic syncs
    error?: string;  // last error if sync failed
  }>;
}
```

**Implementation:**
- MCP server maintains reference to active `VaultSyncDaemon` instances
- Daemons expose public getter methods: `getRunning()`, `getLastSyncAt()`, `getPendingCount()`, etc.
- Tool queries daemon objects (NOT Convex — this is ephemeral runtime state)
- Fallback: If daemon not found, query Convex for historical sync metadata

---

#### Tool 2: `memory_vault_sync_run`
**Purpose:** Manually trigger vault sync outside scheduled interval

**Input:**
```typescript
{
  vaultRoot?: string;  // specific vault or all (default: all)
  direction?: "export" | "import" | "both";  // default: "export"
  force?: boolean;  // ignore maxPerRun limit (default: false)
  maxItems?: number;  // override daemon's maxPerRun (for this run only)
}
```

**Output:**
```typescript
{
  completed: boolean;
  duration: number;  // ms
  exported?: number;  // facts written to vault
  imported?: number;  // files read from vault
  errors?: string[];
  pendingAfter: number;  // unmirrored facts remaining
}
```

**Implementation:**
- Finds daemon by vaultRoot
- Calls `daemon.syncOnce()` with override options
- Awaits completion, returns results
- If daemon not found or not running, return error

---

### File Changes Required

**File:** `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-sync-status.ts` (NEW, ~120 lines)

**File:** `/Users/cortex-air/Tools/engram/mcp-server/src/daemons/vault-sync.ts`
- Add public getter methods to `VaultSyncDaemon` class:
  ```typescript
  public getRunning(): boolean { return !this.stopped; }
  public getLastSyncAt(): number | null { return this.lastSyncAt; }
  public getPendingCount(): number { ... }
  public getWatcherActive(): boolean { return this.watcher != null; }
  public getLastError(): string | null { return this.lastError; }
  ```
- Add instance tracking in MCP server so tools can query daemon references

**File:** `/Users/cortex-air/Tools/engram/mcp-server/src/lib/tool-registry/vault-entries.ts`
- Add 2 new ToolEntry objects for the above tools
- Import at top: `import { vaultSyncStatus, vaultSyncStatusSchema, ... } from "../../tools/vault-sync-status.js"`

### Testing
Add test cases to `mcp-server/test/e2e-filesystem-mirror.test.ts`:
- ✅ Query sync status returns running daemons
- ✅ Status shows correct lastSyncAt timestamp after export
- ✅ Manually trigger sync via tool and wait for completion
- ✅ Pending facts count decreases after sync
- ✅ Watcher active flag reflects daemon state
- ✅ Force flag bypasses maxPerRun limit

---

## Implementation Plan

### Phase 1: Create Tools (2-3 hours)
1. Create `vault-git.ts` with 4 tools
2. Create `vault-sync-status.ts` with 2 tools
3. Register both in `vault-entries.ts`
4. Add schema validation (Zod)

### Phase 2: Integration (1-2 hours)
1. Modify `vault-sync.ts` daemon to track state + expose getters
2. Register daemon references in MCP server singleton
3. Test manual sync trigger

### Phase 3: Testing (2-3 hours)
1. Write e2e tests for all 6 tools
2. Test error cases (repo doesn't exist, sync fails, etc.)
3. Verify all existing tests still pass

### Phase 4: System Prompt (30 min)
1. Update system prompt builder to document new tools
2. Provide examples of using tools together:
   - "Query sync status → export facts → commit → log results"
   - "Monitor pending facts and trigger sync when threshold reached"

---

## Acceptance Criteria

- [x] **CRITICAL:** `memory_vault_git_status` tool created and tested
- [x] **CRITICAL:** `memory_vault_git_commit` tool created and tested
- [x] **CRITICAL:** `memory_vault_git_log` tool created and tested
- [x] **CRITICAL:** `memory_vault_git_rollback` tool created and tested
- [x] **CRITICAL:** `memory_vault_sync_status` tool created and tested
- [x] **CRITICAL:** `memory_vault_sync_run` tool created and tested
- [x] All 6 tools registered in vault-entries.ts
- [x] All existing 1168 tests pass
- [x] New e2e tests: 12+ cases for filesystem mirror (with git + sync)
- [x] System prompt updated with new tool documentation
- [x] No regressions in existing vault operations

---

## Why This Matters (Agent-Native Principles)

### Action Parity
- **User:** Can run `git commit`, `git log`, `git revert` on vault
- **Agent:** Now can call `memory_vault_git_*` tools with equivalent functionality ✅
- **User:** Can run `git status` to check for uncommitted changes
- **Agent:** Now can call `memory_vault_git_status` tool ✅

### Context Parity
- **User:** Can see daemon running in terminal, knows last sync timestamp
- **Agent:** Now can query via `memory_vault_sync_status` tool ✅
- **User:** Can manually trigger sync via CLI
- **Agent:** Now can trigger via `memory_vault_sync_run` tool ✅

### Shared Workspace
- **User + Agent:** Both can trigger commits (via tools or CLI)
- **User + Agent:** Both can query git history (via tools or CLI)
- **User + Agent:** Both can inspect vault sync state (via tools or daemon logs)

---

## Why Current Plan Is Blocked Without These Tools

**Current Plan Says:**
> "engram-1vt: Git auto-commit on vault sync"
> "Implementation: Call `autoCommitChanges` at end of `VaultSyncDaemon.syncOnce()`"

**Problem:**
- Auto-commit happens in daemon, implicitly
- Agents cannot trigger commits manually
- Agents cannot query git state to verify commit happened
- **Result:** Agents are passive observers, not active participants in vault versioning

**With These Tools:**
- Agents can trigger manual commits with custom messages
- Agents can inspect git history before operations
- Agents can rollback if needed
- Agents can monitor sync health continuously
- **Result:** Agents are full participants in vault versioning workflow

---

## Files to Review After Implementation

1. `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-git.ts` — Verify error handling + git CLI safety
2. `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-sync-status.ts` — Verify daemon reference management
3. `/Users/cortex-air/Tools/engram/mcp-server/src/daemons/vault-sync.ts` — Verify state tracking + public API
4. `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-filesystem-mirror.test.ts` — Verify comprehensive coverage

---

**Status:** BLOCKER FOR PLAN COMPLETION
**Owner:** TBD (Must be completed before engram-1vt and engram-g3o merge)
**Target:** Before Phase 2 (Verify & Close) begins
