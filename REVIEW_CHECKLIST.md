# Agent-Native Architecture Review Checklist
**Plan:** Complete Remaining Letta Context Repository Beads
**Date:** 2026-02-25

---

## Pre-Implementation Checklist

Use this before you start implementing the plan.

### Review Understanding
- [ ] Read `REVIEW_SUMMARY.md` (10 minutes)
- [ ] Read `AGENT_NATIVE_PARITY_MATRIX.txt` (5 minutes)
- [ ] Understand the 2 critical gaps
- [ ] Agree on implementation path (Option A recommended)
- [ ] Share documents with team

### Decision Making
- [ ] Discuss: Option A (Fix first, 11 hours) vs Option B (Plan first, 8 hours now + 4+ later)
- [ ] Decision: Which option? (A recommended)
- [ ] Assign: Who will do Phase 1?
- [ ] Assign: Who will do Phase 2?
- [ ] Schedule: When will Phase 1 start?
- [ ] Schedule: When will Phase 2 start (after Phase 1 tests pass)?

### Resource Planning
- [ ] Assignee 1: Review `AGENT_NATIVE_ACTION_ITEMS.md` (tool specifications)
- [ ] Assignee 1: Review `AGENT_NATIVE_CODE_LOCATIONS.md` (file references)
- [ ] Assignee 1: Review `AGENT_NATIVE_REVIEW.md` (context if needed)
- [ ] Setup: Development environment ready
- [ ] Setup: Test framework (`npm run test`) works
- [ ] Setup: Git repository clean and on master branch

---

## Phase 1 Implementation Checklist (6 Hours)

### Part 1: Create vault-git.ts (2.5 hours)

#### Design & Specification
- [ ] Read: `AGENT_NATIVE_ACTION_ITEMS.md` "CRITICAL ISSUE #1"
- [ ] Review: Tool 1: `vaultGitStatus` (input/output)
- [ ] Review: Tool 2: `vaultGitCommit` (input/output)
- [ ] Review: Tool 3: `vaultGitLog` (input/output)
- [ ] Review: Tool 4: `vaultGitRollback` (input/output)

#### Implementation
- [ ] Create: `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-git.ts`
- [ ] Implement: `vaultGitStatus` function with Zod schema
- [ ] Implement: `vaultGitCommit` function with Zod schema
- [ ] Implement: `vaultGitLog` function with Zod schema
- [ ] Implement: `vaultGitRollback` function with Zod schema
- [ ] Add: Error handling for all git CLI calls
- [ ] Add: Input validation via Zod schemas
- [ ] Add: Export statements for all schemas

#### Code Quality
- [ ] Format: Run prettier/lint
- [ ] Types: All functions have proper TypeScript types
- [ ] Errors: All error paths return `{ isError: true, message }`
- [ ] Comments: Add JSDoc comments to all public functions

### Part 2: Create vault-sync-status.ts (1.5 hours)

#### Design & Specification
- [ ] Read: `AGENT_NATIVE_ACTION_ITEMS.md` "CRITICAL ISSUE #2"
- [ ] Review: Tool 5: `vaultSyncStatus` (input/output)
- [ ] Review: Tool 6: `vaultSyncRun` (input/output)

#### Implementation
- [ ] Create: `/Users/cortex-air/Tools/engram/mcp-server/src/tools/vault-sync-status.ts`
- [ ] Implement: `vaultSyncStatus` function with Zod schema
- [ ] Implement: `vaultSyncRun` function with Zod schema
- [ ] Add: Reference to active daemon instances from MCP server
- [ ] Add: Error handling and validation
- [ ] Add: Export statements for all schemas

#### Code Quality
- [ ] Format: Run prettier/lint
- [ ] Types: All functions have proper TypeScript types
- [ ] Errors: All error paths return `{ isError: true, message }`
- [ ] Comments: Add JSDoc comments to all public functions

### Part 3: Modify VaultSyncDaemon (1 hour)

#### File: `/Users/cortex-air/Tools/engram/mcp-server/src/daemons/vault-sync.ts`

#### Add Public Getters
- [ ] Add: `public getRunning(): boolean`
- [ ] Add: `public getLastSyncAt(): number | null`
- [ ] Add: `public getPendingCount(): number`
- [ ] Add: `public getWatcherActive(): boolean`
- [ ] Add: `public getLastError(): string | null`
- [ ] Add: Track `lastSyncAt` timestamp in `syncOnce()`
- [ ] Add: Track `lastError` in error handlers
- [ ] Add: Track pending facts count

#### Integration
- [ ] Ensure: MCP server maintains daemon references
- [ ] Ensure: Tools can access daemon instances

### Part 4: Register Tools (1 hour)

