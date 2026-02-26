# Security Implementation Checklist
## For: Feat - Complete Remaining Letta Context Repository Beads (engram-1vt, engram-wxn, engram-7eb)

**Status**: MUST COMPLETE BEFORE MERGE
**Priority**: CRITICAL
**Estimated Effort**: 16 hours across 2-3 engineers
**Timeline**: 2-3 days

---

## PHASE 1: CRITICAL FIXES (Must complete first)

### 1. Shell Injection in Git Auto-Commit ⚠️ CRITICAL

**File**: `mcp-server/src/lib/vault-git.ts` (to be created)

- [ ] Install `simple-git` package: `npm install simple-git`
- [ ] Implement `ensureGitRepo()` using `simple-git.init()`
- [ ] Implement `autoCommitChanges()` using `simple-git.commit()` with message string (NOT shell)
- [ ] Implement `getLastSyncCommit()` using `simple-git.log()` with grep
- [ ] Verify NO use of `execSync`, `exec`, or shell-based execution
- [ ] Add security test: verify spawn is used (check /proc or mock spawn)
- [ ] Add security test: test with malicious commit count (e.g., `"; echo hacked #"`)
- [ ] Code review: 2 engineers sign-off

**Reference**: `/Users/cortex-air/Tools/engram/docs/SECURITY-FIXES-EXAMPLES.md` (FIX #1)

### 2. YAML Prototype Pollution in Frontmatter Parser ⚠️ CRITICAL

**File**: `mcp-server/src/lib/vault-format.ts` (lines 60-76)

- [ ] Update `parseFrontmatter()` to use `yaml.load(match[1], { schema: yaml.SAFE_SCHEMA })`
  - OR use `yaml.safeLoad()` if available in js-yaml 4.1.1
- [ ] Add `sanitizeFrontmatter()` function to block `__proto__`, `constructor`, `prototype` keys
- [ ] Add whitelisting of allowed YAML keys (optional, for defense in depth)
- [ ] Add try/catch around YAML parsing; return empty object on error
- [ ] Add security test: attempt to pollute prototype with `__proto__` key
- [ ] Add security test: attempt JavaScript code execution via YAML tags
- [ ] Verify test suite: all existing vault-format tests still pass
- [ ] Code review: 2 engineers sign-off

**Reference**: `/Users/cortex-air/Tools/engram/docs/SECURITY-FIXES-EXAMPLES.md` (FIX #2)

### 3. File Permission Hardening ⚠️ CRITICAL

**File**: `mcp-server/src/lib/vault-writer.ts` (all write operations)

- [ ] After `fs.writeFile(tmpPath, ...)`, add `await fs.chmod(tmpPath, 0o600)`
- [ ] After `fs.rename()`, verify file still has 0o600 permissions
- [ ] Update `readVaultFile()` to check file permissions are 0o600; warn if not
- [ ] Add security test: verify files created with 0o600 (owner read/write only)
- [ ] Add security test: verify files NOT readable by group/other
- [ ] Document in comments why 0o600 is critical
- [ ] Code review: 1 engineer sign-off

**Reference**: `/Users/cortex-air/Tools/engram/docs/SECURITY-FIXES-EXAMPLES.md` (FIX #3)

### 4. Input Validation in Bootstrap Scripts ⚠️ CRITICAL

**File**: `scripts/bootstrap-from-sessions.ts`

- [ ] Add `validateInteger(value, min, max, paramName)` helper
- [ ] Validate `--limit` parameter: 1 ≤ limit ≤ 100,000
- [ ] Add directory path validation in `findSessionFiles(dir)`:
  - Use `path.resolve()` to normalize
  - Use `realpath()` to resolve symlinks
  - Verify resolved path doesn't escape base directory
  - Return error if directory not readable
- [ ] Add file size limit: reject files > 50MB
- [ ] Add file count limit: max 10,000 files per scan
- [ ] Add security test: attempt path traversal (`../../../etc`)
- [ ] Add security test: attempt to exceed file size limit
- [ ] Add security test: attempt to process > 10k files
- [ ] Code review: 1 engineer sign-off

**File**: `scripts/bootstrap-parallel.ts`

- [ ] Add `validateGlobPattern(pattern)` helper
- [ ] Reject glob patterns with dangerous chars: `;`, `|`, `` ` ``, `$`, `(`, `)`
- [ ] Reject glob patterns with `..` (path traversal)
- [ ] Validate `--concurrency` parameter: 1 ≤ concurrency ≤ 32
- [ ] Add max files limit: error if glob matches > 10,000 files
- [ ] Add per-file size limit: skip files > 50MB
- [ ] Add security test: attempt command injection in glob pattern
- [ ] Add security test: attempt to trigger memory exhaustion
- [ ] Code review: 1 engineer sign-off

**Reference**: `/Users/cortex-air/Tools/engram/docs/SECURITY-FIXES-EXAMPLES.md` (FIX #4)

---

## PHASE 2: HIGH-PRIORITY FIXES (Can follow up if needed, but should include in Phase 1 if time allows)

### 5. Dashboard Access Control 🔴 HIGH

**File**: `dashboard/src/app/api/facts/[factId]/versions/route.ts` (to be created)

- [ ] Add session/auth check at start of GET handler
- [ ] Return 401 if no authenticated user
- [ ] Fetch fact from database to verify it exists
- [ ] Verify `fact.scopeId == "private-${userId}"`
- [ ] Return 403 Forbidden if scope doesn't match
- [ ] Return 404 if fact doesn't exist (not in user's scope)
- [ ] Only fetch versions AFTER access verified
- [ ] Add security test: attempt to access fact from different user's scope
- [ ] Add security test: verify 403 returned (not 200 or 404)
- [ ] Code review: 1 engineer sign-off

**File**: `dashboard/src/app/components/VersionTimeline.tsx` (to be created)

- [ ] Add useSession() hook to verify authentication
- [ ] Display error message if not authenticated
- [ ] Call `/api/facts/{factId}/versions` endpoint
- [ ] Handle 403/401 errors explicitly
- [ ] Add CSRF token header to fetch request
- [ ] Test component rendering without data

**Reference**: `/Users/cortex-air/Tools/engram/docs/SECURITY-FIXES-EXAMPLES.md` (FIX #5)

### 6. Encryption at Rest (Optional for Phase 1, High priority for Phase 2) 🟡 HIGH

**File**: `mcp-server/src/lib/vault-writer.ts` (enhancement)

- [ ] Add `VaultEncryption` interface with `enabled` and `key` properties
- [ ] Implement `writeEncryptedFile(filePath, content, key)` using AES-256-GCM
- [ ] Implement `readEncryptedFile(filePath, key)` with authentication tag verification
- [ ] Implement `deriveEncryptionKey(password, salt)` using PBKDF2
- [ ] Update `writeFactToVault()` to accept optional `encryption` parameter
- [ ] Add security test: encrypt/decrypt round-trip preserves content
- [ ] Add security test: authentication tag prevents tampering detection
- [ ] Add documentation: how to generate and store encryption key safely
- [ ] Code review: 2 engineers sign-off

**Reference**: `/Users/cortex-air/Tools/engram/docs/SECURITY-FIXES-EXAMPLES.md` (FIX #3)

---

## PHASE 3: TEST SUITE (Run after all code fixes)

### Security Test Suite Creation 🧪

**File**: `mcp-server/test/e2e-filesystem-mirror-security.test.ts` (to be created)

Core tests structure:
```typescript
describe("Filesystem Mirror Security", () => {
  describe("Shell Injection Prevention", () => { ... });
  describe("YAML Prototype Pollution Prevention", () => { ... });
  describe("File Permissions", () => { ... });
  describe("Input Validation", () => { ... });
  describe("Access Control", () => { ... });
});
```

- [ ] Copy test template from `/Users/cortex-air/Tools/engram/docs/SECURITY-FIXES-EXAMPLES.md`
- [ ] Implement shell injection test: verify spawn used, not exec
- [ ] Implement YAML pollution test: verify __proto__ rejected
- [ ] Implement YAML code execution test: verify no !!javascript tags executed
- [ ] Implement file permission test: verify 0o600 after write
- [ ] Implement path traversal test: verify `../../../` rejected
- [ ] Implement integer overflow test: validate min/max bounds
- [ ] Implement glob injection test: verify dangerous chars rejected
- [ ] Implement access control test: verify scope checked before returning data
- [ ] Run full test suite: `npm test`
- [ ] Verify no regressions in existing tests
- [ ] Code review: 1 engineer sign-off

---

## PHASE 4: DOCUMENTATION & DEPLOYMENT

### Documentation Updates 📝

**File**: `docs/CLAUDE.md` (add security section)

- [ ] Add "Vault Security Requirements" section
- [ ] Document file encryption expectations
- [ ] Document file permission requirements (0o600)
- [ ] Document git security (no shell execution, signed commits)
- [ ] Document YAML safety (safeLoad, sanitization)
- [ ] Document input validation rules
- [ ] Document sensitive content handling

**File**: `docs/SECURITY-BEST-PRACTICES.md` (create new)

- [ ] Document vault deployment checklist
- [ ] Explain why vault should NOT be in cloud sync
- [ ] Explain how to store encryption keys securely
- [ ] Document how to rotate encryption keys
- [ ] Explain file permission implications
- [ ] Document git security practices
- [ ] Include troubleshooting section

**File**: Update main `README.md`

- [ ] Add security notice: "Vault files contain sensitive data. See SECURITY-BEST-PRACTICES.md"

### Deployment Verification ✅

- [ ] All critical tests passing
- [ ] All high-priority tests passing
- [ ] No new security warnings from `npm audit`
- [ ] Code review sign-offs from 2+ engineers
- [ ] Security team approval
- [ ] Documentation complete and reviewed

---

## VERIFICATION CHECKLIST

### Before Creating PR

- [ ] All PHASE 1 items complete
- [ ] Security test suite passing
- [ ] Existing tests still passing
- [ ] No new console warnings/errors
- [ ] Code formatted and linted
- [ ] Commit messages clear and descriptive

### Code Review Requirements

**Primary Reviewer**: Must have security background
**Secondary Reviewer**: Original author cannot review own changes

Reviewers must verify:
- [ ] No `execSync`, `exec`, or shell-based code execution
- [ ] YAML parsing uses safe mode with sanitization
- [ ] All file writes have `fs.chmod(0o600)`
- [ ] All user input validated with bounds checking
- [ ] Dashboard backend checks scope ownership
- [ ] All tests passing
- [ ] Documentation accurate and complete

### Testing Requirements

Run before merge:
```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run security tests specifically
npm test -- e2e-filesystem-mirror-security

# Run vault format tests
npm test -- vault-format

# Run bootstrap tests
npm test -- bootstrap

# Check for vulnerabilities
npm audit

# Type check
npm run typecheck
```

---

## SIGN-OFF MATRIX

| Phase | Task | Owner | Status | Date |
|-------|------|-------|--------|------|
| 1 | Shell injection fix | Engineer A | [ ] | [ ] |
| 1 | YAML security fix | Engineer B | [ ] | [ ] |
| 1 | File permissions | Engineer A | [ ] | [ ] |
| 1 | Input validation | Engineer B | [ ] | [ ] |
| 2 | Dashboard access control | Engineer A | [ ] | [ ] |
| 2 | Encryption (optional) | Engineer C | [ ] | [ ] |
| 3 | Test suite creation | Engineer B | [ ] | [ ] |
| 4 | Documentation | Engineer A | [ ] | [ ] |
| 4 | Security team approval | Security Lead | [ ] | [ ] |

---

## ESTIMATED TIMELINE

| Phase | Duration | Engineers | Notes |
|-------|----------|-----------|-------|
| 1 (Critical) | 2 days | 2 | Blocking issues, must complete |
| 2 (High) | 2 days | 2-3 | Can partially overlap with Phase 1 |
| 3 (Tests) | 1 day | 1-2 | Run after code fixes |
| 4 (Docs) | 0.5 days | 1 | Can run in parallel with testing |
| Review & Deploy | 1 day | 1-2 | Final verification |
| **TOTAL** | **5-6 days** | **2-3** | Full security hardening |

---

## RESOURCES

**Documentation**:
- Full audit: `/Users/cortex-air/Tools/engram/docs/security-audit-2026-02-25.md`
- Summary: `/Users/cortex-air/Tools/engram/docs/SECURITY-SUMMARY.md`
- Code examples: `/Users/cortex-air/Tools/engram/docs/SECURITY-FIXES-EXAMPLES.md`

**External References**:
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Node.js Security Cheatsheet: https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html
- CWE-78 (Command Injection): https://cwe.mitre.org/data/definitions/78.html
- CWE-1025 (Prototype Pollution): https://cwe.mitre.org/data/definitions/1025.html

**Libraries**:
- `simple-git`: Safe git CLI wrapper (https://github.com/steelbob/simple-git)
- `js-yaml`: YAML parser with safe mode (v4.1.1)

---

## NOTES

1. **Security is not optional** — These are blocker issues that MUST be fixed before any merge
2. **Code review is critical** — Every fix must be reviewed by engineer with security background
3. **Testing is mandatory** — No feature ships without security test coverage
4. **Documentation matters** — Users need to understand how to deploy securely
5. **Timeline is aggressive but achievable** — 16 hours of focused work across 2-3 engineers

---

**Audit Date**: 2026-02-25
**Plan**: feat(bootstrap+tests): Complete Remaining Letta Context Repository Beads
**Status**: REQUIRES FIXES BEFORE MERGE
**Next Review**: After Phase 1 completion
