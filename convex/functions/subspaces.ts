import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "../_generated/server";
import { api } from "../_generated/api";

const DEFAULT_NOVELTY_THRESHOLD = 0.4;

function dot(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += left[index] * right[index];
  }
  return sum;
}

function vectorNorm(values: number[]): number {
  let sum = 0;
  for (const value of values) {
    sum += value * value;
  }
  return Math.sqrt(sum);
}

function computeCoefficients(embedding: number[], principalVectors: number[][], k: number, centroid?: number[]): number[] {
  const coefficients: number[] = [];
  const effectiveK = Math.min(k, principalVectors.length);
  for (let axis = 0; axis < effectiveK; axis += 1) {
    // Center the embedding before projection (PCA requires centered data)
    let dotProduct = 0;
    const pv = principalVectors[axis];
    for (let j = 0; j < embedding.length; j++) {
      const centered = embedding[j] - (centroid?.[j] ?? 0);
      dotProduct += pv[j] * centered;
    }
    coefficients.push(dotProduct);
  }
  return coefficients;
}

function reconstructEmbedding(coefficients: number[], principalVectors: number[][], dimensionality: number, centroid?: number[]): number[] {
  const reconstructed = new Array(dimensionality).fill(0);
  const effectiveK = Math.min(coefficients.length, principalVectors.length);
  for (let axis = 0; axis < effectiveK; axis += 1) {
    const coefficient = coefficients[axis];
    const direction = principalVectors[axis];
    const axisLength = Math.min(dimensionality, direction.length);
    for (let index = 0; index < axisLength; index += 1) {
      reconstructed[index] += coefficient * direction[index];
    }
  }
  // Add centroid back to reconstruct in the original (non-centered) space
  if (centroid) {
    for (let j = 0; j < dimensionality; j++) {
      reconstructed[j] += centroid[j] ?? 0;
    }
  }
  return reconstructed;
}

function normalizeVector(values: number[]): number[] {
  const norm = vectorNorm(values);
  if (norm <= 1e-12) {
    return [...values];
  }
  return values.map((value) => value / norm);
}

// ─── Queries ─────────────────────────────────────────────────────────

export const getSubspace = query({
  args: { subspaceId: v.id("knowledge_subspaces") },
  handler: async (ctx, { subspaceId }) => {
    return await ctx.db.get(subspaceId);
  },
});

export const listSubspaces = query({
  args: {
    agentId: v.optional(v.string()),
    scopeId: v.optional(v.id("memory_scopes")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { agentId, scopeId, limit }) => {
    if (agentId && scopeId) {
      return await ctx.db
        .query("knowledge_subspaces")
        .withIndex("by_agent_scope", (q) => q.eq("agentId", agentId).eq("scopeId", scopeId))
        .take(limit ?? 50);
    }
    if (agentId) {
      return await ctx.db
        .query("knowledge_subspaces")
        .withIndex("by_agent_scope", (q) => q.eq("agentId", agentId))
        .take(limit ?? 50);
    }
    // Fallback: scan (small table, acceptable)
    const all = await ctx.db.query("knowledge_subspaces").take(limit ?? 50);
    return scopeId ? all.filter((s) => s.scopeId === scopeId) : all;
  },
});

export const getByName = query({
  args: {
    name: v.string(),
    scopeId: v.id("memory_scopes"),
  },
  handler: async (ctx, { name, scopeId }) => {
    return await ctx.db
      .query("knowledge_subspaces")
      .withIndex("by_name", (q) => q.eq("name", name).eq("scopeId", scopeId))
      .first();
  },
});

// ─── Internal Queries ────────────────────────────────────────────────

/** List subspaces not updated in N days (used by consolidation cron). */
export const listStaleSubspaces = internalQuery({
  args: { olderThanDays: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { olderThanDays, limit }) => {
    const cutoff = Date.now() - (olderThanDays ?? 7) * 24 * 60 * 60 * 1000;
    const all = await ctx.db.query("knowledge_subspaces").take(limit ?? 200);
    return all.filter((s) => s.updatedAt < cutoff);
  },
});

export const getSubspaceInternal = internalQuery({
  args: { subspaceId: v.id("knowledge_subspaces") },
  handler: async (ctx, { subspaceId }) => {
    return await ctx.db.get(subspaceId);
  },
});

/** Get fact embeddings by IDs (used by cron to recompute centroids). */
export const getFactEmbeddings = internalQuery({
  args: { factIds: v.array(v.id("facts")) },
  handler: async (ctx, { factIds }) => {
    const results: { factId: string; embedding: number[] }[] = [];
    for (const id of factIds) {
      const fact = await ctx.db.get(id);
      if (fact?.embedding && fact.lifecycleState === "active") {
        results.push({ factId: fact._id, embedding: fact.embedding });
      }
    }
    return results;
  },
});

// ─── Mutations ───────────────────────────────────────────────────────

export const createSubspace = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    agentId: v.string(),
    scopeId: v.id("memory_scopes"),
    factIds: v.array(v.id("facts")),
    centroid: v.optional(v.array(v.float64())),
    principalVectors: v.optional(v.array(v.array(v.float64()))),
    components: v.optional(v.array(v.array(v.float64()))), // backward-compatible alias
    k: v.optional(v.number()),
    version: v.optional(v.number()),
    noveltyThreshold: v.optional(v.float64()),
    dimensionality: v.optional(v.number()),
    variance: v.optional(v.float64()),
    singularValues: v.optional(v.array(v.float64())),
    componentVariances: v.optional(v.array(v.float64())),
    singularValueRatio: v.optional(v.float64()),
    compactEmbeddingsByFactId: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const principalVectors = args.principalVectors ?? args.components;
    const subspaceId = await ctx.db.insert("knowledge_subspaces", {
      name: args.name,
      description: args.description,
      agentId: args.agentId,
      scopeId: args.scopeId,
      factIds: args.factIds,
      centroid: args.centroid,
      principalVectors,
      k: args.k ?? principalVectors?.length,
      version: args.version ?? 1,
      noveltyThreshold: args.noveltyThreshold,
      dimensionality: args.dimensionality,
      variance: args.variance,
      singularValues: args.singularValues,
      componentVariances: args.componentVariances,
      singularValueRatio: args.singularValueRatio,
      compactEmbeddingsByFactId: args.compactEmbeddingsByFactId,
      createdAt: now,
      updatedAt: now,
    });
    return { subspaceId };
  },
});

