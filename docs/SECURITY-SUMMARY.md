# SECURITY AUDIT SUMMARY
## Plan: Complete Remaining Letta Context Repository Beads
### Date: 2026-02-25 | Risk Level: HIGH

---

## CRITICAL VULNERABILITIES (Must Fix)

### 1. Shell Injection in Git Auto-Commit (CVSS 9.8)
**File**: Proposed `vault-git.ts`
**Problem**: Using shell execution for git commands allows metacharacter injection
**Fix**: Use `spawn()` with array arguments, never shell interpolation
```javascript
// WRONG
execSync(`git commit -m "[engram] Sync ${count} facts"`);

// RIGHT
spawn("git", ["commit", "-m", `[engram] Sync ${count} facts`]);
```

### 2. YAML Prototype Pollution (CVSS 9.1)
**File**: `mcp-server/src/lib/vault-format.ts:66`
**Problem**: `yaml.load()` without safe options allows prototype pollution & code execution
**Attack**: Malicious YAML in vault file pollutes global prototypes or executes code
**Fix**: Use `yaml.safeLoad()` or add safe schema + sanitize
```typescript
// WRONG
const frontmatterValue = yaml.load(match[1]);

// RIGHT
const frontmatterValue = yaml.load(match[1], { schema: "safe" });
// Then sanitize to remove __proto__, constructor, prototype keys
```

### 3. Plaintext Secrets in Vault (CVSS 7.5)
**File**: `mcp-server/src/lib/vault-writer.ts`
**Problem**: Facts containing API keys/passwords written to plaintext files with `0644` permissions (world-readable)
**Risk**:
  - Local privilege escalation: any user can read secrets
  - Cloud sync exposure: iCloud/Dropbox backups leak data
  - Git history: secrets in plaintext in `.git/objects` forever
**Fix**:
  1. Encrypt files with AES-256-GCM
  2. Restrict permissions to `0600` (owner only)
  3. Detect & mask sensitive content before export
  4. Document that vault should NOT be in cloud sync

---

## HIGH VULNERABILITIES

### 4. No Input Validation in Bootstrap (CVSS 7.2)
**Files**: `scripts/bootstrap-*.ts`
**Problems**:
  - No path validation: `sessionsDir` argument unchecked (path traversal)
  - No size limit: 1GB file loads entirely into memory (DoS)
  - No bounds: `--limit` parameter unparsed; accepts invalid values
  - Glob injection: pattern not validated for suspicious characters
**Fixes**:
  - Validate paths with `path.resolve()` and `realpath()`
  - Add max file size (50MB), max file count (10,000)
  - Validate integers: 1 ≤ limit ≤ 100,000; 1 ≤ concurrency ≤ 32
  - Reject glob patterns with suspicious chars: `;`, `|`, `` ` ``, `$`, `(`, `)`

### 5. Missing Access Control in Dashboard (CVSS 5.4)
**File**: Proposed `VersionTimeline.tsx`
**Problem**: Component will fetch fact versions without verifying user owns the fact
**Fix**: Add backend access check: verify `fact.scopeId == private-{userId}`

---

## OWASP TOP 10 STATUS

| Category | Status | Notes |
|----------|--------|-------|
| A01: Broken Access Control | ⚠️ FAIL | No access checks; world-readable files |
| A02: Cryptographic Failure | ⚠️ FAIL | No encryption; secrets in plaintext & git |
| A03: Injection | ⚠️ FAIL | Shell injection (git); YAML injection |
| A04: Insecure Design | ⚠️ FAIL | No encryption by design; no input validation |
| A05: Misconfiguration | ⚠️ FAIL | File permissions default to world-readable |
| A06: Vulnerable Components | ✅ PASS | js-yaml 4.1.1 is current |
| A07: Auth Failures | ✅ PASS | Handled by Convex |
| A08: Data Integrity | ⚠️ PARTIAL | Git commits not signed |
| A09: Logging | ⚠️ PARTIAL | Minimal audit trail |
| A10: SSRF | ✅ PASS | Local filesystem only |

**Score: 3/10 PASSING** — Multiple critical issues in scope.

---

## QUICK FIX CHECKLIST

### Before Any Code Review:
- [ ] Replace all `exec/execSync` with `spawn()` using array args
- [ ] Update `vault-format.ts` to use `yaml.safeLoad()` with sanitization
- [ ] Add `await fs.chmod(filePath, 0o600)` after all vault writes
- [ ] Validate `--limit`, `--concurrency`, paths, glob patterns in bootstrap scripts
- [ ] Verify dashboard backend checks user can access fact (scope ownership)

### Before Tests Pass:
- [ ] Add security tests for shell injection (verify no exec)
- [ ] Add YAML prototype pollution tests
- [ ] Test file permissions: verify `0600` after write
- [ ] Test input validation: path traversal, integer overflow, suspicious globs
- [ ] Test sensitive content detection (API key patterns)

### Before Merge:
- [ ] Code review by security-trained engineer
- [ ] All security tests passing
- [ ] Documentation: "Vault Security Best Practices"
- [ ] Team briefing on secure vault deployment

---

## FILES TO MODIFY

**Existing Files**:
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-format.ts` — Safe YAML parsing
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-writer.ts` — File encryption + permissions
- `/Users/cortex-air/Tools/engram/scripts/bootstrap-from-sessions.ts` — Input validation
- `/Users/cortex-air/Tools/engram/scripts/bootstrap-parallel.ts` — Input validation

**Files to Create**:
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/vault-git.ts` — Use `simple-git`, not shell
- `/Users/cortex-air/Tools/engram/dashboard/src/app/components/VersionTimeline.tsx` — Add access control check
- `/Users/cortex-air/Tools/engram/mcp-server/test/e2e-filesystem-mirror-security.test.ts` — Security tests

---

## ESTIMATED EFFORT

| Fix | Complexity | Hours |
|-----|-----------|-------|
| Shell injection (spawn library) | Easy | 2 |
| YAML safe parsing + sanitization | Easy | 2 |
| File encryption (AES-256-GCM) | Medium | 4 |
| Input validation (all scripts) | Easy | 3 |
| Dashboard access control | Easy | 1 |
| Security test suite | Medium | 4 |
| **TOTAL** | | **16 hours** |

**Timeline**: 2-3 days with 1-2 engineers

---

## DEPLOYMENT CHECKLIST

After fixes are merged, users deploying vault must:
- [ ] Store encryption key securely (not in git, not in environment)
- [ ] Set vault directory permissions: `chmod 700 ~/engram-vault`
- [ ] Configure vault NOT in cloud sync (iCloud, Dropbox, OneDrive)
- [ ] If using git: ensure repo is NOT public
- [ ] Consider full-disk encryption (FileVault on macOS, BitLocker on Windows)
- [ ] Test encryption key rotation procedure
- [ ] Document how to rotate encryption keys in team wiki

---

**For detailed analysis, see**: `/Users/cortex-air/Tools/engram/docs/security-audit-2026-02-25.md`
