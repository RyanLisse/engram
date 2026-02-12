"use node";

/**
 * Vector search action for semantic fact retrieval.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";

/**
 * Perform vector search on facts using embedding.
 * Used by memory_recall MCP tool for semantic retrieval.
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
