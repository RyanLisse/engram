/**
 * SVD-based Embedding Consolidation
 *
 * Lightweight principal component analysis for clustering related embeddings.
 * Uses the power iteration method to compute top-k singular vectors —
 * no external linear algebra dependencies needed.
 *
 * Given a set of 1024-dim embeddings, produces:
 *   - centroid: mean vector (used as the subspace's representative embedding)
 *   - components: top-k principal directions (captures the subspace shape)
 *   - varianceExplained: fraction of total variance captured by top-k components
 */

export interface ConsolidationResult {
  /** Mean embedding vector (1024-dim) */
  centroid: number[];
  /** Top-k principal components, each 1024-dim */
  components: number[][];
  /** Fraction of total variance explained by the top-k components (0–1) */
  varianceExplained: number;
  /** Total variance across all dimensions */
  totalVariance: number;
  /** Per-component variance fractions */
  componentVariances: number[];
}

/**
 * Consolidate a set of embedding vectors into a compact subspace representation.
 *
 * @param embeddings - Array of embedding vectors (all must be same dimensionality)
 * @param k - Number of principal components to extract (default: 3)
 * @param maxIterations - Power iteration convergence limit (default: 100)
 * @param tolerance - Convergence threshold for power iteration (default: 1e-8)
 */
export function consolidateEmbeddings(
  embeddings: number[][],
  k = 3,
  maxIterations = 100,
  tolerance = 1e-8,
): ConsolidationResult {
  if (embeddings.length === 0) {
    return { centroid: [], components: [], varianceExplained: 0, totalVariance: 0, componentVariances: [] };
  }

  const n = embeddings.length;
  const d = embeddings[0].length;

  // 1. Compute centroid (mean vector)
  const centroid = new Float64Array(d);
  for (const vec of embeddings) {
    for (let j = 0; j < d; j++) {
      centroid[j] += vec[j];
    }
  }
  for (let j = 0; j < d; j++) {
    centroid[j] /= n;
  }

  // 2. Center the data (subtract mean)
  const centered: Float64Array[] = embeddings.map((vec) => {
    const c = new Float64Array(d);
    for (let j = 0; j < d; j++) {
      c[j] = vec[j] - centroid[j];
    }
    return c;
  });

  // 3. Compute total variance (trace of covariance matrix = sum of all squared deviations / n)
  let totalVariance = 0;
  for (const row of centered) {
    for (let j = 0; j < d; j++) {
      totalVariance += row[j] * row[j];
    }
  }
  totalVariance /= n;

  if (totalVariance < tolerance) {
    // All embeddings are (nearly) identical — perfect cluster
    return {
      centroid: Array.from(centroid),
      components: [],
      varianceExplained: 1.0,
      totalVariance,
      componentVariances: [],
    };
  }

  // 4. Extract top-k components via deflated power iteration
  const effectiveK = Math.min(k, Math.min(n, d));
  const components: number[][] = [];
  const componentVariances: number[] = [];

  // Work on a mutable copy for deflation
  const work: Float64Array[] = centered.map((r) => Float64Array.from(r));

  for (let comp = 0; comp < effectiveK; comp++) {
    const vec = powerIteration(work, d, maxIterations, tolerance);
    if (!vec) break;

    // Compute variance along this component: (1/n) * Σ (dot(row, vec))²
    let compVariance = 0;
    for (const row of work) {
      const proj = dot(row, vec, d);
      compVariance += proj * proj;
    }
    compVariance /= n;

    components.push(Array.from(vec));
    componentVariances.push(compVariance / totalVariance);

    // Deflate: remove projection onto this component from all rows
    for (const row of work) {
      const proj = dot(row, vec, d);
      for (let j = 0; j < d; j++) {
        row[j] -= proj * vec[j];
      }
    }
  }

  const varianceExplained = componentVariances.reduce((a, b) => a + b, 0);

  return {
    centroid: Array.from(centroid),
    components,
    varianceExplained: Math.min(varianceExplained, 1.0),
    totalVariance,
    componentVariances,
  };
}

/**
 * Compute cosine similarity between an embedding and a subspace centroid.
 * Used for subspace-level semantic search.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const d = Math.min(a.length, b.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < d; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dotProduct / denom : 0;
}

// ── Internal helpers ──────────────────────────────────────

/** Dot product of two vectors (or Float64Arrays) up to length d. */
function dot(a: ArrayLike<number>, b: ArrayLike<number>, d: number): number {
  let sum = 0;
  for (let i = 0; i < d; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Power iteration to find the dominant singular vector of the data matrix.
 * Returns a unit vector in R^d, or null if the matrix is zero.
 */
function powerIteration(
  rows: Float64Array[],
  d: number,
  maxIter: number,
  tol: number,
): Float64Array | null {
  // Initialize with a random-ish unit vector (use deterministic seed from data)
  const v = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    v[j] = rows.length > 0 ? rows[0][j] : 1;
  }
  normalize(v, d);

  for (let iter = 0; iter < maxIter; iter++) {
    // w = Aᵀ A v  (computed as Aᵀ(Av) without forming the full matrix)
    // Step 1: u = A v  (n-dim)
    const u = new Float64Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      u[i] = dot(rows[i], v, d);
    }

    // Step 2: w = Aᵀ u  (d-dim)
    const w = new Float64Array(d);
    for (let i = 0; i < rows.length; i++) {
      for (let j = 0; j < d; j++) {
        w[j] += u[i] * rows[i][j];
      }
    }

    const norm = normalize(w, d);
    if (norm < tol) return null; // Zero matrix

    // Check convergence: |w - v| < tol
    let diff = 0;
    for (let j = 0; j < d; j++) {
      const delta = w[j] - v[j];
      diff += delta * delta;
    }

    // Copy w → v for next iteration
    for (let j = 0; j < d; j++) {
      v[j] = w[j];
    }

    if (Math.sqrt(diff) < tol) break;
  }

  return v;
}

/** Normalize a vector in-place, returns the original norm. */
function normalize(v: Float64Array, d: number): number {
  let norm = 0;
  for (let j = 0; j < d; j++) {
    norm += v[j] * v[j];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let j = 0; j < d; j++) {
      v[j] /= norm;
    }
  }
  return norm;
}