#### File: `/Users/cortex-air/Tools/engram/mcp-server/src/lib/tool-registry/vault-entries.ts`

#### Add Imports
- [ ] Add: `import { vaultGitStatus, vaultGitStatusSchema, ... } from "../../tools/vault-git.js"`
- [ ] Add: `import { vaultSyncStatus, vaultSyncStatusSchema, ... } from "../../tools/vault-sync-status.js"`

#### Add ToolEntry Objects
- [ ] Add: Entry for `memory_vault_git_status` tool
- [ ] Add: Entry for `memory_vault_git_commit` tool
- [ ] Add: Entry for `memory_vault_git_log` tool
- [ ] Add: Entry for `memory_vault_git_rollback` tool
- [ ] Add: Entry for `memory_vault_sync_status` tool
- [ ] Add: Entry for `memory_vault_sync_run` tool
- [ ] Verify: All entries in TOOL_REGISTRY array
- [ ] Verify: All have proper schemas and handlers

### Part 5: Test Phase 1 (Continuous)

#### Unit Tests
- [ ] Create: Tests for each vault-git function (error handling, happy path)
- [ ] Create: Tests for each vault-sync function (daemon reference, error cases)
- [ ] Run: `npm run test` — should pass
- [ ] Verify: No regressions in existing vault tests
- [ ] Verify: No regressions in fact-history tests (similar pattern)

#### Integration Tests
- [ ] Verify: System prompt auto-discovers new tools
- [ ] Call: `memory_get_system_prompt` tool
- [ ] Check: All 6 new tools appear in output
- [ ] Test: Manual tool invocation via MCP

#### Acceptance Criteria
- [ ] All 1168 existing tests pass
- [ ] All 6 new tools are registered
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] All tools documented in registry
- [ ] System prompt includes new tools

---

## Phase 2 Implementation Checklist (5 Hours)

### Part 1: Bootstrap E2E Tests (2 hours)

#### File: `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-bootstrap-pipeline.test.ts`

- [ ] Create: New test file
- [ ] Reference: `e2e-reflection-pipeline.test.ts` pattern
- [ ] Test 1: Parse Claude Code JSONL session → extract facts → verify types/counts
- [ ] Test 2: Parse OpenClaw JSON session → extract facts → verify types
- [ ] Test 3: Cross-file deduplication removes near-duplicates (Jaccard 0.7)
- [ ] Test 4: Parallel orchestrator processes N files with concurrency limit
- [ ] Test 5: CLI `resolveBootstrapPath` for both sources
- [ ] Test 6: Empty session file → graceful empty result
- [ ] Test 7: Malformed session file → skip with error, process rest
- [ ] Test 8-10: Additional edge cases
- [ ] Run: `npm run test` — all bootstrap tests pass
- [ ] Verify: No regressions

### Part 2: Dashboard Timeline Component (1 hour)

#### File: `/Users/cortex-air/Tools/engram/dashboard/src/app/components/VersionTimeline.tsx`

- [ ] Create: React component file
- [ ] Implement: Props interface with `factId` and `versions` array
- [ ] Implement: Vertical timeline rendering
- [ ] Implement: Newest-first ordering
- [ ] Implement: Change type badges with color coding
- [ ] Implement: Timestamp and changedBy display
- [ ] Implement: Expandable detail view for full content
- [ ] Implement: Content diff preview
- [ ] Add: Color scheme (update=blue, rollback=amber, archive=gray)
- [ ] Add: Responsive layout using Tailwind

#### Integration
- [ ] Integrate: Add to main dashboard page as detail panel
- [ ] Reference: `/Users/cortex-air/Tools/engram/dashboard/src/app/page.tsx`
- [ ] Test: Component renders without errors
- [ ] Test: Data flows from `memory_history` tool
- [ ] Test: Expandable details work

### Part 3: Filesystem Mirror E2E Tests (2 hours)

#### File: `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-filesystem-mirror.test.ts`

- [ ] Create: New test file
- [ ] Reference: `e2e-reflection-pipeline.test.ts` pattern
- [ ] Test 1: Vault export: fact → markdown with YAML frontmatter
- [ ] Test 2: Vault import: markdown file → fact in Convex
- [ ] Test 3: Round-trip: export → edit file → reconcile → verify DB updated
- [ ] Test 4: Conflict detection: concurrent edit → conflict file generated
- [ ] Test 5: File watcher: chokidar event → reconciliation triggered
- [ ] Test 6: Git auto-init: empty vault dir → `.git` created
- [ ] Test 7: Git auto-commit: after sync → commit with N facts in message
- [ ] Test 8: Git status query: agent queries recent commits (uses new tool)
- [ ] Test 9: Sync status query: agent gets daemon state (uses new tool)
- [ ] Test 10: Manual sync trigger: agent calls sync via tool (uses new tool)
- [ ] Test 11: YAML frontmatter fields: all round-trip correctly
- [ ] Test 12: Watcher lag: chokidar delay measured (< 30s)
- [ ] Run: `npm run test` — all filesystem tests pass
- [ ] Verify: No regressions

