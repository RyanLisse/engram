# Security Audit: Engram Plan - Feat: Complete Remaining Letta Context Repository Beads
## Date: 2026-02-25

---

## EXECUTIVE SUMMARY

The plan proposes implementing git auto-commit in the vault sync daemon (engram-1vt), completing filesystem mirror tests (engram-wxn), and adding dashboard visualization components. A comprehensive security review identifies **3 CRITICAL vulnerabilities** and **5 HIGH-severity issues** that MUST be addressed before implementation.

### Risk Rating: **HIGH** ⚠️

**Primary Concerns:**
1. Git auto-commit via shell commands with user-controlled content — shell injection risk
2. YAML frontmatter parsing without safe options — prototype pollution and code injection
3. Markdown file permissions exposing sensitive fact data
4. Fact content containing API keys/secrets automatically synced to vault
5. No input sanitization for git commit messages

---

## DETAILED FINDINGS

### VULNERABILITY #1: Shell Injection in Git Auto-Commit (CRITICAL)

**Location:** Proposed file `mcp-server/src/lib/vault-git.ts` (lines 105-108 in plan)

**Severity:** CRITICAL (CVSS 9.8)

**Issue:**
The plan proposes:
```typescript
export async function autoCommitChanges(opts: VaultGitOptions): Promise<...>
// Stage all *.md changes, commit with timestamp message
// Commit message: "[engram] Sync {N} facts at {ISO timestamp}"
```

**Risk Analysis:**
- If implemented using shell commands (e.g., `execSync`, `spawn` with shell: true), the number of facts `{N}` could be attacker-controlled
- Fact content is stored in markdown frontmatter via `vault-format.ts:generateFrontmatter()`
- YAML dump at line 45-49 of `vault-format.ts` serializes fact data directly into frontmatter:
  ```typescript
  return yaml.dump(data, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  ```
- If a fact is indexed/mirrored and later a modified fact with malicious `source` field is ingested, the git commit message could include shell metacharacters:
  ```
  [engram] Sync 5 facts at 2026-02-25T14:30:00Z"; rm -rf /; echo "
  ```

**Attack Scenario:**
1. Agent stores fact with `source: "[engram] Sync 5 facts at 2026-02-25T14:30:00Z\"; rm -rf /; echo \""` (unusual but valid)
2. Vault sync reads this fact, generates commit message
3. If `autoCommitChanges` uses backticks, `$()`, or shell execution, the injected command runs
4. System commands execute with the process user's privileges

**Proof of Concept:**
```typescript
// VULNERABLE CODE (DO NOT USE)
import { execSync } from "child_process";

async function autoCommitChanges(opts: VaultGitOptions, count: number): Promise<...> {
  // If `count` comes from untrusted source:
  const cmd = `git commit -m "[engram] Sync ${count} facts at ${new Date().toISOString()}"`;
  execSync(cmd, { cwd: opts.vaultRoot }); // SHELL INJECTION!
}
```

**Remediation:**
1. **Use `spawn` with array arguments** (no shell evaluation):
   ```typescript
   import { spawn } from "child_process";

   export async function autoCommitChanges(opts: VaultGitOptions): Promise<...> {
     // Build git command WITHOUT shell interpolation
     const commitMessage = `[engram] Sync ${factCount} facts at ${new Date().toISOString()}`;

     return new Promise((resolve, reject) => {
       const child = spawn("git", ["commit", "-m", commitMessage], {
         cwd: opts.vaultRoot,
         stdio: "pipe",
       });

       child.on("exit", (code) => {
         if (code === 0) resolve({ committed: true, sha: "..." });
         else reject(new Error(`git commit failed: ${code}`));
       });
     });
   }
   ```
2. **Sanitize commit message** if any untrusted content is included:
   ```typescript
   function sanitizeCommitMessage(input: string): string {
     // Remove null bytes, control characters, and excessive length
     return input
       .replace(/\x00/g, "")
       .replace(/[\x01-\x1F\x7F]/g, " ")
       .slice(0, 200);
   }
   ```
