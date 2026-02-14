import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const getConfig = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    return await ctx.db.query("system_config").withIndex("by_key", (q) => q.eq("key", key)).first();
  },
});

export const listConfigs = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, { category }) => {
    if (!category) return await ctx.db.query("system_config").collect();
    return await ctx.db
      .query("system_config")
      .withIndex("by_category", (q) => q.eq("category", category))
      .collect();
  },
});

export const setConfig = mutation({
  args: {
    key: v.string(),
    value: v.union(v.string(), v.number(), v.boolean(), v.null()),
    category: v.string(),
    description: v.string(),
    updatedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("system_config").withIndex("by_key", (q) => q.eq("key", args.key)).first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        category: args.category,
        description: args.description,
        version: existing.version + 1,
        updatedAt: Date.now(),
        updatedBy: args.updatedBy,
      });
      return { updated: true };
    }
    await ctx.db.insert("system_config", {
      key: args.key,
      value: args.value,
      category: args.category,
      description: args.description,
      version: 1,
      updatedAt: Date.now(),
      updatedBy: args.updatedBy,
    });
    return { created: true };
  },
});

export const setScopePolicy = mutation({
  args: {
    scopeId: v.id("memory_scopes"),
    policyKey: v.string(),
    policyValue: v.union(v.string(), v.number(), v.boolean(), v.null()),
    priority: v.optional(v.number()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("memory_policies", {
      scopeId: args.scopeId,
      policyKey: args.policyKey,
      policyValue: args.policyValue,
      priority: args.priority ?? 100,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });
    return { created: true };
  },
});

export const listScopePolicies = query({
  args: { scopeId: v.id("memory_scopes") },
  handler: async (ctx, { scopeId }) => {
    return await ctx.db
      .query("memory_policies")
      .withIndex("by_scope_key", (q) => q.eq("scopeId", scopeId))
      .collect();
  },
});
