import { v } from "convex/values";
import { query, mutation, internalQuery } from "../_generated/server";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// ─── Helpers ─────────────────────────────────────────────────────────

/** Check if an agent has write access to a scope. Throws on denial. */
export async function checkWriteAccessHelper(
  ctx: QueryCtx | MutationCtx,
  scopeId: Id<"memory_scopes">,
  agentId: string
): Promise<void> {
  const scope = await ctx.db.get(scopeId);
  if (!scope) throw new Error(`Scope not found: ${scopeId}`);

  if (scope.writePolicy === "members") {
    if (!scope.members.includes(agentId)) {
      throw new Error(
        `Agent "${agentId}" not authorized to write to scope "${scope.name}" (writePolicy: members)`
      );
    }
  } else if (scope.writePolicy === "creator") {
    // First member is the creator
    if (scope.members[0] !== agentId) {
      throw new Error(
        `Only scope creator can write to "${scope.name}" (writePolicy: creator)`
      );
    }
  }
  // writePolicy === "all" → no check needed
}

// ─── Queries ─────────────────────────────────────────────────────────

export const get = query({
  args: { scopeId: v.id("memory_scopes") },
  handler: async (ctx, { scopeId }) => {
    return await ctx.db.get(scopeId);
  },
});

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    return await ctx.db
      .query("memory_scopes")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
  },
});

export const getPermitted = query({
  args: { agentId: v.string() },
  handler: async (ctx, { agentId }) => {
    // Get scopes via join table (O(memberships) instead of O(all scopes))
    const memberships = await ctx.db
      .query("scope_memberships")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .collect();

    const memberScopeIds = memberships.map((m) => m.scopeId);

    const [memberScopes, publicScopes] = await Promise.all([
      Promise.all(memberScopeIds.map((id) => ctx.db.get(id))),
      ctx.db
        .query("memory_scopes")
        .filter((q) => q.eq(q.field("readPolicy"), "all"))
        .collect(),
    ]);

    const validMemberScopes = memberScopes.filter(Boolean) as any[];
    // Deduplicate (public scopes may overlap with member scopes)
    const seen = new Set(validMemberScopes.map((s) => s._id));
    const deduped = [
      ...validMemberScopes,
      ...publicScopes.filter((s) => !seen.has(s._id)),
    ];
    return deduped;
  },
});

export const checkWriteAccess = query({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
  },
  handler: async (ctx, { scopeId, agentId }) => {
    const scope = await ctx.db.get(scopeId);
    if (!scope) return { allowed: false, reason: "Scope not found" };

    if (scope.writePolicy === "all") return { allowed: true, reason: "open" };
    if (scope.writePolicy === "members") {
      const allowed = scope.members.includes(agentId);
      return {
        allowed,
        reason: allowed ? "member" : "not a member",
      };
    }
    if (scope.writePolicy === "creator") {
      const allowed = scope.members[0] === agentId;
      return {
        allowed,
        reason: allowed ? "creator" : "not the creator",
      };
    }
    return { allowed: false, reason: "unknown writePolicy" };
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("memory_scopes").collect();
  },
});

// Internal query for use in mutations/actions
export const getInternal = internalQuery({
  args: { scopeId: v.id("memory_scopes") },
  handler: async (ctx, { scopeId }) => {
    return await ctx.db.get(scopeId);
  },
});

