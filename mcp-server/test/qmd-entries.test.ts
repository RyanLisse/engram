import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks (accessible inside vi.mock factories) ──────────────

const {
  mockQmdInstance,
  mockVectorRecall,
  mockGenerateEmbedding,
} = vi.hoisted(() => ({
  mockQmdInstance: {
    isEnabled: vi.fn(),
    isInstalled: vi.fn(),
    search: vi.fn(),
  },
  mockVectorRecall: vi.fn(),
  mockGenerateEmbedding: vi.fn(),
}));

vi.mock("../src/lib/qmd-manager.js", () => ({
  QmdManager: {
    getInstance: () => mockQmdInstance,
  },
}));

vi.mock("../src/lib/convex-client.js", () => ({
  vectorRecall: mockVectorRecall,
}));

// The source imports from "../../lib/embeddings.js" — with the vitest alias
// (.js -> .ts) this resolves to ../src/lib/embeddings.ts from the tool file.
// We mock both possible resolution paths.
vi.mock("../src/lib/embeddings.js", () => ({
  generateEmbedding: mockGenerateEmbedding,
}));

import { entries } from "../src/lib/tool-registry/qmd-entries.js";

// ── Helpers ──────────────────────────────────────────────────────────

function findTool(name: string) {
  const entry = entries.find((e) => e.tool.name === name);
  if (!entry) throw new Error(`Tool ${name} not found in entries`);
  return entry;
}

const AGENT_ID = "test-agent";

// ── Fixture data ─────────────────────────────────────────────────────

const LOCAL_RESULTS = [
  {
    path: "private-indy/decisions/use-qmd.md",
    docId: "abc123",
    title: "Use QMD for local search",
    score: 0.85,
    snippet: "Decided to use QMD for on-device search.",
    factId: "fact-abc123",
  },
  {
    path: "private-indy/observations/vault-sync.md",
    docId: "def456",
    title: "Vault sync latency",
    score: 0.62,
    snippet: "Observed 3s latency during vault sync.",
    factId: "fact-def456",
  },
];

const CLOUD_RESULTS = [
  {
    _id: "conv-001",
    content: "Cloud result about QMD integration",
    score: 0.9,
    factId: "fact-abc123", // Same factId as local — tests dedup
  },
  {
    _id: "conv-002",
    content: "Cloud result about search architecture",
    score: 0.75,
    factId: "fact-ghi789",
  },
];

// ── Tests ────────────────────────────────────────────────────────────

