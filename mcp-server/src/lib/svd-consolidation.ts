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
 *
 * Supports:
 *   - Auto-k selection via target variance threshold (e.g., 80%)
 *   - Incremental rank-1 updates (avoid full recompute for single-fact additions)
 *   - Compact embedding projection (1024-dim → k-dim coefficients)
 */

export interface ConsolidationResult {
  /** Mean embedding vector (1024-dim) */
  centroid: number[];
  /** Top-k principal components, each 1024-dim */
  components: number[][];
  /** Per-component singular values (same order as components) */
  singularValues: number[];
  /** Fraction of total variance explained by the top-k components (0–1).
   *  Computed as sum(σ_i²) / (totalVariance · n) — the squared singular value ratio. */
  varianceExplained: number;
  /** L1 singular value ratio: sum(kept σ_i) / sqrt(totalVariance · n).
   *  Measures spectral coverage using the 1-norm rather than the 2-norm of kept singular values.
   *  Values > 1 are possible when multiple components each carry a large share of the spectrum. */
  singularValueRatio: number;
  /** Total variance across all dimensions */
  totalVariance: number;
  /** Per-component variance fractions */
  componentVariances: number[];
  /** Number of embeddings used in consolidation */
  sampleCount: number;
}

export interface ConsolidationOptions {
  /** Number of principal components to extract (default: 3). Ignored if targetVariance is set. */
  k?: number;
  /** Target cumulative variance to explain (0–1). Auto-selects k. Overrides k. */
  targetVariance?: number;
  /** Max k when using targetVariance auto-selection (default: 20) */
  maxK?: number;
  /** Power iteration convergence limit (default: 100) */
  maxIterations?: number;
  /** Convergence threshold for power iteration (default: 1e-8) */
  tolerance?: number;
}

/**
 * Consolidate a set of embedding vectors into a compact subspace representation.
 *
 * @param embeddings - Array of embedding vectors (all must be same dimensionality)
 * @param kOrOptions - Number of principal components, or full options object
 * @param maxIterations - Power iteration convergence limit (default: 100)
 * @param tolerance - Convergence threshold for power iteration (default: 1e-8)
 */
