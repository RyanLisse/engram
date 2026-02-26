# Agent-Native Architecture Review
## Plan: Complete Remaining Letta Context Repository Beads
**Date:** 2026-02-25 | **Status:** CRITICAL GAPS FOUND

---

## Executive Summary

The plan proposes completing 8 remaining beads across three workstreams: bootstrap e2e tests, dashboard timeline component, and Phase 6 filesystem mirror hardening. **Agent-native compliance is GOOD for most features, but has CRITICAL GAPS in two areas:**

1. **CRITICAL (Must Fix):** Vault git operations (`ensureGitRepo`, `autoCommitChanges`) have **no agent-accessible tools**
2. **CRITICAL (Must Fix):** Vault sync daemon state is **not observable by agents** — no tool to query sync status
3. **GOOD:** Fact version timeline data is **fully agent-accessible** via `memory_history` tool
4. **GOOD:** Bootstrap operations are **automatable** via existing tools
5. **CONCERN:** Dashboard VersionTimeline component creates user-only capability (needs agent equivalent)

---

## Detailed Findings

### 1. Fact Version Timeline (engram-7eb) — PASS ✅

**Status:** Agent-native compliant

**Current State:**
- `memory_history` tool exists in `lifecycle-entries.ts` and is registered in tool-registry
- Tool queries `fact_versions` table directly with full access to: `changeType`, `previousContent`, `previousImportance`, `previousTags`, `changedBy`, `timestamp`
- Tool supports limit parameter, proper error handling, version ID transformation
- `memory_rollback` tool allows agents to restore facts (agents can undo changes)

**Dashboard Component Gap:**
- Plan proposes UI-only VersionTimeline component (`dashboard/src/app/components/VersionTimeline.tsx`)
- This is acceptable because agents have full tool access to same data
- **Recommendation:** Document that dashboard is UX layer; tool is the agent primitive

**Action Parity:** ✅
- Users can view version timeline in dashboard → Agents can query via `memory_history`
- Users can rollback via dashboard → Agents can rollback via `memory_rollback`

---

### 2. Vault Git Auto-Commit (engram-1vt) — CRITICAL FAIL ❌

**Status:** Agent-native non-compliant

**Proposed Implementation:**
```typescript
// mcp-server/src/lib/vault-git.ts (NEW FILE)
export async function ensureGitRepo(vaultRoot: string): Promise<boolean>
export async function autoCommitChanges(opts: VaultGitOptions): Promise<{ committed: boolean; sha?: string }>
export async function getLastSyncCommit(vaultRoot: string): Promise<string | undefined>
```

**Integration Point:**
- Called at end of `VaultSyncDaemon.syncOnce()` (in `mcp-server/src/daemons/vault-sync.ts`)

**Agent-Native Gaps:**

| Capability | User | Agent | Parity |
|-----------|------|-------|--------|
| Trigger git init on vault | Daemon (implicit) | NO TOOL | ❌ |
| Trigger auto-commit | Daemon (implicit) | NO TOOL | ❌ |
| Query last sync commit | NO WAY | NO TOOL | ❌ |
| View git history | `git log` in terminal | NO TOOL | ❌ |
| Rollback to commit | `git revert/reset` | NO TOOL | ❌ |

**Critical Issue:**
If the plan implements `vault-git.ts` functions WITHOUT corresponding MCP tools, agents will:
- Be unable to trigger git commits programmatically
- Be unable to query vault git status (last commit SHA, commit count)
- Be unable to inspect version history beyond what `memory_history` provides
- **Result:** Agents cannot automate vault versioning workflows

**Example of Non-Compliance:**
```
User: "Commit all recent vault changes with a summary"
Agent: "I have no tool to trigger git commits. I can only suggest you run `git commit` manually."

vs.

Agent (with proper tools): "I'll use memory_vault_git_commit to stage and commit all 42 recent facts..."
```

---

### 3. Vault Sync Daemon State (engram-g3o verification) — CRITICAL FAIL ❌

**Status:** Agent-native non-compliant

**Current Implementation:**
- `VaultSyncDaemon` class in `mcp-server/src/daemons/vault-sync.ts`
- Has `start()`, `stop()`, `syncOnce()` methods
- Tracks internal state: `timer`, `watcher`, `stopped`, `intervalMs`, `maxPerRun`
- **No MCP tool to query daemon status**

**What Agents Cannot See:**
- Is the sync daemon running?
- When was the last sync? (timestamp)
- How many facts were exported in last run?
- Are there unmirrored facts waiting?
- Is the file watcher active?
- What is the current sync interval?

