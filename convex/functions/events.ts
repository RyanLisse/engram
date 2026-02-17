import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";

export const emit = internalMutation({
  args: {
    eventType: v.string(),
    factId: v.optional(v.id("facts")),
    scopeId: v.optional(v.id("memory_scopes")),
    agentId: v.optional(v.string()),
    payload: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))),
  },
  handler: async (ctx, args) => {
    const watermark = await getNextWatermark(ctx);
    return await ctx.db.insert("memory_events", {
      eventType: args.eventType,
      factId: args.factId,
      scopeId: args.scopeId,
      agentId: args.agentId,
      payload: args.payload,
      watermark,
      createdAt: Date.now(),
    });
  },
});

export const poll = query({
  args: {
    agentId: v.string(),
    watermark: v.optional(v.number()),
    scopeId: v.optional(v.id("memory_scopes")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { agentId, watermark, scopeId, limit }) => {
    const byAgent = ctx.db
      .query("memory_events")
      .withIndex("by_agent_watermark", (q) => q.eq("agentId", agentId));
    const scoped = scopeId
      ? byAgent.filter((q) => q.eq(q.field("scopeId"), scopeId))
      : byAgent;

    const rows = await (watermark !== undefined
      ? scoped.filter((q) => q.gt(q.field("watermark"), watermark))
      : scoped)
      .order("asc")
      .take(limit ?? 100);

    const nextWatermark = rows.length > 0 ? rows[rows.length - 1].watermark : watermark ?? 0;
    return { events: rows, nextWatermark };
  },
});

/** Get events for a specific agent since a timestamp (used by usage analytics cron). */
export const getEventsByAgent = internalQuery({
  args: {
    agentId: v.string(),
    since: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { agentId, since, limit }) => {
    return await ctx.db
      .query("memory_events")
      .withIndex("by_agent_watermark", (q) => q.eq("agentId", agentId))
      .filter((q) => q.gte(q.field("createdAt"), since))
      .take(limit ?? 1000);
  },
});

/** Record an event explicitly (used by usage analytics cron to store daily rollups). */
export const recordEvent = internalMutation({
  args: {
    agentId: v.string(),
    type: v.string(),
    payload: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))),
  },
  handler: async (ctx, args) => {
    const watermark = await getNextWatermark(ctx);
    return await ctx.db.insert("memory_events", {
      eventType: args.type,
      agentId: args.agentId,
      payload: args.payload,
      watermark,
      createdAt: Date.now(),
    });
  },
});

async function getNextWatermark(ctx: QueryCtx | MutationCtx): Promise<number> {
  const latest = await ctx.db.query("memory_events").withIndex("by_watermark").order("desc").first();
  const next = (latest?.watermark ?? 0) + 1;
  return Math.max(next, Date.now());
}
