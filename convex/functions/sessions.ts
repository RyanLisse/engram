import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const create = mutation({
  args: {
    agentId: v.string(),
    contextSummary: v.string(),
    parentSession: v.optional(v.id("sessions")),
    nodeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sessions", {
      agentId: args.agentId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      conversationIds: [],
      factCount: 0,
      contextSummary: args.contextSummary,
      parentSession: args.parentSession,
      nodeId: args.nodeId,
    });
  },
});

export const updateActivity = mutation({
  args: {
    sessionId: v.id("sessions"),
    incrementFactCount: v.optional(v.boolean()),
    contextSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error(`Session ${args.sessionId} not found`);
    }
    const patch: Record<string, unknown> = {
      lastActivity: Date.now(),
    };
    if (args.incrementFactCount) {
      patch.factCount = session.factCount + 1;
    }
    if (args.contextSummary !== undefined) {
      patch.contextSummary = args.contextSummary;
    }
    await ctx.db.patch(args.sessionId, patch);
  },
});

export const getByAgent = query({
  args: {
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    return await ctx.db
      .query("sessions")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(limit);
  },
});
