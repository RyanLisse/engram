import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
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

export const searchFactsMulti = query({
  args: {
    query: v.string(),
    scopeIds: v.array(v.id("memory_scopes")),
    factType: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.scopeIds.length === 0) return [];
    const merged: any[] = [];
    const perScopeLimit = Math.max(5, Math.ceil((args.limit ?? 20) / args.scopeIds.length));

    for (const scopeId of args.scopeIds) {
      const rows = await ctx.db
        .query("facts")
        .withSearchIndex("search_content", (q) => {
          let s = q.search("content", args.query).eq("scopeId", scopeId);
          if (args.factType) s = s.eq("factType", args.factType);
          if (args.createdBy) s = s.eq("createdBy", args.createdBy);
          return s;
        })
        .take(perScopeLimit);
      merged.push(...rows);
    }

    merged.sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0));
    return merged.slice(0, args.limit ?? 20);
  },
});

export const vectorRecall = query({
  args: {
    embedding: v.array(v.float64()),
    scopeIds: v.array(v.id("memory_scopes")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { embedding, scopeIds, limit }) => {
    if (scopeIds.length === 0) return [];
    const all: any[] = [];
    const perScopeLimit = Math.max(5, Math.ceil((limit ?? 20) / scopeIds.length));

    for (const scopeId of scopeIds) {
      const rows = await ctx.vectorSearch("facts", "vector_search", {
        vector: embedding,
        limit: perScopeLimit,
        filter: (q) => q.eq("scopeId", scopeId),
      });
      all.push(...rows);
    }

    all.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
    return all.slice(0, limit ?? 20);
  },
});

/**
 * Get recent session handoff summaries from other agents.
 * Used by memory_get_context to warm-start with cross-agent context.
 */
export const getRecentHandoffs = query({
  args: {
    currentAgentId: v.string(),
    scopeIds: v.array(v.id("memory_scopes")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { currentAgentId, scopeIds, limit }) => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Get session_summary facts from other agents in permitted scopes
    const handoffs = await ctx.db
      .query("facts")
      .withIndex("by_type", (q) => q.eq("factType", "session_summary"))
      .filter((q) =>
        q.and(
          q.neq(q.field("createdBy"), currentAgentId),
          q.gte(q.field("timestamp"), sevenDaysAgo),
          q.or(...scopeIds.map(id => q.eq(q.field("scopeId"), id)))
        )
      )
      .order("desc")
      .take(limit ?? 5);

    return handoffs.map(fact => ({
      conversationId: fact.conversationId,
      fromAgent: fact.createdBy,
      summary: fact.content,
      timestamp: fact.timestamp,
    }));
  },
});

/** List facts by scope (public, used by MCP prune tool). */
export const listByScopePublic = query({
  args: {
    scopeId: v.id("memory_scopes"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { scopeId, limit }) => {
    return await ctx.db
      .query("facts")
      .withIndex("by_scope", (q) => q.eq("scopeId", scopeId))
      .take(limit ?? 1000);
  },
});

/** List facts that have not yet been mirrored into the markdown vault. */
export const getUnmirrored = query({
  args: {
    scopeId: v.optional(v.id("memory_scopes")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { scopeId, limit }) => {
    const candidates = await ctx.db
      .query("facts")
      .withIndex("unmirrored", (q) =>
        q.eq("vaultPath", undefined).eq("lifecycleState", "active")
      )
      .take(limit ?? 200);

    if (!scopeId) return candidates;
    return candidates.filter((fact) => fact.scopeId === scopeId);
  },
});

// ─── Internal Queries ────────────────────────────────────────────────

/** Internal query to get a fact by ID (used by actions and crons). */
export const getFactInternal = internalQuery({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    return await ctx.db.get(factId);
  },
});

/** List facts by scope with pagination (used by crons). */
export const listByScope = internalQuery({
  args: {
    scopeId: v.id("memory_scopes"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { scopeId, limit }) => {
    return await ctx.db
      .query("facts")
      .withIndex("by_scope", (q) => q.eq("scopeId", scopeId))
      .take(limit ?? 100);
  },
});

/** List facts by lifecycle state (used by crons). */
export const listByLifecycle = internalQuery({
  args: {
    lifecycleState: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { lifecycleState, limit }) => {
    return await ctx.db
      .query("facts")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycleState", lifecycleState))
      .take(limit ?? 100);
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
    confidence: v.optional(v.float64()),
    importanceTier: v.optional(v.string()),
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
      confidence: args.confidence,
      importanceTier: args.importanceTier,
      timestamp: Date.now(),
      relevanceScore: 1.0,
      accessedCount: 0,
      importanceScore,
      lifecycleState: "active",
    });

    // 4. Schedule async enrichment (runs immediately after response)
    await ctx.scheduler.runAfter(0, internal.actions.enrich.enrichFact, { factId });
    // 5. Schedule non-blocking vault mirror signal
    await ctx.scheduler.runAfter(0, internal.actions.mirrorToVault.mirrorToVault, {
      factId,
    });
    // 6. Emit memory event for propagation polling
    await ctx.runMutation(internal.functions.events.emit, {
      eventType: "fact.stored",
      factId,
      scopeId: args.scopeId,
      agentId: args.createdBy,
      payload: { factType },
    });

    return { factId, importanceScore };
  },
});

/** Mark fact as mirrored to a specific vault path. */
export const updateVaultPath = mutation({
  args: {
    factId: v.id("facts"),
    vaultPath: v.string(),
    vaultSyncedAt: v.optional(v.number()),
  },
  handler: async (ctx, { factId, vaultPath, vaultSyncedAt }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) throw new Error(`Fact not found: ${factId}`);
    await ctx.db.patch(factId, {
      vaultPath,
      vaultSyncedAt: vaultSyncedAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/** Apply a human edit pulled from the vault file system. */
export const applyVaultEdit = mutation({
  args: {
    factId: v.optional(v.id("facts")),
    content: v.string(),
    scopeId: v.id("memory_scopes"),
    createdBy: v.string(),
    tags: v.optional(v.array(v.string())),
    entityIds: v.optional(v.array(v.string())),
    vaultPath: v.string(),
    updatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.updatedAt ?? Date.now();

    if (args.factId) {
      const fact = await ctx.db.get(args.factId);
      if (fact) {
        await ctx.db.patch(args.factId, {
          content: args.content,
          tags: args.tags ?? fact.tags,
          entityIds: args.entityIds ?? fact.entityIds,
          vaultPath: args.vaultPath,
          vaultSyncedAt: now,
          updatedAt: now,
        });
        return { factId: args.factId, created: false };
      }
    }

    const factId = await ctx.db.insert("facts", {
      content: args.content,
      source: "import",
      entityIds: args.entityIds ?? [],
      tags: args.tags ?? [],
      factType: "observation",
      scopeId: args.scopeId,
      createdBy: args.createdBy,
      timestamp: now,
      relevanceScore: 1.0,
      accessedCount: 0,
      importanceScore: 0.5,
      lifecycleState: "active",
      vaultPath: args.vaultPath,
      vaultSyncedAt: now,
      updatedAt: now,
    });
    return { factId, created: true };
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

/** Enrichment pipeline writes back embeddings, summaries, entities, importance. */
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

/** Internal mutation for observation tiering/compression pipeline fields. */
export const updateObservationFields = internalMutation({
  args: {
    factId: v.id("facts"),
    observationTier: v.optional(v.string()),
    observationCompressed: v.optional(v.boolean()),
    observationOriginalContent: v.optional(v.string()),
    importanceTier: v.optional(v.string()),
    confidence: v.optional(v.float64()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, { factId, ...fields }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) throw new Error(`Fact not found: ${factId}`);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.observationTier !== undefined) patch.observationTier = fields.observationTier;
    if (fields.observationCompressed !== undefined) patch.observationCompressed = fields.observationCompressed;
    if (fields.observationOriginalContent !== undefined) {
      patch.observationOriginalContent = fields.observationOriginalContent;
    }
    if (fields.importanceTier !== undefined) patch.importanceTier = fields.importanceTier;
    if (fields.confidence !== undefined) patch.confidence = fields.confidence;
    if (fields.content !== undefined) patch.content = fields.content;
    await ctx.db.patch(factId, patch);
  },
});

/** Update lifecycle state (used by crons). */
export const updateLifecycleState = internalMutation({
  args: {
    factId: v.id("facts"),
    lifecycleState: v.string(),
  },
  handler: async (ctx, { factId, lifecycleState }) => {
    await ctx.db.patch(factId, { lifecycleState, updatedAt: Date.now() });
  },
});

/** Update forget score (used by decay cron). */
export const updateForgetScore = internalMutation({
  args: {
    factId: v.id("facts"),
    forgetScore: v.float64(),
  },
  handler: async (ctx, { factId, forgetScore }) => {
    await ctx.db.patch(factId, { forgetScore, updatedAt: Date.now() });
  },
});

/** Update relevance score (used by rerank cron). */
export const updateRelevanceScore = internalMutation({
  args: {
    factId: v.id("facts"),
    relevanceScore: v.float64(),
  },
  handler: async (ctx, { factId, relevanceScore }) => {
    await ctx.db.patch(factId, { relevanceScore, updatedAt: Date.now() });
  },
});

/** Archive a fact (sets lifecycle to archived). */
export const archiveFact = internalMutation({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    await ctx.db.patch(factId, {
      lifecycleState: "archived",
      updatedAt: Date.now(),
    });
  },
});

export const updateFact = mutation({
  args: {
    factId: v.id("facts"),
    content: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    factType: v.optional(v.string()),
  },
  handler: async (ctx, { factId, content, tags, factType }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) throw new Error(`Fact not found: ${factId}`);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (content !== undefined) patch.content = content;
    if (tags !== undefined) patch.tags = tags;
    if (factType !== undefined) patch.factType = factType;
    await ctx.db.patch(factId, patch);
    return { updated: true };
  },
});

export const archiveFactPublic = mutation({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) throw new Error(`Fact not found: ${factId}`);
    await ctx.db.patch(factId, {
      lifecycleState: "archived",
      updatedAt: Date.now(),
    });
    return { archived: true };
  },
});

export const boostRelevance = mutation({
  args: {
    factId: v.id("facts"),
    boost: v.optional(v.float64()),
  },
  handler: async (ctx, { factId, boost }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) throw new Error(`Fact not found: ${factId}`);
    const delta = boost ?? 0.15;
    const next = Math.min(2.0, fact.relevanceScore + delta);
    await ctx.db.patch(factId, { relevanceScore: next, updatedAt: Date.now() });
    return { relevanceScore: next };
  },
});

// ─── Public Mutations (agent-accessible) ────────────────────────────

/** Mark facts as pruned (soft-delete, never true-delete). */
export const markPruned = mutation({
  args: {
    factIds: v.array(v.id("facts")),
  },
  handler: async (ctx, { factIds }) => {
    const now = Date.now();
    let pruned = 0;
    for (const factId of factIds) {
      const fact = await ctx.db.get(factId);
      if (fact && fact.lifecycleState !== "pruned") {
        await ctx.db.patch(factId, { lifecycleState: "pruned", updatedAt: now });
        pruned++;
      }
    }
    return { pruned };
  },
});

export const listStaleFacts = query({
  args: {
    scopeId: v.optional(v.id("memory_scopes")),
    olderThanDays: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { scopeId, olderThanDays, limit }) => {
    const ageMs = (olderThanDays ?? 90) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - ageMs;
    let rows = await ctx.db
      .query("facts")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycleState", "active"))
      .filter((q) => q.lt(q.field("timestamp"), cutoff))
      .take(limit ?? 200);
    if (scopeId) rows = rows.filter((r) => r.scopeId === scopeId);
    return rows;
  },
});

export const markFactsMerged = mutation({
  args: {
    sourceFactIds: v.array(v.id("facts")),
    targetFactId: v.id("facts"),
  },
  handler: async (ctx, { sourceFactIds, targetFactId }) => {
    const now = Date.now();
    for (const factId of sourceFactIds) {
      if (factId === targetFactId) continue;
      await ctx.db.patch(factId, {
        lifecycleState: "merged",
        mergedInto: targetFactId,
        updatedAt: now,
      });
    }
    return { merged: sourceFactIds.length };
  },
});

export const updateOutcomeFromFeedback = mutation({
  args: {
    factId: v.id("facts"),
    signalValue: v.float64(),
  },
  handler: async (ctx, { factId, signalValue }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) throw new Error(`Fact not found: ${factId}`);
    const current = fact.outcomeScore ?? 0.5;
    const alpha = 0.25;
    const normalized = Math.max(0, Math.min(1, signalValue));
    const next = current * (1 - alpha) + normalized * alpha;
    await ctx.db.patch(factId, { outcomeScore: next, updatedAt: Date.now() });
    return { outcomeScore: next };
  },
});
