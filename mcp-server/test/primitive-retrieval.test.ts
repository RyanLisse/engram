import { describe, test, expect, vi, beforeEach } from "vitest";

const {
  mockGenerateEmbedding,
  mockVectorRecall,
  mockIsLanceCacheEnabled,
  mockSearchLocalCache,
} = vi.hoisted(() => ({
  mockGenerateEmbedding: vi.fn(),
  mockVectorRecall: vi.fn(),
  mockIsLanceCacheEnabled: vi.fn(),
  mockSearchLocalCache: vi.fn(),
}));

vi.mock("../src/lib/embeddings.js", () => ({
  generateEmbedding: mockGenerateEmbedding,
}));

vi.mock("../src/lib/convex-client.js", () => ({
  vectorRecall: mockVectorRecall,
}));

vi.mock("../src/lib/lance-cache.js", () => ({
  isLanceCacheEnabled: mockIsLanceCacheEnabled,
  searchLocalCache: mockSearchLocalCache,
}));

import { vectorSearch } from "../src/tools/primitive-retrieval.js";

describe("vectorSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockVectorRecall.mockResolvedValue([{ _id: "fact_1", _score: 0.9 }]);
    mockIsLanceCacheEnabled.mockResolvedValue(false);
    mockSearchLocalCache.mockResolvedValue([]);
  });

  test("passes agentId to convex vector recall when provided", async () => {
    await vectorSearch({
      query: "typescript notes",
      scopeIds: ["scope_1"],
      limit: 5,
      agentId: "agent-42",
    });

    expect(mockVectorRecall).toHaveBeenCalledWith({
      embedding: [0.1, 0.2, 0.3],
      scopeIds: ["scope_1"],
      limit: 5,
      agentId: "agent-42",
    });
  });

  test("keeps backward compatibility when agentId is omitted", async () => {
    await vectorSearch({
      query: "typescript notes",
      scopeIds: ["scope_1"],
      limit: 5,
    });

    expect(mockVectorRecall).toHaveBeenCalledWith({
      embedding: [0.1, 0.2, 0.3],
      scopeIds: ["scope_1"],
      limit: 5,
      agentId: undefined,
    });
  });
});
