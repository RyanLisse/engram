import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "../_generated/server";

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

/** Get recent events for an agent filtered by eventType (used by action-recommendations cooldown). */
export const getRecentByAgentAndType = internalQuery({
  args: {
    agentId: v.string(),
    eventType: v.string(),
    sinceMs: v.number(),
  },
  handler: async (ctx, { agentId, eventType, sinceMs }) => {
    const cutoff = Date.now() - sinceMs;
    return await ctx.db
      .query("memory_events")
      .withIndex("by_agent_watermark", (q) => q.eq("agentId", agentId))
      .order("desc")
      .filter((q) =>
        q.and(
          q.eq(q.field("eventType"), eventType),
          q.gte(q.field("createdAt"), cutoff)
        )
      )
      .take(1);
  },
});

async function getNextWatermark(ctx: any): Promise<number> {
  const latest = await ctx.db.query("memory_events").withIndex("by_watermark").order("desc").first();
  const next = (latest?.watermark ?? 0) + 1;
  return Math.max(next, Date.now());
}
