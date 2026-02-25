/**
 * Retroactive Enrichment — Re-project recent facts onto updated subspaces
 *
 * When a subspace is expanded (new principal direction added) or re-merged,
 * older facts may benefit from being re-projected onto the updated basis.
 * This is "backward transfer" — new knowledge improves representation of old facts.
 *
 * Algorithm:
 * 1. Find facts in the subspace from the last N days
 * 2. Re-project each fact's embedding onto the updated subspace
 * 3. If the coefficient change exceeds a threshold, log an enrichment event
 */

import { v } from "convex/values";
import { mutation, internalMutation, internalQuery, query } from "../_generated/server";

const CHANGE_THRESHOLD = 0.1;

/** Query facts in a subspace that were created within daysBack. */
export const getRecentSubspaceFacts = internalQuery({
  args: {
    factIds: v.array(v.id("facts")),
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, { factIds, daysBack }) => {
    const cutoff = Date.now() - (daysBack ?? 30) * 24 * 60 * 60 * 1000;
    const results: Array<{ _id: any; embedding: number[]; timestamp: number }> = [];

    for (const factId of factIds) {
      const fact = await ctx.db.get(factId);
      if (
        fact &&
        fact.lifecycleState === "active" &&
        fact.embedding?.length &&
        fact.timestamp >= cutoff
      ) {
        results.push({
          _id: fact._id,
          embedding: fact.embedding,
          timestamp: fact.timestamp,
        });
      }
    }

    return results;
  },
});

/**
 * Log retroactive enrichment events for facts that were re-projected.
 * Called after subspace expansion or re-merge.
 */
export const logRetroactiveEnrichment = internalMutation({
  args: {
    subspaceId: v.id("knowledge_subspaces"),
    enrichedFactIds: v.array(v.id("facts")),
    agentId: v.string(),
    trigger: v.string(), // "expansion" | "remerge" | "manual"
  },
  handler: async (ctx, { subspaceId, enrichedFactIds, agentId, trigger }) => {
    const now = Date.now();

    // Get next watermark
    const lastEvent = await ctx.db
      .query("memory_events")
      .withIndex("by_watermark")
      .order("desc")
      .first();
    const watermark = (lastEvent?.watermark ?? 0) + 1;

    // Log one enrichment event per batch (not per-fact, to avoid event spam).
    // Fact IDs are stored as comma-delimited string since payload values are scalar.
    await ctx.db.insert("memory_events", {
      eventType: "retroactive_enrichment",
      agentId,
      payload: {
        subspaceId: String(subspaceId),
        trigger,
        enrichedCount: enrichedFactIds.length,
        factIds: enrichedFactIds.join(","),
      },
      watermark,
      createdAt: now,
    });

    return { logged: enrichedFactIds.length, trigger };
  },
});

/**
 * Check if a fact was recently enriched (for recall boost).
 * Returns true if there's a retroactive_enrichment event in the last N days
 * that includes facts from the given scope.
 */
export const hasRecentEnrichment = internalQuery({
  args: {
    scopeId: v.optional(v.id("memory_scopes")),
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, { scopeId, daysBack }) => {
    const cutoff = Date.now() - (daysBack ?? 7) * 24 * 60 * 60 * 1000;

    const events = await ctx.db
      .query("memory_events")
      .withIndex("by_created")
      .filter((q) =>
        q.and(
          q.eq(q.field("eventType"), "retroactive_enrichment"),
          q.gte(q.field("createdAt"), cutoff)
        )
      )
      .take(50);

    if (scopeId) {
      return events.filter((e) => e.scopeId === scopeId).length > 0;
    }

    return events.length > 0;
  },
});

/**
 * Public query: return the set of fact IDs that were retroactively enriched
 * within the last N days. Used by recall tools to apply a 1.2x boost.
 */
export const getRecentlyEnrichedFactIds = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, { daysBack }) => {
    const cutoff = Date.now() - (daysBack ?? 7) * 24 * 60 * 60 * 1000;

    const events = await ctx.db
      .query("memory_events")
      .withIndex("by_created")
      .filter((q) =>
        q.and(
          q.eq(q.field("eventType"), "retroactive_enrichment"),
          q.gte(q.field("createdAt"), cutoff)
        )
      )
      .take(100);

    const factIds = new Set<string>();
    for (const event of events) {
      const raw = event.payload?.factIds;
      if (typeof raw === "string" && raw.length > 0) {
        for (const id of raw.split(",")) {
          if (id.trim()) factIds.add(id.trim());
        }
      }
    }

    return { factIds: [...factIds] };
  },
});

