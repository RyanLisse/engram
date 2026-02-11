import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const create = mutation({
  args: {
    sessionId: v.id("sessions"),
    participants: v.array(v.string()),
    contextSummary: v.string(),
    tags: v.array(v.string()),
    importance: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("conversations", {
      sessionId: args.sessionId,
      participants: args.participants,
      contextSummary: args.contextSummary,
      tags: args.tags,
      importance: args.importance ?? 0.5,
      threadFacts: [],
      handoffs: [],
    });
  },
});

export const addFact = mutation({
  args: {
    conversationId: v.id("conversations"),
    factId: v.id("facts"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    await ctx.db.patch(args.conversationId, {
      threadFacts: [...conversation.threadFacts, args.factId],
    });
  },
});

export const addHandoff = mutation({
  args: {
    conversationId: v.id("conversations"),
    fromAgent: v.string(),
    toAgent: v.string(),
    contextSummary: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    await ctx.db.patch(args.conversationId, {
      handoffs: [
        ...conversation.handoffs,
        {
          fromAgent: args.fromAgent,
          toAgent: args.toAgent,
          timestamp: Date.now(),
          contextSummary: args.contextSummary,
        },
      ],
    });
  },
});

export const getBySession = query({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});
