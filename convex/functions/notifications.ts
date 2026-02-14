import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

export const create = internalMutation({
  args: {
    agentId: v.string(),
    factId: v.id("facts"),
    reason: v.string(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("notifications", {
      agentId: args.agentId,
      factId: args.factId,
      reason: args.reason,
      read: false,
      createdAt: Date.now(),
      expiresAt: args.expiresAt ?? Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    const fact = await ctx.db.get(args.factId);
    await ctx.runMutation(internal.functions.events.emit, {
      eventType: "notification.created",
      factId: args.factId,
      scopeId: fact?.scopeId,
      payload: { agentId: args.agentId, reason: args.reason },
    });
    return id;
  },
});

export const getUnreadByAgent = query({
  args: {
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { agentId, limit }) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_agent_read", (q) => q.eq("agentId", agentId).eq("read", false))
      .order("desc")
      .take(limit ?? 10);
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    await ctx.db.patch(notificationId, { read: true });
  },
});

export const markAllRead = mutation({
  args: { agentId: v.string() },
  handler: async (ctx, { agentId }) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_agent_read", (q) => q.eq("agentId", agentId).eq("read", false))
      .take(500);
    for (const row of unread) {
      await ctx.db.patch(row._id, { read: true });
    }
    return { marked: unread.length };
  },
});

export const deleteExpired = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, { now }) => {
    const ts = now ?? Date.now();
    const expired = await ctx.db
      .query("notifications")
      .withIndex("by_expires", (q) => q.lte("expiresAt", ts))
      .take(500);
    for (const row of expired) {
      await ctx.db.delete(row._id);
    }
    return { deleted: expired.length };
  },
});

export const deleteByAgentAndScope = mutation({
  args: {
    agentId: v.string(),
    scopeId: v.id("memory_scopes"),
  },
  handler: async (ctx, { agentId, scopeId }) => {
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_agent_read", (q) => q.eq("agentId", agentId))
      .take(500);
    let deleted = 0;
    for (const row of rows) {
      const fact = await ctx.db.get(row.factId);
      if (fact?.scopeId === scopeId) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }
    return { deleted };
  },
});
