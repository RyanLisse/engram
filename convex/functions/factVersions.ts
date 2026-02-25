import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";

/**
 * Snapshot the current state of a fact before any mutation.
 * Called internally by update/merge/archive/restore handlers — never by agents directly.
 */
export const createVersion = internalMutation({
  args: {
    factId: v.id("facts"),
    previousContent: v.string(),
    previousImportance: v.optional(v.float64()),
    previousTags: v.optional(v.array(v.string())),
    changedBy: v.string(),
    changeType: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("fact_versions", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/**
 * Return version history for a fact, newest first, with cursor-based pagination.
 */
export const getVersions = query({
  args: {
    factId: v.id("facts"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()), // paginationOpts cursor
  },
  handler: async (ctx, { factId, limit = 20 }) => {
    const versions = await ctx.db
      .query("fact_versions")
      .withIndex("by_fact", (q) => q.eq("factId", factId))
      .order("desc")
      .take(limit);
    return versions;
  },
});

/**
 * Return a single version record by its ID.
 */
export const getVersion = query({
  args: { versionId: v.id("fact_versions") },
  handler: async (ctx, { versionId }) => {
    return await ctx.db.get(versionId);
  },
});