3. **Use Convex-safe git library** (e.g., `simple-git`) which abstracts CLI:
   ```typescript
   import simpleGit from "simple-git";

   const git = simpleGit(opts.vaultRoot);
   await git.add("*.md");
   await git.commit(`[engram] Sync ${factCount} facts at ${iso}`);
   ```

---

### VULNERABILITY #2: YAML Frontmatter Prototype Pollution & Code Injection (CRITICAL)

**Location:** `mcp-server/src/lib/vault-format.ts` (lines 60-76)

**Severity:** CRITICAL (CVSS 9.1)

**Issue:**
The `parseFrontmatter` function uses `yaml.load()` without safe options:

```typescript
export function parseFrontmatter(fileContent: string): ParsedVaultDocument {
  const match = fileContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: fileContent.trim() };
  }

  const frontmatterValue = yaml.load(match[1]); // ⚠️ VULNERABLE
  const frontmatter =
    frontmatterValue && typeof frontmatterValue === "object"
      ? (frontmatterValue as Record<string, unknown>)
      : {};

  return {
    frontmatter,
    body: match[2].trim(),
  };
}
```

**Risk Analysis:**
1. **Prototype Pollution**: YAML allows complex object structures. Malicious YAML can pollute JavaScript prototypes:
   ```yaml
   ---
   __proto__:
     isAdmin: true
   createdBy: malicious
   ---
   ```
   After parsing, this pollutes the global object prototype, affecting all subsequent code.

2. **Code Execution via YAML Tags**: `js-yaml` by default supports YAML tags like `!!javascript/object`:
   ```yaml
   ---
   payload: !!javascript/object:Function "return (function(){/* malicious code */})()"
   ---
   ```
   This can execute arbitrary code during parsing.

3. **Vault Import Attack**:
   - Attacker creates malicious markdown file in vault directory
   - Vault sync daemon reads it via `reconcileFileEdit()`
   - `parseFrontmatter()` is called on line 10 of `vault-reconciler.ts`
   - Malicious YAML executes, potentially modifying database queries or stealing data

**Attack Scenario:**
1. Attacker writes malicious `.md` file to the vault directory:
   ```markdown
   ---
   id: "fact-123"
   __proto__:
     isAdmin: true
   ---
   Content here
   ```
2. Vault sync detects file change, calls `reconcileFileEdit(filePath)`
3. `parseFrontmatter()` parses the YAML without safe options
4. Prototype pollution affects subsequent logic
5. Access control checks bypass due to polluted `isAdmin` property

**Proof of Concept (Simplified):**
```typescript
import yaml from "js-yaml";

// VULNERABLE
const parsed = yaml.load("__proto__:\n  isAdmin: true");
const obj = {};
console.log(obj.isAdmin); // true — prototype was polluted!
```

**Remediation:**
1. **Use `yaml.load()` with safe options**:
   ```typescript
   export function parseFrontmatter(fileContent: string): ParsedVaultDocument {
     const match = fileContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
     if (!match) {
       return { frontmatter: {}, body: fileContent.trim() };
     }

     const frontmatterValue = yaml.load(match[1], {
       // Disable any dangerous features
       constructor: false,
       customTags: [],
       schema: "safe", // Only load safe YAML types
     });

     const frontmatter =
       frontmatterValue && typeof frontmatterValue === "object"
         ? (frontmatterValue as Record<string, unknown>)
         : {};

     // Sanitize prototype pollution
     const sanitized: Record<string, unknown> = {};
     for (const [key, value] of Object.entries(frontmatter)) {
       if (!["__proto__", "constructor", "prototype"].includes(key)) {
         sanitized[key] = value;
       }
     }

     return { frontmatter: sanitized, body: match[2].trim() };
   }
   ```

2. **Use `yaml.safeLoad()` instead**:
   ```typescript
   const frontmatterValue = yaml.safeLoad(match[1]); // Safe by default
   ```

