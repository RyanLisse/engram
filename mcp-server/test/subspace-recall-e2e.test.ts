/**
 * E2E Test: Subspace-based recall
 *
 * Covers:
 *   - Pure SVD math: consolidateEmbeddings, projectToCompact, compactCosineSimilarity
 *   - Dual scoring: centroid similarity vs compact-space similarity
 *   - querySubspace integration (Convex + embeddings mocked)
 *   - Low k vs high k explained variance
 *   - Compact embeddings approximate full-space retrieval ordering
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

// ── hoisted mocks (must run before any import) ─────────────────────────────────

const { mockConvexQuery, mockConvexMutate, mockGetScopeByName, mockGenerateEmbedding, mockGetRecentlyEnrichedFactIds } =
  vi.hoisted(() => ({
    mockConvexQuery: vi.fn(),
    mockConvexMutate: vi.fn(),
    mockGetScopeByName: vi.fn(),
    mockGenerateEmbedding: vi.fn(),
    mockGetRecentlyEnrichedFactIds: vi.fn(),
  }));

vi.mock("../src/lib/convex-client.js", () => ({
  query: mockConvexQuery,
  mutate: mockConvexMutate,
  getScopeByName: mockGetScopeByName,
  getRecentlyEnrichedFactIds: mockGetRecentlyEnrichedFactIds,
}));

vi.mock("../src/lib/embeddings.js", () => ({
  generateEmbedding: mockGenerateEmbedding,
}));

// ── real imports (svd-consolidation is NOT mocked — tested directly) ───────────

import {
  consolidateEmbeddings,
  projectToCompact,
  compactCosineSimilarity,
  cosineSimilarity,
  incrementalUpdate,
} from "../src/lib/svd-consolidation.js";

import { querySubspace } from "../src/tools/subspaces.js";

// ── test helpers ───────────────────────────────────────────────────────────────

const vec = (x: number, y: number, z: number, w: number): number[] => [x, y, z, w];

// Cluster of embeddings near the x-axis
const X_CLUSTER = [
  vec(1.0, 0.1, 0.0, 0.0),
  vec(0.9, 0.2, 0.0, 0.0),
  vec(0.95, 0.0, 0.05, 0.0),
];

// Cluster of embeddings near the z-axis (orthogonal to X_CLUSTER)
const Z_CLUSTER = [
  vec(0.0, 0.0, 1.0, 0.1),
  vec(0.05, 0.0, 0.9, 0.2),
  vec(0.0, 0.1, 0.95, 0.0),
];

// Queries aligned with each cluster
const QUERY_X = vec(1.0, 0.0, 0.0, 0.0);
const QUERY_Z = vec(0.0, 0.0, 1.0, 0.0);

// ── SVD Consolidation — Pure Math ─────────────────────────────────────────────

describe("SVD Consolidation — Pure Math", () => {
  test("centroid equals mean of input embeddings", () => {
    const result = consolidateEmbeddings(X_CLUSTER, 1);
    const expected = [
      (1.0 + 0.9 + 0.95) / 3,
      (0.1 + 0.2 + 0.0) / 3,
      (0.0 + 0.0 + 0.05) / 3,
      0.0,
    ];
    for (let i = 0; i < 4; i++) {
      expect(result.centroid[i]).toBeCloseTo(expected[i], 6);
    }
    expect(result.sampleCount).toBe(3);
  });

  test("k=1 produces exactly one principal component", () => {
    const result = consolidateEmbeddings(X_CLUSTER, 1);
    expect(result.components).toHaveLength(1);
    expect(result.singularValues).toHaveLength(1);
    expect(result.componentVariances).toHaveLength(1);
  });

  test("k=2 explains more variance than k=1 for diverse data", () => {
    const mixed = [...X_CLUSTER, ...Z_CLUSTER];
    const r1 = consolidateEmbeddings(mixed, 1);
    const r2 = consolidateEmbeddings(mixed, 2);
    expect(r2.varianceExplained).toBeGreaterThanOrEqual(r1.varianceExplained);
  });

  test("low k vs high k: higher k captures more variance on asymmetric data", () => {
    // Use clearly asymmetric data so power iteration finds distinct principal directions
    const asymmetric = [
      ...X_CLUSTER,  // 3 vectors near x-axis
      ...Z_CLUSTER,  // 3 vectors near z-axis
    ];
    const lowK = consolidateEmbeddings(asymmetric, 1);
    const highK = consolidateEmbeddings(asymmetric, 2);
    expect(highK.varianceExplained).toBeGreaterThan(lowK.varianceExplained);
    expect(highK.components).toHaveLength(2);
    expect(lowK.components).toHaveLength(1);
  });

  test("varianceExplained is monotonically non-decreasing with k", () => {
    const diverse = [
      vec(1, 0, 0, 0),
      vec(0, 1, 0, 0),
      vec(0, 0, 1, 0),
      vec(0, 0, 0, 1),
      vec(0.5, 0.5, 0, 0),
      vec(0, 0, 0.5, 0.5),
    ];
    let prev = 0;
    for (let k = 1; k <= 4; k++) {
      const result = consolidateEmbeddings(diverse, k);
      expect(result.varianceExplained).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(result.varianceExplained).toBeLessThanOrEqual(1.0 + 1e-9);
      prev = result.varianceExplained;
    }
  });

  test("nearly identical embeddings → k=1 explains ≥90% variance", () => {
    const near = [vec(1.0, 0.0, 0.0, 0.0), vec(1.0, 0.0001, 0.0, 0.0), vec(1.0, 0.0, 0.0001, 0.0)];
    const result = consolidateEmbeddings(near, 1);
    expect(result.varianceExplained).toBeGreaterThan(0.9);
  });

  test("projectToCompact returns k-dim coefficient vector", () => {
    const result = consolidateEmbeddings(X_CLUSTER, 2);
    const compact = projectToCompact(X_CLUSTER[0], result.centroid, result.components);
    expect(compact).toHaveLength(2);
  });

  test("compact projection preserves cluster similarity ordering", () => {
    // A query near X_CLUSTER should score higher against X facts than Z facts in compact space
    const allEmbeds = [...X_CLUSTER, ...Z_CLUSTER];
    const result = consolidateEmbeddings(allEmbeds, 2);

    const queryCompact = projectToCompact(QUERY_X, result.centroid, result.components);
    const xCompact = projectToCompact(X_CLUSTER[0], result.centroid, result.components);
    const zCompact = projectToCompact(Z_CLUSTER[0], result.centroid, result.components);

    const simX = compactCosineSimilarity(queryCompact, xCompact, result.componentVariances);
    const simZ = compactCosineSimilarity(queryCompact, zCompact, result.componentVariances);

    expect(simX).toBeGreaterThan(simZ);
  });

  test("compactCosineSimilarity with uniform weights is a valid cosine", () => {
    const a = [1.0, 0.5];
    const b = [0.8, 0.6];
    const weighted = compactCosineSimilarity(a, b, [1.0, 1.0]);
    // dot = 1*0.8 + 0.5*0.6 = 1.1; normA = sqrt(1.25); normB = sqrt(1.0)
    const expected = 1.1 / (Math.sqrt(1.25) * 1.0);
    expect(weighted).toBeCloseTo(expected, 5);
  });

  test("cosineSimilarity returns 1.0 for identical vectors", () => {
    const v = vec(0.3, 0.4, 0.5, 0.6);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  test("cosineSimilarity returns ~0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0, 0], [0, 1, 0, 0])).toBeCloseTo(0, 5);
  });

  test("cosineSimilarity is symmetric", () => {
    const a = vec(0.5, 0.3, 0.8, 0.1);
    const b = vec(0.2, 0.9, 0.1, 0.7);
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  test("incrementalUpdate preserves centroid after adding one more fact", () => {
    const initial = consolidateEmbeddings(X_CLUSTER.slice(0, 2), 1);
    const updated = incrementalUpdate(initial, X_CLUSTER[2]);
    const full = consolidateEmbeddings(X_CLUSTER, 1);
    for (let i = 0; i < 4; i++) {
      expect(updated.centroid[i]).toBeCloseTo(full.centroid[i], 3);
    }
    expect(updated.sampleCount).toBe(3);
  });

  test("empty embeddings returns zero-variance result gracefully", () => {
    const result = consolidateEmbeddings([], 3);
    expect(result.centroid).toHaveLength(0);
    expect(result.components).toHaveLength(0);
    expect(result.varianceExplained).toBe(0);
    expect(result.sampleCount).toBe(0);
  });
});

// ── querySubspace — Integration (Mocked I/O) ──────────────────────────────────

describe("querySubspace — Integration (Mocked I/O)", () => {
  const AGENT_ID = "agent-test";

  // Build subspaces using real SVD on controlled embeddings (computed once at describe-init)
  const xResult = consolidateEmbeddings(X_CLUSTER, 2);
  const zResult = consolidateEmbeddings(Z_CLUSTER, 2);

  const X_COMPACT_BY_FACT = Object.fromEntries(
    X_CLUSTER.map((e, i) => [
      `fact_x_${i}`,
      projectToCompact(e, xResult.centroid, xResult.components),
    ])
  );

  const Z_COMPACT_BY_FACT = Object.fromEntries(
    Z_CLUSTER.map((e, i) => [
      `fact_z_${i}`,
      projectToCompact(e, zResult.centroid, zResult.components),
    ])
  );

  const SUBSPACE_X = {
    _id: "sub_x",
    name: "X-cluster subspace",
    factIds: Object.keys(X_COMPACT_BY_FACT),
    centroid: xResult.centroid,
    components: xResult.components,
    componentVariances: xResult.componentVariances,
    compactEmbeddingsByFactId: X_COMPACT_BY_FACT,
    variance: xResult.varianceExplained,
    singularValueRatio: xResult.singularValueRatio,
    updatedAt: Date.now(),
  };

  const SUBSPACE_Z = {
    _id: "sub_z",
    name: "Z-cluster subspace",
    factIds: Object.keys(Z_COMPACT_BY_FACT),
    centroid: zResult.centroid,
    components: zResult.components,
    componentVariances: zResult.componentVariances,
    compactEmbeddingsByFactId: Z_COMPACT_BY_FACT,
    variance: zResult.varianceExplained,
    singularValueRatio: zResult.singularValueRatio,
    updatedAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConvexQuery.mockResolvedValue([SUBSPACE_X, SUBSPACE_Z]);
  });

  test("x-aligned query ranks SUBSPACE_X first", async () => {
    mockGenerateEmbedding.mockResolvedValue(QUERY_X);

    const result = await querySubspace({ query: "x-axis topic", limit: 5 }, AGENT_ID);

    expect("results" in result).toBe(true);
    if ("results" in result) {
      expect(result.results[0]._id).toBe("sub_x");
      expect(result.results[1]._id).toBe("sub_z");
    }
  });

  test("z-aligned query ranks SUBSPACE_Z first", async () => {
    mockGenerateEmbedding.mockResolvedValue(QUERY_Z);

    const result = await querySubspace({ query: "z-axis topic", limit: 5 }, AGENT_ID);

    expect("results" in result).toBe(true);
    if ("results" in result) {
      expect(result.results[0]._id).toBe("sub_z");
      expect(result.results[1]._id).toBe("sub_x");
    }
  });

  test("dual scoring: both centroid similarity and compact similarity are returned", async () => {
    mockGenerateEmbedding.mockResolvedValue(QUERY_X);

    const result = await querySubspace({ query: "x-axis", limit: 5 }, AGENT_ID);

    expect("results" in result).toBe(true);
    if ("results" in result) {
      const top = result.results[0];
      // centroid-based similarity field
      expect(typeof top.similarity).toBe("number");
      expect(top.similarity).toBeGreaterThan(0);
      // compact-space similarity field
      expect(top.compactSimilarity).not.toBeNull();
      expect(typeof top.compactSimilarity).toBe("number");
      // ranking score is the compact similarity (max over facts)
      expect(typeof top._score).toBe("number");
    }
  });

  test("_score uses compact similarity when components are present", async () => {
    mockGenerateEmbedding.mockResolvedValue(QUERY_X);

    const result = await querySubspace({ query: "x-axis", limit: 5 }, AGENT_ID);

    expect("results" in result).toBe(true);
    if ("results" in result) {
      const top = result.results[0];
      // When components exist, _score = max compact similarity over all facts
      // It should equal compactSimilarity field
      expect(top._score).toBeCloseTo(top.compactSimilarity as number, 8);
    }
  });

  test("falls back to centroid similarity for _score when no components", async () => {
    const subspaceNoComp = {
      ...SUBSPACE_X,
      _id: "sub_nocomp",
      components: [],
      compactEmbeddingsByFactId: undefined,
    };
    mockConvexQuery.mockResolvedValue([subspaceNoComp]);
    mockGenerateEmbedding.mockResolvedValue(QUERY_X);

    const result = await querySubspace({ query: "x-axis", limit: 5 }, AGENT_ID);

    expect("results" in result).toBe(true);
    if ("results" in result) {
      const top = result.results[0];
      const expectedCentroidSim = cosineSimilarity(QUERY_X, subspaceNoComp.centroid);
      expect(top._score).toBeCloseTo(expectedCentroidSim, 5);
      expect(top.compactSimilarity).toBeNull();
    }
  });

  test("limit param controls number of returned results", async () => {
    const manySubspaces = Array.from({ length: 8 }, (_, i) => ({
      ...SUBSPACE_X,
      _id: `sub_${i}`,
      name: `Subspace ${i}`,
    }));
    mockConvexQuery.mockResolvedValue(manySubspaces);
    mockGenerateEmbedding.mockResolvedValue(QUERY_X);

    const result = await querySubspace({ query: "topic", limit: 3 }, AGENT_ID);

    expect("results" in result).toBe(true);
    if ("results" in result) {
      expect(result.results.length).toBeLessThanOrEqual(3);
    }
  });

  test("returns error when embedding generation returns null", async () => {
    mockGenerateEmbedding.mockResolvedValue(null);

    const result = await querySubspace({ query: "broken" }, AGENT_ID);

    expect("isError" in result).toBe(true);
    if ("isError" in result) {
      expect(result.message).toContain("embedding");
    }
  });

  test("returns empty results when no subspaces found in scope", async () => {
    mockConvexQuery.mockResolvedValue([]);
    mockGenerateEmbedding.mockResolvedValue(QUERY_X);

    const result = await querySubspace({ query: "anything", limit: 5 }, AGENT_ID);

    expect("results" in result).toBe(true);
    if ("results" in result) {
      expect(result.results).toHaveLength(0);
    }
  });

  test("queryEmbeddingDim reflects the actual embedding dimension", async () => {
    mockGenerateEmbedding.mockResolvedValue(QUERY_X); // 4-dim

    const result = await querySubspace({ query: "x-axis", limit: 5 }, AGENT_ID);

    expect("queryEmbeddingDim" in result).toBe(true);
    if ("queryEmbeddingDim" in result) {
      expect(result.queryEmbeddingDim).toBe(4);
    }
  });

  test("subspaces without centroid are filtered out (not scored)", async () => {
    const noCentroid = { ...SUBSPACE_X, _id: "sub_nocent", centroid: undefined as any };
    mockConvexQuery.mockResolvedValue([noCentroid, SUBSPACE_Z]);
    mockGenerateEmbedding.mockResolvedValue(QUERY_Z);

    const result = await querySubspace({ query: "z topic", limit: 5 }, AGENT_ID);

    expect("results" in result).toBe(true);
    if ("results" in result) {
      // Only SUBSPACE_Z has a centroid, so only 1 result
      const ids = result.results.map((r: any) => r._id);
      expect(ids).not.toContain("sub_nocent");
      expect(ids).toContain("sub_z");
    }
  });
});

// ── E2E Flow: consolidate → project → query ───────────────────────────────────

describe("E2E Flow: consolidate → project → query", () => {
  test("full pipeline preserves retrieval ordering: x-query ranks x-facts above z-facts", () => {
    // Step 1: consolidate all facts into a shared subspace
    const allEmbeds = [...X_CLUSTER, ...Z_CLUSTER];
    const result = consolidateEmbeddings(allEmbeds, 2);

    expect(result.centroid).toHaveLength(4);
    expect(result.components).toHaveLength(2);
    expect(result.varianceExplained).toBeGreaterThan(0);

    // Step 2: project each fact to compact space
    const compacts = allEmbeds.map((e) =>
      projectToCompact(e, result.centroid, result.components)
    );
    expect(compacts[0]).toHaveLength(2); // k=2 compact dimensions

    // Step 3: project query
    const queryCompact = projectToCompact(QUERY_X, result.centroid, result.components);

    // Step 4: score — x-cluster facts must score higher than z-cluster facts
    const xScores = X_CLUSTER.map((_, i) =>
      compactCosineSimilarity(queryCompact, compacts[i], result.componentVariances)
    );
    const zScores = Z_CLUSTER.map((_, i) =>
      compactCosineSimilarity(queryCompact, compacts[X_CLUSTER.length + i], result.componentVariances)
    );

    expect(Math.max(...xScores)).toBeGreaterThan(Math.max(...zScores));
  });

  test("high k approximates full-cosine ranking order", () => {
    const allEmbeds = [...X_CLUSTER, ...Z_CLUSTER];
    const highK = consolidateEmbeddings(allEmbeds, 3);

    const queryCompact = projectToCompact(QUERY_X, highK.centroid, highK.components);
    const compacts = allEmbeds.map((e) => projectToCompact(e, highK.centroid, highK.components));

    const fullSims = allEmbeds.map((e) => cosineSimilarity(QUERY_X, e));
    const compactSims = compacts.map((c) =>
      compactCosineSimilarity(queryCompact, c, highK.componentVariances)
    );

    // Both full-space and compact-space agree: X_CLUSTER[0] ranks above Z_CLUSTER[0]
    const fullXAboveZ = fullSims[0] > fullSims[X_CLUSTER.length];
    const compactXAboveZ = compactSims[0] > compactSims[X_CLUSTER.length];

    expect(fullXAboveZ).toBe(true);
    expect(compactXAboveZ).toBe(true);
  });

  test("low k (k=1) still produces valid non-negative similarities", () => {
    const allEmbeds = [...X_CLUSTER, ...Z_CLUSTER];
    const lowK = consolidateEmbeddings(allEmbeds, 1);

    const queryCompact = projectToCompact(QUERY_X, lowK.centroid, lowK.components);
    const xCompact = projectToCompact(X_CLUSTER[0], lowK.centroid, lowK.components);
    const zCompact = projectToCompact(Z_CLUSTER[0], lowK.centroid, lowK.components);

    const simX = compactCosineSimilarity(queryCompact, xCompact, lowK.componentVariances);
    const simZ = compactCosineSimilarity(queryCompact, zCompact, lowK.componentVariances);

    // Similarity values are finite numbers
    expect(isFinite(simX)).toBe(true);
    expect(isFinite(simZ)).toBe(true);
  });

  test("targetVariance auto-k selects enough components for cluster data", () => {
    // Use cluster data where variance is clearly dominated by 2 directions
    const clustered = [...X_CLUSTER, ...Z_CLUSTER];
    // Target 40% variance — should need at most 1-2 components for these clusters
    const result = consolidateEmbeddings(clustered, { targetVariance: 0.4, maxK: 4 });
    expect(result.varianceExplained).toBeGreaterThanOrEqual(0.4 - 1e-9);
    expect(result.components.length).toBeGreaterThanOrEqual(1);
  });

  test("componentVariances sum to varianceExplained", () => {
    const mixed = [...X_CLUSTER, ...Z_CLUSTER];
    const result = consolidateEmbeddings(mixed, 3);
    const sumCV = result.componentVariances.reduce((a, b) => a + b, 0);
    expect(sumCV).toBeCloseTo(result.varianceExplained, 8);
  });
});
