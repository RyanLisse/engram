import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { checkWriteAccessHelper } from "./scopes";

// ─── Helpers ─────────────────────────────────────────────────────────

/** Quick importance estimate based on factType. Async enrichment (Phase 3) refines this. */
function estimateImportance(factType: string): number {
  const scores: Record<string, number> = {
    decision: 0.8,
    error: 0.7,
    insight: 0.75,
    correction: 0.7,
    steering_rule: 0.85,
    learning: 0.65,
    session_summary: 0.6,
    plan: 0.6,
    observation: 0.5,
  };
  return scores[factType] ?? 0.5;
}

// ─── Queries ─────────────────────────────────────────────────────────

export const getFact = query({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    return await ctx.db.get(factId);
  },
});

export const getByIds = query({
  args: { factIds: v.array(v.id("facts")) },
  handler: async (ctx, { factIds }) => {
    const results = await Promise.all(
      factIds.map((id) => ctx.db.get(id))
    );
    return results.filter((fact) => fact !== null);
  },
});

export const searchFacts = query({
  args: {
    query: v.string(),
    scopeId: v.optional(v.id("memory_scopes")),
    factType: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const search = ctx.db
      .query("facts")
      .withSearchIndex("search_content", (q) => {
        let s = q.search("content", args.query);
        if (args.scopeId) s = s.eq("scopeId", args.scopeId);
        if (args.factType) s = s.eq("factType", args.factType);
        if (args.createdBy) s = s.eq("createdBy", args.createdBy);
        return s;
      });

    return await search.take(args.limit ?? 10);
  },
});

// ─── Mutations ───────────────────────────────────────────────────────

export const storeFact = mutation({
  args: {
    content: v.string(),
    source: v.optional(v.string()),
    entityIds: v.optional(v.array(v.string())),
    tags: v.optional(v.array(v.string())),
    factType: v.optional(v.string()),
    scopeId: v.id("memory_scopes"),
    createdBy: v.string(),
    conversationId: v.optional(v.id("conversations")),
    emotionalContext: v.optional(v.string()),
    emotionalWeight: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    // 1. Check write permission
    await checkWriteAccessHelper(ctx, args.scopeId, args.createdBy);

    // 2. Quick importance estimate based on factType
    const factType = args.factType ?? "observation";
    const importanceScore = estimateImportance(factType);

    // 3. Insert fact
    const factId = await ctx.db.insert("facts", {
      content: args.content,
      source: args.source ?? "direct",
      entityIds: args.entityIds ?? [],
      tags: args.tags ?? [],
      factType,
      scopeId: args.scopeId,
      createdBy: args.createdBy,
      conversationId: args.conversationId,
      emotionalContext: args.emotionalContext,
      emotionalWeight: args.emotionalWeight,
      timestamp: Date.now(),
      relevanceScore: 1.0,
      accessedCount: 0,
      importanceScore,
      lifecycleState: "active",
    });

    // 4. Schedule async enrichment (Phase 3 — action not implemented yet)
    // await ctx.scheduler.runAfter(0, internal.actions.enrich.enrichFact, { factId });

    return { factId, importanceScore };
  },
});

export const bumpAccess = mutation({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) throw new Error(`Fact not found: ${factId}`);

    await ctx.db.patch(factId, {
      accessedCount: fact.accessedCount + 1,
      relevanceScore: Math.min(fact.relevanceScore + 0.1, 2.0),
      updatedAt: Date.now(),
    });
  },
});

// ─── Internal Mutations ──────────────────────────────────────────────

/** Stub for Phase 3: enrichment pipeline writes back embeddings, summaries, entities, importance. */
export const updateEnrichment = internalMutation({
  args: {
    factId: v.id("facts"),
    embedding: v.optional(v.array(v.float64())),
    factualSummary: v.optional(v.string()),
    entityIds: v.optional(v.array(v.string())),
    importanceScore: v.optional(v.float64()),
  },
  handler: async (ctx, { factId, ...fields }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) throw new Error(`Fact not found: ${factId}`);

    // Build patch with only provided fields
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.embedding !== undefined) patch.embedding = fields.embedding;
    if (fields.factualSummary !== undefined) patch.factualSummary = fields.factualSummary;
    if (fields.entityIds !== undefined) patch.entityIds = fields.entityIds;
    if (fields.importanceScore !== undefined) patch.importanceScore = fields.importanceScore;

    await ctx.db.patch(factId, patch);
  },
});