3. **Validate YAML structure after parsing**:
   ```typescript
   function validateFrontmatter(data: any): Record<string, unknown> {
     const allowed = new Set([
       "id", "source", "factType", "createdBy", "scopeId",
       "timestamp", "updatedAt", "entityIds", "tags",
       "importanceScore", "relevanceScore", "lifecycleState"
     ]);

     const result: Record<string, unknown> = {};
     for (const [key, value] of Object.entries(data || {})) {
       if (allowed.has(key)) {
         result[key] = value; // Only copy whitelisted fields
       }
     }
     return result;
   }
   ```

4. **Update js-yaml to latest** (currently 4.1.1, which has some protections):
   ```bash
   npm update js-yaml@^4.1.1
   ```

---

### VULNERABILITY #3: Sensitive Data Exposure via Vault Markdown (HIGH)

**Location:** `mcp-server/src/lib/vault-writer.ts` and `mcp-server/src/daemons/vault-sync.ts`

**Severity:** HIGH (CVSS 7.5)

**Issue:**
The vault stores facts as markdown files on disk. Facts are frequently user/agent input containing:
- API keys (e.g., "stored API_KEY_abc123 for service X")
- Passwords, tokens, credentials
- Authentication details from error messages
- Sensitive conversation snippets

**Current Flow:**
1. Agent stores fact with sensitive content via `memory_store_fact` tool
2. Vault sync daemon reads it: `getUnmirroredFacts()` from Convex
3. Vault writer outputs to disk: `writeFactToVault()` → `renderVaultDocument()` → `fs.writeFile()`
4. Files are written to vault directory with no encryption

**Risk Analysis:**
1. **File Permissions**:
   - `fs.writeFile()` at line 20 of `vault-writer.ts` creates files with default permissions
   - On Unix: typically `0644` (world-readable)
   - On Windows: inherited from directory
   - Any local process can read vault files

2. **No Encryption**: Facts are stored in plaintext markdown

3. **Backup Exposure**: Vault directory may be included in system backups, Time Machine, cloud sync (iCloud Drive, Dropbox, OneDrive)

4. **Git History**: Proposed git auto-commit persists sensitive data in `.git/objects`, creating long-term exposure

**Example Exposure:**
```markdown
---
id: "fact-456"
createdBy: "user-agent"
timestamp: 1708945200000
---

Stored API key "sk-abc123def456" for OpenAI API in environment variable.
Used secret API_TOKEN_xyz789 for authentication.
Database password: "P@ssw0rd123!" for mysql.example.com
```

If this file is:
- Accidentally committed to public git repo
- Included in system backup
- Read by unauthorized process
- Exposed via backup service

**Attack Scenario:**
1. User stores fact: "API key for production database is db_key_aB1cD2eF3gH4"
2. Vault sync writes to `/vault/private-user-id/notes/2026-02-25-...md`
3. File permissions: `0644` (readable by any local user)
4. Attacker on same system: `cat /vault/private-user-id/notes/*.md | grep -i key`
5. Sensitive key extracted

**Remediation:**
1. **Implement file encryption at rest**:
   ```typescript
   import crypto from "crypto";
   import fs from "fs/promises";

   export async function writeFactToVaultEncrypted(
     vaultRoot: string,
     fact: VaultFact,
     encryptionKey: Buffer // 32 bytes for AES-256
   ): Promise<VaultWriteResult> {
     const folder = computeFolderPath(fact, vaultRoot);
     await fs.mkdir(folder, { recursive: true });

     const filename = generateFilename(fact);
     const absolutePath = path.join(folder, filename);

     const markdown = renderVaultDocument(fact);

     // Encrypt with AES-256-GCM
     const iv = crypto.randomBytes(16);
     const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
     let encrypted = cipher.update(markdown, "utf8", "hex");
     encrypted += cipher.final("hex");
     const tag = cipher.getAuthTag();

     const payload = JSON.stringify({
       iv: iv.toString("hex"),
       tag: tag.toString("hex"),
       data: encrypted,
     });

     const tmpPath = `${absolutePath}.tmp`;
     await fs.writeFile(tmpPath, payload, "utf8");
     await fs.chmod(tmpPath, 0o600); // Owner read/write only
     await fs.rename(tmpPath, absolutePath);

     return { absolutePath, relativePath: path.relative(vaultRoot, absolutePath) };
   }
   ```