/**
 * Retroactively re-project recent facts onto the subspace's current principal vectors.
 *
 * When a subspace gains a new principal direction (via expansion or re-merge), facts
 * that were projected onto the old basis have stale compactEmbeddings. This mutation
 * finds recent facts (with full embeddings) in the subspace, re-projects them, and
 * updates any whose coefficient vector has drifted beyond CHANGE_THRESHOLD (L2 distance).
 *
 * Only facts that still have their full `embedding` field can be precisely re-projected.
 * Facts that have already had `embedding` cleared (fully compacted) are skipped — their
 * compactEmbedding remains a valid approximate representation.
 */
export const retroactiveReproject = mutation({
  args: {
    subspaceId: v.id("knowledge_subspaces"),
    daysBack: v.optional(v.number()),
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, { subspaceId, daysBack, agentId }) => {
    const subspace = await ctx.db.get(subspaceId);
    if (!subspace) throw new Error(`Subspace not found: ${subspaceId}`);

    const principalVectors = subspace.principalVectors ?? [];
    const centroid = subspace.centroid ?? [];
    const k = principalVectors.length;

    if (k === 0) {
      return { enriched: 0, skipped: 0, reason: "No principal vectors" };
    }

    const cutoff = Date.now() - (daysBack ?? 30) * 24 * 60 * 60 * 1000;
    const effectiveAgentId = agentId ?? subspace.agentId;
    const now = Date.now();

    const enrichedIds: string[] = [];
    let skipped = 0;

    for (const factId of subspace.factIds) {
      const fact = await ctx.db.get(factId);

      // Skip: missing, non-active, outside time window, or already lost full embedding
      if (
        !fact ||
        fact.lifecycleState !== "active" ||
        fact.timestamp < cutoff ||
        !fact.embedding ||
        fact.embedding.length === 0
      ) {
        skipped++;
        continue;
      }

      // Center the embedding: centered[j] = embedding[j] - centroid[j]
      const embedding = fact.embedding;
      const centered: number[] = new Array(embedding.length);
      for (let j = 0; j < embedding.length; j++) {
        centered[j] = embedding[j] - (centroid[j] ?? 0);
      }

      // Project onto each principal vector: coeff[i] = dot(centered, principalVectors[i])
      const newCoefficients: number[] = new Array(k);
      for (let i = 0; i < k; i++) {
        const pv = principalVectors[i];
        let sum = 0;
        for (let j = 0; j < centered.length; j++) {
          sum += (pv[j] ?? 0) * centered[j];
        }
        newCoefficients[i] = sum;
      }

      // Measure drift: L2 distance between old and new compact coefficients
      const oldCoefficients = fact.compactEmbedding ?? [];
      const maxLen = Math.max(oldCoefficients.length, newCoefficients.length);
      let distSq = 0;
      for (let i = 0; i < maxLen; i++) {
        const diff = (newCoefficients[i] ?? 0) - (oldCoefficients[i] ?? 0);
        distSq += diff * diff;
      }
      const dist = Math.sqrt(distSq);

      if (dist > CHANGE_THRESHOLD) {
        await ctx.db.patch(factId, {
          compactEmbedding: newCoefficients,
          updatedAt: now,
        });
        enrichedIds.push(factId);
      } else {
        skipped++;
      }
    }

    // Log one memory_event for the entire batch (not per-fact, to avoid event spam)
    if (enrichedIds.length > 0) {
      const lastEvent = await ctx.db
        .query("memory_events")
        .withIndex("by_watermark")
        .order("desc")
        .first();
      const watermark = (lastEvent?.watermark ?? 0) + 1;
      await ctx.db.insert("memory_events", {
        eventType: "retroactive_enrichment",
        agentId: effectiveAgentId,
        payload: {
          subspaceId: String(subspaceId),
          trigger: "manual",
          enrichedCount: enrichedIds.length,
          factIds: enrichedIds.join(","),
        },
        watermark,
        createdAt: now,
      });
    }

    return {
      enriched: enrichedIds.length,
      skipped,
      subspaceId,
    };
  },
});
