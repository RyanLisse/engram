import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock strategy ────────────────────────────────────────────────────
// QmdManager uses: const execFileAsync = promisify(execFileCb)
// We mock node:child_process to provide a callback-style execFile,
// and mock node:util's promisify to return our controllable async fn.

const mockExecFileAsync = vi.fn<any>();

vi.mock("node:child_process", () => ({
  execFile: vi.fn(), // not used directly — promisify wraps it
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecFileAsync,
}));

let QmdManager: any;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  // Re-mock after module reset
  vi.doMock("node:child_process", () => ({
    execFile: vi.fn(),
  }));
  vi.doMock("node:util", () => ({
    promisify: () => mockExecFileAsync,
  }));
  const mod = await import("../src/lib/qmd-manager.js");
  QmdManager = mod.QmdManager;
});

afterEach(() => {
  delete process.env.ENGRAM_QMD_ENABLED;
});

// ── QmdManager tests ────────────────────────────────────────────────

describe("QmdManager", () => {
  // ── isInstalled ──────────────────────────────────────────────────

  describe("isInstalled", () => {
    test("returns true when qmd binary is found", async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: "qmd 0.4.2\n", stderr: "" });

      const qmd = QmdManager.getInstance();
      const result = await qmd.isInstalled();

      expect(result).toBe(true);
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        "qmd",
        ["--version"],
        expect.objectContaining({ timeout: 5_000 }),
      );
    });

    test("returns false when qmd binary is not in PATH", async () => {
      mockExecFileAsync.mockRejectedValue(new Error("ENOENT"));

      const qmd = QmdManager.getInstance();
      const result = await qmd.isInstalled();

      expect(result).toBe(false);
    });

    test("caches result for process lifetime", async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: "qmd 0.4.2\n", stderr: "" });

      const qmd = QmdManager.getInstance();
      await qmd.isInstalled();
      await qmd.isInstalled();
      await qmd.isInstalled();

      // Only one call — the rest served from cache
      expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
    });

    test("caches false result too (no repeated probes)", async () => {
      mockExecFileAsync.mockRejectedValue(new Error("ENOENT"));

      const qmd = QmdManager.getInstance();
      await qmd.isInstalled();
      await qmd.isInstalled();

      expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
    });
  });

  // ── getVersion ───────────────────────────────────────────────────

  describe("getVersion", () => {
    test("returns version string when installed", async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: "qmd 0.4.2\n", stderr: "" });

      const qmd = QmdManager.getInstance();
      const version = await qmd.getVersion();

      expect(version).toBe("qmd 0.4.2");
    });

    test("returns null when not installed", async () => {
      mockExecFileAsync.mockRejectedValue(new Error("ENOENT"));

      const qmd = QmdManager.getInstance();
      const version = await qmd.getVersion();

      expect(version).toBeNull();
    });
  });

  // ── isEnabled ────────────────────────────────────────────────────

  describe("isEnabled", () => {
    test("returns true when ENGRAM_QMD_ENABLED=true", () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      const qmd = QmdManager.getInstance();
      expect(qmd.isEnabled()).toBe(true);
    });

    test("returns false when ENGRAM_QMD_ENABLED is unset", () => {
      delete process.env.ENGRAM_QMD_ENABLED;
      const qmd = QmdManager.getInstance();
      expect(qmd.isEnabled()).toBe(false);
    });

    test("returns false when ENGRAM_QMD_ENABLED=false", () => {
      process.env.ENGRAM_QMD_ENABLED = "false";
      const qmd = QmdManager.getInstance();
      expect(qmd.isEnabled()).toBe(false);
    });

    test("returns false for other truthy-looking strings", () => {
      process.env.ENGRAM_QMD_ENABLED = "1";
      const qmd = QmdManager.getInstance();
      expect(qmd.isEnabled()).toBe(false);

      process.env.ENGRAM_QMD_ENABLED = "yes";
      expect(qmd.isEnabled()).toBe(false);
    });
  });

  // ── search ───────────────────────────────────────────────────────

  describe("search", () => {
    const SEARCH_RESULTS_JSON = JSON.stringify([
      {
        path: "private-indy/decisions/2026-02-27-use-qmd.md",
        doc_id: "abc123",
        title: "Use QMD for local search",
        score: 0.85,
        snippet: "Decided to use QMD for on-device search.",
        metadata: { id: "fact-abc123" },
      },
      {
        path: "private-indy/observations/2026-02-27-vault-sync.md",
        doc_id: "def456",
        title: "Vault sync latency",
        score: 0.62,
        snippet: "Observed 3s latency during vault sync.",
        metadata: { id: "fact-def456" },
      },
      {
        path: "team-alpha/notes/low-score.md",
        doc_id: "ghi789",
        title: "Low relevance note",
        score: 0.1,
        snippet: "Barely relevant content.",
      },
    ]);

    function setupQmdInstalled() {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (args.includes("--version")) {
          return { stdout: "qmd 0.4.2\n", stderr: "" };
        }
        return { stdout: SEARCH_RESULTS_JSON, stderr: "" };
      });
    }

    test("returns results for BM25 search mode", async () => {
      setupQmdInstalled();
      const qmd = QmdManager.getInstance();
      const result = await qmd.search("QMD local search", "search");

      expect(result.ok).toBe(true);
      if (result.ok) {
        // minScore default is 0.2, so the 0.1 result is filtered out
        expect(result.value.length).toBe(2);
        expect(result.value[0].title).toBe("Use QMD for local search");
        expect(result.value[0].score).toBe(0.85);
        expect(result.value[0].factId).toBe("fact-abc123");
      }
    });

    test("returns results for vsearch mode", async () => {
      setupQmdInstalled();
      const qmd = QmdManager.getInstance();
      const result = await qmd.search("semantic query", "vsearch");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
      }
    });

    test("returns results for query mode", async () => {
      setupQmdInstalled();
      const qmd = QmdManager.getInstance();
      const result = await qmd.search("hybrid query", "query");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
      }
    });

    test("filters by scope when scope option provided", async () => {
      setupQmdInstalled();
      const qmd = QmdManager.getInstance();
      const result = await qmd.search("query", "search", {
        scope: "private-indy",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
        expect(result.value.every((r) => r.path.startsWith("private-indy/"))).toBe(true);
      }
    });

    test("respects limit option via args", async () => {
      setupQmdInstalled();
      const qmd = QmdManager.getInstance();
      await qmd.search("query", "search", { limit: 5 });

      // Find the search call (not the --version call)
      const searchCall = mockExecFileAsync.mock.calls.find(
        (c: any[]) => c[1] && !c[1].includes("--version"),
      );
      expect(searchCall).toBeDefined();
      if (searchCall) {
        expect(searchCall[1]).toContain("--limit");
        expect(searchCall[1]).toContain("5");
      }
    });

    test("returns error when QMD not installed", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockRejectedValue(new Error("ENOENT"));

      const qmd = QmdManager.getInstance();
      const result = await qmd.search("query", "search");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("not_installed");
      }
    });

    test("returns error when QMD disabled", async () => {
      delete process.env.ENGRAM_QMD_ENABLED;

      const qmd = QmdManager.getInstance();
      const result = await qmd.search("query", "search");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("disabled");
      }
    });

    test("handles timeout gracefully", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (args.includes("--version")) {
          return { stdout: "qmd 0.4.2\n", stderr: "" };
        }
        const err: any = new Error("Timeout");
        err.killed = true;
        err.signal = "SIGTERM";
        throw err;
      });

      const qmd = QmdManager.getInstance();
      const result = await qmd.search("slow query", "search");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("timeout");
        if (result.error.type === "timeout") {
          expect(result.error.timeoutMs).toBeDefined();
        }
      }
    });

    test("parses factId from result metadata", async () => {
      setupQmdInstalled();
      const qmd = QmdManager.getInstance();
      const result = await qmd.search("query", "search");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].factId).toBe("fact-abc123");
        expect(result.value[1].factId).toBe("fact-def456");
      }
    });

    test("handles parse error when QMD returns non-JSON", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (args.includes("--version")) {
          return { stdout: "qmd 0.4.2\n", stderr: "" };
        }
        return { stdout: "Not valid JSON at all!", stderr: "" };
      });

      const qmd = QmdManager.getInstance();
      const result = await qmd.search("query", "search");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("parse_error");
      }
    });

    test("filters results below minScore threshold", async () => {
      setupQmdInstalled();
      const qmd = QmdManager.getInstance();
      const result = await qmd.search("query", "search", { minScore: 0.8 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Only the 0.85 result passes minScore=0.8
        expect(result.value.length).toBe(1);
        expect(result.value[0].score).toBeGreaterThanOrEqual(0.8);
      }
    });

    test("passes --full flag when full option set", async () => {
      setupQmdInstalled();
      const qmd = QmdManager.getInstance();
      await qmd.search("query", "query", { full: true });

      const searchCall = mockExecFileAsync.mock.calls.find(
        (c: any[]) => c[1] && !c[1].includes("--version"),
      );
      expect(searchCall).toBeDefined();
      if (searchCall) {
        expect(searchCall[1]).toContain("--full");
      }
    });

    test("handles wrapped results format ({results: [...]})", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (args.includes("--version")) {
          return { stdout: "qmd 0.4.2\n", stderr: "" };
        }
        return {
          stdout: JSON.stringify({
            results: [
              { path: "note.md", doc_id: "x", title: "A note", score: 0.7, snippet: "content" },
            ],
          }),
          stderr: "",
        };
      });

      const qmd = QmdManager.getInstance();
      const result = await qmd.search("query", "search");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0].title).toBe("A note");
      }
    });
  });

  // ── reindex ──────────────────────────────────────────────────────

  describe("reindex", () => {
    test("returns file count and duration", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (args.includes("--version")) {
          return { stdout: "qmd 0.4.2\n", stderr: "" };
        }
        return { stdout: JSON.stringify({ files_indexed: 42 }), stderr: "" };
      });

      const qmd = QmdManager.getInstance();
      const result = await qmd.reindex();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filesIndexed).toBe(42);
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    test("returns error when QMD not installed", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockRejectedValue(new Error("ENOENT"));

      const qmd = QmdManager.getInstance();
      const result = await qmd.reindex();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("not_installed");
      }
    });

    test("returns error when QMD disabled", async () => {
      delete process.env.ENGRAM_QMD_ENABLED;

      const qmd = QmdManager.getInstance();
      const result = await qmd.reindex();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("disabled");
      }
    });

    test("handles non-JSON index output gracefully", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (args.includes("--version")) {
          return { stdout: "qmd 0.4.2\n", stderr: "" };
        }
        return { stdout: "Indexed 42 files successfully.", stderr: "" };
      });

      const qmd = QmdManager.getInstance();
      const result = await qmd.reindex();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filesIndexed).toBe(0);
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── getStatus ────────────────────────────────────────────────────

  describe("getStatus", () => {
    test("returns full status when QMD installed and enabled", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (args.includes("--version")) {
          return { stdout: "qmd 0.4.2\n", stderr: "" };
        }
        if (args.includes("info")) {
          return {
            stdout: JSON.stringify({
              document_count: 150,
              embedding_count: 148,
              last_indexed: "2026-02-27T10:00:00Z",
            }),
            stderr: "",
          };
        }
        return { stdout: "{}", stderr: "" };
      });

      const qmd = QmdManager.getInstance();
      const status = await qmd.getStatus();

      expect(status.installed).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.version).toBe("qmd 0.4.2");
      expect(status.collectionExists).toBe(true);
      expect(status.documentCount).toBe(150);
      expect(status.embeddingCount).toBe(148);
      expect(status.lastIndexed).toBeInstanceOf(Date);
    });

    test("returns installed=false when not installed", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockRejectedValue(new Error("ENOENT"));

      const qmd = QmdManager.getInstance();
      const status = await qmd.getStatus();

      expect(status.installed).toBe(false);
      expect(status.version).toBeUndefined();
      expect(status.collectionExists).toBe(false);
      expect(status.documentCount).toBe(0);
    });

    test("returns enabled=false when disabled", async () => {
      delete process.env.ENGRAM_QMD_ENABLED;
      mockExecFileAsync.mockResolvedValue({ stdout: "qmd 0.4.2\n", stderr: "" });

      const qmd = QmdManager.getInstance();
      const status = await qmd.getStatus();

      expect(status.installed).toBe(true);
      expect(status.enabled).toBe(false);
      expect(status.collectionExists).toBe(false);
    });
  });

  // ── ensureCollection ─────────────────────────────────────────────

  describe("ensureCollection", () => {
    test("creates collection when missing", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (args.includes("--version")) {
          return { stdout: "qmd 0.4.2\n", stderr: "" };
        }
        if (args.includes("list")) {
          return { stdout: JSON.stringify([{ name: "other-collection" }]), stderr: "" };
        }
        if (args.includes("create")) {
          return { stdout: "Collection created.", stderr: "" };
        }
        return { stdout: "{}", stderr: "" };
      });

      const qmd = QmdManager.getInstance();
      const result = await qmd.ensureCollection("/home/user/vault");

      expect(result.ok).toBe(true);
      const createCall = mockExecFileAsync.mock.calls.find(
        (c: any[]) => c[1] && c[1].includes("create"),
      );
      expect(createCall).toBeDefined();
    });

    test("no-ops when collection exists", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (args.includes("--version")) {
          return { stdout: "qmd 0.4.2\n", stderr: "" };
        }
        if (args.includes("list")) {
          return { stdout: JSON.stringify([{ name: "engram-vault" }]), stderr: "" };
        }
        return { stdout: "{}", stderr: "" };
      });

      const qmd = QmdManager.getInstance();
      const result = await qmd.ensureCollection("/home/user/vault");

      expect(result.ok).toBe(true);
      const createCall = mockExecFileAsync.mock.calls.find(
        (c: any[]) => c[1] && c[1].includes("create"),
      );
      expect(createCall).toBeUndefined();
    });

    test("returns error when QMD disabled", async () => {
      delete process.env.ENGRAM_QMD_ENABLED;

      const qmd = QmdManager.getInstance();
      const result = await qmd.ensureCollection("/home/user/vault");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("disabled");
      }
    });

    test("returns error when QMD not installed", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockRejectedValue(new Error("ENOENT"));

      const qmd = QmdManager.getInstance();
      const result = await qmd.ensureCollection("/home/user/vault");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("not_installed");
      }
    });

    test("accepts custom collection name", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (args.includes("--version")) {
          return { stdout: "qmd 0.4.2\n", stderr: "" };
        }
        if (args.includes("list")) {
          return { stdout: JSON.stringify([]), stderr: "" };
        }
        if (args.includes("create")) {
          return { stdout: "Collection created.", stderr: "" };
        }
        return { stdout: "{}", stderr: "" };
      });

      const qmd = QmdManager.getInstance();
      const result = await qmd.ensureCollection("/home/user/vault", "my-custom-collection");

      expect(result.ok).toBe(true);
      const createCall = mockExecFileAsync.mock.calls.find(
        (c: any[]) => c[1] && c[1].includes("create"),
      );
      expect(createCall).toBeDefined();
      if (createCall) {
        expect(createCall[1]).toContain("my-custom-collection");
      }
    });
  });

  // ── getDocument ──────────────────────────────────────────────────

  describe("getDocument", () => {
    test("returns document content by path", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (args.includes("--version")) {
          return { stdout: "qmd 0.4.2\n", stderr: "" };
        }
        if (args.includes("get")) {
          return { stdout: "# Document Title\n\nFull content here.", stderr: "" };
        }
        return { stdout: "{}", stderr: "" };
      });

      const qmd = QmdManager.getInstance();
      const result = await qmd.getDocument("private-indy/decisions/use-qmd.md");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain("Document Title");
      }
    });
  });

  // ── execQmd error handling ───────────────────────────────────────

  describe("execQmd error handling", () => {
    test("returns execution_error for non-zero exit code", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (args.includes("--version")) {
          return { stdout: "qmd 0.4.2\n", stderr: "" };
        }
        const err: any = new Error("Command failed");
        err.code = 2;
        err.stderr = "Invalid collection name";
        throw err;
      });

      const qmd = QmdManager.getInstance();
      const result = await qmd.search("query", "search");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("execution_error");
        if (result.error.type === "execution_error") {
          expect(result.error.exitCode).toBe(2);
          expect(result.error.message).toContain("Invalid collection name");
        }
      }
    });

    test("returns execution_error for generic failures", async () => {
      process.env.ENGRAM_QMD_ENABLED = "true";
      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (args.includes("--version")) {
          return { stdout: "qmd 0.4.2\n", stderr: "" };
        }
        throw new Error("Unexpected crash");
      });

      const qmd = QmdManager.getInstance();
      const result = await qmd.search("query", "search");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("execution_error");
        if (result.error.type === "execution_error") {
          expect(result.error.message).toContain("Unexpected crash");
        }
      }
    });
  });
});
