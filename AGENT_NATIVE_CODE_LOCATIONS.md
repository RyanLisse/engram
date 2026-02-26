# Agent-Native Review: Code Locations & References
**Plan:** Complete Remaining Letta Context Repository Beads
**Date:** 2026-02-25

---

## Findings Summary

This review analyzed the plan for 8 remaining beads. **3 out of 3 workstreams have agent-native gaps:**

| Workstream | Bead | Status | Gap |
|-----------|------|--------|-----|
| A | engram-7g0 (Bootstrap E2E Tests) | ✅ PASS | CLI bootstrap acceptable for one-time operation |
| B | engram-7eb (Dashboard Timeline) | ✅ PASS | UI layer; agents have full `memory_history` tool access |
| C | engram-uw7 (Markdown Export) | ✅ PASS | Fully agent-native via `memory_vault_export` |
| C | engram-g3o (File Watcher Sync) | ❌ **CRITICAL** | No agent tools to query sync daemon state |
| C | engram-1vt (Git Integration) | ❌ **CRITICAL** | No agent tools to trigger git commits/query history |
| C | engram-wxn (FS Mirror Tests) | ⚠️ INCOMPLETE | Tests needed for above gaps |

---

## PASS: Workstream A — Bootstrap E2E Tests (engram-7g0)

### Files Referenced
- `/Users/cortex-air/Tools/engram/scripts/parse-claude-code-history.ts` — Session file parser
- `/Users/cortex-air/Tools/engram/scripts/bootstrap-parallel.ts` — Parallel file processor
- `/Users/cortex-air/Tools/engram/scripts/bootstrap-from-sessions.ts` — OpenClaw session parser
- `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-reflection-pipeline.test.ts` — Test pattern to follow

### Assessment
- Bootstrap is a one-time operation; CLI-only is acceptable
- Agents do not need to bootstrap frequently (historical data import)
- If agents need `memory_bootstrap_from_session` later, can be added
- **Action:** Create `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-bootstrap-pipeline.test.ts` per plan (10+ test cases)

---

## PASS: Workstream B — Dashboard Timeline (engram-7eb)

### Files Referenced

#### Agent Tool (Existing)
- `/Users/cortex-air/Tools/engram/mcp-server/src/tools/fact-history.ts` (lines 28-89)
  - Function: `factHistory(input: FactHistoryInput)`
  - Returns: Current content + array of versions with changeType, previousContent, timestamp
  - Tool schema: `factHistorySchema`

- `/Users/cortex-air/Tools/engram/mcp-server/src/tools/fact-history.ts` (lines 98-187)
  - Function: `factRollback(input: FactRollbackInput)`
  - Creates version snapshot before rolling back (preserves audit trail)

#### Tool Registry (Existing)
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/tool-registry/lifecycle-entries.ts` (lines 101-114)
  - Entry: `memory_history` — calls `factHistory(args)`
  - Entry: `memory_rollback` — calls `factRollback(args)`
  - Both registered in TOOL_REGISTRY

#### Database Schema (Existing)
- `/Users/cortex-air/Tools/engram/convex/schema.ts` (lines 468-483)
  - Table: `fact_versions`
  - Fields: `factId`, `previousContent`, `previousImportance`, `previousTags`, `changedBy`, `changeType`, `reason`, `createdAt`
  - Indexes: `by_fact`, `by_agent`, `by_type`

#### Dashboard Component (To Create)
- `/Users/cortex-air/Tools/engram/dashboard/src/app/components/VersionTimeline.tsx` (NEW)
  - Input: `factId: string`
  - Calls: `memory_history` tool to fetch versions
  - UI: Vertical timeline, newest-first, expandable details, color-coded badges

#### Dashboard Integration (Existing)
- `/Users/cortex-air/Tools/engram/dashboard/src/app/page.tsx` — Main page where component is integrated

### Assessment
- **Agent-native PASS:** Agents have complete access to fact versions via `memory_history` tool
- **Agents can:** Query history, filter by changeType, rollback to any version
- **Agents cannot:** Open dashboard UI (but don't need to — they have tools)
- **Dashboard component is purely UX layer** (good separation of concerns)

### Action Items
1. ✅ Create `/Users/cortex-air/Tools/engram/dashboard/src/app/components/VersionTimeline.tsx`
2. ✅ Integrate into detail panel in `/Users/cortex-air/Tools/engram/dashboard/src/app/page.tsx`
3. ✅ Add documentation: "Agents use `memory_history` tool; dashboard visualizes same data"

---

## CRITICAL: Workstream C.1 — Filesystem Mirror Export (engram-uw7)

### Files Referenced

#### Vault Writer (Existing)
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-writer.ts`
  - Function: `writeFactToVault(vaultRoot: string, fact: VaultFact)`
  - Creates folder structure, generates filename, renders markdown, writes with `.tmp` atomicity
  - Called by: `VaultSyncDaemon.syncOnce()` (line 49)