**Agent-Native Gap:**

| Capability | User | Agent | Parity |
|-----------|------|-------|--------|
| Check if sync is running | NO UI WAY | NO TOOL | ❌ |
| Get last sync timestamp | NO UI WAY | NO TOOL | ❌ |
| Get pending facts count | NO UI WAY | NO TOOL | ❌ |
| Pause/resume sync | NO WAY | NO TOOL | ❌ |
| Change sync interval | Config only | NO TOOL | ❌ |
| View watcher status | NO UI WAY | NO TOOL | ❌ |

**Critical Issue:**
The plan says "verify engram-g3o (file watcher) covered by existing vault-sync.ts → close" but **does not create agent observability tools**. Agents cannot:
- Detect sync problems autonomously
- Monitor vault mirror health
- Wait for sync completion before making decisions
- Report sync status to users

**Example of Non-Compliance:**
```
Agent: "I exported facts to vault. Let me query the last sync status..."
[No tool exists]
Agent: "I cannot verify that the sync actually completed. Uncertain outcome."

vs.

Agent (with proper tools): "Sync completed 2 minutes ago. 47 facts exported. Watcher is active."
```

---

### 4. Bootstrap Operations (engram-7g0) — PASS ✅

**Status:** Agent-native compliant for core pipeline

**Existing Tools:**
- `memory_vault_export` — export facts to vault files
- `memory_vault_import` — import vault files to facts
- `memory_vault_reconcile` — reconcile single file after user edits
- `memory_vault_sync` — orchestrate full export/import/both

**Bootstrap Integration:**
- Bootstrap scripts (`scripts/parse-claude-code-history.ts`, `scripts/bootstrap-parallel.ts`, `scripts/bootstrap-from-sessions.ts`) parse session files
- These are CLI tools, not MCP tools (agents cannot call them directly)
- **Gap:** E2E tests validate bootstrap logic, but no agent-accessible bootstrap tool exists

**Acceptable Scenario:**
Bootstrap is a one-time data ingestion operation, not an ongoing workflow. CLI-only is acceptable if the process is well-documented.

**Recommendation:** If agents need to bootstrap additional sessions later, create `memory_bootstrap_from_session` tool.

---

### 5. Filesystem Mirror & Reconciliation (engram-uw7, engram-wxn) — PASS ✅

**Status:** Agent-native compliant

**Existing Tools:**
- `memory_vault_export` → calls `writeFactToVault()` + `vault-format.ts`
- `memory_vault_import` → calls vault markdown parsing
- `memory_vault_reconcile` → handles file conflicts with three-way merge
- Daemon chokidar watcher → `reconcileFile()` → calls `reconcileFileEdit()`

**Action Parity:** ✅
- Users can edit markdown files in vault folder
- Chokidar watches files
- Daemon reconciles with Convex
- Agents can trigger same operations via tools (import, export, reconcile)

**No Gaps:** This feature is agent-native compliant. The e2e tests should verify the full round-trip.

---

## Critical Recommendations

### MUST FIX BEFORE IMPLEMENTATION

#### 1. Add Vault Git Tools (Blocks engram-1vt Completion)

Add to `mcp-server/src/tools/vault-git.ts`:

```typescript
/**
 * Vault Git Tools — Enable agents to manage vault versioning
 */

export async function vaultGitStatus(input: { vaultRoot: string }) {
  return {
    isRepository: boolean;
    lastSyncSha?: string;
    commitCount: number;
    workingTreeClean: boolean;
    lastCommitMessage?: string;
    lastCommitTimestamp?: number;
  };
}

export async function vaultGitCommit(input: {
  vaultRoot: string;
  message?: string;
  scopeId?: string;  // Associate commit with scope
}) {
  return {
    committed: boolean;
    sha?: string;
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

export async function vaultGitLog(input: {
  vaultRoot: string;
  limit?: number;  // default 10
  pattern?: string;  // grep pattern for [engram] commits
}) {
  return {
    commits: Array<{
      sha: string;
      message: string;
      author: string;
      timestamp: number;
      filesChanged: number;
    }>;
  };
}

export async function vaultGitRollback(input: {
  vaultRoot: string;
  targetSha: string;
  reason?: string;
}) {
  return {
    rolled: boolean;
    previousSha: string;
    currentSha: string;
    changedFiles: string[];
  };
}
```

**Register in `vault-entries.ts`:**
- Add 4 new entries to TOOL_REGISTRY
- Each tool must include schema validation + error handling
- Handlers call git CLI (via `execSync` with proper escaping)

