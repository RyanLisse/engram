import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";

// ─── Helper Functions ────────────────────────────────────────────────

async function ensureSharedPersonalMembership(ctx: MutationCtx, agentId: string) {
  // Find or create shared-personal scope
  let sharedScope = await ctx.db
    .query("memory_scopes")
    .withIndex("by_name", (q) => q.eq("name", "shared-personal"))
    .unique();

  if (!sharedScope) {
    // Create shared-personal scope on first inner-circle registration
    const scopeId = await ctx.db.insert("memory_scopes", {
      name: "shared-personal",
      description: "Shared memory for inner circle agents",
      members: [agentId],
      readPolicy: "members",
      writePolicy: "members",
      adminPolicy: "creator", // First member is admin
    });
    return scopeId;
  }

  // Add agent to members if not already there
  if (!sharedScope.members.includes(agentId)) {
    await ctx.db.patch(sharedScope._id, {
      members: [...sharedScope.members, agentId],
    });
  }
}

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

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db.query("agents").take(limit ?? 50);
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
    isInnerCircle: v.optional(v.boolean()),
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
        isInnerCircle: args.isInnerCircle,
        lastSeen: Date.now(),
      });

      // Add to shared-personal scope if inner circle
      if (args.isInnerCircle) {
        await ensureSharedPersonalMembership(ctx, args.agentId);
      }

      return existing._id;
    }

    const agentDocId = await ctx.db.insert("agents", {
      agentId: args.agentId,
      name: args.name,
      capabilities: args.capabilities,
      defaultScope: args.defaultScope,
      nodeId: args.nodeId,
      telos: args.telos,
      settings: args.settings,
      isInnerCircle: args.isInnerCircle,
      factCount: 0,
      lastSeen: Date.now(),
    });

    // Add to shared-personal scope if inner circle
    if (args.isInnerCircle) {
      await ensureSharedPersonalMembership(ctx, args.agentId);
    }

    return agentDocId;
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

export const updateCapabilityEmbedding = mutation({
  args: {
    agentId: v.id("agents"),
    capabilityEmbedding: v.array(v.float64()),
  },
  handler: async (ctx, { agentId, capabilityEmbedding }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    await ctx.db.patch(agentId, {
      capabilityEmbedding,
      lastSeen: Date.now(),
    });
  },
});