#### Vault Format (Existing)
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-format.ts`
  - Function: `renderVaultDocument(fact: VaultFact)` — YAML frontmatter + markdown body
  - Function: `generateFilename(fact)` — Creates filename from title/timestamp
  - Function: `computeFolderPath(fact, vaultRoot)` — Organizes by factType/scope

#### Agent Tool (Existing)
- `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-primitives.ts` (lines 1-80)
  - Function: `vaultExport(input)`
  - Schema: `vaultExportSchema`

#### Tool Registry (Existing)
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/tool-registry/vault-entries.ts` (lines 68-83)
  - Entry: `memory_vault_export` — calls `vaultExport(args)`

### Assessment
- **Agent-native PASS:** Agents can trigger vault export via `memory_vault_export` tool
- **Action parity:** Users can't directly trigger export (daemon does it), but agents have equivalent via tool
- **Verification:** Existing vault-writer.ts + vault-format.ts already tested in `mcp-server/test/vault-format.test.ts`

### Action Items
1. ✅ Plan says "engram-uw7 verified: vault-writer + vault-format cover requirement → close"
2. ✅ No new code needed; existing implementation sufficient

---

## CRITICAL: Workstream C.2 — File Watcher Sync (engram-g3o)

### Files Referenced

#### Vault Sync Daemon (Existing)
- `/Users/cortex-air/Tools/engram/mcp-server/src/daemons/vault-sync.ts`
  - Class: `VaultSyncDaemon`
  - Properties: `vaultRoot`, `intervalMs`, `maxPerRun`, `timer`, `watcher`, `stopped`
  - Methods:
    - `start()` (line 26) — Starts interval timer and file watcher
    - `stop()` (line 37) — Stops both
    - `syncOnce()` (line 45) — Exports unmirrored facts, updates vault path
    - `startWatcher()` (line 59) — chokidar watch on `**/*.md`, ignores dotfiles + conflicts
    - `reconcileFile()` (line 69) — Called when file changes
  - **Problem:** No public getter methods for observability
  - **Problem:** No way for agents to query: "Is sync running? When was last sync? How many pending facts?"

#### Vault Reconciler (Existing)
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-reconciler.ts`
  - Function: `reconcileFileEdit(filePath)` — Three-way merge logic (HUMAN_FIELDS vs MACHINE_FIELDS)
  - Handles conflicts, creates `.conflict.md` files

#### Agent Tools (Existing)
- `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-primitives.ts` (lines 100-130)
  - Function: `vaultReconcile(input)` — Trigger reconciliation on single file
  - Agents can manually reconcile, but cannot query sync daemon state

#### Tool Registry (Existing)
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/tool-registry/vault-entries.ts` (lines 114-127)
  - Entry: `memory_vault_reconcile` — calls `vaultReconcile(args)`

### Assessment
- **Agent-native PARTIAL:** Agents can trigger reconciliation but **cannot observe daemon state**
- **Gap 1:** No tool to query if sync is running
- **Gap 2:** No tool to get last sync timestamp
- **Gap 3:** No tool to get pending facts count
- **Gap 4:** No tool to manually trigger sync outside interval
- **Critical for:** Agents that need to coordinate with sync (e.g., "Wait for sync to complete before exporting")

### Action Items (CRITICAL BLOCKERS)
1. ❌ **Add public getters to `VaultSyncDaemon` class** (in `vault-sync.ts`)
   ```typescript
   public getRunning(): boolean { return !this.stopped; }
   public getLastSyncAt(): number | null { return this.lastSyncAt; }
   public getPendingCount(): number { ... }
   public getWatcherActive(): boolean { return this.watcher != null; }
   public getLastError(): string | null { return this.lastError; }
   ```