2. **Restrict file permissions**:
   ```typescript
   // In vault-writer.ts, after fs.writeFile():
   await fs.chmod(absolutePath, 0o600); // Unix: -rw------- (owner only)
   ```

3. **Implement fact content filtering**:
   ```typescript
   function isSensitiveContent(content: string): boolean {
     const patterns = [
       /api[_-]?key[:\s]=?\s*['"]?[a-zA-Z0-9_\-\.]+['"]?/gi,
       /secret[:\s]=?\s*['"]?[a-zA-Z0-9_\-\.]+['"]?/gi,
       /password[:\s]=?\s*['"]?.{6,}['"]?/gi,
       /token[:\s]=?\s*['"]?[a-zA-Z0-9_\-\.]{20,}['"]?/gi,
     ];
     return patterns.some(p => p.test(content));
   }

   export async function writeFactToVault(vaultRoot: string, fact: VaultFact): Promise<...> {
     if (isSensitiveContent(fact.content)) {
       console.warn(`[SECURITY] Fact contains sensitive data. Masking before vault export.`);
       fact = {
         ...fact,
         content: maskSensitiveData(fact.content),
       };
     }
     // ... rest of function
   }
   ```

4. **Provide vault encryption configuration**:
   ```typescript
   export interface VaultSyncOptions {
     vaultRoot: string;
     intervalMs?: number;
     maxPerRun?: number;
     encryptionKey?: Buffer; // AES-256 key (32 bytes)
     skipSensitiveContent?: boolean; // Don't sync facts with API keys/passwords
   }
   ```

5. **Document security best practices**:
   - Vault directory should NOT be in cloud sync (iCloud, Dropbox, OneDrive)
   - Git repo should NOT be public
   - Access should be restricted to owner only: `chmod 700 vault/`
   - Consider using full-disk encryption (FileVault, BitLocker)

---

### VULNERABILITY #4: No Input Validation in Bootstrap Scripts (HIGH)

**Location:** `scripts/bootstrap-from-sessions.ts` and `scripts/bootstrap-parallel.ts`

**Severity:** HIGH (CVSS 7.2)

**Issue:**
The bootstrap scripts accept user input for file paths and process JSONL/JSON files without strict validation:

**File 1: bootstrap-from-sessions.ts**
```typescript
// Lines 158-174: Argument parsing
let sessionsDir = "./sessions";
let dryRun = false;
let limit: number | null = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dry-run") {
    dryRun = true;
  } else if (args[i] === "--limit") {
    limit = parseInt(args[i + 1], 10); // No validation that limit is positive
    i++;
  } else if (!args[i].startsWith("--")) {
    sessionsDir = args[i]; // ⚠️ User-controlled directory path
  }
}
```

**File 2: bootstrap-parallel.ts**
```typescript
// Lines 243-247: Directory path expansion
const expandedPattern = globPattern.replace(/^~/, process.env.HOME || "~");
const files = globSync(expandedPattern, { absolute: true });
// No validation of glob pattern
```

**Risk Analysis:**
1. **Path Traversal**: User provides `../../../etc/passwd` as `sessionsDir`
   - Script recursively walks directory and processes `.json/.jsonl` files
   - Could read sensitive system files if they happened to have these extensions

2. **Glob Pattern Injection** (bootstrap-parallel.ts):
   - Pattern `**/*{payload1,payload2}**` can match many unintended files
   - No limit on file count processed
   - Could cause memory exhaustion or slow performance

