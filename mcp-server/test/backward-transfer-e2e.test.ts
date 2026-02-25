/**
 * E2E tests for the Backward Transfer pipeline:
 *   subspace expansion (k → k+1) → retroactive re-projection → recall boost
 *
 * The full flow:
 *   1. Existing subspace has k principal directions
 *   2. Novel fact arrives → detectNovelty finds residual > 0.4 → expandSubspace adds k+1
 *   3. retroactiveReproject re-projects recent facts onto updated basis
 *   4. Facts whose compact embedding drifts > CHANGE_THRESHOLD (0.1) are updated
 *   5. An enrichment event is logged; recall applies 1.2x boost to enriched fact IDs
 *
 * Pure math functions (svd-consolidation, novelty-detection) are NOT mocked —
 * they run against real data. Convex client is mocked for recall boost tests.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  consolidateEmbeddings,
  projectToCompact,
} from "../src/lib/svd-consolidation.js";
import {
  detectNovelty,
  expandSubspace,
  reconstructEmbedding,
  computeCoefficients,
  type SubspaceData,
} from "../src/lib/novelty-detection.js";

// ── Mock setup for recall boost tests ─────────────────────────────────────────

const {
  mockTextSearch,
  mockVectorSearch,
  mockBumpAccessBatch,
  mockRecordRecall,
  mockRankCandidatesPrimitive,
  mockResolveScopes,
  mockGetGraphNeighbors,
  mockReciprocalRankFusion,
  mockExtractEntityIds,
  mockReadFile,
  mockKvGet,
  mockLogEvent,
  mockGetRecentlyEnrichedFactIds,
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
  default: { readFile: mockReadFile },
}));
vi.mock("../src/lib/convex-client.js", () => ({
  kvGet: mockKvGet,
  logEvent: mockLogEvent,
  getRecentlyEnrichedFactIds: mockGetRecentlyEnrichedFactIds,
}));

import { recall } from "../src/tools/recall.js";

// ── Test data ─────────────────────────────────────────────────────────────────

/** Cluster strongly aligned with the x-axis */
const X_CLUSTER = [
  [0.9, 0.1, 0.05, 0.0],
  [0.85, 0.15, 0.08, 0.02],
  [0.92, 0.08, 0.04, 0.01],
];

/** Novel fact: strongly y-direction — novel relative to an x-axis subspace */
const NOVEL_Y_EMB = [0.1, 0.9, 0.05, 0.0];

/**
 * A "mixed" fact with strong y-component. When the subspace only had the
 * x-direction, its compactEmbedding captured only the x-projection. Once
 * the y-direction is added, the new coefficient is large → dist > 0.1.
 */
const MIXED_EMB = [0.5, 0.8, 0.05, 0.0];

/**
 * A "pure x" fact. Its y-component is negligible. After y-expansion the new
 * coefficient will be near zero → dist ≤ 0.1 → skipped by retroactiveReproject.
 */
const PURE_X_EMB = [0.9, 0.05, 0.04, 0.01];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Replicate the core of convex/functions/retroactiveEnrich.ts
 * `retroactiveReproject` without requiring the Convex runtime.
 *
 * Given a set of facts with full embeddings and their old compact coefficients,
 * re-projects each onto the updated (expanded) basis and identifies which ones
 * have drifted beyond CHANGE_THRESHOLD.
 */
interface FactForReproject {
  _id: string;
  embedding: number[];
  compactEmbedding: number[];
  /** epoch ms — facts before cutoff are skipped (mirrors daysBack filter) */
  timestamp: number;
}

