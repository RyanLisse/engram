"use node";

/**
 * Vector search action for semantic episode retrieval.
 * vectorSearch is only available in actions, NOT queries.
 */

import { v } from "convex/values";
import { action } from "../_generated/server";
import { generateQueryEmbedding } from "./embed";

export const vectorSearchEpisodes = action({
  args: {
    query: v.string(),
    scopeId: v.optional(v.id("memory_scopes")),
    agentId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const embedding = await generateQueryEmbedding(args.query);

    const searchOptions: any = {
      vector: embedding,
      limit: args.limit ?? 10,
    };

    // Build filter from scopeId and/or agentId
    if (args.scopeId && args.agentId) {
      searchOptions.filter = (q: any) =>
        q.and(q.eq("scopeId", args.scopeId), q.eq("agentId", args.agentId));
    } else if (args.scopeId) {
      searchOptions.filter = (q: any) => q.eq("scopeId", args.scopeId);
    } else if (args.agentId) {
      searchOptions.filter = (q: any) => q.eq("agentId", args.agentId);
    }

    const results = await ctx.vectorSearch(
      "episodes",
      "by_embedding",
      searchOptions
    );

    return results;
  },
});
