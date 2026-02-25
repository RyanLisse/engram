import { describe, test, expect, vi, beforeEach } from "vitest";

const {
  mockTextSearch, mockVectorSearch, mockBumpAccessBatch, mockRecordRecall,
  mockRankCandidatesPrimitive,
  mockResolveScopes, mockGetGraphNeighbors,
  mockReciprocalRankFusion, mockExtractEntityIds,
  mockReadFile,
  mockKvGet, mockLogEvent, mockGetRecentlyEnrichedFactIds,
} = vi.hoisted(() => ({
  mockTextSearch: vi.fn(),
  mockVectorSearch: vi.fn(),
  mockBumpAccessBatch: vi.fn(),
  mockRecordRecall: vi.fn(),
  mockRankCandidatesPrimitive: vi.fn(),
  mockResolveScopes: vi.fn(),
  mockGetGraphNeighbors: vi.fn(),
  mockReciprocalRankFusion: vi.fn(),
  mockExtractEntityIds: vi.fn(),
  mockReadFile: vi.fn(),
  mockKvGet: vi.fn(),
  mockLogEvent: vi.fn(),
  mockGetRecentlyEnrichedFactIds: vi.fn(),
}));

vi.mock("../src/tools/primitive-retrieval.js", () => ({
  textSearch: mockTextSearch,
  vectorSearch: mockVectorSearch,
  bumpAccessBatch: mockBumpAccessBatch,
  recordRecall: mockRecordRecall,
}));

vi.mock("../src/tools/rank-candidates.js", () => ({
  rankCandidatesPrimitive: mockRankCandidatesPrimitive,
}));

vi.mock("../src/tools/context-primitives.js", () => ({
  resolveScopes: mockResolveScopes,
  getGraphNeighbors: mockGetGraphNeighbors,
}));

vi.mock("../src/lib/rrf.js", () => ({
  reciprocalRankFusion: mockReciprocalRankFusion,
  extractEntityIds: mockExtractEntityIds,
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: mockReadFile,
  },
}));

vi.mock("../src/lib/convex-client.js", () => ({
  kvGet: mockKvGet,
  logEvent: mockLogEvent,
  getRecentlyEnrichedFactIds: mockGetRecentlyEnrichedFactIds,
}));

import { recall } from "../src/tools/recall.js";

const FAKE_FACT = {
  _id: "fact_1",
  content: "TypeScript is great",
  timestamp: Date.now(),
  importanceScore: 0.8,
};