2. ❌ **Create `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-sync-status.ts`** (NEW, 120 lines)
   - Tool: `vaultSyncStatus` — query daemon state
   - Tool: `vaultSyncRun` — manually trigger sync

3. ❌ **Register in `/Users/cortex-air/Tools/engram/mcp-server/src/lib/tool-registry/vault-entries.ts`**
   - Add 2 ToolEntry objects for above tools

---

## CRITICAL: Workstream C.3 — Git Auto-Commit (engram-1vt)

### Files Referenced (To Create)

#### Git Integration Library (To Create)
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-git.ts` (NEW, 200 lines)
  - Function: `ensureGitRepo(vaultRoot)` — Initialize repo if needed
  - Function: `autoCommitChanges(opts)` — Stage and commit changes
  - Function: `getLastSyncCommit(vaultRoot)` — Get most recent [engram] commit
  - Integration point: Called from `VaultSyncDaemon.syncOnce()` (after line 56)

#### Agent Tools (To Create)
- `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-git.ts` (NEW, 300 lines)
  - Tool: `vaultGitStatus` — query git repo state
  - Tool: `vaultGitCommit` — create manual commit
  - Tool: `vaultGitLog` — query commit history
  - Tool: `vaultGitRollback` — revert to previous commit

#### Tool Registry (To Update)
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/tool-registry/vault-entries.ts`
  - Add 4 ToolEntry objects (git tools)
  - Import at top: `import { vaultGitStatus, vaultGitStatusSchema, ... } from "../../tools/vault-git.js"`

### Assessment
- **Agent-native FAIL:** Plan implements git auto-commit in daemon, but agents have no way to:
  - Trigger commits manually
  - Query commit history
  - Rollback to previous commits
  - Inspect git status
- **Gap:** Agents are passive observers of daemon commits

### Action Items (CRITICAL BLOCKERS)
1. ❌ **Create `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-git.ts`** (NEW, 300 lines)
   ```typescript
   // 4 functions:
   export async function vaultGitStatus(input) { ... }
   export async function vaultGitCommit(input) { ... }
   export async function vaultGitLog(input) { ... }
   export async function vaultGitRollback(input) { ... }
   ```

2. ❌ **Register in `/Users/cortex-air/Tools/engram/mcp-server/src/lib/tool-registry/vault-entries.ts`**
   - Add 4 ToolEntry objects

3. ✅ **Modify `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-git.ts` (when created)**
   - Implement `ensureGitRepo`, `autoCommitChanges`, `getLastSyncCommit` functions
   - Called from `VaultSyncDaemon.syncOnce()` at line 56 (after `updateVaultPath`)

---

## FS Mirror Tests (engram-wxn)

### Files Referenced

#### Test File (To Create)
- `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-filesystem-mirror.test.ts` (NEW, 400+ lines)
  - Test pattern: Follow `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-reflection-pipeline.test.ts`
  - Mock filesystem boundaries (`fs.readFile`, `fs.writeFile`)
  - Test real vault-writer, vault-reconciler, vault-git logic

#### Test Cases (Minimum 12+)
1. Vault export: fact → markdown with YAML frontmatter
2. Vault import: markdown file → fact in Convex
3. Round-trip: export → edit file → reconcile → verify DB updated
4. Conflict detection: concurrent edit → conflict file generated
5. File watcher: chokidar event → reconciliation triggered
6. Git auto-init: empty vault dir → `.git` created (DEPENDS ON vault-git.ts)
7. Git auto-commit: after sync → commit with N facts in message (DEPENDS ON vault-git.ts)
8. Git status query: agent queries recent commits (DEPENDS ON vault-git.ts tools)
9. Sync status query: agent gets daemon state (DEPENDS ON vault-sync-status.ts tools)
10. Manual sync trigger: agent calls sync via tool (DEPENDS ON vault-sync-status.ts tools)
11. YAML frontmatter: id, source, factType, timestamp, tags, entityIds all round-trip
12. Watcher lag: chokidar delay measured (should be < 30s)

### Assessment
- **Partially Complete:** Bootstrap tests (engram-7g0) and filesystem mirror tests (engram-wxn) cannot be completed until vault-git and vault-sync-status tools exist
- **Gap:** Plan lists test cases but does not account for tool dependencies

### Action Items
1. ✅ Create `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-filesystem-mirror.test.ts`
2. ❌ **Must wait for vault-git.ts tools (engram-1vt) to complete**
3. ❌ **Must wait for vault-sync-status.ts tools (engram-g3o) to complete**