**System Prompt Injection:**
Document in `build_system_prompt` aggregate that agents can:
- Commit vault changes with custom messages
- Query vault git history
- Revert to previous commits

---

#### 2. Add Vault Sync Status Tool (Blocks engram-g3o Verification)

Add to `mcp-server/src/tools/vault-sync-status.ts`:

```typescript
/**
 * Query vault sync daemon observability
 */

export async function vaultSyncStatus(input: {
  // optional — query all daemons if not provided
}) {
  return {
    daemons: Array<{
      vaultRoot: string;
      running: boolean;
      lastSyncAt?: number;
      nextSyncIn?: number;  // ms until next interval
      lastSyncExported?: number;  // count
      pendingFacts: number;
      watcherActive: boolean;
      syncInterval: number;  // ms
    }>;
  };
}

export async function vaultSyncRun(input: {
  vaultRoot?: string;  // run specific daemon or all
  direction?: "export" | "import" | "both";  // default: export
  force?: boolean;  // ignore pending limit
}) {
  return {
    completed: boolean;
    duration: number;  // ms
    exported?: number;
    imported?: number;
    errors?: string[];
  };
}
```

**Integration:**
- MCP server maintains reference to active daemon instances
- Tools query daemon state (not Convex — this is ephemeral runtime state)
- Enables agents to monitor sync health and trigger manual runs

---

#### 3. Clarify Dashboard vs Agent Boundary

Update plan to state:
- **Dashboard VersionTimeline.tsx** is a UI presentation layer for `memory_history` tool data
- Agents should use `memory_history` tool directly, not rely on dashboard
- Component is acceptable; tool is the agent primitive

---

## Capability Map

| Feature | UI Action | Agent Tool | Parity | Status |
|---------|-----------|------------|--------|--------|
| Query fact versions | Dashboard > Fact detail panel | `memory_history` | ✅ | PASS |
| Rollback fact | Dashboard button | `memory_rollback` | ✅ | PASS |
| Export facts to vault | Daemon (implicit) | `memory_vault_export` | ✅ | PASS |
| Import vault files | Daemon (implicit) | `memory_vault_import` | ✅ | PASS |
| Reconcile file conflicts | Daemon watcher (implicit) | `memory_vault_reconcile` | ✅ | PASS |
| Trigger git init | **Daemon (implicit)** | **NONE** | ❌ | FAIL |
| Commit vault changes | **Daemon (implicit)** | **NONE** | ❌ | FAIL |
| Query git history | **Terminal** | **NONE** | ❌ | FAIL |
| Query sync status | **NONE** | **NONE** | ❌ | FAIL |
| Pause/resume sync | **NONE** | **NONE** | ❌ | FAIL |

---

## Implementation Checklist

### Workstream A: Bootstrap E2E Tests (engram-7g0)
- [x] Agent-native analysis: PASS (CLI bootstrap is acceptable; one-time operation)
- [ ] Create `mcp-server/test/e2e-bootstrap-pipeline.test.ts`
- [ ] Test parsing, dedup, orchestration
- [ ] All tests green

### Workstream B: Dashboard Timeline (engram-7eb)
- [x] Agent-native analysis: PASS (agents have full tool access)
- [ ] Create `dashboard/src/app/components/VersionTimeline.tsx`
- [ ] Integrate into detail panel
- [ ] Component renders without errors
- [x] **CRITICAL:** Add note in system prompt: "Agents can query version history via `memory_history` tool; dashboard is UX layer"

### Workstream C: Phase 6 Filesystem Mirror (engram-uw7, engram-g3o, engram-1vt, engram-wxn)
- [x] Verify engram-uw7 (markdown export): PASS
- [x] Verify engram-g3o (file watcher): PASS (but needs status tool)
- [ ] **engram-1vt (Git Integration):** MUST ADD vault git tools before implementing `vault-git.ts`
  - [ ] Create `mcp-server/src/tools/vault-git.ts` with 4 tools
  - [ ] Register in `vault-entries.ts`
  - [ ] Update system prompt
- [ ] **engram-g3o (Sync Observability):** MUST ADD sync status tool
  - [ ] Create `mcp-server/src/tools/vault-sync-status.ts` with 2 tools
  - [ ] Register in `vault-entries.ts`
  - [ ] Update system prompt
- [ ] Create `mcp-server/test/e2e-filesystem-mirror.test.ts` with git + sync status tests
- [ ] All tests green

---

## Risk Mitigation

