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

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
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
    const perScopeLimit = Math.max(5, Math.ceil((args.limit ?? 20) / args.scopeIds.length));

    const results = await Promise.all(
      args.scopeIds.map((scopeId) =>
        ctx.db
          .query("facts")
          .withSearchIndex("search_content", (q) => {
            let s = q.search("content", args.query).eq("scopeId", scopeId);
            if (args.factType) s = s.eq("factType", args.factType);
            if (args.createdBy) s = s.eq("createdBy", args.createdBy);
            return s;
          })
          .take(perScopeLimit)
      )
    );
    const merged = results.flat();

    merged.sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0));
    return merged.slice(0, args.limit ?? 20);
  },
});

// vectorRecall moved to actions/vectorSearch.ts as vectorRecallAction
// vectorSearch() is action-only in Convex and cannot live in a query/mutation file

/** QA-pair search — searches the search_qa index on qaQuestion field.
 * Mirrors searchFactsMulti pattern: fan out per scope, merge, sort. */
export const searchByQA = query({
  args: {
    query: v.string(),
    scopeIds: v.array(v.id("memory_scopes")),
    factType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.scopeIds.length === 0) return [];
    const perScopeLimit = Math.max(5, Math.ceil((args.limit ?? 20) / args.scopeIds.length));

    const results = await Promise.all(
      args.scopeIds.map((scopeId) =>
        ctx.db
          .query("facts")
          .withSearchIndex("search_qa", (q) => {
            let s = q.search("qaQuestion", args.query).eq("scopeId", scopeId);
            if (args.factType) s = s.eq("factType", args.factType);
            return s;
          })
          .take(perScopeLimit)
      )
    );
    const merged = results.flat();
    merged.sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0));
    return merged.slice(0, args.limit ?? 20);
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

/** Get pinned facts by scope using the by_pinned_scope index (efficient). */
export const getPinnedFacts = query({
  args: { scopeId: v.id("memory_scopes") },
  handler: async (ctx, { scopeId }) => {
    return await ctx.db
      .query("facts")
      .withIndex("by_pinned_scope", (q) => q.eq("pinned", true).eq("scopeId", scopeId))
      .filter((q) => q.eq(q.field("lifecycleState"), "active"))
      .take(25);
  },
});

