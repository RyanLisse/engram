import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const recordRecall = mutation({
  args: {
    recallId: v.string(),
    factIds: v.array(v.id("facts")),
  },
  handler: async (ctx, { recallId, factIds }) => {
    const now = Date.now();
    for (const factId of factIds) {
      await ctx.db.insert("recall_feedback", {
        recallId,
        factId,
        createdAt: now,
      });
    }
    return { recorded: factIds.length };
  },
});

export const recordUsage = mutation({
  args: {
    recallId: v.string(),
    usedFactIds: v.array(v.id("facts")),
    unusedFactIds: v.optional(v.array(v.id("facts"))),
  },
  handler: async (ctx, { recallId, usedFactIds, unusedFactIds }) => {
    const rows = await ctx.db
      .query("recall_feedback")
      .withIndex("by_recall", (q) => q.eq("recallId", recallId))
      .take(500);

    const used = new Set(usedFactIds);
    const unused = new Set(unusedFactIds ?? []);
    for (const row of rows) {
      if (used.has(row.factId)) {
        await ctx.db.patch(row._id, { used: true, updatedAt: Date.now() });
      } else if (unused.has(row.factId)) {
        await ctx.db.patch(row._id, { used: false, updatedAt: Date.now() });
      }
    }
    return { updated: rows.length };
  },
});

export const getRecall = query({
  args: { recallId: v.string() },
  handler: async (ctx, { recallId }) => {
    return await ctx.db
      .query("recall_feedback")
      .withIndex("by_recall", (q) => q.eq("recallId", recallId))
      .collect();
  },
});