| Risk | Current Plan | Impact | Mitigation |
|------|--------------|--------|------------|
| Git auto-commit conflicts with user workflow | Make `autoCommit` opt-in config | Medium | **REQUIRED:** Agents need tool to trigger commits manually, not implicit daemon behavior |
| Sync daemon state hidden from agents | Plan says "verify + close" | High | **CRITICAL:** Add `vaultSyncStatus` tool before closing engram-g3o |
| Dashboard creates user-only feature | Acceptable (UX layer) | Low | **MITIGATION:** Document that agents use `memory_history` tool, not dashboard |

---

## Agent-Native Design Principles Applied

1. **Action Parity** ✅ (Mostly)
   - Users can view versions → Agents have `memory_history` ✅
   - Users can rollback → Agents have `memory_rollback` ✅
   - Users can commit vault → **Agents need `vaultGitCommit`** ❌
   - Users can check sync → **Agents need `vaultSyncStatus`** ❌

2. **Context Parity** ✅
   - Agents can see fact_versions table schema (via tool output)
   - Agents can see vault file structure (via tool output)
   - **Agents cannot see sync daemon state** ❌

3. **Shared Workspace** ✅
   - Vault files are shared (chokidar watches both user and agent edits)
   - Git repo is shared (both can trigger commits)
   - **Agents cannot trigger commits without tools** ❌

4. **Primitives Over Workflows** ⚠️
   - `ensureGitRepo` + `autoCommitChanges` in daemon are workflow-shaped
   - **Solution:** Extract as tools: `vaultGitStatus`, `vaultGitCommit`, `vaultGitLog`, `vaultGitRollback`
   - Agents compose workflows from primitives via prompts

5. **Dynamic Context Injection** ✅
   - System prompt can be updated to document new tools
   - No hardcoded workflows in prompts

---

## Questions for Review

1. **Should git commits be triggered by daemon implicitly, or by agent requests?**
   - Current plan: Daemon auto-commits at end of sync
   - Agent-native approach: Agents call `vaultGitCommit` tool, daemon respects opt-in config
   - **Recommendation:** Both — daemon does implicit commits if configured, agents can also trigger manually

2. **Should sync daemon state be observable by agents?**
   - Current plan: Daemon runs in background, no visibility
   - Agent-native approach: Agents call `vaultSyncStatus` tool before/after operations
   - **Recommendation:** Yes — agents need to verify sync completed before proceeding

3. **Is one-time bootstrap via CLI acceptable for agents?**
   - Current plan: CLI tools only
   - Agent-native approach: `memory_bootstrap_from_session` tool for agents
   - **Recommendation:** CLI is acceptable for initial one-time setup; add tool if agents need to bootstrap additional sessions later

---

## What's Working Well

1. **Fact Version System** — Fully agent-native; `memory_history` and `memory_rollback` tools are well-designed primitives
2. **Vault Export/Import/Reconcile** — Agents have full control via tools
3. **Filesystem Mirror** — Daemon + file watcher + reconciliation logic is transparent to agents
4. **File-level Three-Way Merge** — Sophisticated conflict resolution, agents can trigger via `memory_vault_reconcile`
5. **Scope-based Access** — Agents respect scope boundaries when syncing

---

## Agent-Native Score

**Current:** 5/7 capabilities fully agent-accessible
**With Fixes:** 7/7 capabilities fully agent-accessible

**Verdict:** NEEDS WORK — Must add vault git and sync status tools before merging engram-1vt and engram-g3o

---

## References

### Files to Create/Modify

**NEW:**
- `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-git.ts` (4 functions, ~150 lines)
- `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-sync-status.ts` (2 functions, ~80 lines)
- `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-filesystem-mirror.test.ts` (12+ test cases)
- `/Users/cortex-air/Tools/engram/dashboard/src/app/components/VersionTimeline.tsx` (UI component)
- `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-bootstrap-pipeline.test.ts` (10+ test cases)

**MODIFY:**
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/tool-registry/vault-entries.ts` — Add 6 new tool entries (git + sync)
- `/Users/cortex-air/Tools/engram/mcp-server/src/daemons/vault-sync.ts` — Integrate git commit calls (if daemon auto-commit chosen)
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-git.ts` — Implement git operations
- System prompt builder — Document new tools

### Test Files Referenced

- `mcp-server/test/e2e-reflection-pipeline.test.ts` — Mocking pattern for FS operations
- `convex/schema.ts` — fact_versions table definition (line 471)
- `convex/schema.ts` — vaults table (if needed for status queries)

---

**Review completed:** 2026-02-25
**Reviewed by:** Agent-Native Architecture Framework
**Severity of gaps:** CRITICAL — Plan cannot be merged without addressing git + sync status tools