describe("recall", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: vault index file missing (graceful fallback)
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    // Default: scopes resolve successfully
    mockResolveScopes.mockResolvedValue({
      scopeIds: ["scope_1"],
      resolved: [{ name: "private-agent-1", id: "scope_1" }],
    });

    // Default: no entity IDs in results (skip graph pathway)
    mockExtractEntityIds.mockReturnValue([]);

    // Default: bump and record succeed silently
    mockBumpAccessBatch.mockResolvedValue(undefined);
    mockRecordRecall.mockResolvedValue(undefined);
    mockKvGet.mockResolvedValue(null);
    mockLogEvent.mockResolvedValue(undefined);
    // Default: no retroactively enriched facts (empty set)
    mockGetRecentlyEnrichedFactIds.mockResolvedValue(new Set());
  });

  test("returns facts from text search when vector search empty", async () => {
    mockTextSearch.mockResolvedValue([FAKE_FACT]);
    mockVectorSearch.mockResolvedValue([]);
    mockRankCandidatesPrimitive.mockResolvedValue({
      ranked: [FAKE_FACT],
      totalCandidates: 1,
      returnedCount: 1,
    });

    const result = await recall(
      { query: "TypeScript", searchStrategy: "hybrid" },
      "agent-1"
    );

    expect("facts" in result).toBe(true);
    if ("facts" in result) {
      expect(result.facts).toHaveLength(1);
      expect(result.facts[0]._id).toBe("fact_1");
    }
  });

  test("returns recallId as UUID", async () => {
    mockTextSearch.mockResolvedValue([FAKE_FACT]);
    mockVectorSearch.mockResolvedValue([]);
    mockRankCandidatesPrimitive.mockResolvedValue({
      ranked: [FAKE_FACT],
      totalCandidates: 1,
      returnedCount: 1,
    });

    const result = await recall({ query: "test" }, "agent-1");

    expect("recallId" in result).toBe(true);
    if ("recallId" in result) {
      expect(result.recallId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    }
  });

  test("activates semantic pathway when vector results exist", async () => {
    mockTextSearch.mockResolvedValue([]);
    mockVectorSearch.mockResolvedValue([
      { ...FAKE_FACT, _id: "fact_2", _score: 0.9 },
    ]);
    mockRankCandidatesPrimitive.mockResolvedValue({
      ranked: [{ ...FAKE_FACT, _id: "fact_2" }],
      totalCandidates: 1,
      returnedCount: 1,
    });

    const result = await recall(
      { query: "TypeScript", searchStrategy: "hybrid" },
      "agent-1"
    );

    // Verify vector search was called (semantic pathway)
    expect(mockVectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: "TypeScript", scopeIds: ["scope_1"], agentId: "agent-1" })
    );
    // Verify text search was also called (symbolic pathway)
    expect(mockTextSearch).toHaveBeenCalled();
    // Result should contain facts
    expect("facts" in result).toBe(true);
  });

  test("uses RRF when both pathways return results", async () => {
    const fact2 = { ...FAKE_FACT, _id: "fact_2", _score: 0.9 };
    mockTextSearch.mockResolvedValue([FAKE_FACT]);
    mockVectorSearch.mockResolvedValue([fact2]);
    mockReciprocalRankFusion.mockReturnValue([
      { ...FAKE_FACT, rrf_score: 0.5 },
    ]);
    mockRankCandidatesPrimitive.mockResolvedValue({
      ranked: [FAKE_FACT],
      totalCandidates: 1,
      returnedCount: 1,
    });

    await recall(
      { query: "TypeScript", searchStrategy: "hybrid" },
      "agent-1"
    );

    // When both text and vector return results, RRF should merge them
    expect(mockReciprocalRankFusion).toHaveBeenCalled();
  });

  test("returns isError when no scopes resolved", async () => {
    mockResolveScopes.mockResolvedValue({
      isError: true,
      message: 'Scope "bad-scope" not found',
    });

    const result = await recall(
      { query: "test", scopeId: "bad-scope" },
      "agent-1"
    );

    expect(result).toEqual({
      isError: true,
      message: 'Scope "bad-scope" not found',
    });
  });

  test("falls back gracefully when vault index file missing", async () => {
    mockTextSearch.mockResolvedValue([FAKE_FACT]);
    mockVectorSearch.mockResolvedValue([]);
    mockRankCandidatesPrimitive.mockResolvedValue({
      ranked: [FAKE_FACT],
      totalCandidates: 1,
      returnedCount: 1,
    });

    const result = await recall({ query: "anything" }, "agent-1");

    expect("facts" in result).toBe(true);
    if ("facts" in result) {
      expect(result.facts).toHaveLength(1);
    }
  });

  test("routes retrieval to vector pathway for vector-only strategy", async () => {
    const vectorFact = { ...FAKE_FACT, _id: "fact_vector", _score: 0.92 };
    mockVectorSearch.mockResolvedValue([vectorFact]);
    mockRankCandidatesPrimitive.mockResolvedValue({
      ranked: [vectorFact],
      totalCandidates: 1,
      returnedCount: 1,
    });

    const result = await recall(
      { query: "embedding search", searchStrategy: "vector-only" },
      "agent-1"
    );

    expect(mockVectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: "embedding search", scopeIds: ["scope_1"], agentId: "agent-1" })
    );
    expect(mockTextSearch).not.toHaveBeenCalled();
    expect("pathways" in result).toBe(true);
    if ("pathways" in result) {
      expect(result.pathways).toContain("semantic");
      expect(result.pathways).not.toContain("symbolic");
    }
  });

  test("routes retrieval to text pathway for text-only strategy", async () => {
    const textFact = { ...FAKE_FACT, _id: "fact_text" };
    mockTextSearch.mockResolvedValue([textFact]);
    mockRankCandidatesPrimitive.mockResolvedValue({
      ranked: [textFact],
      totalCandidates: 1,
      returnedCount: 1,
    });

    const result = await recall(
      { query: "keyword lookup", searchStrategy: "text-only" },
      "agent-1"
    );

    expect(mockTextSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: "keyword lookup", scopeIds: ["scope_1"] })
    );
    expect(mockVectorSearch).not.toHaveBeenCalled();
    expect("pathways" in result).toBe(true);
    if ("pathways" in result) {
      expect(result.pathways).toContain("symbolic");
      expect(result.pathways).not.toContain("semantic");
    }
  });

  test("applies token budget and reports truncation deterministically", async () => {
    const criticalFact = {
      ...FAKE_FACT,
      _id: "fact_critical",
      observationTier: "critical",
      importanceScore: 0.4,
      tokenEstimate: 6,
    };
    const notableFact = {
      ...FAKE_FACT,
      _id: "fact_notable",
      observationTier: "notable",
      importanceScore: 0.9,
      tokenEstimate: 5,
    };
    const backgroundFact = {
      ...FAKE_FACT,
      _id: "fact_background",
      observationTier: "background",
      importanceScore: 0.99,
      tokenEstimate: 4,
    };

    mockTextSearch.mockResolvedValue([criticalFact, notableFact, backgroundFact]);
    mockVectorSearch.mockResolvedValue([]);
    mockRankCandidatesPrimitive.mockResolvedValue({
      ranked: [backgroundFact, notableFact, criticalFact],
      totalCandidates: 3,
      returnedCount: 3,
    });

    const result = await recall(
      { query: "incident summary", searchStrategy: "text-only", maxTokens: 10 },
      "agent-1"
    );

    expect("facts" in result).toBe(true);
    if ("facts" in result && "tokenUsage" in result) {
      expect(result.facts.map((f: any) => f._id)).toEqual(["fact_critical"]);
      expect(result.tokenUsage).toEqual({
        used: 6,
        budget: 10,
        truncated: true,
      });
    }
  });

  test("reports non-truncated token usage when budget fits all facts", async () => {
    const factA = { ...FAKE_FACT, _id: "fact_a", tokenEstimate: 3 };
    const factB = { ...FAKE_FACT, _id: "fact_b", tokenEstimate: 4 };

    mockTextSearch.mockResolvedValue([factA, factB]);
    mockVectorSearch.mockResolvedValue([]);
    mockRankCandidatesPrimitive.mockResolvedValue({
      ranked: [factA, factB],
      totalCandidates: 2,
      returnedCount: 2,
    });

    const result = await recall(
      { query: "daily notes", searchStrategy: "text-only", maxTokens: 10 },
      "agent-1"
    );

    expect("facts" in result).toBe(true);
    if ("facts" in result && "tokenUsage" in result) {
      expect(result.facts.map((f: any) => f._id)).toEqual(["fact_a", "fact_b"]);
      expect(result.tokenUsage).toEqual({
        used: 7,
        budget: 10,
        truncated: false,
      });
    }
  });

  test("routes lookup intent through kv lookup and avoids vector by default", async () => {
    mockKvGet.mockResolvedValue({
      value: "bun",
      category: "preference",
      updatedAt: Date.now(),
    });
    mockTextSearch.mockResolvedValue([]);
    mockRankCandidatesPrimitive.mockImplementation(async ({ candidates }) => ({
      ranked: candidates,
      totalCandidates: candidates.length,
      returnedCount: candidates.length,
    }));

    const result = await recall(
      { query: "what does ryan prefer for package manager", searchStrategy: "hybrid" },
      "agent-1"
    );

    expect(mockKvGet).toHaveBeenCalled();
    expect(mockVectorSearch).not.toHaveBeenCalled();
    expect("facts" in result).toBe(true);
    if ("facts" in result) {
      expect(result.facts.length).toBeGreaterThan(0);
      expect(result.facts[0].content).toBe("bun");
      expect(result.intent).toBe("lookup");
    }
  });

  test("passes agentId through to vector search for personalization", async () => {
    const vectorFact = { ...FAKE_FACT, _id: "fact_personalized", _score: 0.93 };
    mockTextSearch.mockResolvedValue([]);
    mockVectorSearch.mockResolvedValue([vectorFact]);
    mockRankCandidatesPrimitive.mockResolvedValue({
      ranked: [vectorFact],
      totalCandidates: 1,
      returnedCount: 1,
    });

    await recall(
      { query: "design preferences", searchStrategy: "vector-only" },
      "agent-xyz"
    );

    expect(mockVectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "design preferences",
        scopeIds: ["scope_1"],
        agentId: "agent-xyz",
      })
    );
  });

  test("honors tokenBudget field and returns budget metadata", async () => {
    const factA = { ...FAKE_FACT, _id: "fact_a", tokenEstimate: 8 };
    const factB = { ...FAKE_FACT, _id: "fact_b", tokenEstimate: 8 };
    mockTextSearch.mockResolvedValue([factA, factB]);
    mockVectorSearch.mockResolvedValue([]);
    mockRankCandidatesPrimitive.mockResolvedValue({
      ranked: [factA, factB],
      totalCandidates: 2,
      returnedCount: 2,
    });

    const result = await recall(
      { query: "timeline", searchStrategy: "text-only", tokenBudget: 10 },
      "agent-1"
    );

    expect("facts" in result).toBe(true);
    if ("facts" in result) {
      expect(result.facts).toHaveLength(1);
      expect(result.tokenBudget).toBe(10);
      expect(result.tokensUsed).toBe(8);
      expect(result.tokensAvailable).toBe(2);
      expect(result.factsTruncated).toBe(true);
    }
  });
});
