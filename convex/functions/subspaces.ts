import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "../_generated/server";

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
    dimensionality: v.optional(v.number()),
    variance: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const subspaceId = await ctx.db.insert("knowledge_subspaces", {
      name: args.name,
      description: args.description,
      agentId: args.agentId,
      scopeId: args.scopeId,
      factIds: args.factIds,
      centroid: args.centroid,
      dimensionality: args.dimensionality,
      variance: args.variance,
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
    dimensionality: v.optional(v.number()),
    variance: v.optional(v.float64()),
  },
  handler: async (ctx, { subspaceId, ...fields }) => {
    const existing = await ctx.db.get(subspaceId);
    if (!existing) throw new Error(`Subspace not found: ${subspaceId}`);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.description !== undefined) patch.description = fields.description;
    if (fields.factIds !== undefined) patch.factIds = fields.factIds;
    if (fields.centroid !== undefined) patch.centroid = fields.centroid;
    if (fields.dimensionality !== undefined) patch.dimensionality = fields.dimensionality;
    if (fields.variance !== undefined) patch.variance = fields.variance;
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
