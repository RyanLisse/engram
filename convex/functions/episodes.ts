import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  buildAutoEpisodeTitle,
  buildObservationEpisodeTags,
  mergeUniqueFactIds,
} from "./episodes.helpers";

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

export const queryEpisodes = query({
  args: {
    scopeId: v.id("memory_scopes"),
    startTime: v.number(),
    endTime: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("episodes")
      .withIndex("by_scope", (q) =>
        q.eq("scopeId", args.scopeId).gte("startTime", args.startTime)
      )
      .order("desc")
      .take(args.limit ?? 200);

    return rows.filter((ep) => ep.startTime <= args.endTime);
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
      patch.factIds = mergeUniqueFactIds(episode.factIds, addFactIds);
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(episodeId, patch);
    }

    return { updated: true };
  },
});

export const createFromObservationSession = internalMutation({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
    source: v.union(v.literal("observer"), v.literal("reflector")),
    generation: v.number(),
    factIds: v.array(v.id("facts")),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    summary: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    importanceScore: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    if (args.factIds.length === 0) {
      return { created: false, reason: "no_fact_ids" };
    }

    const generationTag = `${args.source}-generation-${args.generation}`;
    const recentEpisodes = await ctx.db
      .query("episodes")
      .withIndex("by_scope", (q) => q.eq("scopeId", args.scopeId))
      .order("desc")
      .take(100);

    const existing = recentEpisodes.find(
      (episode) =>
        episode.agentId === args.agentId &&
        episode.tags.includes("observation-session") &&
        episode.tags.includes(generationTag),
    );

    if (existing) {
      const mergedFactIds = mergeUniqueFactIds(existing.factIds, args.factIds);
      const patch: {
        endTime?: number;
        summary?: string;
        factIds?: typeof mergedFactIds;
      } = {};

      if (args.endTime !== undefined) patch.endTime = args.endTime;
      if (args.summary !== undefined) patch.summary = args.summary;
      if (mergedFactIds.length !== existing.factIds.length) {
        patch.factIds = mergedFactIds;
      }

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(existing._id, patch);
      }
      return { created: false, updated: true, episodeId: existing._id };
    }

    const episodeId = await ctx.db.insert("episodes", {
      title: buildAutoEpisodeTitle(args),
      summary: args.summary,
      agentId: args.agentId,
      scopeId: args.scopeId,
      factIds: args.factIds,
      startTime: args.startTime,
      endTime: args.endTime,
      tags: buildObservationEpisodeTags(args.source, args.generation, args.tags),
      importanceScore: args.importanceScore ?? 0.5,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.actions.embedEpisode.embedEpisode,
      { episodeId }
    );

    return { created: true, episodeId };
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
