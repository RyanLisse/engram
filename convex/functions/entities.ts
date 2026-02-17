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
      .withIndex("by_entity_id", (q) => q.eq("entityId", entityId))
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
      .withSearchIndex("search_name", (s) => {
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
    metadata: v.optional(
      v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))
    ),
    createdBy: v.string(),
    importanceScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("entities")
      .withIndex("by_entity_id", (q) => q.eq("entityId", args.entityId))
      .unique();

    const now = Date.now();

    if (existing) {
      const patch: Record<string, unknown> = {
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
      backlinks: [],
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
      (r) =>
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

export const updateBacklinks = mutation({
  args: {
    factId: v.id("facts"),
    entityNames: v.array(v.string()),
  },
  handler: async (ctx, { factId, entityNames }) => {
    for (const entityName of entityNames) {
      const entity = await ctx.db
        .query("entities")
        .withSearchIndex("search_name", (q) => q.search("name", entityName))
        .take(1);
      const found = entity[0];
      if (!found) continue;
      const backlinks = found.backlinks ?? [];
      if (backlinks.includes(factId)) continue;
      await ctx.db.patch(found._id, {
        backlinks: [...backlinks, factId],
        lastSeen: Date.now(),
      });
    }
    return { updated: true };
  },
});

export const validateBacklinks = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    // Use take() to avoid unbounded collect on large entity tables
    const entities = await ctx.db.query("entities").take(limit ?? 1000);
    let dangling = 0;
    for (const entity of entities) {
      for (const factId of entity.backlinks ?? []) {
        const fact = await ctx.db.get(factId);
        if (!fact) dangling += 1;
      }
    }
    return { dangling, checked: entities.length };
  },
});

export const rebuildBacklinks = mutation({
  args: {},
  handler: async (ctx) => {
    // Bounded scans to avoid timeouts on large tables
    const entities = await ctx.db.query("entities").take(2000);
    for (const entity of entities) {
      await ctx.db.patch(entity._id, { backlinks: [] });
    }

    const facts = await ctx.db.query("facts").take(5000);
    for (const fact of facts) {
      for (const entityName of fact.entityIds ?? []) {
        const entity = await ctx.db
          .query("entities")
          .withSearchIndex("search_name", (q) => q.search("name", entityName))
          .take(1);
        const found = entity[0];
        if (!found) continue;
        const backlinks = found.backlinks ?? [];
        if (backlinks.includes(fact._id)) continue;
        await ctx.db.patch(found._id, { backlinks: [...backlinks, fact._id] });
      }
    }
    return { rebuilt: true };
  },
});

export const deleteEntity = mutation({
  args: {
    entityId: v.id("entities"),
    hardDelete: v.optional(v.boolean()),
  },
  handler: async (ctx, { entityId, hardDelete }) => {
    const entity = await ctx.db.get(entityId);
    if (!entity) throw new Error(`Entity not found: ${entityId}`);
    if (hardDelete) {
      await ctx.db.delete(entityId);
      return { deleted: true, hardDelete: true };
    }
    await ctx.db.patch(entityId, {
      metadata: { ...entity.metadata, archived: true, archivedAt: Date.now() },
      lastSeen: Date.now(),
    });
    return { deleted: true, hardDelete: false };
  },
});
