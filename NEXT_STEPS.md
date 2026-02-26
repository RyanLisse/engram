# Next Steps: Agent-Native Review Complete
**Review Date:** 2026-02-25 | **Status:** Ready for Implementation

---

## What Was Reviewed

Plan: "Complete Remaining Letta Context Repository Beads" (8 beads, 200/208 complete)

**Review Method:** Agent-native architecture compliance check
- ✅ Action Parity: Can agents do everything users can do?
- ✅ Context Parity: Can agents see what users see?
- ✅ Shared Workspace: Do agents and users work in same space?
- ✅ Primitives over Workflows: Are tools atomic or business-logic-wrapped?

---

## Review Results

### 4 Key Findings

1. **PASS: Fact Version Timeline (engram-7eb)**
   - Agents have full access via `memory_history` and `memory_rollback` tools
   - Dashboard component is pure UX layer
   - Status: Ready to implement

2. **PASS: Vault Export/Import/Reconcile (engram-uw7, engram-wxn partial)**
   - Agents have `memory_vault_export`, `memory_vault_import`, `memory_vault_reconcile` tools
   - Three-way merge + YAML frontmatter fully implemented
   - Status: Ready to implement tests

3. **CRITICAL FAIL: Vault Git Operations (engram-1vt)**
   - Plan proposes auto-commit in daemon, but no MCP tools exist
   - Agents cannot: trigger commits, query history, rollback
   - Status: BLOCKER - Must create 4 new tools first

4. **CRITICAL FAIL: Vault Sync Observability (engram-g3o)**
   - Daemon runs with no observability to agents
   - Agents cannot: check if sync running, get last sync time, see pending facts
   - Status: BLOCKER - Must create 2 new tools first

---

## Documents Created

Four comprehensive review documents have been created in the engram root:

1. **AGENT_NATIVE_REVIEW.md** (3200 words)
   - Complete analysis of all 8 beads
   - Detailed capability maps with tool references
   - Risk analysis and design principles

2. **AGENT_NATIVE_ACTION_ITEMS.md** (2500 words)
   - Specific tool designs (inputs/outputs/implementation)
   - File changes required
   - Testing checklist

3. **AGENT_NATIVE_CODE_LOCATIONS.md** (2800 words)
   - File-by-file reference with line numbers
   - Dependencies between beads
   - Implementation order

4. **AGENT_NATIVE_PARITY_MATRIX.txt** (ASCII diagram)
   - Visual representation of gaps
   - Compliance scorecard
   - Timeline to compliance

All files located in: `/Users/cortex-air/Tools/engram/`

---

## Recommended Implementation Path

### Option A: Fix First (RECOMMENDED)
**Total Time: 11 hours | 100% Agent-Native Compliance**

1. **Phase 1 (6 hours):** Create critical tools
   - Create `vault-git.ts` with 4 tools
   - Create `vault-sync-status.ts` with 2 tools
   - Register in vault-entries.ts
   - Add daemon public getters

2. **Phase 2 (5 hours):** Complete plan items
   - Bootstrap e2e tests
   - Dashboard timeline component
   - Filesystem mirror e2e tests
   - All 8 beads complete with 100% compliance

**Benefits:**
- No technical debt
- Future-proof (no compliance issues)
- All 73 tools work cohesively
- Agents have full parity with users

---

### Option B: Plan First (NOT RECOMMENDED)
**Time: 8 hours now + 4+ hours later | Technical Debt Accumulation**

1. Implement plan as-is (no gap fixes)
   - Bootstrap tests, dashboard, filesystem tests
   - 8 beads close, but with compliance violations

2. Later: Create tools to close gaps
   - More tools needed: vault-git + vault-sync
   - New beads opened to close compliance issues
   - Future PR reviews flag violations

**Not Recommended** because:
- Violates agent-native principles
- Creates technical debt
- Future rework required
- More total effort in long run

---

## Quick Start: If You Choose Option A (Recommended)

### Step 1: Review the Findings
```bash
# Read these in this order:
cat /Users/cortex-air/Tools/engram/REVIEW_SUMMARY.md
cat /Users/cortex-air/Tools/engram/AGENT_NATIVE_PARITY_MATRIX.txt
cat /Users/cortex-air/Tools/engram/AGENT_NATIVE_ACTION_ITEMS.md
```

### Step 2: Implement Phase 1 (Critical Tools)

**Create vault-git.ts:**
```bash
# Copy the tool designs from AGENT_NATIVE_ACTION_ITEMS.md section "Tool 1-4"
# Create /Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-git.ts
# Implement 4 functions: vaultGitStatus, vaultGitCommit, vaultGitLog, vaultGitRollback
# ~300 lines with error handling + git CLI calls

# Then register in vault-entries.ts:
# Add 4 ToolEntry objects to TOOL_REGISTRY array
# Each with schema (Zod) + handler function
```

**Create vault-sync-status.ts:**
```bash
# Copy the tool designs from AGENT_NATIVE_ACTION_ITEMS.md section "Tool 5-6"
# Create /Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-sync-status.ts
# Implement 2 functions: vaultSyncStatus, vaultSyncRun
# ~120 lines with daemon reference management

# Then register in vault-entries.ts:
# Add 2 ToolEntry objects to TOOL_REGISTRY array
```

**Modify vault-sync.ts daemon:**
```bash
# Edit /Users/cortex-air/Tools/engram/mcp-server/src/daemons/vault-sync.ts
# Add public getter methods (~30 lines):
#   getRunning(), getLastSyncAt(), getPendingCount(), getWatcherActive(), getLastError()
# Update MCP server to maintain daemon references for tool access
```

