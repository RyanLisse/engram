/**
 * KV Store mutations and queries — deterministic key-value storage.
 *
 * kvSet    — upsert by key + scope
 * kvGet    — lookup by key + scope
 * kvDelete — remove by key + scope
 * kvList   — list by scope with optional prefix / category filter
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { checkWriteAccessHelper } from "./scopes";

// ── kvSet ─────────────────────────────────────────────────────────────

export const kvSet = mutation({
  args: {
    key: v.string(),
    value: v.string(), // JSON-encoded for flexibility
    agentId: v.string(),
    scopeId: v.id("memory_scopes"),
    category: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        source: v.optional(v.string()),
        confidence: v.optional(v.float64()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await checkWriteAccessHelper(ctx, args.scopeId, args.agentId);
    const now = Date.now();

    const existing = await ctx.db
      .query("key_value_facts")
      .withIndex("by_key_scope", (q) =>
        q.eq("key", args.key).eq("scopeId", args.scopeId)
      )
      .first();

    if (existing) {
      const patch: Record<string, unknown> = { value: args.value, updatedAt: now };
      if (args.category !== undefined) patch.category = args.category;
      if (args.metadata !== undefined) patch.metadata = args.metadata;
      await ctx.db.patch(existing._id, patch);
      return { id: existing._id, created: false };
    }

    const id = await ctx.db.insert("key_value_facts", {
      key: args.key,
      value: args.value,
      agentId: args.agentId,
      scopeId: args.scopeId,
      category: args.category,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
    return { id, created: true };
  },
});

// ── kvGet ─────────────────────────────────────────────────────────────

export const kvGet = query({
  args: {
    key: v.string(),
    scopeId: v.id("memory_scopes"),
  },
  handler: async (ctx, { key, scopeId }) => {
    return await ctx.db
      .query("key_value_facts")
      .withIndex("by_key_scope", (q) => q.eq("key", key).eq("scopeId", scopeId))
      .first();
  },
});

// ── kvDelete ──────────────────────────────────────────────────────────

export const kvDelete = mutation({
  args: {
    key: v.string(),
    agentId: v.string(),
    scopeId: v.id("memory_scopes"),
  },
  handler: async (ctx, { key, agentId, scopeId }) => {
    await checkWriteAccessHelper(ctx, scopeId, agentId);

    const existing = await ctx.db
      .query("key_value_facts")
      .withIndex("by_key_scope", (q) => q.eq("key", key).eq("scopeId", scopeId))
      .first();

    if (!existing) return { deleted: false };
    await ctx.db.delete(existing._id);
    return { deleted: true };
  },
});

// ── kvList ────────────────────────────────────────────────────────────

export const kvList = query({
  args: {
    scopeId: v.id("memory_scopes"),
    prefix: v.optional(v.string()),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { scopeId, prefix, category, limit }) => {
    let rows;

    if (category !== undefined) {
      // Use category index when filtering by category
      rows = await ctx.db
        .query("key_value_facts")
        .withIndex("by_category", (q) =>
          q.eq("category", category).eq("scopeId", scopeId)
        )
        .take(limit ?? 100);
    } else {
      // Full scope scan — no scope-only index exists, but KV stores are small
      rows = await ctx.db
        .query("key_value_facts")
        .filter((q) => q.eq(q.field("scopeId"), scopeId))
        .take(limit ?? 100);
    }

    if (prefix) {
      rows = rows.filter((r) => r.key.startsWith(prefix));
    }

    return rows;
  },
});