/** List pinned facts by scope. */
export const listPinnedByScope = query({
  args: {
    scopeId: v.id("memory_scopes"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { scopeId, limit }) => {
    return await ctx.db
      .query("facts")
      .withIndex("by_scope", (q) => q.eq("scopeId", scopeId))
      .filter((fact) => fact.pinned === true && fact.lifecycleState === "active")
      .take(limit ?? 100);
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

/** Count active facts older than N days for a given agent (used by action-recommendations cron). */
export const countStaleFacts = internalQuery({
  args: {
    agentId: v.string(),
    olderThanDays: v.optional(v.number()),
  },
  handler: async (ctx, { agentId, olderThanDays }) => {
    const ageMs = (olderThanDays ?? 90) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - ageMs;
    const rows = await ctx.db
      .query("facts")
      .withIndex("by_agent", (q) => q.eq("createdBy", agentId))
      .filter((q) =>
        q.and(
          q.eq(q.field("lifecycleState"), "active"),
          q.lt(q.field("timestamp"), cutoff)
        )
      )
      .take(200);
    return rows.length;
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

/** List active facts missing embeddings (used by embedding backfill cron). */
export const listFactsMissingEmbeddings = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const facts = await ctx.db
      .query("facts")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycleState", "active"))
      .take(limit ?? 50);
    return facts.filter((f) => !f.embedding || f.embedding.length === 0);
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
    pinned: v.optional(v.boolean()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Check write permission
    await checkWriteAccessHelper(ctx, args.scopeId, args.createdBy);

    // 2. Quick importance estimate based on factType
    const factType = args.factType ?? "observation";
    const importanceScore = estimateImportance(factType);
    const tokenEstimate = estimateTokens(args.content);

    // 3. Insert fact
    const factId = await ctx.db.insert("facts", {
      content: args.content,
      tokenEstimate,
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
      pinned: args.pinned,
      summary: args.summary,
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
    // 7. Mark vault index dirty so the next cron tick triggers a rebuild
    await ctx.scheduler.runAfter(0, internal.crons.regenerateIndices.markVaultIndexDirty, {});

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
          tokenEstimate: estimateTokens(args.content),
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
      tokenEstimate: estimateTokens(args.content),
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

/** Batch bump access counts in a single mutation (avoids N+1 round-trips). */
export const bumpAccessBatch = mutation({
  args: { factIds: v.array(v.id("facts")) },
  handler: async (ctx, { factIds }) => {
    const now = Date.now();
    let bumped = 0;
    for (const factId of factIds) {
      const fact = await ctx.db.get(factId);
      if (!fact) continue;
      await ctx.db.patch(factId, {
        accessedCount: fact.accessedCount + 1,
        relevanceScore: Math.min(fact.relevanceScore + 0.1, 2.0),
        updatedAt: now,
      });
      bumped++;
    }
    return { bumped };
  },
});

// ─── Internal Mutations ──────────────────────────────────────────────

/** Internal storeFact for use by Observer/Reflector actions (bypasses write-access check). */
export const storeFactInternal = internalMutation({
  args: {
    content: v.string(),
    source: v.string(),
    createdBy: v.string(),
    scopeId: v.id("memory_scopes"),
    factType: v.string(),
    tags: v.optional(v.array(v.string())),
    observationGeneration: v.optional(v.number()),
    observationSessionId: v.optional(v.id("observation_sessions")),
  },
  handler: async (ctx, args) => {
    const importanceScore = estimateImportance(args.factType);
    const factId = await ctx.db.insert("facts", {
      content: args.content,
      tokenEstimate: estimateTokens(args.content),
      source: args.source,
      entityIds: [],
      tags: args.tags ?? [],
      factType: args.factType,
      scopeId: args.scopeId,
      createdBy: args.createdBy,
      timestamp: Date.now(),
      relevanceScore: 1.0,
      accessedCount: 0,
      importanceScore,
      lifecycleState: "active",
      observationGeneration: args.observationGeneration,
      observationSessionId: args.observationSessionId,
    });
    // Schedule async enrichment
    await ctx.scheduler.runAfter(0, internal.actions.enrich.enrichFact, { factId });
    // Mark vault index dirty for auto-rebuild
    await ctx.scheduler.runAfter(0, internal.crons.regenerateIndices.markVaultIndexDirty, {});
    return { factId, importanceScore };
  },
});

/** Generic patch for enrichment sub-steps (e.g. temporal anchoring, QA generation). */
export const patchFact = internalMutation({
  args: {
    factId: v.id("facts"),
    fields: v.object({
      referencedDate: v.optional(v.number()),
      summary: v.optional(v.string()),
      qaQuestion: v.optional(v.string()),
      qaAnswer: v.optional(v.string()),
      qaEntities: v.optional(v.array(v.string())),
      qaConfidence: v.optional(v.float64()),
    }),
  },
  handler: async (ctx, { factId, fields }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) return; // fact removed before enrichment sub-step ran
    const updates: Record<string, unknown> = {};
    if (fields.referencedDate !== undefined) updates.referencedDate = fields.referencedDate;
    if (fields.summary !== undefined) updates.summary = fields.summary;
    if (fields.qaQuestion !== undefined) updates.qaQuestion = fields.qaQuestion;
    if (fields.qaAnswer !== undefined) updates.qaAnswer = fields.qaAnswer;
    if (fields.qaEntities !== undefined) updates.qaEntities = fields.qaEntities;
    if (fields.qaConfidence !== undefined) updates.qaConfidence = fields.qaConfidence;
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = Date.now();
      await ctx.db.patch(factId, updates);
    }
  },
});

/** Enrichment pipeline writes back embeddings, summaries, entities, importance. */
export const updateEnrichment = internalMutation({
  args: {
    factId: v.id("facts"),
    embedding: v.optional(v.array(v.float64())),
    factualSummary: v.optional(v.string()),
    summary: v.optional(v.string()),
    entityIds: v.optional(v.array(v.string())),
    importanceScore: v.optional(v.float64()),
  },
  handler: async (ctx, { factId, ...fields }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) throw new Error(`Fact not found: ${factId}`);

    // Build patch with only provided fields
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.embedding !== undefined) {
      await ctx.runMutation((internal as any).functions.subspaces.integrateNewFact, {
        factId,
        embedding: fields.embedding,
      });
    }
    if (fields.factualSummary !== undefined) patch.factualSummary = fields.factualSummary;
    if (fields.summary !== undefined) patch.summary = fields.summary;
    if (fields.entityIds !== undefined) patch.entityIds = fields.entityIds;
    if (fields.importanceScore !== undefined) patch.importanceScore = fields.importanceScore;

    if (
      fields.factualSummary !== undefined ||
      fields.summary !== undefined ||
      fields.entityIds !== undefined ||
      fields.importanceScore !== undefined
    ) {
      await ctx.db.patch(factId, patch);
    }
  },
});

// Helper used in contradiction detection (also used by forget cron)
function normalizeContent(content: string): string {
  return content.toLowerCase().replace(/\s+/g, " ").trim();
}

function detectContradictionInFact(a: string, b: string): boolean {
  const left = normalizeContent(a);
  const right = normalizeContent(b);
  const polarityPairs: Array<[string, string]> = [
    ["enabled", "disabled"],
    ["allow", "deny"],
    ["approved", "rejected"],
    ["success", "failed"],
    ["true", "false"],
    ["active", "inactive"],
    ["on", "off"],
  ];
  for (const [positive, negative] of polarityPairs) {
    if (
      (left.includes(positive) && right.includes(negative)) ||
      (left.includes(negative) && right.includes(positive))
    ) return true;
  }
  return false;
}

/** Pre-compute contradictions at enrichment time (called from enrichFact action). */
export const checkContradictions = internalMutation({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    const fact = await ctx.db.get(factId);
    if (!fact || !fact.entityIds?.length) return;

    const scopeFacts = await ctx.db
      .query("facts")
      .withIndex("by_scope", (q) => q.eq("scopeId", fact.scopeId))
      .filter((q) =>
        q.and(
          q.neq(q.field("_id"), factId),
          q.eq(q.field("lifecycleState"), "active"),
          q.gt(q.field("importanceScore"), fact.importanceScore ?? 0)
        )
      )
      .take(200);

    const contradictions = scopeFacts
      .filter(
        (other) =>
          fact.entityIds.some((e: string) => (other.entityIds ?? []).includes(e)) &&
          detectContradictionInFact(fact.content, other.content)
      )
      .map((other) => other._id);

    if (contradictions.length > 0) {
      await ctx.db.patch(factId, {
        contradictsWith: contradictions,
        lastContradictionCheck: Date.now(),
      });
    }
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
    if (fields.content !== undefined) patch.tokenEstimate = estimateTokens(fields.content);
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
  args: {
    factId: v.id("facts"),
    changedBy: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { factId, changedBy, reason }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) return;
    // Snapshot current state before archiving (inline insert — same transaction)
    await ctx.db.insert("fact_versions", {
      factId,
      previousContent: fact.content,
      previousImportance: fact.importanceScore,
      previousTags: fact.tags,
      changedBy: changedBy ?? "system",
      changeType: "archive",
      reason,
      createdAt: Date.now(),
    });
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
    pinned: v.optional(v.boolean()),
    summary: v.optional(v.string()),
    agentId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { factId, content, tags, factType, pinned, summary, agentId, reason }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) throw new Error(`Fact not found: ${factId}`);
    const now = Date.now();

    // Snapshot current state BEFORE patching (same transaction — atomic rollback)
    await ctx.runMutation(internal.functions.factVersions.createVersion, {
      factId,
      previousContent: fact.content,
      previousImportance: fact.importanceScore,
      previousTags: fact.tags,
      changedBy: agentId ?? "system",
      changeType: "update",
      reason,
    });

    const patch: Record<string, unknown> = { updatedAt: now };
    if (content !== undefined) patch.content = content;
    if (content !== undefined) patch.tokenEstimate = estimateTokens(content);
    if (tags !== undefined) patch.tags = tags;
    if (factType !== undefined) patch.factType = factType;
    if (pinned !== undefined) patch.pinned = pinned;
    if (summary !== undefined) patch.summary = summary;
    await ctx.db.patch(factId, patch);
    await ctx.runMutation(internal.functions.events.emit, {
      eventType: "fact.updated",
      factId,
      scopeId: fact.scopeId,
      agentId: agentId ?? fact.createdBy,
      payload: { factType: factType ?? fact.factType },
    });
    return { updated: true };
  },
});

export const archiveFactPublic = mutation({
  args: {
    factId: v.id("facts"),
    agentId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { factId, agentId, reason }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) throw new Error(`Fact not found: ${factId}`);
    const now = Date.now();

    // Snapshot current state BEFORE archiving
    await ctx.runMutation(internal.functions.factVersions.createVersion, {
      factId,
      previousContent: fact.content,
      previousImportance: fact.importanceScore,
      previousTags: fact.tags,
      changedBy: agentId ?? "system",
      changeType: "archive",
      reason,
    });

    await ctx.db.patch(factId, {
      lifecycleState: "archived",
      updatedAt: now,
    });
    await ctx.runMutation(internal.functions.events.emit, {
      eventType: "fact.archived",
      factId,
      scopeId: fact.scopeId,
      agentId: agentId ?? fact.createdBy,
      payload: { reason: reason ?? "archive" },
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
    agentId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { factIds, agentId, reason }) => {
    const now = Date.now();
    let pruned = 0;
    for (const factId of factIds) {
      const fact = await ctx.db.get(factId);
      if (fact && fact.lifecycleState !== "pruned") {
        // Snapshot before pruning (inline insert for batch efficiency)
        await ctx.db.insert("fact_versions", {
          factId,
          previousContent: fact.content,
          previousImportance: fact.importanceScore,
          previousTags: fact.tags,
          changedBy: agentId ?? "system",
          changeType: "archive",
          reason,
          createdAt: now,
        });
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
    agentId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { sourceFactIds, targetFactId, agentId, reason }) => {
    const now = Date.now();
    for (const factId of sourceFactIds) {
      if (factId === targetFactId) continue;
      const fact = await ctx.db.get(factId);
      if (!fact) continue;
      // Snapshot before merging (inline insert for batch efficiency)
      await ctx.db.insert("fact_versions", {
        factId,
        previousContent: fact.content,
        previousImportance: fact.importanceScore,
        previousTags: fact.tags,
        changedBy: agentId ?? "system",
        changeType: "merge",
        reason,
        createdAt: now,
      });
      await ctx.db.patch(factId, {
        lifecycleState: "merged",
        mergedInto: targetFactId,
        updatedAt: now,
      });
    }
    return { merged: sourceFactIds.length };
  },
});

// ─── Observation Session Queries/Mutations ──────────────────────────

export const getObservationSession = query({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
  },
  handler: async (ctx, { scopeId, agentId }) => {
    return await ctx.db
      .query("observation_sessions")
      .withIndex("by_scope_agent", (q) => q.eq("scopeId", scopeId).eq("agentId", agentId))
      .first();
  },
});

/** Internal version for use by actions. */
export const getObservationSessionInternal = internalQuery({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
  },
  handler: async (ctx, { scopeId, agentId }) => {
    return await ctx.db
      .query("observation_sessions")
      .withIndex("by_scope_agent", (q) => q.eq("scopeId", scopeId).eq("agentId", agentId))
      .first();
  },
});

export const upsertObservationSession = internalMutation({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
    pendingTokenEstimate: v.optional(v.number()),
    summaryTokenEstimate: v.optional(v.number()),
    observerThreshold: v.optional(v.number()),
    reflectorThreshold: v.optional(v.number()),
    lastObserverRun: v.optional(v.number()),
    lastReflectorRun: v.optional(v.number()),
    observerGeneration: v.optional(v.number()),
    reflectorGeneration: v.optional(v.number()),
    compressionLevel: v.optional(v.number()),
    bufferFactId: v.optional(v.id("facts")),
    bufferReady: v.optional(v.boolean()),
    bufferTokenEstimate: v.optional(v.number()),
    lastObserverFingerprint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("observation_sessions")
      .withIndex("by_scope_agent", (q) => q.eq("scopeId", args.scopeId).eq("agentId", args.agentId))
      .first();

    const now = Date.now();
    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: now };
      if (args.pendingTokenEstimate !== undefined) patch.pendingTokenEstimate = args.pendingTokenEstimate;
      if (args.summaryTokenEstimate !== undefined) patch.summaryTokenEstimate = args.summaryTokenEstimate;
      if (args.observerThreshold !== undefined) patch.observerThreshold = args.observerThreshold;
      if (args.reflectorThreshold !== undefined) patch.reflectorThreshold = args.reflectorThreshold;
      if (args.lastObserverRun !== undefined) patch.lastObserverRun = args.lastObserverRun;
      if (args.lastReflectorRun !== undefined) patch.lastReflectorRun = args.lastReflectorRun;
      if (args.observerGeneration !== undefined) patch.observerGeneration = args.observerGeneration;
      if (args.reflectorGeneration !== undefined) patch.reflectorGeneration = args.reflectorGeneration;
      if (args.compressionLevel !== undefined) patch.compressionLevel = args.compressionLevel;
      if (args.bufferFactId !== undefined) patch.bufferFactId = args.bufferFactId;
      if (args.bufferReady !== undefined) patch.bufferReady = args.bufferReady;
      if (args.bufferTokenEstimate !== undefined) patch.bufferTokenEstimate = args.bufferTokenEstimate;
      if (args.lastObserverFingerprint !== undefined) patch.lastObserverFingerprint = args.lastObserverFingerprint;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("observation_sessions", {
      scopeId: args.scopeId,
      agentId: args.agentId,
      pendingTokenEstimate: args.pendingTokenEstimate ?? 0,
      summaryTokenEstimate: args.summaryTokenEstimate ?? 0,
      observerThreshold: args.observerThreshold ?? 10000,
      reflectorThreshold: args.reflectorThreshold ?? 20000,
      observerGeneration: args.observerGeneration ?? 0,
      reflectorGeneration: args.reflectorGeneration ?? 0,
      compressionLevel: args.compressionLevel ?? 0,
      bufferReady: args.bufferReady ?? false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const incrementPendingTokens = internalMutation({
  args: {
    sessionId: v.id("observation_sessions"),
    tokenDelta: v.number(),
  },
  handler: async (ctx, { sessionId, tokenDelta }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return;
    await ctx.db.patch(sessionId, {
      pendingTokenEstimate: session.pendingTokenEstimate + tokenDelta,
      updatedAt: Date.now(),
    });
  },
});

/** Public wrapper for incrementPendingTokens (used by MCP server). */
export const incrementPendingTokensPublic = mutation({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
    tokenDelta: v.number(),
  },
  handler: async (ctx, { scopeId, agentId, tokenDelta }) => {
    const session = await ctx.db
      .query("observation_sessions")
      .withIndex("by_scope_agent", (q) => q.eq("scopeId", scopeId).eq("agentId", agentId))
      .first();

    if (session) {
      await ctx.db.patch(session._id, {
        pendingTokenEstimate: session.pendingTokenEstimate + tokenDelta,
        updatedAt: Date.now(),
      });
      return session._id;
    }

    // Auto-create session if it doesn't exist
    return await ctx.db.insert("observation_sessions", {
      scopeId,
      agentId,
      pendingTokenEstimate: Math.max(0, tokenDelta),
      summaryTokenEstimate: 0,
      observerThreshold: 10000,
      reflectorThreshold: 20000,
      observerGeneration: 0,
      reflectorGeneration: 0,
      compressionLevel: 0,
      bufferReady: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/** Public wrapper for upsertObservationSession (used by MCP server). */
export const upsertObservationSessionPublic = mutation({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
    observerThreshold: v.optional(v.number()),
    reflectorThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("observation_sessions")
      .withIndex("by_scope_agent", (q) => q.eq("scopeId", args.scopeId).eq("agentId", args.agentId))
      .first();

    const now = Date.now();
    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: now };
      if (args.observerThreshold !== undefined) patch.observerThreshold = args.observerThreshold;
      if (args.reflectorThreshold !== undefined) patch.reflectorThreshold = args.reflectorThreshold;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("observation_sessions", {
      scopeId: args.scopeId,
      agentId: args.agentId,
      pendingTokenEstimate: 0,
      summaryTokenEstimate: 0,
      observerThreshold: args.observerThreshold ?? 10000,
      reflectorThreshold: args.reflectorThreshold ?? 20000,
      observerGeneration: 0,
      reflectorGeneration: 0,
      compressionLevel: 0,
      bufferReady: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** List uncompressed observations for a scope+agent (active, factType=observation). */
export const listUncompressedObservations = internalQuery({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { scopeId, agentId, limit }) => {
    return await ctx.db
      .query("facts")
      .withIndex("by_scope", (q) => q.eq("scopeId", scopeId))
      .filter((q) =>
        q.and(
          q.eq(q.field("factType"), "observation"),
          q.eq(q.field("lifecycleState"), "active"),
          q.eq(q.field("createdBy"), agentId)
        )
      )
      .order("desc")
      .take(limit ?? 200);
  },
});

/** List observation summaries for a scope+agent. */
export const listObservationSummaries = internalQuery({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { scopeId, agentId, limit }) => {
    return await ctx.db
      .query("facts")
      .withIndex("by_scope", (q) => q.eq("scopeId", scopeId))
      .filter((q) =>
        q.and(
          q.eq(q.field("factType"), "observation_summary"),
          q.eq(q.field("lifecycleState"), "active"),
          q.eq(q.field("createdBy"), agentId)
        )
      )
      .order("desc")
      .take(limit ?? 50);
  },
});

/** Public wrapper for listObservationSummaries. */
export const listObservationSummariesPublic = query({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { scopeId, agentId, limit }) => {
    return await ctx.db
      .query("facts")
      .withIndex("by_scope", (q) => q.eq("scopeId", scopeId))
      .filter((q) =>
        q.and(
          q.eq(q.field("factType"), "observation_summary"),
          q.eq(q.field("lifecycleState"), "active"),
          q.eq(q.field("createdBy"), agentId)
        )
      )
      .order("desc")
      .take(limit ?? 50);
  },
});

/** Update lifecycle state with optional mergedInto pointer. */
export const updateLifecycleWithMerge = internalMutation({
  args: {
    factId: v.id("facts"),
    lifecycleState: v.string(),
    mergedInto: v.optional(v.id("facts")),
  },
  handler: async (ctx, { factId, lifecycleState, mergedInto }) => {
    const patch: Record<string, unknown> = { lifecycleState, updatedAt: Date.now() };
    if (mergedInto !== undefined) patch.mergedInto = mergedInto;
    await ctx.db.patch(factId, patch);
  },
});

/** List all observation sessions (used by observer sweep cron). */
export const listObservationSessions = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("observation_sessions").collect();
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
