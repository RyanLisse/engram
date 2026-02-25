/**
 * Residual Novelty Detection (SHARE paper)
 *
 * Detects whether a new embedding is novel relative to an existing subspace.
 * Novel facts expand the subspace; known facts get compact representation.
 *
 * Algorithm:
 *   1. Project e_new onto subspace: e_hat = V_k @ (V_k^T @ e_new)
 *   2. Compute residual: r = e_new - e_hat
 *   3. Novel if ||r|| > threshold (default 0.4)
 *
 * When novel, the subspace is expanded by normalizing the residual as a new
 * principal direction and appending it to V_k.
 */

export interface SubspaceData {
  /** Principal component vectors (each 1024-dim), stored row-major */
  components: number[][];
  /** Number of principal components (k) */
  k: number;
  /** Subspace version counter */
  version: number;
}

export interface NoveltyResult {
  /** Whether the embedding is novel relative to the subspace */
  isNovel: boolean;
  /** L2 norm of the residual vector */
  residualNorm: number;
  /** Reconstructed embedding from subspace projection */
  reconstructed: number[];
  /** Compact coefficients (projection onto each principal direction) */
  coefficients: number[];
}

export interface ExpansionResult {
  /** Updated components after expansion */
  components: number[][];
  /** New k value */
  k: number;
  /** Incremented version */
  version: number;
  /** Coefficients for the new embedding in the expanded basis */
  coefficients: number[];
}

const DEFAULT_NOVELTY_THRESHOLD = 0.4;

/**
 * Detect whether an embedding is novel relative to a subspace.
 *
 * @param embedding - New 1024-dim embedding vector
 * @param subspace - Existing subspace with principal components
 * @param threshold - Residual norm threshold for novelty (default: 0.4)
 */
export function detectNovelty(
  embedding: number[],
  subspace: SubspaceData,
  threshold = DEFAULT_NOVELTY_THRESHOLD,
): NoveltyResult {
  const d = embedding.length;

  if (subspace.components.length === 0 || subspace.k === 0) {
    // Empty subspace — everything is novel
    return {
      isNovel: true,
      residualNorm: vectorNorm(embedding),
      reconstructed: new Array(d).fill(0),
      coefficients: [],
    };
  }

  // Compute coefficients: c_i = V_i^T @ e_new
  const coefficients: number[] = [];
  for (let i = 0; i < subspace.k; i++) {
    coefficients.push(dot(subspace.components[i], embedding));
  }

  // Reconstruct: e_hat = Σ c_i * V_i
  const reconstructed = new Array(d).fill(0);
  for (let i = 0; i < subspace.k; i++) {
    const ci = coefficients[i];
    const vi = subspace.components[i];
    for (let j = 0; j < d; j++) {
      reconstructed[j] += ci * vi[j];
    }
  }

  // Residual: r = e_new - e_hat
  const residual = new Array(d);
  for (let j = 0; j < d; j++) {
    residual[j] = embedding[j] - reconstructed[j];
  }

  const residualNorm = vectorNorm(residual);

  return {
    isNovel: residualNorm > threshold,
    residualNorm,
    reconstructed,
    coefficients,
  };
}

/**
 * Expand a subspace by adding the residual as a new principal direction.
 *
 * @param embedding - The novel embedding
 * @param subspace - Current subspace data
 * @param noveltyResult - Result from detectNovelty()
 */
export function expandSubspace(
  embedding: number[],
  subspace: SubspaceData,
  noveltyResult: NoveltyResult,
): ExpansionResult {
  const d = embedding.length;

  // Compute residual
  const residual = new Array(d);
  for (let j = 0; j < d; j++) {
    residual[j] = embedding[j] - noveltyResult.reconstructed[j];
  }

  // Normalize residual to unit vector
  const norm = vectorNorm(residual);
  if (norm > 1e-10) {
    for (let j = 0; j < d; j++) {
      residual[j] /= norm;
    }
  }

  // Append as new principal direction
  const newComponents = [...subspace.components, residual];
  const newK = subspace.k + 1;

  // Recompute coefficients with expanded basis
  const newCoefficients: number[] = [];
  for (let i = 0; i < newK; i++) {
    newCoefficients.push(dot(newComponents[i], embedding));
  }

  return {
    components: newComponents,
    k: newK,
    version: subspace.version + 1,
    coefficients: newCoefficients,
  };
}

/**
 * Compute compact coefficients for an embedding against a subspace.
 * Used for known (non-novel) facts to store compact representation.
 */
export function computeCoefficients(
  embedding: number[],
  subspace: SubspaceData,
): number[] {
  const coefficients: number[] = [];
  for (let i = 0; i < subspace.k; i++) {
    coefficients.push(dot(subspace.components[i], embedding));
  }
  return coefficients;
}

/**
 * Reconstruct an embedding from compact coefficients and subspace components.
 */
export function reconstructEmbedding(
  coefficients: number[],
  components: number[][],
): number[] {
  if (components.length === 0 || coefficients.length === 0) return [];
  const d = components[0].length;
  const result = new Array(d).fill(0);
  const k = Math.min(coefficients.length, components.length);
  for (let i = 0; i < k; i++) {
    const ci = coefficients[i];
    const vi = components[i];
    for (let j = 0; j < d; j++) {
      result[j] += ci * vi[j];
    }
  }
  return result;
}

// ── Internal helpers ──────────────────────────────────

function dot(a: number[], b: number[]): number {
  let sum = 0;
  const d = Math.min(a.length, b.length);
  for (let i = 0; i < d; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

function vectorNorm(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}
