import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { api } from "../_generated/api";

export const recordSignal = mutation({
  args: {
    factId: v.optional(v.id("facts")),
    sessionId: v.optional(v.id("sessions")),
    agentId: v.string(),
    signalType: v.union(
      v.literal("explicit_rating"),
      v.literal("implicit_sentiment"),
      v.literal("usefulness"),
      v.literal("failure")
    ),
    value: v.number(),
    comment: v.optional(v.string()),
    confidence: v.optional(v.float64()),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const signalId = await ctx.db.insert("signals", {
      factId: args.factId,
      sessionId: args.sessionId,
      agentId: args.agentId,
      signalType: args.signalType,
      value: args.value,
      comment: args.comment,
      confidence: args.confidence,
      context: args.context,
      timestamp: Date.now(),
    });

    if (args.factId && (args.signalType === "usefulness" || args.signalType === "explicit_rating")) {
      const normalized = args.signalType === "explicit_rating" ? args.value / 10 : (args.value + 1) / 2;
      await ctx.runMutation(api.functions.facts.updateOutcomeFromFeedback, {
        factId: args.factId,
        signalValue: normalized,
      });
    }

    return signalId;
  },
});

export const getByFact = query({
  args: {
    factId: v.id("facts"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("signals")
      .withIndex("by_fact", (q) => q.eq("factId", args.factId))
      .order("desc")
      .take(limit);
  },
});

export const getByAgent = query({
  args: {
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("signals")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(limit);
  },
});
