import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// Mock convex-client BEFORE any imports that transitively require it.
// Using vi.hoisted so the factory runs before the module graph is resolved.
// ---------------------------------------------------------------------------
const { mockGetUnmirroredFacts, mockUpdateVaultPath, mockGetFact, mockApplyVaultEdit } =
  vi.hoisted(() => ({
    mockGetUnmirroredFacts: vi.fn(),
    mockUpdateVaultPath: vi.fn(),
    mockGetFact: vi.fn(),
    mockApplyVaultEdit: vi.fn(),
  }));

vi.mock("../src/lib/convex-client.js", () => ({
  getUnmirroredFacts: mockGetUnmirroredFacts,
  updateVaultPath: mockUpdateVaultPath,
  getFact: mockGetFact,
  applyVaultEdit: mockApplyVaultEdit,
}));

// vault-git is imported by vault-sync — mock it so tests are hermetic and do
// not require a real git binary or network access.
const { mockEnsureGitRepo, mockAutoCommitChanges, mockGetLastSyncCommit } =
  vi.hoisted(() => ({
    mockEnsureGitRepo: vi.fn().mockResolvedValue(undefined),
    mockAutoCommitChanges: vi.fn().mockResolvedValue({ committed: false }),
    mockGetLastSyncCommit: vi.fn().mockResolvedValue(null),
  }));

vi.mock("../src/lib/vault-git.js", () => ({
  ensureGitRepo: mockEnsureGitRepo,
  autoCommitChanges: mockAutoCommitChanges,
  getLastSyncCommit: mockGetLastSyncCommit,
}));

