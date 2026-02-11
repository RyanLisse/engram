import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    factIds: v.array(v.id("facts")),
    entityIds: v.array(v.id("entities")),
    scopeId: v.id("memory_scopes"),
    importance: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("themes", {
      name: args.name,
      description: args.description,
      factIds: args.factIds,
      entityIds: args.entityIds,
      scopeId: args.scopeId,
      importance: args.importance ?? 0.5,
      lastUpdated: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    themeId: v.id("themes"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    factIds: v.optional(v.array(v.id("facts"))),
    entityIds: v.optional(v.array(v.id("entities"))),
    importance: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { themeId, ...fields } = args;
    const patch: Record<string, unknown> = { lastUpdated: Date.now() };
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.description !== undefined) patch.description = fields.description;
    if (fields.factIds !== undefined) patch.factIds = fields.factIds;
    if (fields.entityIds !== undefined) patch.entityIds = fields.entityIds;
    if (fields.importance !== undefined) patch.importance = fields.importance;
    await ctx.db.patch(themeId, patch);
  },
});

export const getByScope = query({
  args: {
    scopeId: v.id("memory_scopes"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("themes")
      .withIndex("by_scope", (q) => q.eq("scopeId", args.scopeId))
      .take(limit);
  },
});

export const search = query({
  args: {
    minImportance: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const minImportance = args.minImportance ?? 0.0;
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("themes")
      .withIndex("by_importance", (q) => q.gte("importance", minImportance))
      .order("desc")
      .take(limit);
  },
});
