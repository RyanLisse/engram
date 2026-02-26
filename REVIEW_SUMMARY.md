# Agent-Native Architecture Review Summary
## "Complete Remaining Letta Context Repository Beads" Plan

**Review Date:** 2026-02-25 | **Status:** BLOCKER | **Issues Found:** 2 CRITICAL, 1 GOOD

---

## Quick Answer to Your 4 Questions

### Q1: Can agents trigger vault git operations programmatically?
**Answer:** ❌ **NO** — This is a CRITICAL gap.
- Plan proposes auto-commit in daemon, but no MCP tools exist
- Agents cannot: trigger commits, query history, rollback
- **Fix required:** Create 4 MCP tools (`vaultGitStatus`, `vaultGitCommit`, `vaultGitLog`, `vaultGitRollback`)

### Q2: Can agents query version timeline data without the dashboard UI?
**Answer:** ✅ **YES** — This is PASS.
- `memory_history` tool already exists and is registered
- Agents can query fact versions with full access to all fields
- Dashboard component is a UX layer; agents have equivalent tool access

### Q3: Are bootstrap operations fully automatable via MCP tools?
**Answer:** ⚠️ **PARTIAL** — This is PASS for core need.
- Bootstrap is a one-time data import operation
- CLI tools exist, not MCP tools (acceptable for infrequent one-time operation)
- If agents need to bootstrap additional sessions later, a `memory_bootstrap_from_session` tool could be added

### Q4: Is the vault sync daemon's state observable by agents?
**Answer:** ❌ **NO** — This is a CRITICAL gap.
- Daemon runs in background with no observability tools
- Agents cannot: check if sync is running, get last sync time, see pending facts count
- **Fix required:** Create 2 MCP tools (`vaultSyncStatus`, `vaultSyncRun`) + add public getters to daemon

---

## Scoring

| Category | Score | Status |
|----------|-------|--------|
| Fact version timeline | 5/5 | ✅ PASS |
| Vault export/import | 5/5 | ✅ PASS |
| Vault reconciliation | 5/5 | ✅ PASS |
| **Vault git operations** | 0/5 | ❌ FAIL |
| **Vault sync observability** | 0/5 | ❌ FAIL |
| **Overall** | **3/5** | ❌ BLOCKER |

---

## The Two Critical Issues

### Issue 1: Vault Git Operations Invisible to Agents

**What's in the Plan:**
- Implement `ensureGitRepo()`, `autoCommitChanges()`, `getLastSyncCommit()` in daemon
- Call `autoCommitChanges()` at end of `VaultSyncDaemon.syncOnce()`

**What's Missing:**
- NO MCP tools for agents to trigger these operations
- Agents cannot ask: "Commit my vault changes with a message"
- Agents cannot ask: "Show me the last 10 commits"
- Agents cannot ask: "Rollback to commit X"

**Impact:**
- Plan violates **Action Parity** principle (user can commit, agent cannot)
- Blocks completion of **engram-1vt** bead

**Fix:**
Create 4 MCP tools:
1. `memory_vault_git_status` — query git repo state
2. `memory_vault_git_commit` — create manual commit with custom message
3. `memory_vault_git_log` — query commit history
4. `memory_vault_git_rollback` — revert to previous commit

**Effort:** 4-5 hours (tools + tests + integration)

---

### Issue 2: Vault Sync Daemon State Hidden from Agents

**What's in the Plan:**
- Verify `vault-sync.ts` daemon covers engram-g3o requirement
- Close the bead

**What's Missing:**
- NO MCP tools for agents to query daemon state
- Agents cannot ask: "Is sync running right now?"
- Agents cannot ask: "When was the last sync?"
- Agents cannot ask: "How many facts are waiting to be exported?"

**Impact:**
- Plan violates **Context Parity** principle (user sees daemon logs, agent sees nothing)
- Agents cannot coordinate with sync (e.g., "Wait for sync to complete before proceeding")
- Blocks completion of **engram-g3o** verification and **engram-wxn** tests

**Fix:**
Create 2 MCP tools:
1. `memory_vault_sync_status` — query running daemon state (last sync time, pending facts, etc.)
2. `memory_vault_sync_run` — manually trigger sync outside interval

**Effort:** 3-4 hours (tools + daemon public getters + tests + integration)

---

## What's Working Well (3 PASS Items)

### ✅ Fact Version Timeline (engram-7eb)

**Agent Access:**
- `memory_history` tool exists and is registered
- Returns: fact versions with changeType, previousContent, importance, tags, changedBy, timestamp
- Tool supports limit parameter and error handling

**Dashboard Component:**
- VersionTimeline.tsx is pure UX layer
- Visualizes data from `memory_history` tool
- Not a separate agent-inaccessible feature

**Verdict:** FULLY AGENT-NATIVE

---

### ✅ Vault Export/Import/Reconcile (engram-uw7, engram-wxn export/import)

**Agent Access:**
- `memory_vault_export` — agents can export facts to vault
- `memory_vault_import` — agents can import vault files
- `memory_vault_reconcile` — agents can reconcile edits
- `memory_vault_sync` — agents can orchestrate full sync

**Implementation Quality:**
- Three-way merge conflict resolution (sophisticated)
- YAML frontmatter with all fields (id, timestamp, tags, entityIds, etc.)
- File atomicity (`.tmp` pattern)

