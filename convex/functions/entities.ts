import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

// ─── Queries ─────────────────────────────────────────────────────────

export const get = query({
  args: { id: v.id("entities") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const getByEntityId = query({
  args: { entityId: v.string() },
  handler: async (ctx, { entityId }) => {
    return await ctx.db
      .query("entities")
      .withIndex("by_entity_id", (q: any) => q.eq("entityId", entityId))
      .unique();
  },
});

export const search = query({
  args: {
    query: v.string(),
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    let q = ctx.db
      .query("entities")
      .withSearchIndex("search_name", (s: any) => {
        let search = s.search("name", args.query);
        if (args.type) {
          search = search.eq("type", args.type);
        }
        return search;
      });
    return await q.take(limit);
  },
});

// ─── Mutations ───────────────────────────────────────────────────────

export const upsert = mutation({
  args: {
    entityId: v.string(),
    name: v.string(),
    type: v.string(),
    metadata: v.optional(v.any()),
    createdBy: v.string(),
    importanceScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("entities")
      .withIndex("by_entity_id", (q: any) => q.eq("entityId", args.entityId))
      .unique();

    const now = Date.now();

    if (existing) {
      const patch: Record<string, any> = {
        name: args.name,
        type: args.type,
        lastSeen: now,
      };
      if (args.metadata !== undefined) {
        patch.metadata = { ...existing.metadata, ...args.metadata };
      }
      if (args.importanceScore !== undefined) {
        patch.importanceScore = args.importanceScore;
      }
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("entities", {
      entityId: args.entityId,
      name: args.name,
      type: args.type,
      firstSeen: now,
      lastSeen: now,
      metadata: args.metadata ?? {},
      relationships: [],
      importanceScore: args.importanceScore ?? 0.5,
      accessCount: 0,
      createdBy: args.createdBy,
    });
  },
});

export const addRelationship = mutation({
  args: {
    entityId: v.id("entities"),
    targetId: v.string(),
    relationType: v.string(),
    since: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entity = await ctx.db.get(args.entityId);
    if (!entity) throw new Error(`Entity not found: ${args.entityId}`);

    // Check for duplicate relationship (same targetId + relationType)
    const isDuplicate = entity.relationships.some(
      (r: any) =>
        r.targetId === args.targetId && r.relationType === args.relationType
    );
    if (isDuplicate) return;

    const relationship: { targetId: string; relationType: string; since?: string } = {
      targetId: args.targetId,
      relationType: args.relationType,
    };
    if (args.since !== undefined) {
      relationship.since = args.since;
    }

    await ctx.db.patch(args.entityId, {
      relationships: [...entity.relationships, relationship],
      lastSeen: Date.now(),
    });
  },
});