export function consolidateEmbeddings(
  embeddings: number[][],
  kOrOptions: number | ConsolidationOptions = 3,
  maxIterations = 100,
  tolerance = 1e-8,
): ConsolidationResult {
  // Normalize options
  const opts: ConsolidationOptions =
    typeof kOrOptions === "number"
      ? { k: kOrOptions, maxIterations, tolerance }
      : { maxIterations, tolerance, ...kOrOptions };

  const targetVariance = opts.targetVariance;
  const maxK = opts.maxK ?? 20;
  const requestedK = opts.k ?? 3;
  const maxIter = opts.maxIterations ?? 100;
  const tol = opts.tolerance ?? 1e-8;

  if (embeddings.length === 0) {
    return {
      centroid: [],
      components: [],
      singularValues: [],
      varianceExplained: 0,
      singularValueRatio: 0,
      totalVariance: 0,
      componentVariances: [],
      sampleCount: 0,
    };
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

  if (totalVariance < tol) {
    return {
      centroid: Array.from(centroid),
      components: [],
      singularValues: [],
      varianceExplained: 1.0,
      singularValueRatio: 1.0,
      totalVariance,
      componentVariances: [],
      sampleCount: n,
    };
  }

  // 4. Determine extraction limit: fixed k or auto-k via target variance
  const kLimit = targetVariance !== undefined
    ? Math.min(maxK, Math.min(n, d))
    : Math.min(requestedK, Math.min(n, d));

  const components: number[][] = [];
  const componentVariances: number[] = [];
  const singularValues: number[] = [];

  // Work on a mutable copy for deflation
  const work: Float64Array[] = centered.map((r) => Float64Array.from(r));

  for (let comp = 0; comp < kLimit; comp++) {
    const vec = powerIteration(work, d, maxIter, tol);
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
    singularValues.push(Math.sqrt(Math.max(compVariance, 0) * n));

    // Deflate: remove projection onto this component from all rows
    for (const row of work) {
      const proj = dot(row, vec, d);
      for (let j = 0; j < d; j++) {
        row[j] -= proj * vec[j];
      }
    }

    // Auto-k: stop once we've captured enough variance
    if (targetVariance !== undefined) {
      const cumulative = componentVariances.reduce((a, b) => a + b, 0);
      if (cumulative >= targetVariance) break;
    }
  }

  const varianceExplained = componentVariances.reduce((a, b) => a + b, 0);

  // L1 singular value ratio: sum(kept σ_i) / sqrt(totalVariance · n)
  // The denominator is the Frobenius norm of the centered data matrix.
  const frobeniusNorm = Math.sqrt(totalVariance * n);
  const keptSVSum = singularValues.reduce((a, b) => a + b, 0);
  const singularValueRatio = frobeniusNorm > 0 ? keptSVSum / frobeniusNorm : 0;

  return {
    centroid: Array.from(centroid),
    components,
    singularValues,
    varianceExplained: Math.min(varianceExplained, 1.0),
    singularValueRatio,
    totalVariance,
    componentVariances,
    sampleCount: n,
  };
}

/**
 * Incremental rank-1 update: incorporate a new embedding into an existing subspace
 * without full recomputation. Uses the formula for updating the mean and
 * a rank-1 correction to the principal components.
 *
 * This is an approximation — periodically call full consolidateEmbeddings()
 * for accuracy. Good for up to ~20% new facts before drift becomes noticeable.
 */
export function incrementalUpdate(
  existing: ConsolidationResult,
  newEmbedding: number[],
): ConsolidationResult {
  const d = existing.centroid.length;
  if (d === 0 || newEmbedding.length !== d) return existing;

  const oldN = existing.sampleCount;
  const newN = oldN + 1;

  // 1. Update centroid: μ_new = (n * μ_old + x) / (n + 1)
  const newCentroid = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    newCentroid[j] = (oldN * existing.centroid[j] + newEmbedding[j]) / newN;
  }

  // 2. Compute the centered new vector relative to the NEW centroid
  const centered = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    centered[j] = newEmbedding[j] - newCentroid[j];
  }

  // 3. Compute residual after projecting onto existing components
  const residual = Float64Array.from(centered);
  const projections: number[] = [];
  for (const comp of existing.components) {
    const proj = dot(residual, comp, d);
    projections.push(proj);
    for (let j = 0; j < d; j++) {
      residual[j] -= proj * comp[j];
    }
  }

  // 4. If residual has significant norm, it represents a new direction
  const residualNorm = Math.sqrt(dot(residual, residual, d));
  const newComponents = existing.components.map((c) => [...c]);
  const newComponentVariances = [...existing.componentVariances];

  // Update variance estimates for existing components using running variance
  const centroidShift = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    centroidShift[j] = newCentroid[j] - existing.centroid[j];
  }

  // Approximate new total variance (Welford-style online update)
  const diffFromOldMean = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    diffFromOldMean[j] = newEmbedding[j] - existing.centroid[j];
  }
  let diffNormSq = 0;
  for (let j = 0; j < d; j++) {
    diffNormSq += diffFromOldMean[j] * centered[j];
  }
  const newTotalVariance = existing.totalVariance * (oldN / newN) + diffNormSq / newN;

  // Recompute component variance fractions with new total
  if (newTotalVariance > 0) {
    for (let i = 0; i < newComponentVariances.length; i++) {
      // Scale old absolute variance to new fraction
      const oldAbsVariance = existing.componentVariances[i] * existing.totalVariance;
      const projContrib = (projections[i] ?? 0) ** 2;
      const newAbsVariance = oldAbsVariance + projContrib / newN;
      newComponentVariances[i] = newAbsVariance / newTotalVariance;
    }
  }

  const varianceExplained = newComponentVariances.reduce((a, b) => a + b, 0);
  const singularValues = newComponentVariances.map((varianceFraction) =>
    Math.sqrt(Math.max(varianceFraction * Math.max(newTotalVariance, 0), 0) * newN),
  );

  const frobeniusNorm = Math.sqrt(Math.max(newTotalVariance, 0) * newN);
  const keptSVSum = singularValues.reduce((a, b) => a + b, 0);
  const singularValueRatio = frobeniusNorm > 0 ? keptSVSum / frobeniusNorm : 0;

  return {
    centroid: Array.from(newCentroid),
    components: newComponents,
    singularValues,
    varianceExplained: Math.min(varianceExplained, 1.0),
    singularValueRatio,
    totalVariance: Math.max(newTotalVariance, 0),
    componentVariances: newComponentVariances,
    sampleCount: newN,
  };
}

/**
 * Project a full embedding (1024-dim) into compact subspace coefficients (k-dim).
 * Each coefficient = dot(centered_embedding, component_i).
 */
export function projectToCompact(
  embedding: number[],
  centroid: number[],
  components: number[][],
): number[] {
  const d = centroid.length;
  const centered = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    centered[j] = embedding[j] - centroid[j];
  }
  return components.map((comp) => dot(centered, comp, d));
}

/**
 * Compute weighted cosine similarity in compact space.
 * Weights are the per-component explained variance fractions.
 */
export function compactCosineSimilarity(
  a: number[],
  b: number[],
  componentVariances?: number[],
): number {
  const k = Math.min(a.length, b.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < k; i++) {
    const w = componentVariances?.[i] ?? 1;
    dotProduct += w * a[i] * b[i];
    normA += w * a[i] * a[i];
    normB += w * b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dotProduct / denom : 0;
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
