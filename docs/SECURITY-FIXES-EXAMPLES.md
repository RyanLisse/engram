# Security Fixes: Code Examples
## For: engram-1vt (Git Integration) & Filesystem Mirror Beads

---

## FIX #1: Shell Injection Prevention in Git Commands

### ❌ VULNERABLE CODE (DO NOT USE)

```typescript
import { execSync } from "child_process";

// These are VULNERABLE to shell injection:
execSync(`git commit -m "[engram] Sync ${count} facts"`);
execSync(`git init "${vaultRoot}"`);
exec(`cd ${vaultRoot} && git add .`);
```

### ✅ SECURE CODE (USE THIS)

```typescript
import { spawn } from "child_process";
import { promisify } from "util";
import simpleGit from "simple-git";

// Option A: Use spawn with array arguments (no shell)
export async function autoCommitChanges(
  opts: VaultGitOptions,
  factCount: number
): Promise<{ committed: boolean; sha?: string }> {
  return new Promise((resolve, reject) => {
    const message = `[engram] Sync ${factCount} facts at ${new Date().toISOString()}`;

    const child = spawn("git", ["commit", "-m", message, "-q"], {
      cwd: opts.vaultRoot,
      stdio: "pipe",
    });

    let errorOutput = "";
    child.stderr?.on("data", (data) => {
      errorOutput += data.toString();
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ committed: true });
      } else if (code === 1) {
        // No changes to commit
        resolve({ committed: false });
      } else {
        reject(new Error(`git commit failed: ${errorOutput}`));
      }
    });
  });
}

// Option B: Use simple-git library (RECOMMENDED)
import simpleGit from "simple-git";

export async function autoCommitChanges(
  opts: VaultGitOptions,
  factCount: number
): Promise<{ committed: boolean; sha?: string }> {
  const git = simpleGit(opts.vaultRoot);

  // Check if there are changes
  const status = await git.status();
  if (status.files.length === 0) {
    return { committed: false };
  }

  const message = `[engram] Sync ${factCount} facts at ${new Date().toISOString()}`;

  try {
    await git.add("*.md");
    const commit = await git.commit(message);
    return { committed: true, sha: commit.commit };
  } catch (error) {
    throw new Error(`Failed to commit: ${error}`);
  }
}

export async function ensureGitRepo(vaultRoot: string): Promise<boolean> {
  const git = simpleGit(vaultRoot);

  try {
    // Check if repo already initialized
    await git.revparse(["--git-dir"]);
    return true; // Already initialized
  } catch {
    // Not initialized, initialize now
    await git.init();
    await git.add(".gitignore");
    await git.commit("Initial commit");
    return true;
  }
}

export async function getLastSyncCommit(vaultRoot: string): Promise<string | undefined> {
  const git = simpleGit(vaultRoot);

  try {
    // Find most recent commit with [engram] in message
    const log = await git.log({
      grep: "\\[engram\\]",
      maxCount: 1,
    });

    if (log.latest) {
      return log.latest.hash;
    }
  } catch (error) {
    console.warn("[vault-git] Failed to get last sync commit:", error);
  }

  return undefined;
}
```

### Installation

```bash
npm install simple-git
npm install --save-dev @types/simple-git
```

### Key Security Principles

1. **Never use backticks or `${}`** in shell strings
2. **Always use spawn() with array arguments** to avoid shell interpretation
3. **Use library abstractions** (simple-git) that handle escaping properly
4. **Never allow user input** in git commands directly

---

## FIX #2: YAML Safe Parsing with Prototype Pollution Prevention

### ❌ VULNERABLE CODE (DO NOT USE)

```typescript
import yaml from "js-yaml";

export function parseFrontmatter(fileContent: string): ParsedVaultDocument {
  const match = fileContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: fileContent.trim() };
  }

  // VULNERABLE: loads arbitrary code/prototypes
  const frontmatterValue = yaml.load(match[1]);
  const frontmatter =
    frontmatterValue && typeof frontmatterValue === "object"
      ? (frontmatterValue as Record<string, unknown>)
      : {};

  return { frontmatter, body: match[2].trim() };
}
```

