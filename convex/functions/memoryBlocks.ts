/**
 * Memory Blocks — Letta-style named blocks with character limits and versioning.
 * Phase 7: CRUD, append/replace with limit enforcement, version snapshots.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { checkWriteAccessHelper } from "./scopes";

// ── blockCreate ─────────────────────────────────────────────────────

export const blockCreate = mutation({
  args: {
    label: v.string(),
    value: v.string(),
    characterLimit: v.number(),
    scopeId: v.id("memory_scopes"),
    createdBy: v.string(),
    shared: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await checkWriteAccessHelper(ctx, args.scopeId, args.createdBy);
    if (args.value.length > args.characterLimit) {
      throw new Error(
        `Block value length ${args.value.length} exceeds limit ${args.characterLimit}`
      );
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("memory_blocks")
      .withIndex("by_scope_label", (q) =>
        q.eq("scopeId", args.scopeId).eq("label", args.label)
      )
      .first();
    if (existing) {
      throw new Error(
        `Block with label "${args.label}" already exists in this scope`
      );
    }
    const blockId = await ctx.db.insert("memory_blocks", {
      label: args.label,
      value: args.value,
      characterLimit: args.characterLimit,
      scopeId: args.scopeId,
      createdBy: args.createdBy,
      version: 1,
      shared: args.shared ?? false,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("block_versions", {
      blockId,
      previousValue: "",
      changeType: "create",
      changedBy: args.createdBy,
      createdAt: now,
    });
    return { blockId, version: 1 };
  },
});

// ── blockGet ──────────────────────────────────────────────────────────

export const blockGet = query({
  args: {
    scopeId: v.id("memory_scopes"),
    label: v.string(),
  },
  handler: async (ctx, { scopeId, label }) => {
    return await ctx.db
      .query("memory_blocks")
      .withIndex("by_scope_label", (q) =>
        q.eq("scopeId", scopeId).eq("label", label)
      )
      .first();
  },
});

// ── blockListByScope ──────────────────────────────────────────────────

export const blockListByScope = query({
  args: {
    scopeId: v.id("memory_scopes"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { scopeId, limit = 50 }) => {
    return await ctx.db
      .query("memory_blocks")
      .withIndex("by_scope", (q) => q.eq("scopeId", scopeId))
      .order("desc")
      .take(limit);
  },
});

// ── blockWrite ────────────────────────────────────────────────────────
// Append or replace content. Enforces character limit; snapshots to block_versions.

export const blockWrite = mutation({
  args: {
    scopeId: v.id("memory_scopes"),
    label: v.string(),
    mode: v.union(v.literal("append"), v.literal("replace")),
    content: v.string(),
    agentId: v.string(),
    expectedVersion: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await checkWriteAccessHelper(ctx, args.scopeId, args.agentId);
    const block = await ctx.db
      .query("memory_blocks")
      .withIndex("by_scope_label", (q) =>
        q.eq("scopeId", args.scopeId).eq("label", args.label)
      )
      .first();
    if (!block) {
      throw new Error(
        `Block with label "${args.label}" not found in scope. Create it first with blockCreate.`
      );
    }
    if (
      args.expectedVersion !== undefined &&
      block.version !== args.expectedVersion
    ) {
      throw new Error(
        `Version conflict: expected ${args.expectedVersion}, current is ${block.version}`
      );
    }
    const now = Date.now();
    const previousValue = block.value;
    let newValue: string;
    if (args.mode === "replace") {
      newValue = args.content;
    } else {
      newValue = previousValue + args.content;
    }
    if (newValue.length > block.characterLimit) {
      throw new Error(
        `Block would exceed character limit: ${newValue.length} > ${block.characterLimit}`
      );
    }
    const changeType = args.mode === "append" ? "append" : "replace";
    await ctx.db.insert("block_versions", {
      blockId: block._id,
      previousValue,
      changeType,
      changedBy: args.agentId,
      reason: args.reason,
      createdAt: now,
    });
    const newVersion = block.version + 1;
    await ctx.db.patch(block._id, {
      value: newValue,
      version: newVersion,
      updatedAt: now,
    });
    return {
      blockId: block._id,
      version: newVersion,
      length: newValue.length,
      characterLimit: block.characterLimit,
    };
  },
});

// ── blockGetVersions ──────────────────────────────────────────────────

export const blockGetVersions = query({
  args: {
    blockId: v.id("memory_blocks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { blockId, limit = 20 }) => {
    return await ctx.db
      .query("block_versions")
      .withIndex("by_block", (q) => q.eq("blockId", blockId))
      .order("desc")
      .take(limit);
  },
});

// ── blockDelete ───────────────────────────────────────────────────────

export const blockDelete = mutation({
  args: {
    blockId: v.optional(v.id("memory_blocks")),
    scopeId: v.optional(v.id("memory_scopes")),
    label: v.optional(v.string()),
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    let block = null as any;

    if (args.blockId) {
      block = await ctx.db.get(args.blockId);
    } else if (args.scopeId && args.label) {
      block = await ctx.db
        .query("memory_blocks")
        .withIndex("by_scope_label", (q) =>
          q.eq("scopeId", args.scopeId!).eq("label", args.label!)
        )
        .first();
    } else {
      throw new Error("Provide blockId or scopeId+label to delete a block");
    }

    if (!block) {
      throw new Error("Memory block not found");
    }

    await checkWriteAccessHelper(ctx, block.scopeId, args.agentId);

    const versions = await ctx.db
      .query("block_versions")
      .withIndex("by_block", (q) => q.eq("blockId", block._id))
      .collect();

    for (const version of versions) {
      await ctx.db.delete(version._id);
    }

    await ctx.db.delete(block._id);
    return { deleted: true, blockId: block._id, deletedVersions: versions.length };
  },
});
