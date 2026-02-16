import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const record = mutation({
  args: {
    agentId: v.string(),
    taskType: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    success: v.boolean(),
    linesChanged: v.number(),
    testsAdded: v.number(),
    violations: v.array(v.string()),
    qualityGradeBefore: v.string(),
    qualityGradeAfter: v.string(),
    templateUsed: v.optional(v.string()),
    patternsFollowed: v.array(v.string()),
    patternsViolated: v.array(v.string()),
    mergedAt: v.optional(v.number()),
    reviewTime: v.optional(v.number()),
    rollbackRequired: v.boolean(),
    wasHelpful: v.optional(v.boolean()),
    reusedCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agent_performance", args);
  },
});

export const listByAgent = query({
  args: { agentId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { agentId, limit }) => {
    return await ctx.db
      .query("agent_performance")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .order("desc")
      .take(limit ?? 50);
  },
});

export const listSuccessfulByTask = query({
  args: { taskType: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { taskType, limit }) => {
    return await ctx.db
      .query("agent_performance")
      .withIndex("by_task_type", (q) => q.eq("taskType", taskType).eq("success", true))
      .order("desc")
      .take(limit ?? 100);
  },
});

export const summarizeRecent = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const recent = await ctx.db
      .query("agent_performance")
      .withIndex("by_success", (q) => q.eq("success", true).gte("endTime", since))
      .take(500);

    const total = recent.length;
    const withTemplate = recent.filter((r) => !!r.templateUsed).length;
    const avgReviewTime = total
      ? recent.reduce((acc, r) => acc + (r.reviewTime ?? 0), 0) / total
      : 0;

    return {
      total,
      withTemplate,
      avgReviewTime,
      successRate: 100,
    };
  },
});