export const updateSubspace = mutation({
  args: {
    subspaceId: v.id("knowledge_subspaces"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    factIds: v.optional(v.array(v.id("facts"))),
    centroid: v.optional(v.array(v.float64())),
    principalVectors: v.optional(v.array(v.array(v.float64()))),
    components: v.optional(v.array(v.array(v.float64()))), // backward-compatible alias
    k: v.optional(v.number()),
    version: v.optional(v.number()),
    noveltyThreshold: v.optional(v.float64()),
    dimensionality: v.optional(v.number()),
    variance: v.optional(v.float64()),
    singularValues: v.optional(v.array(v.float64())),
    componentVariances: v.optional(v.array(v.float64())),
    singularValueRatio: v.optional(v.float64()),
    compactEmbeddingsByFactId: v.optional(v.any()),
  },
  handler: async (ctx, { subspaceId, ...fields }) => {
    const existing = await ctx.db.get(subspaceId);
    if (!existing) throw new Error(`Subspace not found: ${subspaceId}`);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.description !== undefined) patch.description = fields.description;
    if (fields.factIds !== undefined) patch.factIds = fields.factIds;
    if (fields.centroid !== undefined) patch.centroid = fields.centroid;
    if (fields.principalVectors !== undefined || fields.components !== undefined) {
      patch.principalVectors = fields.principalVectors ?? fields.components;
    }
    if (fields.k !== undefined) patch.k = fields.k;
    if (fields.version !== undefined) patch.version = fields.version;
    if (fields.noveltyThreshold !== undefined) patch.noveltyThreshold = fields.noveltyThreshold;
    if (fields.dimensionality !== undefined) patch.dimensionality = fields.dimensionality;
    if (fields.variance !== undefined) patch.variance = fields.variance;
    if (fields.singularValues !== undefined) patch.singularValues = fields.singularValues;
    if (fields.componentVariances !== undefined) patch.componentVariances = fields.componentVariances;
    if (fields.singularValueRatio !== undefined) patch.singularValueRatio = fields.singularValueRatio;
    if (fields.compactEmbeddingsByFactId !== undefined) patch.compactEmbeddingsByFactId = fields.compactEmbeddingsByFactId;
    await ctx.db.patch(subspaceId, patch);
    return { updated: true };
  },
});

export const deleteSubspace = mutation({
  args: { subspaceId: v.id("knowledge_subspaces") },
  handler: async (ctx, { subspaceId }) => {
    const existing = await ctx.db.get(subspaceId);
    if (!existing) throw new Error(`Subspace not found: ${subspaceId}`);
    await ctx.db.delete(subspaceId);
    return { deleted: true };
  },
});

