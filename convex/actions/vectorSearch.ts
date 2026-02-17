"use node";

/**
 * Vector search action for semantic fact retrieval.
 * NOTE: vectorSearch is only available in actions, NOT queries.
 */

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Perform vector search on facts using embedding (internal).
 * Used by enrichment pipeline and crons.
 */
export const vectorSearchFacts = internalAction({
  args: {
    embedding: v.array(v.float64()),
    scopeId: v.optional(v.id("memory_scopes")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const searchOptions: any = {
      vector: args.embedding,
      limit: args.limit ?? 10,
    };

    if (args.scopeId) {
      searchOptions.filter = (q: any) => q.eq("scopeId", args.scopeId);
    }

    const results = await ctx.vectorSearch(
      "facts",
      "vector_search",
      searchOptions
    );

    return results;
  },
});

/**
 * Public vector recall across multiple scopes.
 * Called by MCP server for memory_recall and memory_vector_search.
 * This MUST be an action because ctx.vectorSearch() is action-only.
 */
export const vectorRecallAction = action({
  args: {
    embedding: v.array(v.float64()),
    scopeIds: v.array(v.id("memory_scopes")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { embedding, scopeIds, limit } = args;
    if (scopeIds.length === 0) return [];

    const perScopeLimit = Math.max(5, Math.ceil(((limit ?? 20) * 1.5) / scopeIds.length));

    const allResults = await Promise.all(
      scopeIds.map((scopeId) =>
        ctx.vectorSearch("facts", "vector_search", {
          vector: embedding,
          limit: perScopeLimit,
          filter: (q: any) => q.eq("scopeId", scopeId),
        })
      )
    );

    const merged = allResults.flat().sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
    return merged.slice(0, limit ?? 20);
  },
});
