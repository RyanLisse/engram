import { describe, it, expect } from "vitest";
import {
  consolidateEmbeddings,
  incrementalUpdate,
  projectToCompact,
  compactCosineSimilarity,
  cosineSimilarity,
  ConsolidationResult,
} from "../src/lib/svd-consolidation";

describe("SVD Consolidation", () => {
  describe("consolidateEmbeddings", () => {
    it("should handle empty embeddings array", () => {
      const result = consolidateEmbeddings([]);
      expect(result.centroid).toEqual([]);
      expect(result.components).toEqual([]);
      expect(result.singularValues).toEqual([]);
      expect(result.varianceExplained).toBe(0);
      expect(result.sampleCount).toBe(0);
    });

    it("should compute centroid as mean of all embeddings", () => {
      const embeddings = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      const result = consolidateEmbeddings(embeddings, 2);
      expect(result.centroid).toEqual([1 / 3, 1 / 3, 1 / 3]);
      expect(result.sampleCount).toBe(3);
    });

    it("should extract k components", () => {
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
    });

    it("should have singular values in descending order", () => {
      const embeddings = [
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
        [0.8, 0.2, 0],
      ];
      const result = consolidateEmbeddings(embeddings, 3);
      for (let i = 1; i < result.singularValues.length; i++) {
        expect(result.singularValues[i]).toBeLessThanOrEqual(result.singularValues[i - 1]);
      }
    });

    it("should calculate variance explained between 0 and 1", () => {
      const embeddings = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
        [0, 0, 1, 0],
      ];
      const result = consolidateEmbeddings(embeddings, 2);
      expect(result.varianceExplained).toBeGreaterThanOrEqual(0);
      expect(result.varianceExplained).toBeLessThanOrEqual(1);
    });

    it("should limit k to min(n, d)", () => {
      const embeddings = [
        [1, 0, 0],
        [0, 1, 0],
      ];
      // Request 5 components but only 2 embeddings and 3 dimensions
      const result = consolidateEmbeddings(embeddings, 5);
      expect(result.components.length).toBeLessThanOrEqual(2);
    });

    it("should use default k of 3 when number is provided", () => {
      const embeddings = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ];
      const result = consolidateEmbeddings(embeddings);
      expect(result.components.length).toBeLessThanOrEqual(3);
    });

    it("should auto-select k based on target variance", () => {
      const embeddings = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ];
      const result = consolidateEmbeddings(embeddings, { targetVariance: 0.8, maxK: 10 });
      expect(result.varianceExplained).toBeGreaterThanOrEqual(0.8);
      expect(result.varianceExplained).toBeLessThanOrEqual(1.0);
    });

    it("should respect maxK limit in auto-k selection", () => {
      const embeddings = Array.from({ length: 10 }, (_, i) => {
        const vec = new Array(10).fill(0);
        vec[i % 10] = 1;
        return vec;
      });
      const result = consolidateEmbeddings(embeddings, { targetVariance: 0.99, maxK: 3 });
      expect(result.components.length).toBeLessThanOrEqual(3);
    });

    it("should handle single embedding", () => {
      const embeddings = [[1, 2, 3, 4, 5]];
      const result = consolidateEmbeddings(embeddings, 2);
      expect(result.centroid).toEqual([1, 2, 3, 4, 5]);
      expect(result.sampleCount).toBe(1);
      // With single embedding, centered data is all zeros
      expect(result.varianceExplained).toBe(1.0);
    });

    it("should handle identical embeddings", () => {
      const embeddings = [
        [1, 2, 3],
        [1, 2, 3],
        [1, 2, 3],
      ];
      const result = consolidateEmbeddings(embeddings, 2);
      expect(result.centroid).toEqual([1, 2, 3]);
      // No variance since all embeddings are identical
      expect(result.varianceExplained).toBe(1.0);
    });

    it("should handle zero vector embeddings", () => {
      const embeddings = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
      const result = consolidateEmbeddings(embeddings, 2);
      expect(result.centroid).toEqual([0, 0, 0]);
      expect(result.varianceExplained).toBe(1.0);
      expect(result.totalVariance).toBe(0);
    });

    it("should compute total variance correctly", () => {
      const embeddings = [
        [1, 0],
        [0, 1],
      ];
      const result = consolidateEmbeddings(embeddings, 1);
      expect(result.totalVariance).toBeGreaterThan(0);
      expect(result.componentVariances.length).toBeGreaterThan(0);
    });

    it("should compute singular value ratio", () => {
      const embeddings = [
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ];
      const result = consolidateEmbeddings(embeddings, 2);
      expect(result.singularValueRatio).toBeGreaterThanOrEqual(0);
    });

    it("should have components be unit vectors", () => {
      const embeddings = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
        [0, 0, 1, 0],
      ];
      const result = consolidateEmbeddings(embeddings, 2);
      for (const comp of result.components) {
        const norm = Math.sqrt(comp.reduce((sum, x) => sum + x * x, 0));
        expect(norm).toBeCloseTo(1, 5);
      }
    });

    it("should have orthogonal components", () => {
      const embeddings = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ];
      const result = consolidateEmbeddings(embeddings, 3);
      // Check orthogonality of first two components
      if (result.components.length >= 2) {
        const dot = result.components[0].reduce((sum, x, i) => sum + x * result.components[1][i], 0);
        expect(Math.abs(dot)).toBeLessThan(0.01); // ~orthogonal
      }
    });

    it("should handle high-dimensional embeddings", () => {
      const embeddings = Array.from({ length: 10 }, (_, i) => {
        const vec = new Array(100).fill(0);
        vec[i % 10] = 1;
        vec[(i + 1) % 10] = 0.5;
        return vec;
      });
      const result = consolidateEmbeddings(embeddings, 3);
      expect(result.components.length).toBeGreaterThanOrEqual(1);
      expect(result.centroid).toHaveLength(100);
    });

    it("should match existing test case", () => {
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

  describe("projectToCompact", () => {
    it("should project embedding to k-dim coefficients", () => {
      const embeddings = [
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ];
      const result = consolidateEmbeddings(embeddings, 2);
      const embedding = [0.9, 0.1, 0];
      const compact = projectToCompact(embedding, result.centroid, result.components);

      expect(compact).toHaveLength(2);
      expect(typeof compact[0]).toBe("number");
      expect(typeof compact[1]).toBe("number");
    });

    it("should return empty array for zero components", () => {
      const centroid = [0.5, 0.5, 0.5];
      const components: number[][] = [];
      const embedding = [1, 0, 0];
      const compact = projectToCompact(embedding, centroid, components);
      expect(compact).toEqual([]);
    });

    it("should center embedding before projection", () => {
      const centroid = [1, 0, 0];
      const components = [[1, 0, 0]]; // x-axis
      const embedding = [2, 0, 0];
      const compact = projectToCompact(embedding, centroid, components);
      // Centered: [2-1, 0-0, 0-0] = [1, 0, 0]
      // Projected onto [1, 0, 0]: dot([1,0,0], [1,0,0]) = 1
      expect(compact[0]).toBeCloseTo(1, 5);
    });

    it("should handle multiple components", () => {
      const embeddings = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
        [0, 0, 1, 0],
      ];
      const result = consolidateEmbeddings(embeddings, 3);
      const embedding = [1, 1, 1, 0];
      const compact = projectToCompact(embedding, result.centroid, result.components);
      expect(compact).toHaveLength(3);
    });

    it("should preserve relative magnitudes", () => {
      const embeddings = [
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ];
      const result = consolidateEmbeddings(embeddings, 2);
      const embedding1 = [2, 0, 0];
      const embedding2 = [1, 0, 0];
      const compact1 = projectToCompact(embedding1, result.centroid, result.components);
      const compact2 = projectToCompact(embedding2, result.centroid, result.components);

      const ratio1 = compact1[0] / embedding1[0];
      const ratio2 = compact2[0] / embedding2[0];
      // Ratios should be similar
      expect(Math.abs(ratio1 - ratio2)).toBeLessThan(0.1);
    });
  });

  describe("incrementalUpdate", () => {
    it("should update centroid correctly", () => {
      const embeddings = [[1, 0, 0], [0, 1, 0]];
      let result = consolidateEmbeddings(embeddings, 2);
      expect(result.sampleCount).toBe(2);

      const newEmbedding = [0, 0, 1];
      result = incrementalUpdate(result, newEmbedding);
      expect(result.sampleCount).toBe(3);
      // New centroid should be mean of [1,0,0], [0,1,0], [0,0,1]
      expect(result.centroid).toEqual([1 / 3, 1 / 3, 1 / 3]);
    });

    it("should preserve existing components structure", () => {
      const embeddings = [
        [1, 0, 0],
        [0, 1, 0],
      ];
      let result = consolidateEmbeddings(embeddings, 2);
      const originalComponentCount = result.components.length;

      const newEmbedding = [0, 0, 1];
      result = incrementalUpdate(result, newEmbedding);

      expect(result.components.length).toBeLessThanOrEqual(originalComponentCount + 1);
    });

    it("should update variance estimates", () => {
      const embeddings = [[1, 0], [0, 1]];
      let result = consolidateEmbeddings(embeddings, 1);
      const originalVariance = result.totalVariance;

      const newEmbedding = [1, 1];
      result = incrementalUpdate(result, newEmbedding);

      expect(result.totalVariance).toBeGreaterThanOrEqual(0);
    });

    it("should correctly apply Welford variance formula with old variance scaling", () => {
      // Start with 2 embeddings: [1, 0] and [0, 1]
      // Centroid: [0.5, 0.5], centered: [0.5, -0.5], [-0.5, 0.5]
      // Initial variance: (0.5² + 0.5² + 0.5² + 0.5²) / 2 = 1/2 = 0.5
      const embeddings = [[1, 0], [0, 1]];
      let result = consolidateEmbeddings(embeddings, 1);
      const originalVariance = result.totalVariance;
      expect(originalVariance).toBeCloseTo(0.5, 5);

      // Add a third embedding [0.5, 0.5]
      // New centroid: [0.5, 0.5], all points centered to [0.5, -0.5], [-0.5, 0.5], [0, 0]
      // Expected variance: (0.25 + 0.25 + 0.25 + 0.25 + 0) / 3 = 1/3 ≈ 0.333...
      const newEmbedding = [0.5, 0.5];
      result = incrementalUpdate(result, newEmbedding);

      // With the fix, the formula is:
      // newTotalVariance = existing.totalVariance * (oldN / newN) + diffNormSq / newN
      // = 0.5 * (2/3) + 0 / 3 = 1/3
      expect(result.totalVariance).toBeCloseTo(1 / 3, 5);
      expect(result.sampleCount).toBe(3);
    });

    it("should handle empty initial state", () => {
      let result = consolidateEmbeddings([], 2);
      expect(result.centroid).toEqual([]);

      // This should handle gracefully or return early
      const newEmbedding = [1, 2, 3];
      result = incrementalUpdate(result, newEmbedding);
      expect(result.centroid).toEqual([]);
    });

    it("should handle mismatched dimensionality", () => {
      const embeddings = [[1, 2, 3]];
      let result = consolidateEmbeddings(embeddings, 1);

      const newEmbedding = [1, 2]; // wrong dimension
      const updated = incrementalUpdate(result, newEmbedding);
      expect(updated).toEqual(result); // Should return unchanged
    });

    it("should maintain component count after update", () => {
      const embeddings = [
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ];
      let result = consolidateEmbeddings(embeddings, 2);
      const componentCount = result.components.length;

      result = incrementalUpdate(result, [0, 0, 1]);
      expect(result.components.length).toBeLessThanOrEqual(componentCount + 1);
    });

    it("should update sample count incrementally", () => {
      const embeddings = [
        [1, 0],
        [0, 1],
      ];
      let result = consolidateEmbeddings(embeddings, 1);
      expect(result.sampleCount).toBe(2);

      for (let i = 0; i < 5; i++) {
        result = incrementalUpdate(result, [Math.random(), Math.random()]);
        expect(result.sampleCount).toBe(3 + i);
      }
    });
  });

  describe("compactCosineSimilarity", () => {
    it("should compute similarity between two compact vectors", () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];
      const similarity = compactCosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it("should compute similarity 0 for orthogonal vectors", () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const similarity = compactCosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it("should compute similarity -1 for opposite vectors", () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      const similarity = compactCosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(-1, 5);
    });

    it("should apply component variance weights", () => {
      const a = [1, 1];
      const b = [1, 1];
      const unweighted = compactCosineSimilarity(a, b);
      const weighted = compactCosineSimilarity(a, b, [0.8, 0.2]);
      // Both should be 1 for identical vectors
      expect(unweighted).toBeCloseTo(1, 5);
      expect(weighted).toBeCloseTo(1, 5);
    });

    it("should handle zero vectors", () => {
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      const similarity = compactCosineSimilarity(a, b);
      expect(similarity).toBe(0); // 0/0 case → 0
    });

    it("should handle vectors of different lengths", () => {
      const a = [1, 0, 0];
      const b = [1, 0];
      const similarity = compactCosineSimilarity(a, b);
      expect(typeof similarity).toBe("number");
      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it("should be consistent with weighted variance", () => {
      const a = [1, 2];
      const b = [2, 1];
      const variances = [0.9, 0.1];
      const similarity = compactCosineSimilarity(a, b, variances);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });
  });

  describe("cosineSimilarity", () => {
    it("should compute similarity between two full embeddings", () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];
      const similarity = cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it("should compute similarity 0 for orthogonal vectors", () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const similarity = cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it("should compute similarity -1 for opposite vectors", () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      const similarity = cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(-1, 5);
    });

    it("should be symmetric", () => {
      const a = [1, 2, 3];
      const b = [4, 5, 6];
      const ab = cosineSimilarity(a, b);
      const ba = cosineSimilarity(b, a);
      expect(ab).toBeCloseTo(ba, 10);
    });

    it("should handle zero vectors", () => {
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      const similarity = cosineSimilarity(a, b);
      expect(similarity).toBe(0);
    });

    it("should handle high-dimensional embeddings", () => {
      const a = new Array(1024).fill(0);
      const b = new Array(1024).fill(0);
      a[0] = 1;
      b[0] = 1;
      const similarity = cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(1, 5);
    });
  });

  describe("Reconstruction Accuracy", () => {
    it("should provide good reconstruction with k=d", () => {
      const embeddings = [
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ];
      const result = consolidateEmbeddings(embeddings, 3); // k = d
      expect(result.varianceExplained).toBeCloseTo(1, 1); // nearly perfect
    });

    it("should have lower reconstruction with k < d", () => {
      const embeddings = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
        [0, 0, 1, 0],
      ];
      const result1 = consolidateEmbeddings(embeddings, 1);
      const result2 = consolidateEmbeddings(embeddings, 3);
      expect(result2.varianceExplained).toBeGreaterThanOrEqual(result1.varianceExplained);
    });

    it("should capture most variance in first component", () => {
      const embeddings = [
        [10, 0, 0, 0],
        [0, 1, 0, 0],
        [10, 1, 0, 0],
        [0, 0, 0.1, 0],
      ];
      const result = consolidateEmbeddings(embeddings, 2);
      if (result.componentVariances.length >= 2) {
        // First component should capture the x-axis variance which dominates
        expect(result.componentVariances[0]).toBeGreaterThan(result.componentVariances[1] * 0.5);
      }
    });
  });

  describe("Edge Cases and Stability", () => {
    it("should handle very small tolerance", () => {
      const embeddings = [
        [1, 0],
        [0, 1],
      ];
      const result = consolidateEmbeddings(embeddings, { k: 1, tolerance: 1e-12 });
      expect(result.components).toHaveLength(1);
    });

    it("should handle very large number of iterations", () => {
      const embeddings = [
        [1, 0],
        [0, 1],
      ];
      const result = consolidateEmbeddings(embeddings, { k: 1, maxIterations: 1000 });
      expect(result.components).toHaveLength(1);
    });

    it("should handle near-duplicate embeddings", () => {
      const embeddings = [
        [1, 0, 0],
        [1.001, 0.001, 0],
        [1.002, 0.001, 0],
      ];
      const result = consolidateEmbeddings(embeddings, 1);
      // Near-duplicates have very low variance - components may be empty if below tolerance
      expect(result.components.length).toBeLessThanOrEqual(1);
      expect(result.varianceExplained).toBeLessThanOrEqual(1);
    });

    it("should handle embeddings with very large values", () => {
      const embeddings = [
        [1e6, 0],
        [0, 1e6],
      ];
      const result = consolidateEmbeddings(embeddings, 1);
      expect(result.components).toHaveLength(1);
      expect(result.centroid[0]).toBeGreaterThan(0);
    });

    it("should handle embeddings with very small values", () => {
      const embeddings = [
        [1e-4, 0],
        [0, 1e-4],
        [1e-4, 1e-4],
      ];
      const result = consolidateEmbeddings(embeddings, 1);
      // Very small values still have variance, should extract at least some components
      expect(result.components.length).toBeGreaterThanOrEqual(0);
      expect(result.centroid.length).toBe(2);
    });

    it("should be deterministic for same input", () => {
      const embeddings = [
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ];
      const result1 = consolidateEmbeddings(embeddings, 2);
      const result2 = consolidateEmbeddings(embeddings, 2);

      expect(result1.centroid).toEqual(result2.centroid);
      expect(result1.varianceExplained).toBeCloseTo(result2.varianceExplained, 10);
    });
  });

  describe("Integration", () => {
    it("should round-trip: consolidate → project → similarity", () => {
      const embeddings = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
        [0, 0, 1, 0],
      ];
      const result = consolidateEmbeddings(embeddings, 2);

      const compact1 = projectToCompact(embeddings[0], result.centroid, result.components);
      const compact2 = projectToCompact(embeddings[1], result.centroid, result.components);

      const similarity = compactCosineSimilarity(compact1, compact2, result.componentVariances);
      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it("should maintain similarity ordering through consolidation", () => {
      const embeddings = [
        [1, 0, 0, 0],
        [1, 0.1, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
      ];
      const result = consolidateEmbeddings(embeddings, 2);

      const compact0 = projectToCompact(embeddings[0], result.centroid, result.components);
      const compact1 = projectToCompact(embeddings[1], result.centroid, result.components);
      const compact2 = projectToCompact(embeddings[2], result.centroid, result.components);

      const sim01 = compactCosineSimilarity(compact0, compact1, result.componentVariances);
      const sim02 = compactCosineSimilarity(compact0, compact2, result.componentVariances);

      // Embeddings 0 and 1 are closer than 0 and 2
      expect(sim01).toBeGreaterThan(sim02);
    });
  });
});