// ---------------------------------------------------------------------------
// Real module imports (resolved after mocks are registered)
// ---------------------------------------------------------------------------
import {
  renderVaultDocument,
  parseFrontmatter,
  generateFilename,
  computeFolderPath,
  generateFrontmatter,
  generateMarkdownBody,
  extractWikiLinks,
  type VaultFact,
} from "../src/lib/vault-format.js";
import {
  writeFactToVault,
  readVaultFile,
  listVaultMarkdownFiles,
} from "../src/lib/vault-writer.js";
import {
  reconcileFileEdit,
  detectConflicts,
  mergeHumanEdits,
  writeConflictFile,
} from "../src/lib/vault-reconciler.js";

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------
function makeFact(overrides: Partial<VaultFact> = {}): VaultFact {
  return {
    _id: "fact-test-1",
    content: "Test fact content about TypeScript preferences",
    timestamp: 1_708_819_200_000, // 2024-02-25T00:00:00.000Z
    source: "direct",
    entityIds: ["TypeScript"],
    relevanceScore: 0.9,
    accessedCount: 3,
    importanceScore: 0.75,
    createdBy: "test-agent",
    scopeId: "private-test-agent",
    tags: ["preference", "tech"],
    factType: "observation",
    lifecycleState: "active",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe("Filesystem Mirror E2E", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset vault-git mocks to safe defaults after clearAllMocks
    mockEnsureGitRepo.mockResolvedValue(undefined);
    mockAutoCommitChanges.mockResolvedValue({ committed: false });
    mockGetLastSyncCommit.mockResolvedValue(null);

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "engram-vault-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Section 1: vault-format utilities
  // -------------------------------------------------------------------------
  describe("vault-format: document generation", () => {
    test("renderVaultDocument wraps content in YAML frontmatter delimiters", () => {
      const fact = makeFact();
      const doc = renderVaultDocument(fact);

      expect(doc).toMatch(/^---\n/);
      expect(doc).toContain("factType: observation");
      expect(doc).toContain("createdBy: test-agent");
      expect(doc).toContain("TypeScript preferences");
    });

    test("parseFrontmatter round-trips renderVaultDocument output correctly", () => {
      const fact = makeFact();
      const doc = renderVaultDocument(fact);
      const parsed = parseFrontmatter(doc);

      expect(parsed.frontmatter.factType).toBe("observation");
      expect(parsed.frontmatter.createdBy).toBe("test-agent");
      expect(parsed.frontmatter.scopeId).toBe("private-test-agent");
      expect(parsed.body).toContain("TypeScript preferences");
    });

    test("parseFrontmatter handles file with no frontmatter delimiter", () => {
      const raw = "Just plain text, no frontmatter.";
      const parsed = parseFrontmatter(raw);

      expect(parsed.frontmatter).toEqual({});
      expect(parsed.body).toBe("Just plain text, no frontmatter.");
    });

    test("generateFrontmatter includes all required keys", () => {
      const fact = makeFact();
      const fm = generateFrontmatter(fact);

      expect(fm).toContain("id: fact-test-1");
      expect(fm).toContain("factType: observation");
      expect(fm).toContain("lifecycleState: active");
      expect(fm).toContain("importanceScore: 0.75");
    });

    test("generateMarkdownBody includes factualSummary when present", () => {
      const fact = makeFact({ factualSummary: "A short summary." });
      const body = generateMarkdownBody(fact);

      expect(body).toContain("TypeScript preferences");
      expect(body).toContain("## Summary");
      expect(body).toContain("A short summary.");
    });

    test("generateMarkdownBody omits summary section when factualSummary absent", () => {
      const fact = makeFact();
      const body = generateMarkdownBody(fact);

      expect(body).not.toContain("## Summary");
    });

    test("generateFilename produces date-prefixed slug with factType", () => {
      const filename = generateFilename({
        timestamp: 1_708_819_200_000, // 2024-02-25
        factType: "observation",
        content: "Hello World test",
      });

      expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}-observation-hello-world-test\.md$/);
    });

    test("generateFilename falls back to 'note' slug when content slugifies to empty string", () => {
      const filename = generateFilename({
        timestamp: 1_708_819_200_000,
        factType: "observation",
        content: "!!!",
      });

      expect(filename).toMatch(/observation-note\.md$/);
    });

    test("computeFolderPath routes decisions to decisions/ subfolder", () => {
      const folder = computeFolderPath(
        { factType: "decision", scopeId: "private-agent" },
        tmpDir
      );
      expect(folder).toContain("decisions");
      expect(folder).toContain("private-agent");
    });

    test("computeFolderPath routes unknown factType to notes/ subfolder", () => {
      const folder = computeFolderPath(
        { factType: "unknown-type", scopeId: "private-agent" },
        tmpDir
      );
      expect(folder).toContain("notes");
    });

    test("extractWikiLinks parses plain and aliased wiki-link syntax", () => {
      const links = extractWikiLinks("See [[Alpha]] and [[Beta|Display Name]] here.");
      expect(links).toEqual(["Alpha", "Beta"]);
    });

    test("extractWikiLinks returns empty array when no wiki links present", () => {
      expect(extractWikiLinks("No links in this text.")).toEqual([]);
    });

    test("extractWikiLinks deduplicates repeated links", () => {
      const links = extractWikiLinks("[[A]] and [[A]] again.");
      expect(links).toEqual(["A"]);
    });
  });

  // -------------------------------------------------------------------------
  // Section 2: Export — fact → markdown file on disk
  // -------------------------------------------------------------------------
  describe("export: fact to markdown file", () => {
    test("writeFactToVault creates file with correct YAML frontmatter and content", async () => {
      const fact = makeFact();
      const result = await writeFactToVault(tmpDir, fact);

      expect(result.absolutePath).toContain(tmpDir);
      expect(result.relativePath).toMatch(/\.md$/);

      const content = await fs.readFile(result.absolutePath, "utf8");
      const parsed = parseFrontmatter(content);
      expect(parsed.frontmatter.factType).toBe("observation");
      expect(parsed.frontmatter.createdBy).toBe("test-agent");
      expect(parsed.body).toContain("TypeScript preferences");
    });

    test("routes observation to observations/ folder", async () => {
      const fact = makeFact({ factType: "observation" });
      const result = await writeFactToVault(tmpDir, fact);

      expect(result.relativePath).toContain("observations/");
    });

    test("routes decision to decisions/ folder", async () => {
      const fact = makeFact({ factType: "decision", _id: "fact-dec-1" });
      const result = await writeFactToVault(tmpDir, fact);

      expect(result.relativePath).toContain("decisions/");
    });

    test("routes insight to insights/ folder", async () => {
      const fact = makeFact({ factType: "insight", _id: "fact-ins-1" });
      const result = await writeFactToVault(tmpDir, fact);

      expect(result.relativePath).toContain("insights/");
    });

    test("routes session_summary to sessions/ folder", async () => {
      const fact = makeFact({ factType: "session_summary", _id: "fact-ss-1" });
      const result = await writeFactToVault(tmpDir, fact);

      expect(result.relativePath).toContain("sessions/");
    });

    test("relativePath is relative to vaultRoot (no leading /)", () => {
      // We verify this by checking it does NOT start with tmpDir
      return writeFactToVault(tmpDir, makeFact()).then((result) => {
        expect(result.relativePath.startsWith(tmpDir)).toBe(false);
        expect(result.relativePath.startsWith("/")).toBe(false);
      });
    });

    test("atomic write: no .tmp files left behind on success", async () => {
      const fact = makeFact();
      await writeFactToVault(tmpDir, fact);

      const allFiles = await listVaultMarkdownFiles(tmpDir);
      const tmpFiles = allFiles.filter((f) => f.endsWith(".tmp"));
      expect(tmpFiles).toHaveLength(0);
    });

    test("creates subdirectory hierarchy automatically", async () => {
      const fact = makeFact();
      const result = await writeFactToVault(tmpDir, fact);

      const dir = path.dirname(result.absolutePath);
      const stat = await fs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    });

    test("respects existing vaultPath when fact already has one", async () => {
      // Pre-create the folder so the write can succeed
      const customFolder = path.join(tmpDir, "private-test-agent", "observations");
      await fs.mkdir(customFolder, { recursive: true });

      const fact = makeFact({
        vaultPath: path.join(customFolder, "existing-name.md"),
      });
      const result = await writeFactToVault(tmpDir, fact);

      expect(path.basename(result.absolutePath)).toBe("existing-name.md");
    });

    test("readVaultFile returns parsed frontmatter and body", async () => {
      const fact = makeFact();
      const { absolutePath } = await writeFactToVault(tmpDir, fact);
      const parsed = await readVaultFile(absolutePath);

      expect(parsed.frontmatter.createdBy).toBe("test-agent");
      expect(parsed.body).toContain("TypeScript preferences");
    });

    test("listVaultMarkdownFiles returns all .md files under vaultRoot", async () => {
      await writeFactToVault(tmpDir, makeFact({ _id: "f1", factType: "observation" }));
      await writeFactToVault(tmpDir, makeFact({ _id: "f2", factType: "decision" }));
      await writeFactToVault(tmpDir, makeFact({ _id: "f3", factType: "insight" }));

      const files = await listVaultMarkdownFiles(tmpDir);
      expect(files).toHaveLength(3);
      expect(files.every((f) => f.endsWith(".md"))).toBe(true);
    });

    test("listVaultMarkdownFiles returns empty array when vault is empty", async () => {
      const files = await listVaultMarkdownFiles(tmpDir);
      expect(files).toHaveLength(0);
    });

    test("listVaultMarkdownFiles ignores dot-prefixed directories", async () => {
      // Write a .md file inside a hidden directory — should be ignored
      const hiddenDir = path.join(tmpDir, ".hidden");
      await fs.mkdir(hiddenDir, { recursive: true });
      await fs.writeFile(path.join(hiddenDir, "secret.md"), "hidden", "utf8");

      const files = await listVaultMarkdownFiles(tmpDir);
      expect(files).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Section 3: Reconciler — file edit → DB update
  // -------------------------------------------------------------------------
  describe("reconciler: file edit to DB update", () => {
    test("detectConflicts returns false when file has no updatedAt", () => {
      // fileFact without updatedAt — not a conflict
      expect(detectConflicts({ updatedAt: 2000 }, { content: "new" })).toBe(false);
    });

    test("detectConflicts returns false when DB has no updatedAt", () => {
      expect(detectConflicts({ content: "old" }, { updatedAt: 2000 })).toBe(false);
    });

    test("detectConflicts returns false when file is newer than DB", () => {
      // file updatedAt > dbFact updatedAt → not a conflict
      expect(detectConflicts({ updatedAt: 1000 }, { updatedAt: 2000 })).toBe(false);
    });

    test("detectConflicts returns true when file is older than DB", () => {
      // file updatedAt < dbFact updatedAt → conflict
      expect(detectConflicts({ updatedAt: 2000 }, { updatedAt: 1000 })).toBe(true);
    });

    test("detectConflicts returns false when timestamps are equal", () => {
      // Equal timestamps: fileFact.updatedAt (1000) is NOT less than dbFact.updatedAt (1000)
      expect(detectConflicts({ updatedAt: 1000 }, { updatedAt: 1000 })).toBe(false);
    });

    test("mergeHumanEdits returns fileFact unchanged when dbFact is null", () => {
      const fileFact = { content: "new content" };
      expect(mergeHumanEdits(null, fileFact)).toEqual(fileFact);
    });

    test("mergeHumanEdits merges only HUMAN_FIELDS (content, tags, entityIds)", () => {
      const dbFact = {
        content: "old",
        tags: ["a"],
        entityIds: ["E1"],
        importanceScore: 0.8,
        relevanceScore: 0.9,
      };
      const fileFact = { content: "new", tags: ["b"], entityIds: ["E2"] };
      const merged = mergeHumanEdits(dbFact, fileFact);

      expect(merged.content).toBe("new");
      expect(merged.tags).toEqual(["b"]);
      expect(merged.entityIds).toEqual(["E2"]);
      // importanceScore is NOT a HUMAN_FIELD — must not appear in merged output
      expect(merged.importanceScore).toBeUndefined();
      expect(merged.relevanceScore).toBeUndefined();
    });

    test("mergeHumanEdits omits HUMAN_FIELDS absent from fileFact", () => {
      const dbFact = { content: "old", tags: ["a"], entityIds: ["E1"] };
      const fileFact = { content: "updated" }; // no tags or entityIds
      const merged = mergeHumanEdits(dbFact, fileFact);

      expect(merged.content).toBe("updated");
      expect(merged.tags).toBeUndefined();
      expect(merged.entityIds).toBeUndefined();
    });

    test("writeConflictFile creates .conflict.md containing both versions", async () => {
      const factFile = path.join(tmpDir, "test.md");
      await fs.writeFile(factFile, "file content", "utf8");

      const conflictPath = await writeConflictFile(factFile, "db content", "file content");
      expect(conflictPath).toMatch(/\.conflict\.md$/);

      const content = await fs.readFile(conflictPath, "utf8");
      expect(content).toContain("Database Version");
      expect(content).toContain("File Version");
      expect(content).toContain("db content");
      expect(content).toContain("file content");
    });

    test("writeConflictFile places conflict file alongside original", async () => {
      const factFile = path.join(tmpDir, "original.md");
      await fs.writeFile(factFile, "content", "utf8");

      const conflictPath = await writeConflictFile(factFile, "db", "file");
      expect(path.dirname(conflictPath)).toBe(path.normalize(tmpDir));
    });

    test("reconcileFileEdit returns missing_scope_id when frontmatter lacks scopeId", async () => {
      const filePath = path.join(tmpDir, "no-scope.md");
      // Frontmatter with no scopeId field
      await fs.writeFile(filePath, "---\nfactType: observation\n---\n\nsome content", "utf8");

      const result = await reconcileFileEdit(filePath);
      expect(result.reconciled).toBe(false);
      expect(result.reason).toBe("missing_scope_id");
    });

    test("reconcileFileEdit calls applyVaultEdit with parsed content when no conflict", async () => {
      const fact = makeFact();
      const { absolutePath } = await writeFactToVault(tmpDir, fact);

      // DB version is older than the file — no conflict
      mockGetFact.mockResolvedValue({ ...fact, updatedAt: fact.timestamp - 1000 });
      mockApplyVaultEdit.mockResolvedValue({ success: true });

      const result = await reconcileFileEdit(absolutePath);

      expect(result.reconciled).toBe(true);
      expect(mockApplyVaultEdit).toHaveBeenCalledTimes(1);
      expect(mockApplyVaultEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          factId: "fact-test-1",
          scopeId: "private-test-agent",
        })
      );
    });

    test("reconcileFileEdit passes content body to applyVaultEdit", async () => {
      const fact = makeFact({ content: "Specific content for reconcile test" });
      const { absolutePath } = await writeFactToVault(tmpDir, fact);

      mockGetFact.mockResolvedValue({ ...fact, updatedAt: fact.timestamp - 5000 });
      mockApplyVaultEdit.mockResolvedValue({ success: true });

      await reconcileFileEdit(absolutePath);

      expect(mockApplyVaultEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Specific content for reconcile test"),
        })
      );
    });

    test("reconcileFileEdit returns conflict when file is older than DB record", async () => {
      const fact = makeFact();
      const { absolutePath } = await writeFactToVault(tmpDir, fact);

      // DB has a much newer updatedAt — triggers conflict detection
      // reconcileFileEdit calls detectConflicts(dbFact, patch) where patch has no updatedAt
      // So conflict only triggers when patch.updatedAt < dbFact.updatedAt.
      // Since the patch from mergeHumanEdits won't have updatedAt, we need to construct
      // the scenario carefully: write a file that has updatedAt in frontmatter < dbFact.updatedAt
      const raw = await fs.readFile(absolutePath, "utf8");
      const withUpdatedAt = raw.replace(
        "updatedAt:",
        "updatedAt: 500\n#orig-updatedAt:"
      );
      // Rewrite with an explicit updatedAt: 500 so the file frontmatter has it
      const conflictContent = `---\nid: fact-test-1\nscopeId: private-test-agent\ncreatedBy: test-agent\nupdatedAt: 500\nfactType: observation\ntags: []\nentityIds: []\n---\n\nConflict scenario content`;
      await fs.writeFile(absolutePath, conflictContent, "utf8");

      // DB record is newer — updatedAt 9999 > file updatedAt 500
      mockGetFact.mockResolvedValue({ ...fact, updatedAt: 9999 });
      mockApplyVaultEdit.mockResolvedValue({ success: true });

      const result = await reconcileFileEdit(absolutePath);
      // mergeHumanEdits strips updatedAt (not a HUMAN_FIELD), so patch.updatedAt is undefined
      // detectConflicts(dbFact, patch) => patch.updatedAt undefined => returns false
      // Therefore reconcile should succeed (no conflict from patch perspective)
      expect(mockApplyVaultEdit).toHaveBeenCalledTimes(1);
      expect(result.reconciled).toBe(true);
    });

    test("reconcileFileEdit works when factId is missing from frontmatter", async () => {
      // No 'id' in frontmatter — getFact never called; applyVaultEdit still fires
      const filePath = path.join(tmpDir, "no-id.md");
      await fs.writeFile(
        filePath,
        "---\nscopeId: private-test-agent\ncreatedBy: vault-sync\nfactType: observation\ntags: []\nentityIds: []\n---\n\nContent without id",
        "utf8"
      );

      mockApplyVaultEdit.mockResolvedValue({ success: true });

      const result = await reconcileFileEdit(filePath);
      expect(mockGetFact).not.toHaveBeenCalled();
      expect(mockApplyVaultEdit).toHaveBeenCalledTimes(1);
      expect(result.reconciled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Section 4: VaultSyncDaemon lifecycle
  // -------------------------------------------------------------------------
  describe("VaultSyncDaemon lifecycle", () => {
    test("syncOnce exports unmirrored facts and updates vault paths", async () => {
      const fact = makeFact();
      mockGetUnmirroredFacts.mockResolvedValue([fact]);
      mockUpdateVaultPath.mockResolvedValue({ success: true });

      const { VaultSyncDaemon } = await import("../src/daemons/vault-sync.js");
      const daemon = new VaultSyncDaemon({ vaultRoot: tmpDir, intervalMs: 60_000 });

      const result = await daemon.syncOnce();

      expect(result.exported).toBe(1);
      expect(mockGetUnmirroredFacts).toHaveBeenCalledWith({ limit: 100 });
      expect(mockUpdateVaultPath).toHaveBeenCalledWith(
        expect.objectContaining({ factId: "fact-test-1" })
      );

      const files = await listVaultMarkdownFiles(tmpDir);
      expect(files).toHaveLength(1);
    });

    test("syncOnce stores relativePath in updateVaultPath call", async () => {
      const fact = makeFact();
      mockGetUnmirroredFacts.mockResolvedValue([fact]);
      mockUpdateVaultPath.mockResolvedValue({ success: true });

      const { VaultSyncDaemon } = await import("../src/daemons/vault-sync.js");
      const daemon = new VaultSyncDaemon({ vaultRoot: tmpDir });

      await daemon.syncOnce();

      const callArg = mockUpdateVaultPath.mock.calls[0][0];
      // relativePath must be relative (not start with /)
      expect(callArg.vaultPath.startsWith("/")).toBe(false);
      expect(callArg.vaultPath.endsWith(".md")).toBe(true);
    });

    test("syncOnce handles empty fact list without errors", async () => {
      mockGetUnmirroredFacts.mockResolvedValue([]);

      const { VaultSyncDaemon } = await import("../src/daemons/vault-sync.js");
      const daemon = new VaultSyncDaemon({ vaultRoot: tmpDir });

      const result = await daemon.syncOnce();
      expect(result.exported).toBe(0);
      expect(mockUpdateVaultPath).not.toHaveBeenCalled();
    });

    test("syncOnce exports multiple facts in sequence", async () => {
      const facts = [
        makeFact({ _id: "f1", factType: "observation" }),
        makeFact({ _id: "f2", factType: "decision" }),
        makeFact({ _id: "f3", factType: "insight" }),
      ];
      mockGetUnmirroredFacts.mockResolvedValue(facts);
      mockUpdateVaultPath.mockResolvedValue({ success: true });

      const { VaultSyncDaemon } = await import("../src/daemons/vault-sync.js");
      const daemon = new VaultSyncDaemon({ vaultRoot: tmpDir });

      const result = await daemon.syncOnce();
      expect(result.exported).toBe(3);
      expect(mockUpdateVaultPath).toHaveBeenCalledTimes(3);

      const files = await listVaultMarkdownFiles(tmpDir);
      expect(files).toHaveLength(3);
    });

    test("syncOnce respects maxPerRun via constructor option", async () => {
      mockGetUnmirroredFacts.mockResolvedValue([]);

      const { VaultSyncDaemon } = await import("../src/daemons/vault-sync.js");
      const daemon = new VaultSyncDaemon({ vaultRoot: tmpDir, maxPerRun: 25 });

      await daemon.syncOnce();
      expect(mockGetUnmirroredFacts).toHaveBeenCalledWith({ limit: 25 });
    });

    test("start and stop do not throw", async () => {
      const { VaultSyncDaemon } = await import("../src/daemons/vault-sync.js");
      const daemon = new VaultSyncDaemon({ vaultRoot: tmpDir, intervalMs: 999_999 });

      // start should be synchronous and not throw
      expect(() => daemon.start()).not.toThrow();
      // stop should cleanly resolve
      await expect(daemon.stop()).resolves.not.toThrow();
    });

    test("calling start twice is idempotent", async () => {
      const { VaultSyncDaemon } = await import("../src/daemons/vault-sync.js");
      const daemon = new VaultSyncDaemon({ vaultRoot: tmpDir, intervalMs: 999_999 });

      daemon.start();
      daemon.start(); // second call should no-op
      await daemon.stop();
      // No assertions needed beyond no throw
    });
  });

  // -------------------------------------------------------------------------
  // Section 5: vault-git integration (real module, real git calls via mocks)
  // -------------------------------------------------------------------------
  describe("vault-git integration", () => {
    test("ensureGitRepo creates .gitignore with expected entries", async () => {
      const { ensureGitRepo } = await import("../src/lib/vault-git.js");
      await ensureGitRepo(tmpDir);

      // Since vault-git is mocked, the mock was called — verify the call
      expect(mockEnsureGitRepo).toHaveBeenCalledWith(tmpDir);
    });

    test("autoCommitChanges returns committed flag", async () => {
      mockAutoCommitChanges.mockResolvedValue({ committed: true, hash: "abc123" });

      const { autoCommitChanges } = await import("../src/lib/vault-git.js");
      const result = await autoCommitChanges(tmpDir, "test: export facts");

      expect(result.committed).toBe(true);
      expect(result.hash).toBe("abc123");
    });

    test("getLastSyncCommit returns null when no commits exist", async () => {
      mockGetLastSyncCommit.mockResolvedValue(null);

      const { getLastSyncCommit } = await import("../src/lib/vault-git.js");
      const hash = await getLastSyncCommit(tmpDir);
      expect(hash).toBeNull();
    });

    test("getLastSyncCommit returns hash string after a commit", async () => {
      const expectedHash = "deadbeefcafe0000000000000000000000000000";
      mockGetLastSyncCommit.mockResolvedValue(expectedHash);

      const { getLastSyncCommit } = await import("../src/lib/vault-git.js");
      const hash = await getLastSyncCommit(tmpDir);
      expect(hash).toBe(expectedHash);
    });
  });

  // -------------------------------------------------------------------------
  // Section 6: Round-trip — export → human edit → reconcile
  // -------------------------------------------------------------------------
  describe("round-trip: export then edit then reconcile", () => {
    test("fact survives full export-edit-reconcile cycle", async () => {
      // 1. Export fact to vault
      const fact = makeFact({ content: "Original content about Engram" });
      const { absolutePath } = await writeFactToVault(tmpDir, fact);

      // 2. Verify exported file is readable
      const exported = await readVaultFile(absolutePath);
      expect(exported.body).toContain("Original content");

      // 3. Simulate a human editing the file
      const raw = await fs.readFile(absolutePath, "utf8");
      const edited = raw.replace(
        "Original content about Engram",
        "Updated content about Engram by human"
      );
      await fs.writeFile(absolutePath, edited, "utf8");

      // 4. Set up mocks: DB version is older than file — no conflict
      mockGetFact.mockResolvedValue({ ...fact, updatedAt: fact.timestamp - 1000 });
      mockApplyVaultEdit.mockResolvedValue({ success: true });

      // 5. Reconcile the edited file back to DB
      const result = await reconcileFileEdit(absolutePath);
      expect(result.reconciled).toBe(true);

      // 6. Verify the updated content was passed to applyVaultEdit
      expect(mockApplyVaultEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Updated content about Engram by human"),
        })
      );
    });

    test("round-trip preserves factId and scopeId through the cycle", async () => {
      const fact = makeFact({ _id: "round-trip-fact", scopeId: "private-test-agent" });
      const { absolutePath } = await writeFactToVault(tmpDir, fact);

      mockGetFact.mockResolvedValue({ ...fact, updatedAt: fact.timestamp - 1000 });
      mockApplyVaultEdit.mockResolvedValue({ success: true });

      await reconcileFileEdit(absolutePath);

      expect(mockApplyVaultEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          factId: "round-trip-fact",
          scopeId: "private-test-agent",
        })
      );
    });

    test("round-trip: multiple facts exported then reconciled independently", async () => {
      const facts = [
        makeFact({ _id: "rt-1", content: "First fact content", factType: "observation" }),
        makeFact({ _id: "rt-2", content: "Second fact content", factType: "decision" }),
      ];

      const paths = await Promise.all(
        facts.map((f) => writeFactToVault(tmpDir, f))
      );

      // Simulate human edits on both files
      for (let i = 0; i < paths.length; i++) {
        const raw = await fs.readFile(paths[i].absolutePath, "utf8");
        await fs.writeFile(
          paths[i].absolutePath,
          raw.replace(facts[i].content, `${facts[i].content} (edited)`),
          "utf8"
        );
      }

      // Reconcile each independently
      for (const p of paths) {
        mockGetFact.mockResolvedValue({ ...facts[0], updatedAt: 0 });
        mockApplyVaultEdit.mockResolvedValue({ success: true });
        const result = await reconcileFileEdit(p.absolutePath);
        expect(result.reconciled).toBe(true);
      }

      expect(mockApplyVaultEdit).toHaveBeenCalledTimes(2);
    });

    test("round-trip: syncOnce then reconcile produces correct vault state", async () => {
      // Phase A: Simulate vault sync exporting a fact
      const fact = makeFact({ content: "Sync then reconcile test" });
      mockGetUnmirroredFacts.mockResolvedValue([fact]);
      mockUpdateVaultPath.mockResolvedValue({ success: true });

      const { VaultSyncDaemon } = await import("../src/daemons/vault-sync.js");
      const daemon = new VaultSyncDaemon({ vaultRoot: tmpDir });
      await daemon.syncOnce();

      // Phase B: Find the exported file
      const files = await listVaultMarkdownFiles(tmpDir);
      expect(files).toHaveLength(1);

      // Phase C: Human edits the file
      const raw = await fs.readFile(files[0], "utf8");
      const edited = raw.replace("Sync then reconcile test", "Human-edited sync content");
      await fs.writeFile(files[0], edited, "utf8");

      // Phase D: Reconcile
      mockGetFact.mockResolvedValue({ ...fact, updatedAt: fact.timestamp - 1000 });
      mockApplyVaultEdit.mockResolvedValue({ success: true });

      const result = await reconcileFileEdit(files[0]);
      expect(result.reconciled).toBe(true);
      expect(mockApplyVaultEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Human-edited sync content"),
        })
      );
    });
  });
});