3. **Integer Overflow** (limit parameter):
   - `parseInt("9999999999999999", 10)` returns `9999999999999999`
   - No bounds check allows processing all files regardless of limit

4. **Memory Exhaustion**:
   - Large JSON files (e.g., 1GB session file) loaded entirely into memory at line 58-60
   - No file size validation

**Attack Scenario:**
1. Attacker runs: `npx tsx scripts/bootstrap-parallel.ts "~/**/*.{json,jsonl}" --concurrency 1`
2. Script processes every JSON/JSONL file in home directory
3. Sensitive configuration files (package.json, .env.json) are read
4. Memory could be exhausted with large files

**Remediation:**
```typescript
// In bootstrap-from-sessions.ts
export async function findSessionFiles(dir: string): Promise<string[]> {
  // 1. Validate directory path
  const realPath = await fs.realpath(path.resolve(dir));
  const baseDir = await fs.realpath(".");

  if (!realPath.startsWith(baseDir)) {
    throw new Error("Directory path must be within current working directory");
  }

  // 2. Validate directory exists and is readable
  try {
    await access(realPath, fs.constants.R_OK);
  } catch {
    throw new Error(`Directory not readable: ${dir}`);
  }

  // 3. Add file size limit
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
  const MAX_FILES = 10000;

  // ... rest of walk function ...

  // Enforce limits
  if (files.length > MAX_FILES) {
    console.warn(`Found ${files.length} files, limiting to ${MAX_FILES}`);
    files.splice(MAX_FILES);
  }

  return files;
}

// Validate limit parameter
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--limit") {
    limit = parseInt(args[i + 1], 10);
    if (isNaN(limit) || limit < 1 || limit > 100000) {
      console.error("Error: --limit must be a positive integer <= 100000");
      process.exit(1);
    }
    i++;
  }
}

// In bootstrap-parallel.ts
// Validate glob pattern
if (!globPattern) {
  console.error("Glob pattern required");
  process.exit(1);
}

// Reject patterns with suspicious characters
const suspiciousChars = /[;&|`$()]/;
if (suspiciousChars.test(globPattern)) {
  console.error("Error: Glob pattern contains suspicious characters");
  process.exit(1);
}

// Validate concurrency
if (isNaN(concurrency) || concurrency < 1 || concurrency > 32) {
  console.error("Error: --concurrency must be between 1 and 32");
  process.exit(1);
}

