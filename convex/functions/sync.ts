import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const getFactsSince = query({
  args: {
    scopeId: v.id("memory_scopes"),
    since: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    // Use compound index [scopeId, timestamp] to skip old facts without full scan
    return await ctx.db
      .query("facts")
      .withIndex("by_scope", (q) =>
        q.eq("scopeId", args.scopeId).gt("timestamp", args.since)
      )
      .order("asc")
      .take(limit);
  },
});

export const updateSyncLog = mutation({
  args: {
    nodeId: v.string(),
    factsSynced: v.number(),
    status: v.union(
      v.literal("ok"),
      v.literal("error"),
      v.literal("syncing")
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sync_log")
      .withIndex("by_node", (q) => q.eq("nodeId", args.nodeId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        factsSynced: args.factsSynced,
        status: args.status,
        lastSyncTimestamp: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("sync_log", {
      nodeId: args.nodeId,
      factsSynced: args.factsSynced,
      status: args.status,
      lastSyncTimestamp: Date.now(),
    });
  },
});

export const getSyncStatus = query({
  args: {
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sync_log")
      .withIndex("by_node", (q) => q.eq("nodeId", args.nodeId))
      .first();
  },
});