### Step 3: Test Phase 1
```bash
# Run existing tests to verify no regressions
cd /Users/cortex-air/Tools/engram
npm run test

# All 1168 tests should pass
```

### Step 4: Implement Phase 2 (Plan Items)

Once Phase 1 passes:
```bash
# Create bootstrap e2e tests
# Create dashboard timeline component
# Create filesystem mirror e2e tests
# All per original plan, now with solid foundation
```

### Step 5: Final Verification
```bash
# Run full test suite
npm run test

# Verify system prompt auto-discovery works
# All new tools should appear in memory_get_system_prompt output

# Close all 8 beads ✅
```

---

## Key Files to Know

### Already Exist (Reference Only)
- `/Users/cortex-air/Tools/engram/mcp-server/src/tools/fact-history.ts` — Reference for tool patterns
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-writer.ts` — Existing vault implementation
- `/Users/cortex-air/Tools/engram/mcp-server/src/daemons/vault-sync.ts` — Daemon to enhance
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/tool-registry/vault-entries.ts` — Where to register

### Must Create
- `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-git.ts` (NEW)
- `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-sync-status.ts` (NEW)
- `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-bootstrap-pipeline.test.ts` (NEW)
- `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-filesystem-mirror.test.ts` (NEW)
- `/Users/cortex-air/Tools/engram/dashboard/src/app/components/VersionTimeline.tsx` (NEW)

### Must Modify
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/tool-registry/vault-entries.ts` (+60 lines)
- `/Users/cortex-air/Tools/engram/mcp-server/src/daemons/vault-sync.ts` (+30 lines)

---

## Questions to Clarify Before Starting

1. **Is the 6-hour estimate acceptable for fixing the gaps?**
   - Recommended: Yes, do it upfront rather than accumulate debt

2. **Should git auto-commit be implicit (daemon) or explicit (agents)?**
   - Recommended: Both — daemon auto-commits if configured, agents can also trigger manually

3. **Should Phase 1 be done by the same person/team as Phase 2?**
   - Recommended: Yes, for consistency and to verify integration works

---

## Success Criteria

### Phase 1 Complete When:
- [ ] `vault-git.ts` tools created (vaultGitStatus, vaultGitCommit, vaultGitLog, vaultGitRollback)
- [ ] `vault-sync-status.ts` tools created (vaultSyncStatus, vaultSyncRun)
- [ ] Both tool sets registered in vault-entries.ts
- [ ] VaultSyncDaemon class has public getter methods
- [ ] All existing 1168 tests pass
- [ ] No regressions in vault operations

### Phase 2 Complete When:
- [ ] `e2e-bootstrap-pipeline.test.ts` created with 10+ test cases
- [ ] `VersionTimeline.tsx` component created and integrated
- [ ] `e2e-filesystem-mirror.test.ts` created with 12+ test cases
- [ ] All tests pass (including new ones)
- [ ] System prompt documents all 79 tools (73 + 6 new)
- [ ] All 8 beads marked closed

### Overall Complete When:
- [ ] 100% agent-native compliance verified
- [ ] Action parity: 7/7 capabilities available to agents
- [ ] Context parity: Agents see all state daemon can see
- [ ] No technical debt introduced
- [ ] No future compliance issues

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Git tool implementation is complex | Low | Refer to existing vault-git CLI patterns |
| Daemon reference management adds complexity | Low | Reference existing subscription-manager pattern |
| Tests fail on new tools | Low | Follow e2e-reflection-pipeline.test.ts pattern |
| Sync status changes during query | Medium | Return timestamp so agent can detect staleness |

---

## After Implementation: Next Steps

Once all 8 beads are closed:

1. **Update architecture docs**
   - Add vault-git + vault-sync-status to API-REFERENCE.md (auto-generated)
   - Document example workflows (commit → log → rollback sequence)

2. **Consider Phase 7**
   - Are there other agent-blind operations in the system?
   - E.g., permission changes, scope operations, etc.

3. **Celebrate**
   - 79 agent-native tools, all with full user parity
   - Zero non-agent-accessible features
   - Agents are true first-class citizens

---

## Where to Get Help

### If You Have Questions About:

**The gaps themselves:**
- Read: `AGENT_NATIVE_REVIEW.md` (detailed analysis)
- Ref: `AGENT_NATIVE_PARITY_MATRIX.txt` (visual diagram)

**Specific tool designs:**
- Read: `AGENT_NATIVE_ACTION_ITEMS.md` (tool specs with I/O)
- Ref: `fact-history.ts` (tool pattern to follow)

**File locations and code:**
- Read: `AGENT_NATIVE_CODE_LOCATIONS.md` (every file referenced with line numbers)
- Ref: Existing vault tools (`vault-writer.ts`, `vault-sync.ts`)

**Implementation order:**
- Read: `AGENT_NATIVE_CODE_LOCATIONS.md` (dependencies section)
- Ref: `REVIEW_SUMMARY.md` (timeline graphic)

---

## Summary

**Plan Status:** BLOCKER for agent-native compliance

**Path Forward:**
1. Fix critical gaps first (6 hours, Phase 1)
2. Complete plan items (5 hours, Phase 2)
3. Total: 11 hours for 100% compliance

**Recommendation:** Proceed with Option A (Fix First)

**Owner:** TBD (Assign to engineer with MCP/TypeScript expertise)

---

**Review completed by:** Agent-Native Architecture Framework
**Date:** 2026-02-25
**Status:** Ready for implementation
**Confidence:** High (gaps are clear, solutions are specified)
