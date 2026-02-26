# Quick Reference: Design Patterns Analysis
## Letta Beads Plan (2026-02-25)

---

## ✅ What's Good

| Item | Status | Details |
|------|--------|---------|
| **vault-git.ts pattern** | ✅ Consistent | Follows vault-writer.ts structure (interface + async functions) |
| **E2E test structure** | ✅ Matches existing | Explicitly references e2e-reflection-pipeline.test.ts pattern |
| **No boundary violations** | ✅ Clean | All changes stay within MCP/daemon layer |
| **VersionTimeline component** | ✅ Good spec | Follows page.tsx conventions (Tailwind, Lucide, hooks) |

---

## ⚠️ What Needs Fixing (Priority 1)

### 1. vault-git.ts Missing Error Types
**File:** Plan mentions vault-git.ts but doesn't specify error handling

**Current (Bad):**
```typescript
async function autoCommitChanges(): Promise<{ committed: boolean; sha?: string }>
// Caller can't tell: no changes? git missing? permission denied?
```

**Fix:**
```typescript
async function autoCommitChanges(): Promise<{
  committed: boolean;
  sha?: string;
  reason?: "no_changes" | "git_not_found" | "permission_denied" | string;
}>
```

**Impact:** Without this, error handling is fragile

---

### 2. Git Module Coupling Unclear
**File:** VaultSyncDaemon integration point not specified

**Problem:** If `autoCommit` is optional via config, daemon has branching logic:
```typescript
// ❌ COUPLES daemon to git knowledge
if (this.autoCommit) await vault.git.commit(...);
```

**Solution:** Use dependency injection:
```typescript
// ✅ ISOLATES git as optional dependency
class VaultSyncDaemon {
  constructor(options: VaultSyncOptions, gitModule?: VaultGit) { ... }
  async syncOnce() {
    if (this.gitModule) await this.gitModule.autoCommit();
  }
}
```

**Impact:** Prevents "god object" anti-pattern in daemon

---

### 3. Dashboard Integration Vague
**File:** VersionTimeline.tsx spec incomplete

**Missing:**
- How is fact selected? (click event?)
- Modal or drawer or inline panel?
- Who fetches version data?
- What are exact Tailwind color classes?

**Action:** Add to implementation plan:
```typescript
// page.tsx modifications:
const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
if (selectedFactId) {
  <VersionTimeline factId={selectedFactId} />
}
```

**Impact:** Without clarification, component won't integrate correctly

---

## 🔧 What Could Be Better (Priority 2)

### 1. Create Test Fixtures Module
**Issue:** 4 test files duplicate makeFact(), makeSession()

**Fix:**
- Create: `mcp-server/test/fixtures/bootstrap-facts.ts`
- Export: makeFact(), makeVaultFact(), makeSession()
- Benefit: 50% less boilerplate

---

### 2. Add Vault Unit Tests
**Issue:** vault-format.ts, vault-writer.ts, vault-reconciler.ts have zero unit tests

**Fix:**
- Create: `mcp-server/test/vault-modules.test.ts`
- Test: Each vault module's error cases in isolation
- Benefit: Errors caught early, not just in e2e

**Existing files to test:**
- vault-format: generateFrontmatter, parseFrontmatter, generateFilename
- vault-writer: writeFactToVault, readVaultFile, listVaultMarkdownFiles
- vault-reconciler: mergeHumanEdits, detectConflicts, writeConflictFile

---

### 3. Consolidate Overlapping E2E Tests
**Issue:** bootstrap tests + filesystem tests both verify fact export

**Fix:**
- Keep bootstrap tests as-is (fact extraction focus)
- Scope filesystem tests to: round-trip, conflict, watcher, git only
- Reference bootstrap tests in comments

---

## 📊 Pattern Consistency Scorecard

| Aspect | Score | Gap |
|--------|-------|-----|
| Module structure | 85% | vault-git.ts missing error enum |
| Test patterns | 90% | E2E structure good; unit tests absent |
| Component design | 85% | VersionTimeline spec incomplete |
| Naming conventions | 95% | Minor inconsistency in bootstrap modules |
| Architecture | 90% | No violations; coupling needs attention |
| **Overall** | **85%** | Executable; fix Priority 1 items first |

---

## 🚀 Implementation Order

1. **First:** Address Priority 1 (error types, git coupling, dashboard integration)
2. **Second:** Create shared test fixtures module
3. **Third:** Add vault unit tests
4. **Fourth:** Implement workstreams in parallel (bootstrap tests, dashboard, git module)

---

## 📝 Files to Create/Modify

### New Files
- `mcp-server/src/lib/vault-git.ts` — Git integration module
- `mcp-server/test/e2e-bootstrap-pipeline.test.ts` — Bootstrap e2e tests
- `mcp-server/test/e2e-filesystem-mirror.test.ts` — Vault/git e2e tests
- `dashboard/src/app/components/VersionTimeline.tsx` — Timeline component
- `mcp-server/test/fixtures/bootstrap-facts.ts` — **RECOMMENDED: Shared test fixtures**
- `mcp-server/test/vault-modules.test.ts` — **RECOMMENDED: Unit tests for vault modules**

### Modified Files
- `mcp-server/src/daemons/vault-sync.ts` — Add git integration (with dependency injection)
- `dashboard/src/app/page.tsx` — Add fact selection + VersionTimeline panel

---

## 🎯 Key Findings

**What works well:**
1. vault-git.ts follows vault-writer.ts pattern perfectly
2. E2E test structure explicitly mirrors existing e2e-reflection-pipeline.test.ts
3. No architectural boundaries crossed
4. Three workstreams are properly isolated

**What's risky:**
1. Git error handling not explicit (what if git command fails?)
2. VaultSyncDaemon could become god object without proper isolation
3. VersionTimeline integration point not specified
4. Vault modules lack unit-level test coverage

**What's duplicated:**
1. Test fixtures (makeFact, makeSession) repeated 4 times
2. Fact export testing overlaps between bootstrap and filesystem tests
3. Three-way merge validation could be more isolated

---

## ✨ Before You Code

**Checklist:**

- [ ] Add error type to vault-git.ts (reason field)
- [ ] Document git module as optional dependency (not config)
- [ ] Complete VersionTimeline integration spec (click → select → render)
- [ ] Create test fixtures module to share across tests
- [ ] Plan vault unit tests for error cases

**Once complete, all three workstreams can proceed in parallel.**

---

**Last Updated:** 2026-02-25
**Confidence Level:** HIGH (analysis based on direct codebase inspection)
**Recommendation:** Implement with Priority 1 fixes