// ─── Mutations ───────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    members: v.array(v.string()),
    readPolicy: v.string(),
    writePolicy: v.string(),
    retentionDays: v.optional(v.number()),
    memoryPolicy: v.optional(
      v.object({
        maxFacts: v.optional(v.number()),
        decayRate: v.optional(v.float64()),
        prioritizeTypes: v.optional(v.array(v.string())),
        autoForget: v.optional(v.boolean()),
        compressionStrategy: v.optional(v.string()),
        compactionThresholdBytes: v.optional(v.number()),
      })
    ),
    idealStateCriteria: v.optional(
      v.array(
        v.object({
          criterion: v.string(),
          status: v.string(),
          evidence: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    // Check for duplicate scope name
    const existing = await ctx.db
      .query("memory_scopes")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    if (existing) {
      throw new Error(`Scope "${args.name}" already exists`);
    }
    const scopeId = await ctx.db.insert("memory_scopes", args);
    await Promise.all(
      args.members.map((agentId, idx) =>
        ctx.db.insert("scope_memberships", {
          agentId,
          scopeId,
          role: idx === 0 ? "creator" : "member",
          createdAt: Date.now(),
        })
      )
    );
    return scopeId;
  },
});

export const addMember = mutation({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
    callerAgentId: v.optional(v.string()), // Who is adding the member
  },
  handler: async (ctx, { scopeId, agentId, callerAgentId }) => {
    const scope = await ctx.db.get(scopeId);
    if (!scope) throw new Error(`Scope not found: ${scopeId}`);
    if (scope.members.includes(agentId)) return; // idempotent

    // Check admin policy if provided
    if (callerAgentId) {
      const adminPolicy = scope.adminPolicy || "creator";
      if (adminPolicy === "creator") {
        if (scope.members[0] !== callerAgentId) {
          throw new Error(`Only scope creator can add members to "${scope.name}"`);
        }
      } else if (adminPolicy === "members") {
        if (!scope.members.includes(callerAgentId)) {
          throw new Error(`Only scope members can add members to "${scope.name}"`);
        }
      }
      // adminPolicy === "admin_only" would need separate admin list (future phase)
    }

    await ctx.db.patch(scopeId, {
      members: [...scope.members, agentId],
    });

    const existing = await ctx.db
      .query("scope_memberships")
      .withIndex("by_agent_scope", (q) =>
        q.eq("agentId", agentId).eq("scopeId", scopeId)
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("scope_memberships", {
        agentId,
        scopeId,
        role: "member",
        createdAt: Date.now(),
      });
    }
  },
});

export const removeMember = mutation({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
    callerAgentId: v.optional(v.string()), // Who is removing the member
  },
  handler: async (ctx, { scopeId, agentId, callerAgentId }) => {
    const scope = await ctx.db.get(scopeId);
    if (!scope) throw new Error(`Scope not found: ${scopeId}`);

    // Check admin policy if provided
    if (callerAgentId) {
      const adminPolicy = scope.adminPolicy || "creator";
      if (adminPolicy === "creator") {
        if (scope.members[0] !== callerAgentId) {
          throw new Error(`Only scope creator can remove members from "${scope.name}"`);
        }
      } else if (adminPolicy === "members") {
        if (!scope.members.includes(callerAgentId)) {
          throw new Error(`Only scope members can remove members from "${scope.name}"`);
        }
      }
    }

    await ctx.db.patch(scopeId, {
      members: scope.members.filter((m: string) => m !== agentId),
    });

    const membership = await ctx.db
      .query("scope_memberships")
      .withIndex("by_agent_scope", (q) =>
        q.eq("agentId", agentId).eq("scopeId", scopeId)
      )
      .unique();
    if (membership) await ctx.db.delete(membership._id);

    // Security hardening: remove routed notifications tied to this scope
    await ctx.runMutation(api.functions.notifications.deleteByAgentAndScope, {
      agentId,
      scopeId,
    });
  },
});

export const deleteScope = mutation({
  args: {
    scopeId: v.id("memory_scopes"),
    hardDelete: v.optional(v.boolean()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { scopeId, hardDelete, force }) => {
    const scope = await ctx.db.get(scopeId);
    if (!scope) throw new Error(`Scope not found: ${scopeId}`);
    const facts = await ctx.db
      .query("facts")
      .withIndex("by_scope", (q) => q.eq("scopeId", scopeId))
      .take(1);

    if (facts.length > 0 && !force) {
      throw new Error(`Scope ${scope.name} contains facts. Use force=true to delete.`);
    }

    if (hardDelete || force) {
      await ctx.db.delete(scopeId);
      return { deleted: true, hardDelete: true };
    }

    await ctx.db.patch(scopeId, {
      description: `[ARCHIVED] ${scope.description}`,
      retentionDays: 1,
    });
    return { deleted: true, hardDelete: false };
  },
});
