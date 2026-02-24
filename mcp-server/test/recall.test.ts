import { describe, test, expect, vi, beforeEach } from "vitest";

const {
  mockTextSearch, mockVectorSearch, mockBumpAccessBatch, mockRecordRecall,
  mockRankCandidatesPrimitive,
  mockResolveScopes, mockGetGraphNeighbors,
  mockReciprocalRankFusion, mockExtractEntityIds,
  mockReadFile,
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
      expect.objectContaining({ query: "TypeScript", scopeIds: ["scope_1"] })
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
});
