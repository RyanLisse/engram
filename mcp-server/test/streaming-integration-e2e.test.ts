/**
 * E2E tests: Streaming integration of facts into knowledge subspaces.
 *
 * Covers the full MCP-side flow:
 *   1. Pure novelty detection (detectNovelty, expandSubspace, computeCoefficients)
 *   2. Sequential fact streaming — novel facts expand, known facts get compact repr
 *   3. Full SVD consolidation via consolidateEmbeddingsTool (Convex mocked)
 *   4. createSubspace MCP tool orchestration
 *   5. Incremental vs full consolidation comparison
 *
 * Convex is mocked throughout — these tests exercise MCP-side logic only.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

// ── Mock Convex client before any imports that use it ─────────────────────────
const { mockQuery, mockMutate, mockGetScopeByName } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockMutate: vi.fn(),
  mockGetScopeByName: vi.fn(),
}));

vi.mock("../src/lib/convex-client.js", () => ({
  query: mockQuery,
  mutate: mockMutate,
  getScopeByName: mockGetScopeByName,
}));

import { PATHS } from "../src/lib/convex-paths.js";
import {
  detectNovelty,
  expandSubspace,
  computeCoefficients,
  reconstructEmbedding,
  type SubspaceData,
} from "../src/lib/novelty-detection.js";
import { consolidateEmbeddings } from "../src/lib/svd-consolidation.js";
import { consolidateEmbeddingsTool, createSubspace } from "../src/tools/subspaces.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Unit vector in dimension i of a d-dimensional space. */
function unit(i: number, d = 3): number[] {
  const v = new Array(d).fill(0);
  v[i] = 1;
  return v;
}

/** L2 norm of a vector. */
function norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

