import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

// ─── Queries ─────────────────────────────────────────────────────────

export const getEpisode = query({
  args: { episodeId: v.id("episodes") },
  handler: async (ctx, { episodeId }) => {
    return await ctx.db.get(episodeId);
  },
});

export const listEpisodes = query({
  args: {
    agentId: v.optional(v.string()),
    scopeId: v.optional(v.id("memory_scopes")),
    startAfter: v.optional(v.number()),
    startBefore: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    if (args.agentId) {
      let q = ctx.db
        .query("episodes")
        .withIndex("by_agent_time", (q) => {
          let idx = q.eq("agentId", args.agentId!);
          if (args.startAfter) idx = idx.gte("startTime", args.startAfter);
          return idx;
        })
        .order("desc");

      if (args.startBefore) {
        q = q.filter((q) => q.lt(q.field("startTime"), args.startBefore!));
      }
      return await q.take(limit);
    }

    if (args.scopeId) {
      let q = ctx.db
        .query("episodes")
        .withIndex("by_scope", (q) => {
          let idx = q.eq("scopeId", args.scopeId!);
          if (args.startAfter) idx = idx.gte("startTime", args.startAfter);
          return idx;
        })
        .order("desc");

      if (args.startBefore) {
        q = q.filter((q) => q.lt(q.field("startTime"), args.startBefore!));
      }
      return await q.take(limit);
    }

    // Fallback: scan recent episodes
    return await ctx.db
      .query("episodes")
      .order("desc")
      .take(limit);
  },
});

export const searchEpisodes = query({
  args: {
    query: v.string(),
    scopeId: v.optional(v.id("memory_scopes")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Text search over title field — episodes don't have a search index yet,
    // so we fall back to listing + client-side filter. Vector search via action.
    const candidates = args.scopeId
      ? await ctx.db
          .query("episodes")
          .withIndex("by_scope", (q) => q.eq("scopeId", args.scopeId!))
          .order("desc")
          .take(200)
      : await ctx.db.query("episodes").order("desc").take(200);

    const queryLower = args.query.toLowerCase();
    return candidates
      .filter(
        (ep) =>
          ep.title.toLowerCase().includes(queryLower) ||
          (ep.summary ?? "").toLowerCase().includes(queryLower) ||
          ep.tags.some((t) => t.toLowerCase().includes(queryLower))
      )
      .slice(0, args.limit ?? 10);
  },
});

// ─── Internal Queries ────────────────────────────────────────────────

export const getEpisodeInternal = internalQuery({
  args: { episodeId: v.id("episodes") },
  handler: async (ctx, { episodeId }) => {
    return await ctx.db.get(episodeId);
  },
});

// ─── Mutations ───────────────────────────────────────────────────────

export const createEpisode = mutation({
  args: {
    title: v.string(),
    agentId: v.string(),
    scopeId: v.id("memory_scopes"),
    factIds: v.array(v.id("facts")),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    importanceScore: v.optional(v.float64()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const episodeId = await ctx.db.insert("episodes", {
      title: args.title,
      summary: args.summary,
      agentId: args.agentId,
      scopeId: args.scopeId,
      factIds: args.factIds,
      startTime: args.startTime,
      endTime: args.endTime,
      tags: args.tags ?? [],
      importanceScore: args.importanceScore ?? 0.5,
      createdAt: Date.now(),
    });

    // Schedule async embedding generation
    await ctx.scheduler.runAfter(
      0,
      internal.actions.embedEpisode.embedEpisode,
      { episodeId }
    );

    return { episodeId };
  },
});

export const updateEpisode = mutation({
  args: {
    episodeId: v.id("episodes"),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    endTime: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    importanceScore: v.optional(v.float64()),
    addFactIds: v.optional(v.array(v.id("facts"))),
  },
  handler: async (ctx, { episodeId, addFactIds, ...fields }) => {
    const episode = await ctx.db.get(episodeId);
    if (!episode) throw new Error(`Episode not found: ${episodeId}`);

    const patch: Record<string, unknown> = {};
    if (fields.title !== undefined) patch.title = fields.title;
    if (fields.summary !== undefined) patch.summary = fields.summary;
    if (fields.endTime !== undefined) patch.endTime = fields.endTime;
    if (fields.tags !== undefined) patch.tags = fields.tags;
    if (fields.importanceScore !== undefined) patch.importanceScore = fields.importanceScore;

    if (addFactIds && addFactIds.length > 0) {
      const existingSet = new Set(episode.factIds.map(String));
      const newFacts = addFactIds.filter((id) => !existingSet.has(String(id)));
      patch.factIds = [...episode.factIds, ...newFacts];
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(episodeId, patch);
    }

    return { updated: true };
  },
});

// ─── Internal Mutations ──────────────────────────────────────────────

/** Write back embedding from the embedEpisode action. */
export const updateEmbedding = internalMutation({
  args: {
    episodeId: v.id("episodes"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, { episodeId, embedding }) => {
    const episode = await ctx.db.get(episodeId);
    if (!episode) throw new Error(`Episode not found: ${episodeId}`);
    await ctx.db.patch(episodeId, { embedding });
  },
});