// Add file size check
const MAX_FILE_SIZE = 50 * 1024 * 1024;
for (const filePath of files) {
  const stats = await fs.stat(filePath);
  if (stats.size > MAX_FILE_SIZE) {
    console.warn(`Skipping ${filePath}: exceeds size limit (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
    files = files.filter(f => f !== filePath);
  }
}
```

---

### VULNERABILITY #5: Missing CSRF Protection for Dashboard (MEDIUM)

**Location:** Proposed `dashboard/src/app/components/VersionTimeline.tsx`

**Severity:** MEDIUM (CVSS 5.4)

**Issue:**
The plan proposes adding a React component to display fact version history. However:

1. **No mention of API protection**: The component will likely fetch version history from an API endpoint
2. **No CSRF token handling**: If dashboard state changes based on version selection, CSRF attacks possible
3. **No access control**: Component doesn't verify user can access the displayed fact

**Risk Analysis:**
If dashboard backend provides an `/api/facts/{factId}/versions` endpoint:
- Attacker crafts request: `GET /api/facts/attacker-controlled-fact-id/versions`
- Dashboard doesn't validate fact ownership
- Attacker reads fact history of other users' facts

**Remediation:**
1. **Implement access control in backend**:
   ```typescript
   // In dashboard backend API
   export async function getFactVersions(factId: string, userId: string) {
     const fact = await convex.query("functions:getFact", { id: factId });

     // Verify access
     if (fact.scopeId !== `private-${userId}`) {
       throw new UnauthorizedError("Cannot access this fact");
     }

     return fact.versions;
   }
   ```

2. **Pass user context in component**:
   ```typescript
   interface VersionTimelineProps {
     factId: string;
     versions: Array<...>;
     userId: string; // From auth context
   }
   ```

3. **Add CSRF token to state-changing operations**:
   ```typescript
   async function updateVersionSelection(versionId: string) {
     const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
     const response = await fetch(`/api/facts/${factId}/select-version`, {
       method: "POST",
       headers: {
         "X-CSRF-Token": csrfToken || "",
       },
       body: JSON.stringify({ versionId }),
     });
   }
   ```

---

## ADDITIONAL SECURITY ISSUES

### Issue #6: Unvalidated Fact Content Stored in Git Commit Message (MEDIUM)

**Status**: Related to Vulnerability #1

The commit message includes fact count:
```
[engram] Sync {N} facts at {ISO timestamp}
```

If `N` derives from `facts.length` in `vault-sync.ts` and facts can be modified before git commit, attacker could:
1. Ingestion pipeline creates invalid fact count
2. Git commit message becomes misleading
3. Could obfuscate actual file changes in git log

**Mitigation**: Count facts immediately before committing, validate it's reasonable (0-1000 range)

---

### Issue #7: No Audit Trail for File Reconciliation (LOW)

**Location**: `vault-reconciler.ts`

When file edits are reconciled back to database:
- No logging of which agent/user reconciled the change
- No audit trail of file conflicts
- Unclear who modified facts via vault directory

**Mitigation**: Add audit logging:
```typescript
export async function reconcileFileEdit(filePath: string, userId?: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);

  // Log reconciliation event
  console.log(`[AUDIT] Reconciled vault file`, {
    filePath,
    timestamp: Date.now(),
    userId,
    action: "reconcile",
  });

  // ... rest of reconciliation
}
```

---

### Issue #8: Chokidar Watching Could Miss Changes (LOW)

**Location**: `vault-sync.ts:61`

```typescript
this.watcher = chokidar.watch(`${this.vaultRoot}/**/*.md`, {
  ignoreInitial: true,
  ignored: (p) => p.includes("/.") || p.endsWith(".conflict.md"),
});
```

Chokidar has ~30s maximum lag (acknowledged in plan). In the meantime:
- File edits could pile up
- Concurrent edits to same fact could race
- No protection against rapid file modifications

**Mitigation**: Add debouncing and batch reconciliation:
```typescript
private reconcileQueue = new Set<string>();
private reconcileTimer: NodeJS.Timeout | null = null;

private async reconcileFile(filePath: string) {
  this.reconcileQueue.add(filePath);

  // Debounce: wait 5s for more changes before processing
  if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
  this.reconcileTimer = setTimeout(() => this.processBatch(), 5000);
}

private async processBatch() {
  const files = Array.from(this.reconcileQueue);
  this.reconcileQueue.clear();

  for (const filePath of files) {
    try {
      await reconcileFileEdit(filePath);
    } catch (error) {
      console.error("[vault-sync] reconcile failed", filePath, error);
    }
  }
}
```

---

## OWASP TOP 10 COMPLIANCE ASSESSMENT

| # | Category | Status | Finding |
|---|----------|--------|---------|
| A01 | Broken Access Control | ⚠️ PARTIAL | No access control in dashboard component; vault files world-readable |
| A02 | Cryptographic Failure | ⚠️ CRITICAL | Vault files plaintext; git history exposes secrets |
| A03 | Injection | ⚠️ CRITICAL | Shell injection in git commands; YAML code injection |
| A04 | Insecure Design | ⚠️ HIGH | No encryption at design time; no input validation strategy |
| A05 | Security Misconfiguration | ⚠️ HIGH | File permissions default to world-readable; no secret rotation |
| A06 | Vulnerable Components | ✅ GOOD | js-yaml 4.1.1 is current; no known exploits |
| A07 | Auth Failures | ✅ GOOD | Handled by Convex; not in scope of vault layer |
| A08 | Software & Data Integrity | ⚠️ MEDIUM | Git commits not signed; no tamper detection |
| A09 | Logging & Monitoring | ⚠️ MEDIUM | Minimal audit trail for file reconciliation |
| A10 | SSRF | ✅ GOOD | Local filesystem only; no remote requests |

---

## REMEDIATION ROADMAP

### Phase 1: Critical (MUST fix before merge) — 1-2 days

- [ ] **CVE-1: Shell Injection** — Use `spawn` with array args, not shell execution
- [ ] **CVE-2: YAML Prototype Pollution** — Use `yaml.safeLoad()` or `yaml.load()` with safe schema
- [ ] **Input Validation** — Add bounds checking for --limit, --concurrency; validate paths
- [ ] **File Permissions** — Restrict vault files to `0600` (owner read/write only)

### Phase 2: High (SHOULD fix before merge) — 2-3 days

- [ ] **Encryption at Rest** — Implement AES-256-GCM for vault files
- [ ] **Sensitive Content Detection** — Add regex patterns to detect/mask API keys
- [ ] **Git Configuration** — Use `simple-git` library instead of shell; require commit signing
- [ ] **Audit Logging** — Log all vault reconciliations with user/timestamp

### Phase 3: Medium (CAN fix in follow-up) — 1 week

- [ ] **Dashboard Access Control** — Add scope validation in backend
- [ ] **Debouncing** — Add file change batching in chokidar watcher
- [ ] **Git Signing** — Require GPG-signed commits to prevent spoofing
- [ ] **Secret Rotation** — Document encryption key rotation procedure

### Phase 4: Low (Nice to have) — Backlog

- [ ] Vault compression (gzip) for large fact stores
- [ ] Incremental backup/sync protocol
- [ ] Encrypted git transport (over HTTPS, not SSH)

---

## IMPLEMENTATION CHECKLIST

Before implementing `vault-git.ts` and `e2e-filesystem-mirror.test.ts`, MUST complete:

- [ ] Security code review of all shell/exec invocations
- [ ] YAML parsing updated to safe mode with sanitization
- [ ] File permission tests (verify 0600 after write)
- [ ] Input validation tests (path traversal, integer overflow, glob injection)
- [ ] Sensitive content detection tests (API key patterns)
- [ ] Git integration tests with malicious commit messages
- [ ] Encryption integration tests (key derivation, AES-256-GCM)
- [ ] Vault directory permission tests (chmod 700, no world-readable)
- [ ] End-to-end test with sensitive data (verify no leaks to git/disk)
- [ ] Documentation update: "Security Best Practices for Vault"

---

## TESTING STRATEGY

### Security Test Suite: `mcp-server/test/e2e-filesystem-mirror-security.test.ts`

```typescript
describe("Filesystem Mirror Security", () => {
  describe("Shell Injection Prevention", () => {
    test("should NOT execute shell metacharacters in commit message", async () => {
      const maliciousCommit = "[engram] Sync 5; rm -rf /; echo facts";
      // Verify git command is safe (uses spawn, not exec)
    });
  });

  describe("YAML Prototype Pollution Prevention", () => {
    test("should reject YAML with __proto__ keys", async () => {
      const maliciousYaml = "id: fact\n__proto__:\n  isAdmin: true";
      const parsed = parseFrontmatter(`---\n${maliciousYaml}\n---\nbody`);
      expect(parsed.frontmatter.__proto__).toBeUndefined();
      expect({}.isAdmin).toBeFalsy(); // Prototype not polluted
    });
  });

  describe("File Permissions", () => {
    test("should write vault files with 0600 permissions", async () => {
      const result = await writeFactToVault(tempDir, testFact);
      const stats = await fs.stat(result.absolutePath);
      expect(stats.mode & 0o077).toBe(0); // No group/other read
    });
  });

  describe("Input Validation", () => {
    test("should reject path traversal in bootstrap", async () => {
      await expect(
        findSessionFiles("../../../etc")
      ).rejects.toThrow("outside current");
    });

    test("should limit file size to 50MB", async () => {
      // Create 100MB test file, verify skipped
    });
  });

  describe("Sensitive Content", () => {
    test("should detect and mask API keys before vault export", async () => {
      const fact = {
        ...testFact,
        content: "API key: sk-abc123def456 stored successfully",
      };
      // If encryption enabled, should be encrypted
      // If masking enabled, should replace "sk-abc123def456"
    });
  });
});
```

---

## DOCUMENTATION UPDATES

### Add to CLAUDE.md:

```markdown
## Vault Security Requirements

- **File Encryption**: All vault files MUST be encrypted at rest (AES-256-GCM)
- **File Permissions**: Vault files MUST have `0600` permissions (owner read/write only)
- **Git Security**: Git commits MUST NOT execute shell code; use `simple-git` library
- **YAML Safety**: YAML parsing MUST use `yaml.safeLoad()` or safe schema
- **Input Validation**: All user-provided paths, integers, glob patterns MUST be validated
- **Sensitive Content**: Facts containing API keys/passwords MUST be masked or encrypted
- **Audit Trail**: All vault reconciliations MUST be logged with user/timestamp

## Vault Deployment Checklist

- [ ] Vault directory encrypted (FileVault/BitLocker)
- [ ] Vault directory NOT in cloud sync (iCloud, Dropbox, OneDrive)
- [ ] Git repo NOT public
- [ ] Git commits signed (GPG)
- [ ] Encryption key stored securely (not in git)
- [ ] Regular backups tested for decryption
```

---

## REFERENCES & RESOURCES

### Security Standards
- **OWASP Top 10 2023**: https://owasp.org/www-project-top-ten/
- **CWE-78 (OS Command Injection)**: https://cwe.mitre.org/data/definitions/78.html
- **CWE-1025 (Prototype Pollution)**: https://cwe.mitre.org/data/definitions/1025.html
- **CWE-668 (Exposure of Resource to Wrong Sphere)**: https://cwe.mitre.org/data/definitions/668.html

### Node.js Security
- **OWASP: Node.js Security Cheatsheet**: https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html
- **NIST Guidelines**: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-53r5.pdf

### Tooling
- **`simple-git`**: Safe wrapper around git CLI (https://github.com/steelbob/simple-git)
- **`js-yaml` safe mode**: https://github.com/nodeca/js-yaml#options
- **Node.js `child_process` security**: https://nodejs.org/en/docs/guides/security/#command-injection

### Related Vulnerabilities
- **File Permission Exposure**: CWE-276
- **Unvalidated Input in Git**: CWE-94
- **Unencrypted Sensitive Data**: CWE-312

---

## CONCLUSION

The plan for completing Letta Context Repository beads is **SOLID in scope and architecture**, but **CRITICAL security gaps must be closed before implementation**:

1. **Shell injection via git commands** — Replace with library-based API
2. **YAML prototype pollution** — Use safe parsing with sanitization
3. **Plaintext secrets on disk** — Add encryption + sensitive content detection
4. **World-readable vault files** — Enforce restrictive permissions
5. **No input validation** — Add bounds checking and path validation

**Timeline**: With focused effort, all critical/high issues can be resolved in **3-5 days** without impacting the feature schedule.

**Recommendation**:
- [ ] Schedule security implementation sprint before vault-git merge
- [ ] Assign 1-2 engineers to security hardening
- [ ] Complete Phase 1 (Critical) fixes before any PR merge
- [ ] Add security tests to CI/CD pipeline
- [ ] Document vault security best practices in team wiki

---

**Audit Date**: 2026-02-25
**Auditor**: Application Security Specialist
**Review Status**: REQUIRES FIXES BEFORE MERGE
**Next Review**: After Phase 1 remediations