**Verdict:** FULLY AGENT-NATIVE

---

### ⚠️ Bootstrap E2E Tests (engram-7g0)

**Agent Access:**
- Bootstrap is CLI-only (not MCP tools)
- One-time data import operation
- Agents don't need frequent bootstrap capability

**Acceptable because:**
- Not an ongoing workflow (happens once)
- Users also use CLI bootstrap, not UI
- If agents need to bootstrap additional sessions later, tool can be added

**Verdict:** ACCEPTABLE (CLI-only for one-time operation)

---

## Files to Create/Modify

### CRITICAL (Must Create)

| File | Purpose | Lines | Owner |
|------|---------|-------|-------|
| `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-git.ts` | Git operations for agents | ~300 | TBD |
| `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-sync-status.ts` | Sync observability for agents | ~120 | TBD |

### CRITICAL (Must Modify)

| File | Purpose | Changes | Owner |
|------|---------|---------|-------|
| `/Users/cortex-air/Tools/engram/mcp-server/src/lib/tool-registry/vault-entries.ts` | Register 6 new tools | +60 lines | TBD |
| `/Users/cortex-air/Tools/engram/mcp-server/src/daemons/vault-sync.ts` | Public getters for observability | +30 lines | TBD |

### PLAN (Per Original Plan)

| File | Purpose | Lines | Status |
|------|---------|-------|--------|
| `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-bootstrap-pipeline.test.ts` | Bootstrap tests | ~200 | ✅ Can start now |
| `/Users/cortex-air/Tools/engram/dashboard/src/app/components/VersionTimeline.tsx` | Timeline UI | ~150 | ✅ Can start now |
| `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-filesystem-mirror.test.ts` | Mirror tests | ~400 | ❌ Blocked on tools |

---

## Implementation Timeline

### Phase 1: Foundation (Critical Tools)
**Duration:** 4-6 hours
1. Create vault-git.ts tools
2. Create vault-sync-status.ts tools
3. Register in tool-registry
4. Add daemon public getters

### Phase 2: Tests & Components (Plan Items)
**Duration:** 2-3 hours (after Phase 1)
1. Bootstrap e2e tests
2. Dashboard timeline component
3. Filesystem mirror e2e tests

### Phase 3: Verification
**Duration:** 1 hour
1. Run all tests
2. Verify system prompt auto-discovery
3. Close all 8 beads

---

## Recommended Action

### Before Proceeding with Plan Implementation:

1. **Implement vault-git.ts tools** (4 functions)
   - `vaultGitStatus` — query repo state
   - `vaultGitCommit` — create commit
   - `vaultGitLog` — query history
   - `vaultGitRollback` — revert commit

2. **Implement vault-sync-status.ts tools** (2 functions)
   - `vaultSyncStatus` — query daemon state
   - `vaultSyncRun` — trigger sync manually

3. **Register both tool sets** in vault-entries.ts

4. **Add public getters to VaultSyncDaemon** class
   - `getRunning()`, `getLastSyncAt()`, `getPendingCount()`, `getWatcherActive()`, `getLastError()`

5. **Then proceed with original plan items:**
   - Bootstrap e2e tests
   - Dashboard timeline component
   - Filesystem mirror e2e tests

### Cost-Benefit Analysis

**Current Estimate for Complete Plan:** 8-10 hours
- Bootstrap tests: 2 hrs
- Dashboard component: 1 hr
- Filesystem tests: 2 hrs
- Vault git tools: 3 hrs ← NEEDED
- Vault sync tools: 2 hrs ← NEEDED

**Without Fixing Gaps:**
- Plan completes but violates agent-native principles
- Agents cannot automate git versioning workflows
- Agents cannot monitor sync health
- Future PRs will flag as non-compliant

**With Fixing Gaps:**
- Plan aligns with agent-native architecture
- Agents have full parity with users
- All 73 tools work together cohesively
- No future compliance issues

---

## Review Artifacts

Three detailed documents created:

1. **AGENT_NATIVE_REVIEW.md** (3200 words)
   - Full analysis of all 8 beads
   - Detailed capability maps
   - Risk analysis and principles applied

2. **AGENT_NATIVE_ACTION_ITEMS.md** (2500 words)
   - Specific tool designs with inputs/outputs
   - Implementation requirements
   - Testing checklist

3. **AGENT_NATIVE_CODE_LOCATIONS.md** (2800 words)
   - File-by-file reference
   - Line numbers of relevant code
   - Dependencies between beads

**All files located in:** `/Users/cortex-air/Tools/engram/`

---

## Questions to Discuss

1. **Should git auto-commit be implicit (daemon) or explicit (agents trigger)?**
   - Recommendation: Both — daemon auto-commits if configured, agents can also trigger manually

2. **Should vault sync status be queryable from Convex or just daemon?**
   - Recommendation: Daemon (ephemeral state), with Convex fallback for historical data

3. **Should bootstrap be available as agent tool for future sessions?**
   - Recommendation: Not now (one-time operation), can add later if needed

---

**Status:** BLOCKER FOR PLAN COMPLETION
**Resolution:** Requires 4-6 hour implementation before proceeding
**Severity:** CRITICAL (Agent-native compliance violation)
**Recommendation:** Implement Phase 1 (critical tools) before Phase 2 (plan items)
