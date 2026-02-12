import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

// ─── Queries ─────────────────────────────────────────────────────────

export const get = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    return await ctx.db.get(agentId);
  },
});

export const getByAgentId = query({
  args: { agentId: v.string() },
  handler: async (ctx, { agentId }) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agentId", agentId))
      .unique();
  },
});

// ─── Mutations ───────────────────────────────────────────────────────

export const register = mutation({
  args: {
    agentId: v.string(),
    name: v.string(),
    capabilities: v.array(v.string()),
    defaultScope: v.string(),
    nodeId: v.optional(v.string()),
    telos: v.optional(v.string()),
    settings: v.optional(
      v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        capabilities: args.capabilities,
        defaultScope: args.defaultScope,
        nodeId: args.nodeId,
        telos: args.telos,
        settings: args.settings,
        lastSeen: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("agents", {
      agentId: args.agentId,
      name: args.name,
      capabilities: args.capabilities,
      defaultScope: args.defaultScope,
      nodeId: args.nodeId,
      telos: args.telos,
      settings: args.settings,
      factCount: 0,
      lastSeen: Date.now(),
    });
  },
});

export const updateLastSeen = mutation({
  args: {
    agentId: v.id("agents"),
    incrementFactCount: v.optional(v.boolean()),
  },
  handler: async (ctx, { agentId, incrementFactCount }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    const patch: { lastSeen: number; factCount?: number } = {
      lastSeen: Date.now(),
    };
    if (incrementFactCount) {
      patch.factCount = agent.factCount + 1;
    }
    await ctx.db.patch(agentId, patch);
  },
});