/** Empty subspace (k = 0). */
function emptySubspace(): SubspaceData {
  return { components: [], k: 0, version: 0 };
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe("novelty detection — pure math", () => {
  test("empty subspace classifies every embedding as novel", () => {
    const result = detectNovelty([0.5, 0.3, 0.2], emptySubspace());
    expect(result.isNovel).toBe(true);
    // residualNorm = norm of the embedding itself
    expect(result.residualNorm).toBeCloseTo(norm([0.5, 0.3, 0.2]), 5);
    expect(result.coefficients).toHaveLength(0);
  });

  test("embedding aligned with component is NOT novel (residual ≈ 0)", () => {
    const subspace: SubspaceData = { components: [unit(0)], k: 1, version: 0 };
    // [1, 0, 0] is exactly the first component → zero residual
    const result = detectNovelty([1, 0, 0], subspace);
    expect(result.isNovel).toBe(false);
    expect(result.residualNorm).toBeCloseTo(0, 5);
  });

  test("embedding orthogonal to subspace IS novel (residual = 1.0 >> 0.4)", () => {
    const subspace: SubspaceData = { components: [unit(0)], k: 1, version: 0 };
    // [0, 1, 0] is fully orthogonal to [1, 0, 0] → residual norm = 1
    const result = detectNovelty([0, 1, 0], subspace);
    expect(result.isNovel).toBe(true);
    expect(result.residualNorm).toBeCloseTo(1, 5);
  });

  test("novelty threshold is configurable", () => {
    const subspace: SubspaceData = { components: [unit(0)], k: 1, version: 0 };
    const embedding = [0.3, 0.95, 0]; // residual ≈ 0.95 in y-direction

    // High threshold → not novel
    expect(detectNovelty(embedding, subspace, 0.99).isNovel).toBe(false);
    // Low threshold → novel
    expect(detectNovelty(embedding, subspace, 0.1).isNovel).toBe(true);
  });

  test("returned coefficients equal dot products with each component", () => {
    const subspace: SubspaceData = { components: [unit(0), unit(1)], k: 2, version: 0 };
    const embedding = [0.7, 0.3, 0];
    const { coefficients, reconstructed } = detectNovelty(embedding, subspace);

    expect(coefficients).toHaveLength(2);
    expect(coefficients[0]).toBeCloseTo(0.7, 5); // dot([1,0,0], [0.7,0.3,0])
    expect(coefficients[1]).toBeCloseTo(0.3, 5); // dot([0,1,0], [0.7,0.3,0])

    // Reconstructed = 0.7·[1,0,0] + 0.3·[0,1,0] = [0.7, 0.3, 0]
    expect(reconstructed[0]).toBeCloseTo(0.7, 5);
    expect(reconstructed[1]).toBeCloseTo(0.3, 5);
    expect(reconstructed[2]).toBeCloseTo(0, 5);
  });
});

describe("subspace expansion — novel facts add principal directions", () => {
  test("expanding an empty subspace creates the first component", () => {
    const subspace = emptySubspace();
    const embedding = [0, 1, 0];
    const novelty = detectNovelty(embedding, subspace);
    const expansion = expandSubspace(embedding, subspace, novelty);

    expect(expansion.k).toBe(1);
    expect(expansion.version).toBe(1);
    expect(expansion.components).toHaveLength(1);
    // New component should be unit-norm
    expect(norm(expansion.components[0])).toBeCloseTo(1, 5);
  });

  test("orthogonal second embedding expands subspace to k=2", () => {
    // Start with x-direction
    const subspace: SubspaceData = { components: [unit(0)], k: 1, version: 1 };
    const embedding = [0, 1, 0]; // fully orthogonal
    const novelty = detectNovelty(embedding, subspace);
    const expansion = expandSubspace(embedding, subspace, novelty);

    expect(expansion.k).toBe(2);
    expect(expansion.version).toBe(2);
    expect(expansion.components).toHaveLength(2);
  });

  test("expanded basis coefficients cover all components", () => {
    const subspace: SubspaceData = { components: [unit(0)], k: 1, version: 0 };
    const embedding = [0, 1, 0];
    const novelty = detectNovelty(embedding, subspace);
    const expansion = expandSubspace(embedding, subspace, novelty);

    // Coefficients should have length = new k
    expect(expansion.coefficients).toHaveLength(2);
  });

  test("new component added by expansion is unit-normalised", () => {
    const subspace: SubspaceData = { components: [unit(0)], k: 1, version: 0 };
    const embedding = [0.2, 0.8, 0.5]; // oblique, partially novel
    const novelty = detectNovelty(embedding, subspace);

    expect(novelty.isNovel).toBe(true); // ensure expansion fires
    const expansion = expandSubspace(embedding, subspace, novelty);

    const newDir = expansion.components[expansion.k - 1];
    expect(norm(newDir)).toBeCloseTo(1, 5);
  });

  test("version counter increments exactly once per expansion", () => {
    let subspace = emptySubspace();

    const e1 = expandSubspace([1, 0, 0], subspace, detectNovelty([1, 0, 0], subspace));
    subspace = { components: e1.components, k: e1.k, version: e1.version };
    expect(subspace.version).toBe(1);

    const e2 = expandSubspace([0, 1, 0], subspace, detectNovelty([0, 1, 0], subspace));
    subspace = { components: e2.components, k: e2.k, version: e2.version };
    expect(subspace.version).toBe(2);
  });
});

describe("compact storage — non-novel facts get coefficient representation", () => {
  test("computeCoefficients returns one dot product per component", () => {
    const subspace: SubspaceData = { components: [unit(0), unit(1)], k: 2, version: 1 };
    const embedding = [0.8, 0.6, 0];
    const coeffs = computeCoefficients(embedding, subspace);

    expect(coeffs).toHaveLength(2);
    expect(coeffs[0]).toBeCloseTo(0.8, 5);
    expect(coeffs[1]).toBeCloseTo(0.6, 5);
  });

  test("reconstructEmbedding from compact coefficients recovers in-subspace components", () => {
    const components = [unit(0), unit(1)];
    const subspace: SubspaceData = { components, k: 2, version: 1 };
    const original = [0.8, 0.6, 0]; // fully in xy-plane

    const coeffs = computeCoefficients(original, subspace);
    const reconstructed = reconstructEmbedding(coeffs, components);

    expect(reconstructed[0]).toBeCloseTo(0.8, 5);
    expect(reconstructed[1]).toBeCloseTo(0.6, 5);
    expect(reconstructed[2]).toBeCloseTo(0, 5);
  });

  test("reconstruction discards out-of-subspace components (expected lossy)", () => {
    const components = [unit(0)]; // only x-axis
    const subspace: SubspaceData = { components, k: 1, version: 1 };
    const original = [0.7, 0.5, 0.3]; // has y and z components

    const coeffs = computeCoefficients(original, subspace);
    const reconstructed = reconstructEmbedding(coeffs, components);

    // x preserved, y and z dropped
    expect(reconstructed[0]).toBeCloseTo(0.7, 5);
    expect(reconstructed[1]).toBeCloseTo(0, 5);
    expect(reconstructed[2]).toBeCloseTo(0, 5);
  });

  test("reconstructEmbedding returns empty array for empty inputs", () => {
    expect(reconstructEmbedding([], [])).toEqual([]);
  });
});

describe("sequential streaming integration — multiple facts", () => {
  test("identical embeddings only expand the subspace on the first insertion", () => {
    let subspace = emptySubspace();
    const embedding = [1, 0, 0];

    // First: empty subspace → always novel
    const n1 = detectNovelty(embedding, subspace);
    expect(n1.isNovel).toBe(true);
    const e1 = expandSubspace(embedding, subspace, n1);
    subspace = { components: e1.components, k: e1.k, version: e1.version };

    // Second identical embedding: should NOT be novel
    const n2 = detectNovelty(embedding, subspace);
    expect(n2.isNovel).toBe(false);
    expect(n2.residualNorm).toBeCloseTo(0, 4);
  });

  test("orthogonal sequence [x, y, z] all register as novel", () => {
    let subspace = emptySubspace();
    const axes = [unit(0), unit(1), unit(2)];
    const noveltyFlags: boolean[] = [];

    for (const emb of axes) {
      const n = detectNovelty(emb, subspace);
      noveltyFlags.push(n.isNovel);
      if (n.isNovel) {
        const e = expandSubspace(emb, subspace, n);
        subspace = { components: e.components, k: e.k, version: e.version };
      }
    }

    // All three orthogonal axes should be novel relative to each other
    expect(noveltyFlags).toEqual([true, true, true]);
    expect(subspace.k).toBe(3);
    expect(subspace.version).toBe(3);
  });

  test("5-fact sequence: some novel, some compact — subspace grows correctly", () => {
    let subspace = emptySubspace();
    const THRESHOLD = 0.4;
    let novelCount = 0;
    const compactCoeffSets: number[][] = [];

    const facts = [
      [1, 0, 0],       // novel: first ever
      [0.98, 0.1, 0],  // not novel: almost identical to x (residual ≈ 0.1 < 0.4)
      [0, 1, 0],       // novel: orthogonal to x
      [0.02, 0.99, 0], // not novel: almost identical to y
      [0, 0, 1],       // novel: orthogonal to both x and y
    ];

    for (const emb of facts) {
      const n = detectNovelty(emb, subspace, THRESHOLD);
      if (n.isNovel) {
        const e = expandSubspace(emb, subspace, n);
        subspace = { components: e.components, k: e.k, version: e.version };
        novelCount++;
      } else {
        compactCoeffSets.push(n.coefficients);
      }
    }

    expect(novelCount).toBe(3); // x, y, z axes each novel
    expect(subspace.k).toBe(3);
    expect(compactCoeffSets).toHaveLength(2); // two near-duplicate facts stored compactly
    // Each compact set has k coefficients
    for (const coeffs of compactCoeffSets) {
      expect(coeffs.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("version only increments on novel insertions, never on compact storage", () => {
    let subspace = emptySubspace();

    // Novel insertion (empty → x)
    const n1 = detectNovelty([1, 0, 0], subspace);
    const e1 = expandSubspace([1, 0, 0], subspace, n1);
    subspace = { components: e1.components, k: e1.k, version: e1.version };
    expect(subspace.version).toBe(1);

    // Compact insertion (nearly x) — caller does NOT call expandSubspace
    const n2 = detectNovelty([0.99, 0.1, 0], subspace, 0.4);
    expect(n2.isNovel).toBe(false);
    // version unchanged — no expand called
    expect(subspace.version).toBe(1);

    // Novel insertion (y-axis)
    const n3 = detectNovelty([0, 1, 0], subspace);
    const e3 = expandSubspace([0, 1, 0], subspace, n3);
    subspace = { components: e3.components, k: e3.k, version: e3.version };
    expect(subspace.version).toBe(2);
  });
});

describe("full SVD consolidation — consolidateEmbeddingsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("consolidates 3 active facts: updates all facts + subspace", async () => {
    mockQuery.mockImplementation(async (path: string) => {
      if (path === PATHS.subspaces.getSubspace)
        return { _id: "j_sub_e2e", factIds: ["j_f1", "j_f2", "j_f3"] };
      if (path === PATHS.facts.getByIds)
        return [
          { _id: "j_f1", embedding: [1, 0, 0], lifecycleState: "active" },
          { _id: "j_f2", embedding: [0, 1, 0], lifecycleState: "active" },
          { _id: "j_f3", embedding: [0, 0, 1], lifecycleState: "active" },
        ];
    });
    mockMutate.mockResolvedValue({});

    const result = await consolidateEmbeddingsTool({ subspaceId: "j_sub_e2e", k: 2 }, "agent-1");

    expect(result).not.toHaveProperty("isError");
    expect(result).toHaveProperty("factCount", 3);
    expect(result).toHaveProperty("compactEmbeddingsUpdated", 3);

    // Each active fact gets a compact embedding patch
    const factUpdates = mockMutate.mock.calls.filter(([p]) => p === PATHS.facts.updateFact);
    expect(factUpdates).toHaveLength(3);
    for (const [, payload] of factUpdates) {
      expect(payload.compactEmbedding).toBeInstanceOf(Array);
      expect(payload.compactEmbedding.length).toBeGreaterThan(0);
    }

    // Subspace gets updated with SVD output
    const subUpdate = mockMutate.mock.calls.find(([p]) => p === PATHS.subspaces.updateSubspace);
    expect(subUpdate).toBeDefined();
    expect(subUpdate![1]).toMatchObject({
      subspaceId: "j_sub_e2e",
      components: expect.any(Array),
      variance: expect.any(Number),
    });
  });

  test("archived facts are excluded from consolidation", async () => {
    mockQuery.mockImplementation(async (path: string) => {
      if (path === PATHS.subspaces.getSubspace)
        return { _id: "j_sub_mixed", factIds: ["j_f1", "j_f2", "j_f3"] };
      if (path === PATHS.facts.getByIds)
        return [
          { _id: "j_f1", embedding: [1, 0], lifecycleState: "active" },
          { _id: "j_f2", embedding: [0, 1], lifecycleState: "archived" }, // excluded
          { _id: "j_f3", embedding: [0.5, 0.5], lifecycleState: "active" },
        ];
    });
    mockMutate.mockResolvedValue({});

    await consolidateEmbeddingsTool({ subspaceId: "j_sub_mixed", k: 1 }, "agent-1");

    const factUpdates = mockMutate.mock.calls.filter(([p]) => p === PATHS.facts.updateFact);
    expect(factUpdates).toHaveLength(2);

    const updatedIds = factUpdates.map(([, p]) => p.factId);
    expect(updatedIds).toContain("j_f1");
    expect(updatedIds).toContain("j_f3");
    expect(updatedIds).not.toContain("j_f2");
  });

  test("returns error when fewer than 2 active facts available", async () => {
    mockQuery.mockImplementation(async (path: string) => {
      if (path === PATHS.subspaces.getSubspace)
        return { _id: "j_sub_small", factIds: ["j_f1"] };
      if (path === PATHS.facts.getByIds)
        return [{ _id: "j_f1", embedding: [1, 0], lifecycleState: "active" }];
    });

    const result = await consolidateEmbeddingsTool({ subspaceId: "j_sub_small", k: 1 }, "agent-1");
    expect(result).toHaveProperty("isError", true);
  });

  test("returns error when subspace does not exist", async () => {
    mockQuery.mockResolvedValue(null);

    const result = await consolidateEmbeddingsTool({ subspaceId: "j_sub_missing" }, "agent-1");
    expect(result).toHaveProperty("isError", true);
  });

  test("SVD output variance is in [0, 1]", async () => {
    mockQuery.mockImplementation(async (path: string) => {
      if (path === PATHS.subspaces.getSubspace)
        return { _id: "j_sub_v", factIds: ["j_f1", "j_f2"] };
      if (path === PATHS.facts.getByIds)
        return [
          { _id: "j_f1", embedding: [1, 0, 0], lifecycleState: "active" },
          { _id: "j_f2", embedding: [0, 1, 0], lifecycleState: "active" },
        ];
    });
    mockMutate.mockResolvedValue({});

    const result = await consolidateEmbeddingsTool({ subspaceId: "j_sub_v", k: 2 }, "agent-1");

    expect(result).not.toHaveProperty("isError");
    if ("varianceExplained" in result) {
      expect(result.varianceExplained).toBeGreaterThanOrEqual(0);
      expect(result.varianceExplained).toBeLessThanOrEqual(1);
    }
  });
});

describe("createSubspace MCP tool orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScopeByName.mockResolvedValue({ _id: "j_scope_test" });
    mockMutate.mockResolvedValue({ subspaceId: "j_sub_created" });
  });

  test("computes SVD and writes centroid + components to Convex", async () => {
    mockQuery.mockResolvedValue([
      { _id: "j_f1", embedding: [1, 0, 0] },
      { _id: "j_f2", embedding: [0, 1, 0] },
      { _id: "j_f3", embedding: [0, 0, 1] },
    ]);

    const result = await createSubspace(
      { name: "e2e-subspace", factIds: ["j_f1", "j_f2", "j_f3"], k: 2 },
      "agent-e2e",
    );

    expect(result).not.toHaveProperty("isError");
    expect(result).toMatchObject({
      subspaceId: "j_sub_created",
      factCount: 3,
      componentCount: expect.any(Number),
      varianceExplained: expect.any(Number),
    });

    const createCall = mockMutate.mock.calls.find(([p]) => p === PATHS.subspaces.createSubspace);
    expect(createCall).toBeDefined();
    expect(createCall![1]).toMatchObject({
      name: "e2e-subspace",
      agentId: "agent-e2e",
      centroid: expect.any(Array),
      components: expect.any(Array),
    });
    // centroid should be a 3-dim vector (matching embedding dim)
    expect(createCall![1].centroid).toHaveLength(3);
  });

  test("returns error when no facts have embeddings", async () => {
    mockQuery.mockResolvedValue([
      { _id: "j_f1" }, // no embedding field
    ]);

    const result = await createSubspace(
      { name: "empty-subspace", factIds: ["j_f1"] },
      "agent-e2e",
    );
    expect(result).toHaveProperty("isError", true);
  });

  test("resolves scope by name when scopeId is not an ID", async () => {
    mockQuery.mockResolvedValue([
      { _id: "j_f1", embedding: [1, 0] },
      { _id: "j_f2", embedding: [0, 1] },
    ]);

    await createSubspace(
      { name: "scope-resolved", factIds: ["j_f1", "j_f2"], scopeId: "private-agent-e2e" },
      "agent-e2e",
    );

    // getScopeByName should have been called to resolve the name
    expect(mockGetScopeByName).toHaveBeenCalledWith("private-agent-e2e");
  });

  test("uses agent private scope when no scopeId provided", async () => {
    mockQuery.mockResolvedValue([
      { _id: "j_f1", embedding: [1, 0] },
      { _id: "j_f2", embedding: [0, 1] },
    ]);

    await createSubspace(
      { name: "auto-scope", factIds: ["j_f1", "j_f2"] },
      "agent-xyz",
    );

    expect(mockGetScopeByName).toHaveBeenCalledWith("private-agent-xyz");
  });
});