// ─── Internal Mutations ──────────────────────────────────────────────

/** Update centroid and variance (used by consolidation cron). */
export const updateCentroid = internalMutation({
  args: {
    subspaceId: v.id("knowledge_subspaces"),
    centroid: v.array(v.float64()),
    variance: v.optional(v.float64()),
    factIds: v.optional(v.array(v.id("facts"))),
  },
  handler: async (ctx, { subspaceId, centroid, variance, factIds }) => {
    const patch: Record<string, unknown> = { centroid, updatedAt: Date.now() };
    if (variance !== undefined) patch.variance = variance;
    if (factIds !== undefined) patch.factIds = factIds;
    await ctx.db.patch(subspaceId, patch);
  },
});

/** Delete subspace (used by cron pruning). */
export const deleteSubspaceInternal = internalMutation({
  args: { subspaceId: v.id("knowledge_subspaces") },
  handler: async (ctx, { subspaceId }) => {
    await ctx.db.delete(subspaceId);
  },
});

/**
 * Integrate a newly enriched fact into an existing knowledge subspace.
 * Uses residual novelty detection to either:
 * - store compact coefficients only (known knowledge), or
 * - expand subspace with a new principal direction (novel knowledge).
 */
export const integrateNewFact = internalMutation({
  args: {
    factId: v.id("facts"),
    embedding: v.array(v.float64()),
    threshold: v.optional(v.float64()),
  },
  handler: async (ctx, { factId, embedding, threshold }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) {
      throw new Error(`Fact not found: ${factId}`);
    }

    const subspace = await ctx.db
      .query("knowledge_subspaces")
      .withIndex("by_scope", (q) => q.eq("scopeId", fact.scopeId))
      .first();

    if (!subspace) {
      await ctx.db.patch(factId, {
        embedding,
        compactEmbedding: undefined,
        updatedAt: Date.now(),
      });
      return { mode: "full" as const, novelty: null, newK: null };
    }

    const principalVectors = subspace.principalVectors ?? [];
    const k = subspace.k ?? principalVectors.length;
    const effectiveThreshold = threshold ?? subspace.noveltyThreshold ?? DEFAULT_NOVELTY_THRESHOLD;

    if (k === 0 || principalVectors.length === 0) {
      await ctx.db.patch(factId, {
        embedding,
        compactEmbedding: undefined,
        updatedAt: Date.now(),
      });
      return { mode: "full" as const, novelty: null, newK: 0 };
    }

    const coefficients = computeCoefficients(embedding, principalVectors, k, subspace.centroid ?? undefined);
    const reconstructed = reconstructEmbedding(coefficients, principalVectors, embedding.length, subspace.centroid ?? undefined);
    const residual = embedding.map((value, index) => value - (reconstructed[index] ?? 0));
    const residualNorm = vectorNorm(residual);

    const factIds = subspace.factIds.includes(factId) ? subspace.factIds : [...subspace.factIds, factId];

    if (residualNorm > effectiveThreshold) {
      const newDirection = normalizeVector(residual);
      const expandedVectors = [...principalVectors, newDirection];
      const newK = k + 1;
      const expandedCoefficients = computeCoefficients(embedding, expandedVectors, newK, subspace.centroid ?? undefined);

      await ctx.db.patch(subspace._id, {
        principalVectors: expandedVectors,
        k: newK,
        version: (subspace.version ?? 0) + 1,
        factIds,
        updatedAt: Date.now(),
      });

      await ctx.db.patch(factId, {
        compactEmbedding: expandedCoefficients,
        embedding: undefined,
        updatedAt: Date.now(),
      });

      // Schedule retroactive re-projection for facts stored before this expansion.
      // Runs after this transaction commits so it sees the updated principalVectors.
      // NOTE: retroactiveReproject uses centroid subtraction; integrateNewFact does not.
      // This inconsistency is tracked but intentionally not fixed here.
      await ctx.scheduler.runAfter(
        0,
        api.functions.retroactiveEnrich.retroactiveReproject,
        { subspaceId: subspace._id, daysBack: 30, agentId: fact.createdBy }
      );

      return { mode: "expand" as const, novelty: residualNorm, newK };
    }

    await ctx.db.patch(subspace._id, {
      factIds,
      updatedAt: Date.now(),
    });

    await ctx.db.patch(factId, {
      compactEmbedding: coefficients,
      embedding: undefined,
      updatedAt: Date.now(),
    });

    return { mode: "compact" as const, novelty: residualNorm, newK: k };
  },
});