---

## System Prompt Context (Auto-Generated)

### Files Referenced

#### System Prompt Builder
- `/Users/cortex-air/Tools/engram/mcp-server/src/tools/system-prompt-builder.ts`
  - Function: `buildSystemPrompt(agentId)` — Aggregates all context
  - Auto-documents all tools from TOOL_REGISTRY

#### Where Tools Are Documented
- When new tools are added to `TOOL_REGISTRY`, they appear automatically in system prompts
- Agents see: tool name, description, required inputs, output format

### Action Items
1. ✅ No changes needed — system prompt builder auto-discovers new tools from registry
2. ✅ After vault-git and vault-sync-status tools are registered, they will appear in agent prompts

---

## Summary of Critical Dependencies

### Blocking Chain
```
engram-1vt (Git Integration)
  → Requires: vaultGitStatus, vaultGitCommit, vaultGitLog, vaultGitRollback tools
  → Files: vault-git.ts (tool implementations)
  → Files: vault-entries.ts (registration)
  → Tests: e2e-filesystem-mirror.test.ts (6 test cases)

engram-g3o (File Watcher Sync)
  → Requires: vaultSyncStatus, vaultSyncRun tools
  → Files: vault-sync-status.ts (tool implementations)
  → Files: vault-entries.ts (registration)
  → Tests: e2e-filesystem-mirror.test.ts (4 test cases)

engram-wxn (FS Mirror Tests)
  → Blocks on: engram-1vt AND engram-g3o
  → Cannot write complete test suite until both are done
```

### Safe Path Forward (No Blocking)
```
engram-7g0 (Bootstrap E2E Tests) — Independent
  ✅ Can proceed now

engram-7eb (Dashboard Timeline) — Independent
  ✅ Can proceed now

engram-uw7 (Vault Export) — Verified complete
  ✅ Can proceed now (verification only, no code)

engram-g3o (File Watcher) — Blocked
  ❌ Must complete vault-sync-status tools first

engram-1vt (Git Integration) — Blocked
  ❌ Must complete vault-git tools first

engram-wxn (FS Mirror Tests) — Blocked
  ❌ Must complete engram-1vt AND engram-g3o first
```

---

## Implementation Order (Recommended)

### Phase 1 (In Parallel, No Blocking)
1. Create bootstrap e2e tests (engram-7g0)
2. Create dashboard timeline component (engram-7eb)
3. Verify vault export (engram-uw7)

### Phase 2 (Sequential, Can Overlap)
4. Create vault-git.ts tools (engram-1vt)
5. Create vault-sync-status.ts tools (engram-g3o)
6. Modify vault-sync.ts daemon (add public getters)

### Phase 3 (After Phase 2)
7. Create filesystem mirror e2e tests (engram-wxn)
8. Close all 8 beads

---

## Quick Reference: What Currently Exists

### Agent-Accessible Tools (Ready Today)
- ✅ `memory_vault_export` — Export facts to vault
- ✅ `memory_vault_import` — Import vault files to facts
- ✅ `memory_vault_reconcile` — Reconcile single file edits
- ✅ `memory_vault_sync` — Orchestrate export/import/both
- ✅ `memory_history` — Query fact version history
- ✅ `memory_rollback` — Restore fact from version

### Tools Missing (Must Create)
- ❌ `memory_vault_git_status` — Query git repo state
- ❌ `memory_vault_git_commit` — Create git commit
- ❌ `memory_vault_git_log` — Query commit history
- ❌ `memory_vault_git_rollback` — Revert to commit
- ❌ `memory_vault_sync_status` — Query daemon state
- ❌ `memory_vault_sync_run` — Manually trigger sync

---

## Key Decisions Made in Review

1. **Dashboard VersionTimeline component is acceptable** because agents have full tool access to same data
2. **Bootstrap CLI-only is acceptable** because it's a one-time operation
3. **Vault export/import/reconcile are agent-native** — No changes needed
4. **Git auto-commit in daemon requires agent tools** — Cannot proceed without them
5. **Sync daemon observability is critical** — Agents need to verify sync before proceeding

---

**Review Date:** 2026-02-25
**Status:** BLOCKER — Critical issues must be resolved before plan completion
**Estimated Fix Time:** 4-6 hours (tools + tests + integration)