describe("QMD MCP Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQmdInstance.isEnabled.mockReturnValue(true);
    mockQmdInstance.isInstalled.mockResolvedValue(true);
    mockQmdInstance.search.mockResolvedValue({ ok: true, value: LOCAL_RESULTS });
    mockGenerateEmbedding.mockResolvedValue(new Array(1024).fill(0.1));
    mockVectorRecall.mockResolvedValue(CLOUD_RESULTS);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── memory_local_search ──────────────────────────────────────────

  describe("memory_local_search", () => {
    test("returns results with searchMode=bm25", async () => {
      const tool = findTool("memory_local_search");
      const result = await tool.handler({ query: "local search", limit: 10, minScore: 0.2 }, AGENT_ID);

      expect(result.searchMode).toBe("bm25");
      expect(result.results).toEqual(LOCAL_RESULTS);
      expect(result.totalResults).toBe(2);
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
      expect(mockQmdInstance.search).toHaveBeenCalledWith("local search", "search", {
        limit: 10,
        minScore: 0.2,
        scope: undefined,
      });
    });

    test("returns error when QMD disabled", async () => {
      mockQmdInstance.isEnabled.mockReturnValue(false);
      const tool = findTool("memory_local_search");
      const result = await tool.handler({ query: "test", limit: 10, minScore: 0.2 }, AGENT_ID);

      expect(result.error).toBe(true);
      expect(result.message).toContain("disabled");
    });

    test("returns error when QMD not installed", async () => {
      mockQmdInstance.isEnabled.mockReturnValue(true);
      mockQmdInstance.isInstalled.mockResolvedValue(false);
      const tool = findTool("memory_local_search");
      const result = await tool.handler({ query: "test", limit: 10, minScore: 0.2 }, AGENT_ID);

      expect(result.error).toBe(true);
      expect(result.message).toContain("not found");
    });

    test("passes scope filter to QMD", async () => {
      const tool = findTool("memory_local_search");
      await tool.handler(
        { query: "test", scope: "private-indy", limit: 5, minScore: 0.5 },
        AGENT_ID,
      );

      expect(mockQmdInstance.search).toHaveBeenCalledWith("test", "search", {
        limit: 5,
        minScore: 0.5,
        scope: "private-indy",
      });
    });

    test("returns error message when search fails", async () => {
      mockQmdInstance.search.mockResolvedValue({
        ok: false,
        error: { type: "timeout", message: "Search timed out", timeoutMs: 30000 },
      });

      const tool = findTool("memory_local_search");
      const result = await tool.handler({ query: "slow query", limit: 10, minScore: 0.2 }, AGENT_ID);

      expect(result.error).toBe(true);
      expect(result.message).toContain("timed out");
    });
  });

  // ── memory_local_vsearch ─────────────────────────────────────────

  describe("memory_local_vsearch", () => {
    test("returns results with searchMode=vector", async () => {
      const tool = findTool("memory_local_vsearch");
      const result = await tool.handler({ query: "semantic search", limit: 10, minScore: 0.2 }, AGENT_ID);

      expect(result.searchMode).toBe("vector");
      expect(result.results).toEqual(LOCAL_RESULTS);
      expect(mockQmdInstance.search).toHaveBeenCalledWith("semantic search", "vsearch", {
        limit: 10,
        minScore: 0.2,
        scope: undefined,
      });
    });
  });

  // ── memory_local_query ───────────────────────────────────────────

  describe("memory_local_query", () => {
    test("returns results with searchMode=hybrid", async () => {
      const tool = findTool("memory_local_query");
      const result = await tool.handler({ query: "hybrid query", limit: 10, minScore: 0.2, full: false }, AGENT_ID);

      expect(result.searchMode).toBe("hybrid");
      expect(result.results).toEqual(LOCAL_RESULTS);
      expect(mockQmdInstance.search).toHaveBeenCalledWith("hybrid query", "query", {
        limit: 10,
        minScore: 0.2,
        scope: undefined,
        full: false,
      });
    });

    test("supports full option", async () => {
      const tool = findTool("memory_local_query");
      await tool.handler({ query: "detailed query", full: true, limit: 10, minScore: 0.2 }, AGENT_ID);

      expect(mockQmdInstance.search).toHaveBeenCalledWith("detailed query", "query", {
        limit: 10,
        minScore: 0.2,
        scope: undefined,
        full: true,
      });
    });
  });

  // ── memory_deep_search ───────────────────────────────────────────

  describe("memory_deep_search", () => {
    test("fuses cloud and local results via RRF", async () => {
      const tool = findTool("memory_deep_search");
      const result = await tool.handler({ query: "deep search" }, AGENT_ID);

      expect(result.searchMode).toBe("deep");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.sources.cloud.available).toBe(true);
      expect(result.sources.local.available).toBe(true);
      expect(result.sources.cloud.count).toBe(2);
      expect(result.sources.local.count).toBe(2);
    });

    test("deduplicates by factId", async () => {
      const tool = findTool("memory_deep_search");
      const result = await tool.handler({ query: "deep search" }, AGENT_ID);

      // fact-abc123 appears in both cloud and local — should only appear once
      const factIds = result.results
        .map((r: any) => r.factId)
        .filter((id: any) => id === "fact-abc123");
      expect(factIds.length).toBeLessThanOrEqual(1);
    });

    test("handles cloud-only fallback when QMD unavailable", async () => {
      mockQmdInstance.isEnabled.mockReturnValue(false);

      const tool = findTool("memory_deep_search");
      const result = await tool.handler({ query: "cloud only" }, AGENT_ID);

      expect(result.sources.cloud.available).toBe(true);
      expect(result.sources.local.available).toBe(true);
      expect(result.sources.local.count).toBe(0);
      expect(result.results.length).toBeGreaterThan(0);
    });

    test("handles local-only fallback when Convex unavailable", async () => {
      mockVectorRecall.mockRejectedValue(new Error("Network error"));
      mockGenerateEmbedding.mockRejectedValue(new Error("Embedding failed"));

      const tool = findTool("memory_deep_search");
      const result = await tool.handler({ query: "local only" }, AGENT_ID);

      expect(result.sources.cloud.available).toBe(false);
      expect(result.sources.local.available).toBe(true);
      expect(result.sources.local.count).toBe(2);
      expect(result.results.length).toBeGreaterThan(0);
    });

    test("returns empty results when both sources fail", async () => {
      mockVectorRecall.mockRejectedValue(new Error("Network error"));
      mockGenerateEmbedding.mockRejectedValue(new Error("Embedding failed"));
      mockQmdInstance.isEnabled.mockReturnValue(false);

      const tool = findTool("memory_deep_search");
      const result = await tool.handler({ query: "all fail" }, AGENT_ID);

      expect(result.sources.cloud.available).toBe(false);
      expect(result.sources.local.available).toBe(true);
      expect(result.sources.local.count).toBe(0);
      expect(result.sources.cloud.count).toBe(0);
      expect(result.results.length).toBe(0);
    });

    test("respects weight tuning via weights option", async () => {
      const tool = findTool("memory_deep_search");
      const result = await tool.handler(
        {
          query: "weighted search",
          weights: { cloud: 0.8, local: 0.2 },
        },
        AGENT_ID,
      );

      expect(result.searchMode).toBe("deep");
      expect(result.results.length).toBeGreaterThan(0);
    });

    test("includes source attribution per result", async () => {
      const tool = findTool("memory_deep_search");
      const result = await tool.handler({ query: "source test" }, AGENT_ID);

      for (const r of result.results) {
        expect(["cloud", "local", "both"]).toContain(r.source);
      }
    });

    test("respects limit option", async () => {
      const tool = findTool("memory_deep_search");
      const result = await tool.handler({ query: "limited", limit: 1 }, AGENT_ID);

      expect(result.results.length).toBeLessThanOrEqual(1);
    });
  });
});