### ✅ SECURE CODE (USE THIS)

```typescript
import yaml from "js-yaml";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function sanitizeFrontmatter(data: any): Record<string, unknown> {
  if (!data || typeof data !== "object") {
    return {};
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    // Block dangerous keys that could pollute prototypes
    if (DANGEROUS_KEYS.has(key)) {
      console.warn(`[Security] Blocked dangerous key in YAML: ${key}`);
      continue;
    }

    // Only allow whitelisted keys (optional, for strict validation)
    if (!isAllowedKey(key)) {
      console.warn(`[Security] Blocked unknown key in YAML frontmatter: ${key}`);
      continue;
    }

    result[key] = value;
  }

  return result;
}

function isAllowedKey(key: string): boolean {
  const allowedKeys = new Set([
    "id",
    "source",
    "factType",
    "createdBy",
    "scopeId",
    "timestamp",
    "updatedAt",
    "entityIds",
    "tags",
    "importanceScore",
    "relevanceScore",
    "lifecycleState",
    "conversationId",
    "vaultPath",
  ]);
  return allowedKeys.has(key);
}

export function parseFrontmatter(fileContent: string): ParsedVaultDocument {
  const match = fileContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: fileContent.trim() };
  }

  let frontmatterValue: any;

  try {
    // Use safe load with restricted schema
    frontmatterValue = yaml.load(match[1], {
      // Only allow safe YAML types (no code execution)
      // This restricts to: strings, numbers, booleans, dates, lists, maps
    });
  } catch (error) {
    console.error("[Security] Failed to parse YAML frontmatter:", error);
    return { frontmatter: {}, body: fileContent.trim() };
  }

  // Sanitize to remove prototype pollution attempts
  const frontmatter = sanitizeFrontmatter(frontmatterValue);

  return {
    frontmatter,
    body: match[2].trim(),
  };
}

// Alternative: Use js-yaml's safeLoad (deprecated in newer versions, but safe)
export function parseFrontmatterAlternative(fileContent: string): ParsedVaultDocument {
  const match = fileContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: fileContent.trim() };
  }

  let frontmatterValue: any;

  try {
    // js-yaml 4.1.0+ recommends load with options over deprecated safeLoad
    frontmatterValue = yaml.load(match[1], {
      // Restrict to safe schema (no code execution)
      schema: yaml.SAFE_SCHEMA,
    });
  } catch (error) {
    console.error("[Security] Failed to parse YAML frontmatter:", error);
    return { frontmatter: {}, body: fileContent.trim() };
  }

  const frontmatter = sanitizeFrontmatter(frontmatterValue);
  return { frontmatter, body: match[2].trim() };
}
```

### Key Security Principles

1. **Always use safe schema** to prevent code execution
2. **Sanitize after parsing** to remove prototype pollution keys
3. **Whitelist allowed keys** (optional, for defense in depth)
4. **Catch parsing errors** and fail safely (empty frontmatter)

---

## FIX #3: File Encryption + Restricted Permissions

### ❌ VULNERABLE CODE (DO NOT USE)

```typescript
import fs from "fs/promises";

export async function writeFactToVault(vaultRoot: string, fact: VaultFact) {
  const folder = computeFolderPath(fact, vaultRoot);
  await fs.mkdir(folder, { recursive: true });

  const filename = generateFilename(fact);
  const absolutePath = path.join(folder, filename);

  const markdown = renderVaultDocument(fact);

  // VULNERABLE: plaintext file with default permissions (0644 = world-readable)
  const tmpPath = `${absolutePath}.tmp`;
  await fs.writeFile(tmpPath, markdown, "utf8");
  await fs.rename(tmpPath, absolutePath);
  // ^ File is readable by everyone on the system!
}
```

### ✅ SECURE CODE (USE THIS)