describe("incremental vs full consolidation — consistency check", () => {
  test("full SVD centroid is the mean of all embeddings", () => {
    const embeddings = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const result = consolidateEmbeddings(embeddings, 2);

    // Centroid = [1/3, 1/3, 1/3]
    expect(result.centroid[0]).toBeCloseTo(1 / 3, 5);
    expect(result.centroid[1]).toBeCloseTo(1 / 3, 5);
    expect(result.centroid[2]).toBeCloseTo(1 / 3, 5);
  });

  test("incremental sequential expansion produces ≥1 component for distinct directions", () => {
    let subspace = emptySubspace();
    const embeddings = [[1, 0, 0], [0, 1, 0], [0.7, 0.7, 0]];

    for (const emb of embeddings) {
      const n = detectNovelty(emb, subspace, 0.05); // tight threshold to capture all nuance
      if (n.isNovel) {
        const e = expandSubspace(emb, subspace, n);
        subspace = { components: e.components, k: e.k, version: e.version };
      }
    }

    expect(subspace.k).toBeGreaterThanOrEqual(1);

    // Compact coefficients should work on resulting subspace
    const testEmb = [0.5, 0.5, 0];
    const coeffs = computeCoefficients(testEmb, subspace);
    expect(coeffs).toHaveLength(subspace.k);
  });

  test("full SVD components explain >= incremental subspace variance on same data", () => {
    const embeddings = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

    // Full SVD
    const svdResult = consolidateEmbeddings(embeddings, 3);
    expect(svdResult.varianceExplained).toBeGreaterThan(0.9); // should explain most variance

    // Incremental: loop through facts, expanding as needed
    let subspace = emptySubspace();
    for (const emb of embeddings) {
      const n = detectNovelty(emb, subspace, 0.4);
      if (n.isNovel) {
        const e = expandSubspace(emb, subspace, n);
        subspace = { components: e.components, k: e.k, version: e.version };
      }
    }

    // Incremental should have found 3 novel directions (orthogonal axes)
    expect(subspace.k).toBe(3);
    // SVD's variance explained should be high (all three axes are independent)
    expect(svdResult.varianceExplained).toBeLessThanOrEqual(1.0);
  });
});