function retroactiveReprojectLocal(
  facts: FactForReproject[],
  centroid: number[],
  newComponents: number[][],
  options: { changeThreshold?: number; cutoff?: number } = {},
): { enriched: string[]; skipped: string[] } {
  const { changeThreshold = 0.1, cutoff = 0 } = options;
  const enriched: string[] = [];
  const skipped: string[] = [];

  for (const fact of facts) {
    if (fact.timestamp < cutoff) {
      skipped.push(fact._id);
      continue;
    }

    const newCoefficients = projectToCompact(fact.embedding, centroid, newComponents);
    const oldCoefficients = fact.compactEmbedding;

    const maxLen = Math.max(oldCoefficients.length, newCoefficients.length);
    let distSq = 0;
    for (let i = 0; i < maxLen; i++) {
      const diff = (newCoefficients[i] ?? 0) - (oldCoefficients[i] ?? 0);
      distSq += diff * diff;
    }
    const dist = Math.sqrt(distSq);

    if (dist > changeThreshold) {
      enriched.push(fact._id);
    } else {
      skipped.push(fact._id);
    }
  }

  return { enriched, skipped };
}

/** Build an enrichment event payload (mirrors the Convex mutation's structure) */
function buildEnrichmentEventPayload(
  subspaceId: string,
  enrichedIds: string[],
  trigger: "expansion" | "remerge" | "manual",
) {
  return {
    eventType: "retroactive_enrichment" as const,
    payload: {
      subspaceId,
      trigger,
      enrichedCount: enrichedIds.length,
      // Convex payload values are scalar — IDs are comma-delimited string
      factIds: enrichedIds.join(","),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Backward Transfer E2E", () => {
  // ── 1. Subspace expansion: k → k+1 ───────────────────────────────────────

  describe("Subspace expansion: k → k+1", () => {
    test("detectNovelty marks x-cluster embedding as NOT novel (within existing subspace)", () => {
      // detectNovelty uses raw (uncentered) dot products, so the subspace must be
      // built incrementally via expandSubspace — NOT from PCA components — so that
      // the components span the actual embedding directions (not just their variance).
      const firstEmb = X_CLUSTER[0];
      const emptySubspace: SubspaceData = { components: [], k: 0, version: 0 };
      const nov0 = detectNovelty(firstEmb, emptySubspace);
      const sub1 = expandSubspace(firstEmb, emptySubspace, nov0);
      const subspace: SubspaceData = { components: sub1.components, k: sub1.k, version: sub1.version };

      // Another embedding near the same x-direction: small residual → not novel
      const result = detectNovelty(X_CLUSTER[1], subspace);
      expect(result.isNovel).toBe(false);
      expect(result.residualNorm).toBeLessThan(0.4);
    });

    test("detectNovelty marks y-direction embedding as novel relative to x-only subspace", () => {
      const { components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 1 };

      const result = detectNovelty(NOVEL_Y_EMB, subspace);
      expect(result.isNovel).toBe(true);
      expect(result.residualNorm).toBeGreaterThan(0.4);
    });

    test("expandSubspace increments k by exactly 1", () => {
      const { components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 1 };
      const initialK = subspace.k;

      const noveltyResult = detectNovelty(NOVEL_Y_EMB, subspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, subspace, noveltyResult);

      expect(expanded.k).toBe(initialK + 1);
      expect(expanded.components).toHaveLength(initialK + 1);
    });

    test("expandSubspace increments version by 1", () => {
      const { components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 3 };

      const noveltyResult = detectNovelty(NOVEL_Y_EMB, subspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, subspace, noveltyResult);

      expect(expanded.version).toBe(4);
    });

    test("new component is appended (not prepended) — existing components unchanged", () => {
      const { components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 1 };
      const originalComp0 = [...components[0]];

      const noveltyResult = detectNovelty(NOVEL_Y_EMB, subspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, subspace, noveltyResult);

      // First component is unchanged
      for (let j = 0; j < originalComp0.length; j++) {
        expect(expanded.components[0][j]).toBeCloseTo(originalComp0[j], 10);
      }
      // New component is last
      expect(expanded.components[expanded.k - 1]).not.toEqual(originalComp0);
    });

    test("expanded subspace yields coefficients matching new k (k+1 coefficients for new fact)", () => {
      const { components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 1 };

      const noveltyResult = detectNovelty(NOVEL_Y_EMB, subspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, subspace, noveltyResult);

      // Coefficients returned by expandSubspace cover all k+1 dimensions
      expect(expanded.coefficients).toHaveLength(expanded.k);
    });
  });

  // ── 2. Backward transfer re-projection ───────────────────────────────────

  describe("Backward transfer re-projection", () => {
    test("old fact gets k+1 coefficients after subspace expansion", () => {
      const { centroid, components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 1 };
      const initialK = subspace.k;

      const oldCoeffs = projectToCompact(PURE_X_EMB, centroid, components);

      const noveltyResult = detectNovelty(NOVEL_Y_EMB, subspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, subspace, noveltyResult);

      const newCoeffs = projectToCompact(PURE_X_EMB, centroid, expanded.components);

      expect(oldCoeffs).toHaveLength(initialK);
      expect(newCoeffs).toHaveLength(expanded.k); // k+1
      expect(newCoeffs.length).toBe(oldCoeffs.length + 1);
    });

    test("expansion is additive: first k coefficients are numerically identical after re-projection", () => {
      // Key invariant: since expansion APPENDS a new component without modifying
      // existing ones, projectToCompact must yield the same c₁..cₖ for any fact.
      const { centroid, components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 1 };

      const oldCoeffs = projectToCompact(PURE_X_EMB, centroid, components);

      const noveltyResult = detectNovelty(NOVEL_Y_EMB, subspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, subspace, noveltyResult);
      const newCoeffs = projectToCompact(PURE_X_EMB, centroid, expanded.components);

      // First k coefficients must be identical (up to floating-point precision)
      for (let i = 0; i < oldCoeffs.length; i++) {
        expect(newCoeffs[i]).toBeCloseTo(oldCoeffs[i], 8);
      }
    });

    test("mixed fact (strong y-component) gets large k+1 coefficient after y-expansion", () => {
      const { centroid, components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 1 };

      const noveltyResult = detectNovelty(NOVEL_Y_EMB, subspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, subspace, noveltyResult);

      const newCoeffs = projectToCompact(MIXED_EMB, centroid, expanded.components);

      // The new (k+1)th coefficient should be non-negligible for the mixed fact
      const newDimCoeff = newCoeffs[expanded.k - 1];
      expect(Math.abs(newDimCoeff)).toBeGreaterThan(0.05);
    });

    test("pure-x fact gets near-zero k+1 coefficient after y-expansion", () => {
      const { centroid, components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 1 };

      const noveltyResult = detectNovelty(NOVEL_Y_EMB, subspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, subspace, noveltyResult);

      const newCoeffs = projectToCompact(PURE_X_EMB, centroid, expanded.components);

      // Pure-x fact has negligible y-component → new coefficient ≈ 0
      const newDimCoeff = newCoeffs[expanded.k - 1];
      expect(Math.abs(newDimCoeff)).toBeLessThan(0.2);
    });

    test("facts outside time window are skipped by retroactiveReproject", () => {
      const { centroid, components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 1 };

      const noveltyResult = detectNovelty(NOVEL_Y_EMB, subspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, subspace, noveltyResult);

      const oldFacts: FactForReproject[] = [
        {
          _id: "fact_old",
          embedding: MIXED_EMB,
          compactEmbedding: projectToCompact(MIXED_EMB, centroid, components),
          timestamp: Date.now() - 40 * 24 * 60 * 60 * 1000, // 40 days ago
        },
      ];

      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30-day window
      const result = retroactiveReprojectLocal(oldFacts, centroid, expanded.components, {
        cutoff,
      });

      expect(result.enriched).toHaveLength(0);
      expect(result.skipped).toContain("fact_old");
    });
  });

  // ── 3. Change detection threshold ────────────────────────────────────────

  describe("Change detection threshold (CHANGE_THRESHOLD = 0.1)", () => {
    test("fact with large drift (dist > 0.1) is marked enriched", () => {
      const { centroid, components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 1 };

      const noveltyResult = detectNovelty(NOVEL_Y_EMB, subspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, subspace, noveltyResult);

      const now = Date.now();
      const facts: FactForReproject[] = [
        {
          _id: "fact_mixed",
          embedding: MIXED_EMB,
          compactEmbedding: projectToCompact(MIXED_EMB, centroid, components),
          timestamp: now,
        },
      ];

      const result = retroactiveReprojectLocal(facts, centroid, expanded.components);

      // Mixed fact has strong y-component → drift > 0.1
      expect(result.enriched).toContain("fact_mixed");
      expect(result.skipped).not.toContain("fact_mixed");
    });

    test("fact with minimal drift (dist ≤ 0.1) is skipped", () => {
      const { centroid, components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 1 };

      const noveltyResult = detectNovelty(NOVEL_Y_EMB, subspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, subspace, noveltyResult);

      const now = Date.now();
      const facts: FactForReproject[] = [
        {
          _id: "fact_pure_x",
          embedding: PURE_X_EMB,
          compactEmbedding: projectToCompact(PURE_X_EMB, centroid, components),
          timestamp: now,
        },
      ];

      const result = retroactiveReprojectLocal(facts, centroid, expanded.components);

      // Pure-x fact has negligible y-drift → stays unchanged
      expect(result.skipped).toContain("fact_pure_x");
      expect(result.enriched).not.toContain("fact_pure_x");
    });

    test("threshold is strict (> not >=): fact at exactly 0.1 is skipped", () => {
      // Build a fact whose new coefficient is exactly 0.1 relative to old
      // by constructing the embeddings so the drift is exactly 0.1
      const centroid = [0, 0, 0, 0];
      const comp0 = [1, 0, 0, 0]; // x-axis component
      const comp1 = [0, 1, 0, 0]; // y-axis component (new)

      const factEmb = [1, 0.1, 0, 0]; // x=1.0, y=0.1
      const oldCoeffs = [1.0]; // only x-projection (k=1)

      // After expansion with y-component: new coeff = dot([1,0.1,0,0], [0,1,0,0]) = 0.1
      // dist = sqrt((1-1)² + (0-0.1)²) = 0.1 → should be SKIPPED (not > 0.1)
      const facts: FactForReproject[] = [
        {
          _id: "fact_boundary",
          embedding: factEmb,
          compactEmbedding: oldCoeffs,
          timestamp: Date.now(),
        },
      ];

      const result = retroactiveReprojectLocal(facts, centroid, [comp0, comp1]);

      expect(result.skipped).toContain("fact_boundary");
      expect(result.enriched).not.toContain("fact_boundary");
    });

    test("mixed batch: some enriched, some skipped", () => {
      const { centroid, components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 1 };

      const noveltyResult = detectNovelty(NOVEL_Y_EMB, subspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, subspace, noveltyResult);

      const now = Date.now();
      const facts: FactForReproject[] = [
        {
          _id: "fact_mixed",
          embedding: MIXED_EMB,
          compactEmbedding: projectToCompact(MIXED_EMB, centroid, components),
          timestamp: now,
        },
        {
          _id: "fact_pure_x",
          embedding: PURE_X_EMB,
          compactEmbedding: projectToCompact(PURE_X_EMB, centroid, components),
          timestamp: now,
        },
        {
          _id: "fact_x2",
          embedding: X_CLUSTER[0],
          compactEmbedding: projectToCompact(X_CLUSTER[0], centroid, components),
          timestamp: now,
        },
      ];

      const result = retroactiveReprojectLocal(facts, centroid, expanded.components);

      // Mixed fact should be enriched; pure-x facts likely skipped
      expect(result.enriched).toContain("fact_mixed");
      // Total should account for all facts
      expect(result.enriched.length + result.skipped.length).toBe(facts.length);
    });
  });

  // ── 4. Compact-only embedding reconstruction ──────────────────────────────

  describe("Compact-only embedding reconstruction", () => {
    test("reconstructEmbedding from k=2 coefficients approximates original", () => {
      // Build a 2-component subspace incrementally (expandSubspace) so that the
      // components span the actual raw embedding directions. PCA components (from
      // consolidateEmbeddings) only capture centered variance; reconstructEmbedding
      // needs the mean-inclusive basis that expandSubspace produces.
      const emb0 = X_CLUSTER[0];
      const emb1 = X_CLUSTER[1];

      const empty: SubspaceData = { components: [], k: 0, version: 0 };
      const nov0 = detectNovelty(emb0, empty);
      const sub1 = expandSubspace(emb0, empty, nov0);
      const sub1data: SubspaceData = { components: sub1.components, k: sub1.k, version: sub1.version };

      const nov1 = detectNovelty(emb1, sub1data);
      // emb1 may or may not be novel; expand if novel, otherwise use sub1
      const finalSub = nov1.isNovel
        ? expandSubspace(emb1, sub1data, nov1)
        : sub1;
      const subspace: SubspaceData = {
        components: finalSub.components,
        k: finalSub.k,
        version: finalSub.version,
      };

      const coefficients = computeCoefficients(X_CLUSTER[0], subspace);
      const reconstructed = reconstructEmbedding(coefficients, subspace.components);

      expect(reconstructed).toHaveLength(subspace.components[0].length);

      // Cosine similarity between reconstructed and original should be high (>0.95)
      // because the components were built from the actual embedding directions
      const dotProd = reconstructed.reduce((s, v, i) => s + v * X_CLUSTER[0][i], 0);
      const normR = Math.sqrt(reconstructed.reduce((s, v) => s + v * v, 0));
      const normO = Math.sqrt(X_CLUSTER[0].reduce((s, v) => s + v * v, 0));
      const cosSim = normR > 0 && normO > 0 ? dotProd / (normR * normO) : 0;

      expect(cosSim).toBeGreaterThan(0.95);
    });

    test("reconstruction error decreases as k increases", () => {
      const embedding = X_CLUSTER[0];

      const r1 = consolidateEmbeddings(X_CLUSTER, 1);
      const sub1: SubspaceData = { components: r1.components, k: r1.components.length, version: 1 };
      const coeffs1 = computeCoefficients(embedding, sub1);
      const rec1 = reconstructEmbedding(coeffs1, r1.components);
      const err1 = Math.sqrt(embedding.reduce((s, v, i) => s + (v - rec1[i]) ** 2, 0));

      // With all 3 embeddings in X_CLUSTER, k=2 should capture more variance
      const r2 = consolidateEmbeddings(X_CLUSTER, 2);
      const sub2: SubspaceData = { components: r2.components, k: r2.components.length, version: 1 };
      const coeffs2 = computeCoefficients(embedding, sub2);
      const rec2 = reconstructEmbedding(coeffs2, r2.components);
      const err2 = Math.sqrt(embedding.reduce((s, v, i) => s + (v - rec2[i]) ** 2, 0));

      // k=2 should have ≤ reconstruction error of k=1 (more components = better approx)
      expect(err2).toBeLessThanOrEqual(err1 + 1e-6);
    });

    test("approximate re-projection via reconstruction stays within acceptable error", () => {
      // Simulates: fact has only compactEmbedding (full embedding cleared).
      // Reconstruct approximate full embedding, then re-project onto expanded basis.
      const { centroid, components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 1 };

      // Original fact embedding
      const originalEmb = X_CLUSTER[2];
      const compactCoeffs = computeCoefficients(originalEmb, subspace);

      // Reconstruct from compact (as would happen if full embedding cleared)
      const approximateEmb = reconstructEmbedding(compactCoeffs, components);

      // Expand subspace
      const noveltyResult = detectNovelty(NOVEL_Y_EMB, subspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, subspace, noveltyResult);

      // Re-project using approximate embedding
      const approxNewCoeffs = projectToCompact(approximateEmb, centroid, expanded.components);
      // Re-project using original (exact) embedding
      const exactNewCoeffs = projectToCompact(originalEmb, centroid, expanded.components);

      // First k coefficients should be identical
      for (let i = 0; i < components.length; i++) {
        expect(approxNewCoeffs[i]).toBeCloseTo(exactNewCoeffs[i], 3);
      }
    });

    test("empty coefficients return empty reconstruction", () => {
      const result = reconstructEmbedding([], []);
      expect(result).toHaveLength(0);
    });
  });

  // ── 5. Enrichment event structure ─────────────────────────────────────────

  describe("Enrichment event structure", () => {
    test("factIds field is a comma-delimited string (not an array)", () => {
      const enrichedIds = ["fact_a", "fact_b", "fact_c"];
      const event = buildEnrichmentEventPayload("sub_1", enrichedIds, "expansion");

      expect(typeof event.payload.factIds).toBe("string");
      expect(event.payload.factIds).toBe("fact_a,fact_b,fact_c");
    });

    test("enrichedCount matches number of enriched fact IDs", () => {
      const enrichedIds = ["fact_1", "fact_2"];
      const event = buildEnrichmentEventPayload("sub_1", enrichedIds, "expansion");

      expect(event.payload.enrichedCount).toBe(enrichedIds.length);
      expect(event.payload.enrichedCount).toBe(event.payload.factIds.split(",").length);
    });

    test("trigger field reflects the cause of enrichment", () => {
      const expansion = buildEnrichmentEventPayload("sub_1", ["f1"], "expansion");
      const remerge = buildEnrichmentEventPayload("sub_1", ["f1"], "remerge");
      const manual = buildEnrichmentEventPayload("sub_1", ["f1"], "manual");

      expect(expansion.payload.trigger).toBe("expansion");
      expect(remerge.payload.trigger).toBe("remerge");
      expect(manual.payload.trigger).toBe("manual");
    });

    test("event type is always retroactive_enrichment", () => {
      const event = buildEnrichmentEventPayload("sub_1", ["f1"], "manual");
      expect(event.eventType).toBe("retroactive_enrichment");
    });

    test("factIds round-trips through comma-split to original IDs", () => {
      const enrichedIds = ["fact_alpha", "fact_beta", "fact_gamma"];
      const event = buildEnrichmentEventPayload("sub_1", enrichedIds, "expansion");

      const decoded = event.payload.factIds
        .split(",")
        .filter((s) => s.trim().length > 0)
        .map((s) => s.trim());

      expect(decoded).toEqual(enrichedIds);
    });
  });

  // ── 6. 20% recall boost (hasRecentEnrichment) ────────────────────────────

  describe("20% recall boost for recently enriched facts", () => {
    const FACT_BASE = {
      timestamp: Date.now(),
      importanceScore: 0.5,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockResolveScopes.mockResolvedValue({
        scopeIds: ["scope_1"],
        resolved: [{ name: "private-agent-1", id: "scope_1" }],
      });
      mockExtractEntityIds.mockReturnValue([]);
      mockBumpAccessBatch.mockResolvedValue(undefined);
      mockRecordRecall.mockResolvedValue(undefined);
      mockKvGet.mockResolvedValue(null);
      mockLogEvent.mockResolvedValue(undefined);
      mockGetRecentlyEnrichedFactIds.mockResolvedValue(new Set());
    });

    test("enriched fact receives 1.2x score boost", async () => {
      const enrichedFact = { ...FACT_BASE, _id: "fact_enriched", content: "enriched memory" };
      const otherFact = { ...FACT_BASE, _id: "fact_other", content: "other memory" };

      mockTextSearch.mockResolvedValue([enrichedFact, otherFact]);
      mockVectorSearch.mockResolvedValue([]);
      mockRankCandidatesPrimitive.mockResolvedValue({
        ranked: [enrichedFact, otherFact],
        totalCandidates: 2,
        returnedCount: 2,
      });
      // Signal that "fact_enriched" was recently retroactively enriched
      mockGetRecentlyEnrichedFactIds.mockResolvedValue(new Set(["fact_enriched"]));

      const result = await recall({ query: "memory", searchStrategy: "text-only" }, "agent-1");

      expect("facts" in result).toBe(true);
      if ("facts" in result) {
        const enrichedInResult = result.facts.find((f: any) => f._id === "fact_enriched");
        const otherInResult = result.facts.find((f: any) => f._id === "fact_other");

        expect(enrichedInResult).toBeDefined();
        expect(otherInResult).toBeDefined();

        // Enriched fact should rank first (boosted) and have retroactivelyRelevant tag
        expect(result.facts[0]._id).toBe("fact_enriched");
        expect(enrichedInResult?.retroactivelyRelevant).toBe(true);
        // Other fact should NOT have the tag
        expect(otherInResult?.retroactivelyRelevant).toBeUndefined();
      }
    });

    test("non-enriched facts are not boosted and have no retroactivelyRelevant tag", async () => {
      const fact = { ...FACT_BASE, _id: "fact_plain", content: "plain memory" };

      mockTextSearch.mockResolvedValue([fact]);
      mockVectorSearch.mockResolvedValue([]);
      mockRankCandidatesPrimitive.mockResolvedValue({
        ranked: [fact],
        totalCandidates: 1,
        returnedCount: 1,
      });
      // No enriched facts
      mockGetRecentlyEnrichedFactIds.mockResolvedValue(new Set());

      const result = await recall({ query: "memory", searchStrategy: "text-only" }, "agent-1");

      expect("facts" in result).toBe(true);
      if ("facts" in result) {
        const factInResult = result.facts.find((f: any) => f._id === "fact_plain");
        expect(factInResult?.retroactivelyRelevant).toBeUndefined();
      }
    });

    test("boost is applied after ranking — enriched fact can overtake higher-ranked non-enriched", async () => {
      // fact_low was ranked second (lower score); it gets boosted by 1.2x
      // and should appear first in the output
      const factHigh = { ...FACT_BASE, _id: "fact_high", content: "high-ranked", _score: 0.9 };
      const factLow = { ...FACT_BASE, _id: "fact_low", content: "low-ranked", _score: 0.8 };

      mockTextSearch.mockResolvedValue([factHigh, factLow]);
      mockVectorSearch.mockResolvedValue([]);
      // Ranker returns factHigh first (higher score)
      mockRankCandidatesPrimitive.mockResolvedValue({
        ranked: [factHigh, factLow],
        totalCandidates: 2,
        returnedCount: 2,
      });
      // Only the lower-ranked fact was retroactively enriched
      mockGetRecentlyEnrichedFactIds.mockResolvedValue(new Set(["fact_low"]));

      const result = await recall({ query: "memory", searchStrategy: "text-only" }, "agent-1");

      expect("facts" in result).toBe(true);
      if ("facts" in result) {
        // After 1.2x boost: fact_low score = 0.8 * 1.2 = 0.96 > fact_high 0.9
        expect(result.facts[0]._id).toBe("fact_low");
        expect(result.facts[0].retroactivelyRelevant).toBe(true);
      }
    });

    test("getRecentlyEnrichedFactIds is always called during recall", async () => {
      mockTextSearch.mockResolvedValue([]);
      mockVectorSearch.mockResolvedValue([]);
      mockRankCandidatesPrimitive.mockResolvedValue({
        ranked: [],
        totalCandidates: 0,
        returnedCount: 0,
      });

      await recall({ query: "test" }, "agent-1");

      expect(mockGetRecentlyEnrichedFactIds).toHaveBeenCalled();
    });
  });

  // ── 7. Edge cases ─────────────────────────────────────────────────────────

  describe("Edge cases", () => {
    test("no facts in time window: enriched=0, skipped=0", () => {
      const { centroid, components } = consolidateEmbeddings(X_CLUSTER, 1);
      const subspace: SubspaceData = { components, k: components.length, version: 1 };
      const noveltyResult = detectNovelty(NOVEL_Y_EMB, subspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, subspace, noveltyResult);

      // All facts are 40 days old; cutoff is 30 days
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const oldTimestamp = Date.now() - 40 * 24 * 60 * 60 * 1000;
      const facts: FactForReproject[] = [
        {
          _id: "fact_old_1",
          embedding: MIXED_EMB,
          compactEmbedding: projectToCompact(MIXED_EMB, centroid, components),
          timestamp: oldTimestamp,
        },
        {
          _id: "fact_old_2",
          embedding: PURE_X_EMB,
          compactEmbedding: projectToCompact(PURE_X_EMB, centroid, components),
          timestamp: oldTimestamp,
        },
      ];

      const result = retroactiveReprojectLocal(facts, centroid, expanded.components, { cutoff });

      expect(result.enriched).toHaveLength(0);
      expect(result.skipped).toHaveLength(2);
    });

    test("all facts unchanged (drift ≤ 0.1): enriched=0", () => {
      // Build k=1, then expand — but use facts with zero y-component
      // so new coefficient ≈ 0 and drift ≤ 0.1
      const centroid = [0, 0, 0, 0];
      const comp0 = [1, 0, 0, 0];
      const comp1 = [0, 1, 0, 0]; // new y-direction after expansion

      const now = Date.now();
      const facts: FactForReproject[] = [
        // Fact with y=0.05 → new coeff = 0.05 ≤ 0.1 → skipped
        {
          _id: "fact_tiny_y",
          embedding: [1.0, 0.05, 0.0, 0.0],
          compactEmbedding: [1.0],
          timestamp: now,
        },
        // Fact with y=0.0 → new coeff = 0.0 → skipped
        {
          _id: "fact_zero_y",
          embedding: [1.0, 0.0, 0.0, 0.0],
          compactEmbedding: [1.0],
          timestamp: now,
        },
      ];

      const result = retroactiveReprojectLocal(facts, centroid, [comp0, comp1]);

      expect(result.enriched).toHaveLength(0);
      expect(result.skipped).toHaveLength(2);
    });

    test("empty subspace (no principalVectors): everything is novel", () => {
      const emptySubspace: SubspaceData = { components: [], k: 0, version: 1 };
      const result = detectNovelty(NOVEL_Y_EMB, emptySubspace);

      expect(result.isNovel).toBe(true);
      expect(result.residualNorm).toBeGreaterThan(0);
      expect(result.coefficients).toHaveLength(0);
    });

    test("expanding from empty subspace creates k=1 subspace", () => {
      const emptySubspace: SubspaceData = { components: [], k: 0, version: 1 };
      const noveltyResult = detectNovelty(NOVEL_Y_EMB, emptySubspace);
      const expanded = expandSubspace(NOVEL_Y_EMB, emptySubspace, noveltyResult);

      expect(expanded.k).toBe(1);
      expect(expanded.components).toHaveLength(1);
      expect(expanded.version).toBe(2);
    });

    test("enrichment event with zero facts: enrichedCount=0, factIds=empty string", () => {
      const event = buildEnrichmentEventPayload("sub_1", [], "expansion");

      expect(event.payload.enrichedCount).toBe(0);
      expect(event.payload.factIds).toBe("");
    });

    test("single-fact enrichment: factIds contains no comma", () => {
      const event = buildEnrichmentEventPayload("sub_1", ["fact_single"], "manual");

      expect(event.payload.factIds).toBe("fact_single");
      expect(event.payload.factIds).not.toContain(",");
    });
  });
});