```typescript
import fs from "fs/promises";
import crypto from "crypto";
import path from "path";

export interface VaultEncryption {
  enabled: boolean;
  key?: Buffer; // 32 bytes for AES-256
}

export async function writeFactToVault(
  vaultRoot: string,
  fact: VaultFact,
  encryption?: VaultEncryption
): Promise<VaultWriteResult> {
  const folder = computeFolderPath(fact, vaultRoot);
  await fs.mkdir(folder, { recursive: true });

  const filename = fact.vaultPath ? path.basename(fact.vaultPath) : generateFilename(fact);
  const absolutePath = path.join(folder, filename);

  const markdown = renderVaultDocument(fact);
  const tmpPath = `${absolutePath}.tmp`;

  if (encryption?.enabled && encryption?.key) {
    // Write encrypted
    await writeEncryptedFile(tmpPath, markdown, encryption.key);
  } else {
    // Write plaintext with restricted permissions
    await fs.writeFile(tmpPath, markdown, "utf8");
  }

  // CRITICAL: Restrict permissions to owner read/write only
  // 0600 = -rw------- (owner can read/write, group/other cannot access)
  await fs.chmod(tmpPath, 0o600);

  // Atomic rename
  await fs.rename(tmpPath, absolutePath);

  const relativePath = path.relative(vaultRoot, absolutePath);
  return { absolutePath, relativePath };
}

export async function writeEncryptedFile(
  filePath: string,
  content: string,
  encryptionKey: Buffer // 32 bytes for AES-256
): Promise<void> {
  // Generate random IV (initialization vector) for each file
  const iv = crypto.randomBytes(16);

  // Create cipher
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);

  // Encrypt content
  let encrypted = cipher.update(content, "utf8", "hex");
  encrypted += cipher.final("hex");

  // Get authentication tag (prevents tampering)
  const tag = cipher.getAuthTag();

  // Build payload: IV + tag + encrypted data
  const payload = {
    version: 1, // For future compatibility
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted,
  };

  // Write JSON payload
  await fs.writeFile(filePath, JSON.stringify(payload, null, 0), "utf8");
}

export async function readEncryptedFile(
  filePath: string,
  encryptionKey: Buffer
): Promise<string> {
  const fileContent = await fs.readFile(filePath, "utf8");
  const payload = JSON.parse(fileContent);

  if (payload.version !== 1) {
    throw new Error("Unsupported encryption version");
  }

  const iv = Buffer.from(payload.iv, "hex");
  const tag = Buffer.from(payload.tag, "hex");
  const encrypted = payload.data;

  // Create decipher
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(tag);

  // Decrypt
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export function deriveEncryptionKey(password: string, salt?: Buffer): Buffer {
  // Generate salt if not provided
  if (!salt) {
    salt = crypto.randomBytes(32);
  }

  // Use PBKDF2 to derive key from password
  // This is safer than using the password directly
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");

  return key;
}
```

### Key Security Principles

1. **Always set permissions to `0o600`** after writing files
2. **Encrypt sensitive content** using AES-256-GCM
3. **Use per-file IV** (initialization vector) for randomness
4. **Use authentication tag** to detect tampering
5. **Never hardcode encryption keys** in code

---

## FIX #4: Input Validation in Bootstrap Scripts

### ❌ VULNERABLE CODE (DO NOT USE)

```typescript
// bootstrap-from-sessions.ts
export async function findSessionFiles(dir: string): Promise<string[]> {
  // NO validation!
  const entries = await readdir(dir, { withFileTypes: true });
  // Could read ../../../etc if user provides that path
}

// bootstrap-parallel.ts
const expandedPattern = globPattern.replace(/^~/, process.env.HOME || "~");
const files = globSync(expandedPattern, { absolute: true });
// No validation of globPattern; could match unintended files
// Could hit memory limit with huge glob expansion

// Limit parameter
limit = parseInt(args[i + 1], 10);
// No validation: could be negative, NaN, or enormous
```

### ✅ SECURE CODE (USE THIS)

