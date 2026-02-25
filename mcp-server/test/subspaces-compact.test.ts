import { beforeEach, describe, expect, test, vi } from "vitest";

const {
  mockQuery,
  mockMutate,
  mockGetScopeByName,
  mockGenerateEmbedding,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockMutate: vi.fn(),
  mockGetScopeByName: vi.fn(),
  mockGenerateEmbedding: vi.fn(),
}));

vi.mock("../src/lib/convex-client.js", () => ({
  query: mockQuery,
  mutate: mockMutate,
  getScopeByName: mockGetScopeByName,
}));

vi.mock("../src/lib/embeddings.js", () => ({
  generateEmbedding: mockGenerateEmbedding,
}));

import { PATHS } from "../src/lib/convex-paths.js";
import { consolidateEmbeddings } from "../src/lib/svd-consolidation.js";
import { consolidateEmbeddingsTool, querySubspace } from "../src/tools/subspaces.js";

describe("svd-consolidation", () => {
  test("returns singular values aligned to extracted components", () => {
    const embeddings = [
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [0.8, 0.2, 0],
    ];

    const result = consolidateEmbeddings(embeddings, 2);

    expect(result.components).toHaveLength(2);
    expect(result.singularValues).toHaveLength(2);
    expect(result.componentVariances).toHaveLength(2);
    expect(result.singularValues[0]).toBeGreaterThan(result.singularValues[1]);
  });
});

describe("subspace compact embeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScopeByName.mockResolvedValue({ _id: "j_scope_1" });
  });

  test("consolidateEmbeddingsTool computes and writes compact embeddings to facts", async () => {
    mockQuery.mockImplementation(async (path: string) => {
      if (path === PATHS.subspaces.getSubspace) {
        return { _id: "j_sub_1", factIds: ["j_fact_1", "j_fact_2"] };
      }
      if (path === PATHS.facts.getByIds) {
        return [
          { _id: "j_fact_1", embedding: [1, 0], lifecycleState: "active" },
          { _id: "j_fact_2", embedding: [0, 1], lifecycleState: "active" },
        ];
      }
      throw new Error(`Unexpected query path: ${path}`);
    });

    await consolidateEmbeddingsTool({ subspaceId: "j_sub_1", k: 2 }, "agent-1");

    const factPatchCalls = mockMutate.mock.calls.filter(([path]) => path === PATHS.facts.updateFact);
    expect(factPatchCalls).toHaveLength(2);
    const subspaceUpdateCall = mockMutate.mock.calls.find(([path]) => path === PATHS.subspaces.updateSubspace);
    expect(subspaceUpdateCall).toBeDefined();
    const expectedCompactDim = subspaceUpdateCall?.[1]?.components?.length ?? 0;

    for (const [, payload] of factPatchCalls) {
      expect(payload.factId).toMatch(/^j_fact_/);
      expect(payload.compactEmbedding).toHaveLength(expectedCompactDim);
    }

    expect(subspaceUpdateCall?.[1]).toMatchObject({
      subspaceId: "j_sub_1",
      components: expect.any(Array),
      componentVariances: expect.any(Array),
      singularValues: expect.any(Array),
      compactEmbeddingsByFactId: expect.any(Object),
    });
  });

  test("querySubspace ranks using compact similarity when compact vectors exist", async () => {
    mockGenerateEmbedding.mockResolvedValue([1, 0]);
    mockQuery.mockResolvedValue([
      {
        _id: "j_sub_1",
        name: "matched",
        description: "good",
        factIds: ["j_fact_1"],
        centroid: [0, 1],
        components: [[1, 0], [0, 1]],
        componentVariances: [1, 0.2],
        compactEmbeddingsByFactId: { j_fact_1: [1, 0] },
      },
      {
        _id: "j_sub_2",
        name: "mismatch",
        description: "bad",
        factIds: ["j_fact_2"],
        centroid: [1, 0],
        components: [[1, 0], [0, 1]],
        componentVariances: [1, 0.2],
        compactEmbeddingsByFactId: { j_fact_2: [0, 1] },
      },
    ]);

    const result = await querySubspace({ query: "alpha", scopeId: "j_scope_1", limit: 2 }, "agent-1");

    expect("results" in result).toBe(true);
    if ("results" in result) {
      expect(result.results[0].name).toBe("matched");
      expect(result.results[0].compactSimilarity).toBeGreaterThan(result.results[1].compactSimilarity);
    }
  });
});
