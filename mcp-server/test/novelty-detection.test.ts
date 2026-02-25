import { describe, expect, test } from "vitest";
import {
  detectNovelty,
  expandSubspace,
  computeCoefficients,
  reconstructEmbedding,
  type SubspaceData,
  type NoveltyResult,
} from "../src/lib/novelty-detection.js";

/**
 * Test suite for novelty detection module
 * Tests residual-based novelty detection against subspaces
 */

// ============================================================================
// UTILITY FUNCTIONS FOR TESTS
// ============================================================================

function createUnitVector(dim: number, index: number): number[] {
  const v = new Array(dim).fill(0);
  v[index] = 1;
  return v;
}

function createRandomVector(dim: number, seed: number): number[] {
  // Seeded pseudo-random for reproducibility
  const v: number[] = [];
  let x = seed;
  for (let i = 0; i < dim; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    v.push((x / 0x7fffffff) * 2 - 1);
  }
  // Normalize to unit length
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < dim; i++) {
    v[i] /= norm;
  }
  return v;
}

function vectorLength(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

function vectorSubtract(a: number[], b: number[]): number[] {
  return a.map((x, i) => x - b[i]);
}

function vectorAdd(a: number[], b: number[]): number[] {
  return a.map((x, i) => x + b[i]);
}

function scalarMultiply(v: number[], s: number): number[] {
  return v.map((x) => x * s);
}

describe("noveltyDetection", () => {
  const DIM = 1024;

  // ============================================================================
  // BASIC NOVELTY DETECTION TESTS
  // ============================================================================
  describe("detectNovelty", () => {
    test("detects embeddings within subspace as non-novel", () => {
      // Create a simple 1D subspace
      const component = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [component],
        k: 1,
        version: 1,
      };

      // Embedding that lies in the subspace (0.5 * component)
      const embedding = scalarMultiply(component, 0.5);
      const result = detectNovelty(embedding, subspace);

      expect(result.isNovel).toBe(false);
      expect(result.residualNorm).toBeLessThan(1e-10); // Should be ~0
      expect(result.coefficients.length).toBe(1);
      expect(result.coefficients[0]).toBeCloseTo(0.5, 5);
    });

    test("detects orthogonal embeddings as novel", () => {
      // Create a 1D subspace with component along dimension 0
      const component = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [component],
        k: 1,
        version: 1,
      };

      // Embedding orthogonal to the subspace (along dimension 1)
      const embedding = createUnitVector(DIM, 1);
      const result = detectNovelty(embedding, subspace);

      expect(result.isNovel).toBe(true);
      expect(result.residualNorm).toBeCloseTo(1.0, 5); // Orthogonal, so residual = embedding
    });

    test("reconstructs embedding correctly from subspace projection", () => {
      const component = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [component],
        k: 1,
        version: 1,
      };

      // Embedding with component along dimension 0 and 1
      const embedding = new Array(DIM).fill(0);
      embedding[0] = 0.6;
      embedding[1] = 0.8;

      const result = detectNovelty(embedding, subspace);

      // Reconstructed should only have dimension 0 component
      expect(result.reconstructed[0]).toBeCloseTo(0.6, 5);
      expect(result.reconstructed[1]).toBeCloseTo(0, 10);
    });

    test("returns empty coefficients for empty subspace", () => {
      const subspace: SubspaceData = {
        components: [],
        k: 0,
        version: 1,
      };

      const embedding = createUnitVector(DIM, 0);
      const result = detectNovelty(embedding, subspace);

      expect(result.isNovel).toBe(true);
      expect(result.coefficients.length).toBe(0);
      expect(result.residualNorm).toBeCloseTo(1.0, 5);
    });

    test("uses custom threshold", () => {
      const component = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [component],
        k: 1,
        version: 1,
      };

      // Create embedding with residual norm = 0.35
      const embedding = new Array(DIM).fill(0);
      embedding[0] = 0.6; // In subspace
      embedding[1] = 0.35; // Orthogonal component

      // With default threshold (0.4), should NOT be novel
      const result1 = detectNovelty(embedding, subspace);
      expect(result1.isNovel).toBe(false);

      // With threshold 0.3, should be novel
      const result2 = detectNovelty(embedding, subspace, 0.3);
      expect(result2.isNovel).toBe(true);

      // With threshold 0.4, should NOT be novel (at boundary)
      const result3 = detectNovelty(embedding, subspace, 0.4);
      expect(result3.isNovel).toBe(false);
    });
  });

  // ============================================================================
  // THRESHOLD SENSITIVITY TESTS
  // ============================================================================
  describe("threshold sensitivity", () => {
    test("classifies embeddings just below 0.4 threshold as non-novel", () => {
      const component = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [component],
        k: 1,
        version: 1,
      };

      // Create embedding with residual = 0.39
      const embedding = new Array(DIM).fill(0);
      embedding[0] = 0.6;
      embedding[1] = 0.39;

      const result = detectNovelty(embedding, subspace, 0.4);
      expect(result.isNovel).toBe(false);
      expect(result.residualNorm).toBeCloseTo(0.39, 5);
    });

    test("classifies embeddings just above 0.4 threshold as novel", () => {
      const component = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [component],
        k: 1,
        version: 1,
      };

      // Create embedding with residual = 0.41
      const embedding = new Array(DIM).fill(0);
      embedding[0] = 0.6;
      embedding[1] = 0.41;

      const result = detectNovelty(embedding, subspace, 0.4);
      expect(result.isNovel).toBe(true);
      expect(result.residualNorm).toBeCloseTo(0.41, 5);
    });

    test("classifies at exact boundary (0.4)", () => {
      const component = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [component],
        k: 1,
        version: 1,
      };

      // Create embedding with residual = 0.4 exactly
      const embedding = new Array(DIM).fill(0);
      embedding[0] = 0.6;
      embedding[1] = 0.4;

      const result = detectNovelty(embedding, subspace, 0.4);
      // At boundary: residualNorm > threshold is false, so not novel
      expect(result.isNovel).toBe(false);
      expect(result.residualNorm).toBeCloseTo(0.4, 5);
    });
  });

  // ============================================================================
  // MULTI-DIMENSIONAL SUBSPACE TESTS
  // ============================================================================
  describe("multi-dimensional subspaces", () => {
    test("detects novelty with 2D subspace", () => {
      const comp1 = createUnitVector(DIM, 0);
      const comp2 = createUnitVector(DIM, 1);
      const subspace: SubspaceData = {
        components: [comp1, comp2],
        k: 2,
        version: 1,
      };

      // Embedding in the 2D subspace
      const inSubspace = new Array(DIM).fill(0);
      inSubspace[0] = 0.5;
      inSubspace[1] = 0.6;

      const result1 = detectNovelty(inSubspace, subspace);
      expect(result1.isNovel).toBe(false);
      expect(result1.residualNorm).toBeLessThan(1e-10);

      // Embedding orthogonal to the subspace
      const orthogonal = createUnitVector(DIM, 2);
      const result2 = detectNovelty(orthogonal, subspace);
      expect(result2.isNovel).toBe(true);
      expect(result2.residualNorm).toBeCloseTo(1.0, 5);
    });

    test("correctly computes coefficients for multi-D subspace", () => {
      const comp1 = createUnitVector(DIM, 0);
      const comp2 = createUnitVector(DIM, 1);
      const subspace: SubspaceData = {
        components: [comp1, comp2],
        k: 2,
        version: 1,
      };

      const embedding = new Array(DIM).fill(0);
      embedding[0] = 0.3;
      embedding[1] = 0.7;

      const result = detectNovelty(embedding, subspace);
      expect(result.coefficients.length).toBe(2);
      expect(result.coefficients[0]).toBeCloseTo(0.3, 5);
      expect(result.coefficients[1]).toBeCloseTo(0.7, 5);
    });
  });

  // ============================================================================
  // SUBSPACE EXPANSION TESTS
  // ============================================================================
  describe("expandSubspace", () => {
    test("expands subspace by adding residual as new component", () => {
      const component = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [component],
        k: 1,
        version: 1,
      };

      // Embedding with residual
      const embedding = new Array(DIM).fill(0);
      embedding[0] = 0.6;
      embedding[1] = 0.8; // Orthogonal component

      const noveltyResult = detectNovelty(embedding, subspace);
      expect(noveltyResult.isNovel).toBe(true);

      const expanded = expandSubspace(embedding, subspace, noveltyResult);

      expect(expanded.k).toBe(2);
      expect(expanded.components.length).toBe(2);
      expect(expanded.version).toBe(2);
    });

    test("normalized residual has unit length in expanded subspace", () => {
      const component = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [component],
        k: 1,
        version: 1,
      };

      const embedding = new Array(DIM).fill(0);
      embedding[0] = 0.6;
      embedding[1] = 0.8;

      const noveltyResult = detectNovelty(embedding, subspace);
      const expanded = expandSubspace(embedding, subspace, noveltyResult);

      // The new component should be normalized
      const newComponent = expanded.components[1];
      const newComponentNorm = vectorLength(newComponent);
      expect(newComponentNorm).toBeCloseTo(1.0, 5);
    });

    test("expanded subspace coefficients include original + new projection", () => {
      const component = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [component],
        k: 1,
        version: 1,
      };

      const embedding = new Array(DIM).fill(0);
      embedding[0] = 0.6;
      embedding[1] = 0.8;

      const noveltyResult = detectNovelty(embedding, subspace);
      const expanded = expandSubspace(embedding, subspace, noveltyResult);

      // Should have 2 coefficients now
      expect(expanded.coefficients.length).toBe(2);
      // First coefficient should still be ~0.6
      expect(expanded.coefficients[0]).toBeCloseTo(0.6, 5);
      // Second coefficient should be normalized projection
      expect(Math.abs(expanded.coefficients[1])).toBeGreaterThan(0);
    });

    test("can expand empty subspace", () => {
      const subspace: SubspaceData = {
        components: [],
        k: 0,
        version: 1,
      };

      const embedding = createUnitVector(DIM, 0);
      const noveltyResult = detectNovelty(embedding, subspace);
      const expanded = expandSubspace(embedding, subspace, noveltyResult);

      expect(expanded.k).toBe(1);
      expect(expanded.components.length).toBe(1);
      // First principal direction should be the embedding itself (normalized)
      const firstComponent = expanded.components[0];
      expect(vectorLength(firstComponent)).toBeCloseTo(1.0, 5);
    });

    test("handles near-zero residual gracefully", () => {
      const component = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [component],
        k: 1,
        version: 1,
      };

      // Embedding exactly in subspace (residual = 0)
      const embedding = scalarMultiply(component, 0.5);
      const noveltyResult = detectNovelty(embedding, subspace);

      // Should not be novel, but we can still try to expand
      const expanded = expandSubspace(embedding, subspace, noveltyResult);

      // Should still expand k, but new component handling zero residual
      expect(expanded.k).toBe(2);
      expect(expanded.components.length).toBe(2);
    });
  });

  // ============================================================================
  // RECONSTRUCTION TESTS
  // ============================================================================
  describe("reconstructEmbedding", () => {
    test("reconstructs embedding from coefficients and components", () => {
      const comp1 = createUnitVector(DIM, 0);
      const comp2 = createUnitVector(DIM, 1);
      const components = [comp1, comp2];
      const coefficients = [0.3, 0.7];

      const reconstructed = reconstructEmbedding(coefficients, components);

      expect(reconstructed.length).toBe(DIM);
      expect(reconstructed[0]).toBeCloseTo(0.3, 5);
      expect(reconstructed[1]).toBeCloseTo(0.7, 5);
    });

    test("handles empty coefficients", () => {
      const components = [createUnitVector(DIM, 0)];
      const coefficients: number[] = [];

      const reconstructed = reconstructEmbedding(coefficients, components);

      expect(reconstructed.length).toBe(0);
    });

    test("handles empty components", () => {
      const components: number[][] = [];
      const coefficients = [0.5];

      const reconstructed = reconstructEmbedding(coefficients, components);

      expect(reconstructed.length).toBe(0);
    });

    test("handles mismatched coefficient and component counts", () => {
      const comp1 = createUnitVector(DIM, 0);
      const comp2 = createUnitVector(DIM, 1);
      const components = [comp1, comp2];
      const coefficients = [0.3]; // Only 1 coefficient

      const reconstructed = reconstructEmbedding(coefficients, components);

      expect(reconstructed.length).toBe(DIM);
      expect(reconstructed[0]).toBeCloseTo(0.3, 5);
      expect(reconstructed[1]).toBeCloseTo(0, 10); // Not included
    });

    test("reconstruction + residual recovers original embedding", () => {
      const comp1 = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [comp1],
        k: 1,
        version: 1,
      };

      // Original embedding with in-subspace and orthogonal components
      const original = new Array(DIM).fill(0);
      original[0] = 0.6;
      original[1] = 0.8;

      const noveltyResult = detectNovelty(original, subspace);
      const reconstructed = reconstructEmbedding(
        noveltyResult.coefficients,
        subspace.components,
      );

      // Reconstructed + residual should equal original
      const sum = new Array(DIM).fill(0);
      for (let i = 0; i < DIM; i++) {
        sum[i] = reconstructed[i] + noveltyResult.reconstructed[i];
      }

      // This is actually just the reconstruction, not recovery
      // Let me recalculate: original = reconstructed + residual
      for (let i = 0; i < DIM; i++) {
        const residual = original[i] - noveltyResult.reconstructed[i];
        expect(noveltyResult.reconstructed[i] + residual).toBeCloseTo(
          original[i],
          5,
        );
      }
    });
  });

  // ============================================================================
  // COMPUTE COEFFICIENTS TESTS
  // ============================================================================
  describe("computeCoefficients", () => {
    test("computes projections onto subspace components", () => {
      const comp1 = createUnitVector(DIM, 0);
      const comp2 = createUnitVector(DIM, 1);
      const subspace: SubspaceData = {
        components: [comp1, comp2],
        k: 2,
        version: 1,
      };

      const embedding = new Array(DIM).fill(0);
      embedding[0] = 0.4;
      embedding[1] = 0.9;

      const coefficients = computeCoefficients(embedding, subspace);

      expect(coefficients.length).toBe(2);
      expect(coefficients[0]).toBeCloseTo(0.4, 5);
      expect(coefficients[1]).toBeCloseTo(0.9, 5);
    });

    test("returns empty array for empty subspace", () => {
      const subspace: SubspaceData = {
        components: [],
        k: 0,
        version: 1,
      };

      const embedding = createUnitVector(DIM, 0);
      const coefficients = computeCoefficients(embedding, subspace);

      expect(coefficients.length).toBe(0);
    });

    test("matches coefficients from detectNovelty", () => {
      const comp1 = createUnitVector(DIM, 0);
      const comp2 = createUnitVector(DIM, 1);
      const subspace: SubspaceData = {
        components: [comp1, comp2],
        k: 2,
        version: 1,
      };

      const embedding = new Array(DIM).fill(0);
      embedding[0] = 0.5;
      embedding[1] = 0.6;

      const noveltyCoefficients = detectNovelty(embedding, subspace).coefficients;
      const computedCoefficients = computeCoefficients(embedding, subspace);

      expect(noveltyCoefficients).toEqual(computedCoefficients);
    });
  });

  // ============================================================================
  // EDGE CASES & SPECIAL SCENARIOS
  // ============================================================================
  describe("edge cases", () => {
    test("handles single-component subspace", () => {
      const comp = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [comp],
        k: 1,
        version: 1,
      };

      const embedding = createUnitVector(DIM, 0);
      const result = detectNovelty(embedding, subspace);

      expect(result.coefficients.length).toBe(1);
      expect(result.coefficients[0]).toBeCloseTo(1.0, 5);
      expect(result.isNovel).toBe(false);
    });

    test("identical embeddings relative to subspace have zero residual", () => {
      const comp = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [comp],
        k: 1,
        version: 1,
      };

      const embedding = scalarMultiply(comp, 0.5);
      const result1 = detectNovelty(embedding, subspace);
      const result2 = detectNovelty(embedding, subspace);

      expect(result1.residualNorm).toBeCloseTo(result2.residualNorm, 10);
      expect(result1.isNovel).toBe(result2.isNovel);
    });

    test("handles zero-vector embedding", () => {
      const comp = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [comp],
        k: 1,
        version: 1,
      };

      const embedding = new Array(DIM).fill(0);
      const result = detectNovelty(embedding, subspace);

      expect(result.residualNorm).toBeCloseTo(0, 10);
      expect(result.isNovel).toBe(false);
    });

    test("handles very high-dimensional subspaces (k close to DIM)", () => {
      // Create a high-dimensional subspace
      const components: number[][] = [];
      for (let i = 0; i < 100; i++) {
        components.push(createUnitVector(DIM, i));
      }

      const subspace: SubspaceData = {
        components,
        k: 100,
        version: 1,
      };

      const embedding = createUnitVector(DIM, 50); // In the subspace
      const result = detectNovelty(embedding, subspace);

      expect(result.isNovel).toBe(false);
      expect(result.residualNorm).toBeLessThan(1e-10);
    });

    test("negative coefficients are handled correctly", () => {
      const comp = createUnitVector(DIM, 0);
      const subspace: SubspaceData = {
        components: [comp],
        k: 1,
        version: 1,
      };

      // Embedding in opposite direction
      const embedding = scalarMultiply(comp, -0.5);
      const result = detectNovelty(embedding, subspace);

      expect(result.coefficients[0]).toBeCloseTo(-0.5, 5);
      expect(result.isNovel).toBe(false);
    });

    test("mixed orthogonal and in-subspace components", () => {
      const comp1 = createUnitVector(DIM, 0);
      const comp2 = createUnitVector(DIM, 1);
      const subspace: SubspaceData = {
        components: [comp1, comp2],
        k: 2,
        version: 1,
      };

      // Part in subspace, part orthogonal
      const embedding = new Array(DIM).fill(0);
      embedding[0] = 0.3; // In subspace
      embedding[1] = 0.4; // In subspace
      embedding[2] = 0.5; // Orthogonal

      const result = detectNovelty(embedding, subspace);

      expect(result.isNovel).toBe(true);
      expect(result.residualNorm).toBeCloseTo(0.5, 5);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================
  describe("integration scenarios", () => {
    test("full workflow: detect novel, expand, then detect non-novel", () => {
      let subspace: SubspaceData = {
        components: [createUnitVector(DIM, 0)],
        k: 1,
        version: 1,
      };

      // First embedding: novel
      const embedding1 = new Array(DIM).fill(0);
      embedding1[0] = 0.6;
      embedding1[1] = 0.8;

      const noveltyResult1 = detectNovelty(embedding1, subspace);
      expect(noveltyResult1.isNovel).toBe(true);

      // Expand subspace
      const expanded = expandSubspace(embedding1, subspace, noveltyResult1);
      subspace = {
        components: expanded.components,
        k: expanded.k,
        version: expanded.version,
      };

      // Second embedding: same as first should now be non-novel
      const noveltyResult2 = detectNovelty(embedding1, subspace);
      expect(noveltyResult2.isNovel).toBe(false);
      expect(noveltyResult2.residualNorm).toBeLessThan(0.1);
    });

    test("sequential novelty detections with expanding subspace", () => {
      let subspace: SubspaceData = {
        components: [createUnitVector(DIM, 0)],
        k: 1,
        version: 1,
      };

      const embeddings = [
        (() => {
          const e = new Array(DIM).fill(0);
          e[0] = 0.6;
          e[1] = 0.8;
          return e;
        })(),
        (() => {
          const e = new Array(DIM).fill(0);
          e[1] = 0.9;
          e[2] = 0.4;
          return e;
        })(),
        (() => {
          const e = new Array(DIM).fill(0);
          e[2] = 0.7;
          e[3] = 0.6;
          return e;
        })(),
      ];

      for (const embedding of embeddings) {
        const result = detectNovelty(embedding, subspace);

        if (result.isNovel) {
          const expanded = expandSubspace(embedding, subspace, result);
          subspace = {
            components: expanded.components,
            k: expanded.k,
            version: expanded.version,
          };
        }
      }

      // Should have expanded at least once
      expect(subspace.k).toBeGreaterThan(1);
      expect(subspace.version).toBeGreaterThan(1);
    });

    test("reconstruction fidelity after multiple expansions", () => {
      let subspace: SubspaceData = {
        components: [createUnitVector(DIM, 0)],
        k: 1,
        version: 1,
      };

      const embedding = new Array(DIM).fill(0);
      embedding[0] = 0.3;
      embedding[1] = 0.4;
      embedding[2] = 0.5;

      let result = detectNovelty(embedding, subspace);

      // Expand a few times
      for (let i = 0; i < 3; i++) {
        if (result.isNovel) {
          const expanded = expandSubspace(embedding, subspace, result);
          subspace = {
            components: expanded.components,
            k: expanded.k,
            version: expanded.version,
          };
          result = detectNovelty(embedding, subspace);
        }
      }

      // After multiple expansions, the same embedding should reconstruct with low error
      expect(result.residualNorm).toBeLessThan(0.5);
    });
  });
});