### Part 4: Final Verification (As you complete each part)

#### Per-Part Tests
- [ ] Each part: Run `npm run test` after implementation
- [ ] Each part: Verify no regressions
- [ ] Each part: Check TypeScript compilation
- [ ] Each part: Check linting

#### Full Test Suite
- [ ] All 1168 existing tests pass
- [ ] All new tests pass
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] System prompt documents all tools

---

## Final Acceptance Criteria

### Phase 1 Acceptance
- [ ] `vault-git.ts` tools created (4 functions)
- [ ] `vault-sync-status.ts` tools created (2 functions)
- [ ] Both registered in `vault-entries.ts`
- [ ] `VaultSyncDaemon` has public getters
- [ ] All 1168 existing tests pass
- [ ] No regressions in vault operations
- [ ] System prompt includes 6 new tools

### Phase 2 Acceptance
- [ ] Bootstrap e2e tests: 10+ test cases passing
- [ ] Dashboard timeline: Component renders correctly
- [ ] Filesystem mirror tests: 12+ test cases passing
- [ ] All tests passing (including new ones)
- [ ] No regressions
- [ ] System prompt documents all 79 tools (73 existing + 6 new)

### Overall Acceptance
- [ ] All 8 beads marked as closed
- [ ] 100% agent-native compliance verified
- [ ] Action parity: 7/7 capabilities
- [ ] Context parity: Agents see all daemon state
- [ ] No technical debt
- [ ] Code review passed
- [ ] Documentation updated

---

## Sign-Off Checklist

### Technical Lead Sign-Off
- [ ] Code reviewed for quality
- [ ] Architecture aligns with agent-native principles
- [ ] No security issues identified
- [ ] Performance is acceptable
- [ ] Tests are comprehensive

### Project Manager Sign-Off
- [ ] All 8 beads closed
- [ ] Timeline met (11 hours or better)
- [ ] Budget ok
- [ ] Stakeholders informed
- [ ] Next steps planned

### Team Sign-Off
- [ ] All team members understand the changes
- [ ] Documentation is clear
- [ ] Onboarding ready for new team members
- [ ] No surprises in code review

---

## Rollback Plan (If Needed)

If Phase 1 or Phase 2 hits blocking issues:

### For Phase 1 Issues:
1. [ ] Git revert to clean state
2. [ ] Document the issue
3. [ ] Decide: Fix or escalate
4. [ ] If escalate: Create new bead for blockers

### For Phase 2 Issues:
1. [ ] Git revert to clean Phase 1 state
2. [ ] Document the issue
3. [ ] Decide: Fix or escalate
4. [ ] If escalate: Can still close Phase 1, open new beads for Phase 2

### Prevention:
- [ ] Commit after each sub-task passes tests
- [ ] Regular pushes to feature branch
- [ ] No giant commits

---

## Timeline Tracking

### Phase 1 (6 hours target)
- [ ] Part 1 (vault-git.ts): Start ___, End ___, Actual: ___ hours
- [ ] Part 2 (vault-sync-status.ts): Start ___, End ___, Actual: ___ hours
- [ ] Part 3 (VaultSyncDaemon mods): Start ___, End ___, Actual: ___ hours
- [ ] Part 4 (Register tools): Start ___, End ___, Actual: ___ hours
- [ ] Part 5 (Testing): Start ___, End ___, Actual: ___ hours
- [ ] **Phase 1 Total**: Planned: 6 hours, Actual: ___ hours

### Phase 2 (5 hours target)
- [ ] Bootstrap tests: Start ___, End ___, Actual: ___ hours
- [ ] Dashboard component: Start ___, End ___, Actual: ___ hours
- [ ] Filesystem tests: Start ___, End ___, Actual: ___ hours
- [ ] Final verification: Start ___, End ___, Actual: ___ hours
- [ ] **Phase 2 Total**: Planned: 5 hours, Actual: ___ hours

### Grand Total
- [ ] **Overall**: Planned: 11 hours, Actual: ___ hours

---

## Notes & Comments

### Phase 1 Notes:
```
(Add notes as you work)




```

### Phase 2 Notes:
```
(Add notes as you work)




```

### Issues Encountered:
```
(Document any blockers or unexpected issues)




```

---

**Document Created:** 2026-02-25
**For:** Implementing the agent-native review recommendations
**Status:** Ready to use