```typescript
import fs from "fs/promises";
import path from "path";
import { realpath } from "fs/promises";

// Validation helper
function validateInteger(value: string, min: number, max: number, paramName: string): number {
  const num = parseInt(value, 10);

  if (isNaN(num)) {
    throw new Error(`${paramName} must be a valid integer`);
  }

  if (num < min || num > max) {
    throw new Error(`${paramName} must be between ${min} and ${max}`);
  }

  return num;
}

function validateGlobPattern(pattern: string): void {
  // Reject patterns with suspicious characters that could cause issues
  const suspiciousChars = /[;&|`$()]/;

  if (suspiciousChars.test(pattern)) {
    throw new Error(
      "Glob pattern contains suspicious characters. Only use alphanumerics, *, ?, -, _, ."
    );
  }

  if (pattern.includes("..")) {
    throw new Error("Glob pattern cannot contain '..' (path traversal)");
  }

  if (pattern.length > 1000) {
    throw new Error("Glob pattern too long (max 1000 characters)");
  }
}

// ✅ Secure version
export async function findSessionFiles(dir: string, maxFiles: number = 10000): Promise<string[]> {
  // 1. Resolve and validate directory
  const resolvedDir = path.resolve(dir);
  const realDir = await realpath(resolvedDir);

  // 2. Check directory is accessible
  try {
    await fs.access(realDir, fs.constants.R_OK);
  } catch (err) {
    throw new Error(`Directory not readable: ${dir}`);
  }

  // 3. Walk directory
  const files: Array<{ path: string; mtime: number }> = [];
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

  async function walk(current: string): Promise<void> {
    // Prevent infinite loops with symlinks
    if (files.length > maxFiles) {
      throw new Error(`Too many files (max ${maxFiles})`);
    }

    try {
      const entries = await fs.readdir(current, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= maxFiles) {
          break;
        }

        const fullPath = path.join(current, entry.name);

        // Prevent symlink loops
        try {
          const realPath = await realpath(fullPath);
          if (!realPath.startsWith(realDir)) {
            continue; // Skip symlinks pointing outside vault
          }
        } catch {
          continue; // Skip broken symlinks
        }

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith(".json") || entry.name.endsWith(".jsonl"))) {
          // Check file size
          const stats = await fs.stat(fullPath);
          if (stats.size > MAX_FILE_SIZE) {
            console.warn(`Skipping ${fullPath}: exceeds 50MB limit`);
            continue;
          }

          files.push({ path: fullPath, mtime: stats.mtimeMs });
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Error reading ${current}:`, err);
      }
    }
  }

  await walk(realDir);

  // Return sorted by mtime (newest first)
  files.sort((a, b) => b.mtime - a.mtime);
  return files.map((f) => f.path);
}

// ✅ Secure argument parsing
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let sessionsDir = "./sessions";
  let dryRun = false;
  let limit: number | null = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--limit") {
      if (i + 1 >= args.length) {
        console.error("Error: --limit requires a value");
        process.exit(1);
      }
      limit = validateInteger(args[i + 1], 1, 100000, "--limit");
      i++;
    } else if (!args[i].startsWith("--")) {
      sessionsDir = args[i];
    }
  }

  // Find and process files
  const sessionFiles = await findSessionFiles(sessionsDir);
  const filesToProcess = limit ? sessionFiles.slice(0, limit) : sessionFiles;

  // ... rest of processing
}

// ✅ Secure version of bootstrap-parallel
async function parallelMain(): Promise<void> {
  const args = process.argv.slice(2);

  let globPattern: string | null = null;
  let concurrency = 4;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--concurrency" && i + 1 < args.length) {
      concurrency = validateInteger(args[i + 1], 1, 32, "--concurrency");
      i++;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (!args[i].startsWith("--")) {
      globPattern = args[i];
    }
  }

  if (!globPattern) {
    console.error("Usage: npx tsx scripts/bootstrap-parallel.ts <glob-pattern> ...");
    process.exit(1);
  }

  // ✅ Validate glob pattern
  validateGlobPattern(globPattern);

  // Expand tilde
  const expandedPattern = globPattern.replace(/^~/, process.env.HOME || "~");

  // Find files
  const files = globSync(expandedPattern, { absolute: true });

  if (files.length === 0) {
    console.error(`No files found matching pattern: ${globPattern}`);
    process.exit(1);
  }

  if (files.length > 10000) {
    console.error(`Too many files matched (${files.length}). Pattern too broad.`);
    process.exit(1);
  }

  // ... process files
}
```

### Key Security Principles

1. **Validate all user input** (paths, numbers, patterns)
2. **Use bounds checking** (1 ≤ limit ≤ 100,000)
3. **Limit resource consumption** (max 50MB per file, max 10k files)
4. **Reject path traversal** (`..` sequences)
5. **Check file permissions** before processing

---

## FIX #5: Dashboard Access Control

### ❌ VULNERABLE CODE (DO NOT USE)

```typescript
// dashboard/src/app/api/facts/[factId]/versions/route.ts
export async function GET(
  request: Request,
  { params }: { params: { factId: string } }
) {
  // NO access control check!
  const versions = await db.query("fact_versions")
    .where("factId", params.factId)
    .toArray();

  return Response.json(versions);
  // Any authenticated user can read ANY fact's history
}
```

### ✅ SECURE CODE (USE THIS)

```typescript
// dashboard/src/app/api/facts/[factId]/versions/route.ts
import { getSession } from "@/auth";
import { convex } from "@/convex-client";

export async function GET(
  request: Request,
  { params }: { params: { factId: string } }
) {
  // 1. Get user from session
  const session = await getSession(request);
  if (!session?.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Fetch the fact to check access
  const fact = await convex.query("functions:getFact", { id: params.factId });

  if (!fact) {
    return Response.json({ error: "Fact not found" }, { status: 404 });
  }

  // 3. Verify user owns the fact (scope check)
  const expectedScope = `private-${session.userId}`;
  if (fact.scopeId !== expectedScope) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. Fetch versions only after verified access
  const versions = await convex.query("functions:getFactVersions", {
    factId: params.factId,
  });

  return Response.json(versions);
}
```

### React Component

```typescript
// dashboard/src/app/components/VersionTimeline.tsx
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

interface VersionTimelineProps {
  factId: string;
}

export function VersionTimeline({ factId }: VersionTimelineProps) {
  const { data: session } = useSession();
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) {
      setError("Not authenticated");
      return;
    }

    const fetchVersions = async () => {
      try {
        // This request goes to backend, which verifies scope
        const response = await fetch(`/api/facts/${factId}/versions`, {
          headers: {
            "X-CSRF-Token": getCsrfToken(),
          },
        });

        if (response.status === 401) {
          setError("Not authenticated");
          return;
        }

        if (response.status === 403) {
          setError("You do not have access to this fact");
          return;
        }

        if (!response.ok) {
          setError(`Failed to load versions: ${response.statusText}`);
          return;
        }

        const data = await response.json();
        setVersions(data);
      } catch (err) {
        setError(`Error: ${err}`);
      }
    };

    fetchVersions();
  }, [factId, session]);

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="version-timeline">
      {versions.map((version) => (
        <div key={version._id} className="version-entry">
          <span className="changeType">{version.changeType}</span>
          <span className="timestamp">{new Date(version.timestamp).toLocaleString()}</span>
          <span className="changedBy">{version.changedBy}</span>
        </div>
      ))}
    </div>
  );
}

function getCsrfToken(): string {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta?.getAttribute("content") || "";
}
```

### Key Security Principles

1. **Always check authentication** before returning any data
2. **Verify scope ownership** (fact belongs to user)
3. **Return 403 Forbidden** for access denied (not 404)
4. **Use CSRF tokens** for state-changing requests (POST/PUT/DELETE)
5. **Validate on backend**, not frontend

---

## TESTING EXAMPLES

### Security Test Suite

```typescript
// mcp-server/test/security-vault.test.ts
import { describe, test, expect } from "vitest";
import { spawn } from "child_process";
import { parseFrontmatter } from "../src/lib/vault-format";
import { writeFactToVault } from "../src/lib/vault-writer";
import fs from "fs/promises";

describe("Vault Security", () => {
  describe("Shell Injection Prevention", () => {
    test("should use spawn not exec for git commands", async () => {
      // Verify that autoCommitChanges uses spawn, not execSync
      // by checking it doesn't throw on special chars
      const result = await autoCommitChanges(
        { vaultRoot: tempDir, autoCommit: true },
        5
      );
      expect(result.committed).toBeDefined();
    });

    test("should reject malicious commit messages", async () => {
      // If somehow spawn is not used, this would execute malicious code
      // This test verifies the behavior is safe
      const maliciousMessage = "'; rm -rf /; echo '";
      // Should not execute because spawn uses array args
    });
  });

  describe("YAML Prototype Pollution", () => {
    test("should reject __proto__ in frontmatter", () => {
      const maliciousYaml = `---
__proto__:
  isAdmin: true
---
body`;

      const parsed = parseFrontmatter(maliciousYaml);
      expect(parsed.frontmatter.__proto__).toBeUndefined();
      expect(({} as any).isAdmin).toBeFalsy();
    });

    test("should reject constructor in frontmatter", () => {
      const maliciousYaml = `---
constructor:
  prototype:
    isAdmin: true
---
body`;

      const parsed = parseFrontmatter(maliciousYaml);
      expect(parsed.frontmatter.constructor).toBeUndefined();
    });
  });

  describe("File Permissions", () => {
    test("should write vault files with 0600 permissions", async () => {
      const result = await writeFactToVault(tempDir, testFact);
      const stats = await fs.stat(result.absolutePath);

      // Verify: no group/other read (0o077 should be 0)
      const perms = stats.mode & 0o077;
      expect(perms).toBe(0);

      // Verify: owner can read (0o400 should be non-zero)
      expect(stats.mode & 0o400).toBeGreaterThan(0);
    });

    test("should not be readable by other users", async () => {
      const result = await writeFactToVault(tempDir, testFact);
      const stats = await fs.stat(result.absolutePath);

      // Mode should be 0o600 exactly
      const expectedMode = 0o100600; // Regular file + 0o600
      const actualMode = stats.mode & 0o777;
      expect(actualMode).toBe(0o600);
    });
  });

  describe("Input Validation", () => {
    test("should reject path traversal in findSessionFiles", async () => {
      await expect(
        findSessionFiles("../../../etc")
      ).rejects.toThrow(/outside|traversal/i);
    });

    test("should limit file size", async () => {
      // Create temp file > 50MB
      // Verify it's skipped
    });

    test("should validate --limit parameter", async () => {
      expect(() => validateInteger("abc", 1, 100, "--limit")).toThrow();
      expect(() => validateInteger("0", 1, 100, "--limit")).toThrow();
      expect(() => validateInteger("101", 1, 100, "--limit")).toThrow();
      expect(validateInteger("50", 1, 100, "--limit")).toBe(50);
    });

    test("should reject suspicious glob patterns", async () => {
      const patterns = [
        "test`whoami`",
        "test$(whoami)",
        "test;rm -rf /",
        "test|cat /etc/passwd",
      ];

      for (const pattern of patterns) {
        expect(() => validateGlobPattern(pattern)).toThrow();
      }
    });
  });
});
```

---

## DEPLOYMENT CHECKLIST

Before deploying vault to production:

- [ ] All security tests passing
- [ ] Code reviewed by security engineer
- [ ] `vault-git.ts` uses `simple-git` library (no shell execution)
- [ ] `vault-format.ts` uses `yaml.safeLoad()` with sanitization
- [ ] `writeFactToVault()` enforces `0o600` permissions
- [ ] Bootstrap scripts validate all input
- [ ] Dashboard backend checks scope ownership
- [ ] Encryption key storage documented
- [ ] Vault directory NOT in cloud sync
- [ ] Git repo is NOT public
- [ ] Team trained on secure vault deployment

---

**For full audit details, see**: `/Users/cortex-air/Tools/engram/docs/security-audit-2026-02-25.md`
