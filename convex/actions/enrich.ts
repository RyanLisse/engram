"use node";

/**
 * Main enrichment pipeline orchestrator.
 * Runs asynchronously after a fact is stored.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { generateEmbedding } from "./embed";
import { calculateImportanceWithWeights } from "./importance";

/**
 * Main enrichment pipeline - scheduled by storeFact mutation.
 * Runs steps sequentially:
 * 1. Get the fact
 * 2. Generate embedding (Cohere Embed 4)
 * 3. Calculate importance score
 * 4. Write enrichment results back
 *
 * Future phases will add:
 * - Semantic compression
 * - Synthesis check (find similar facts)
 * - Entity extraction
 */
export const enrichFact = internalAction({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    // 1. Get the fact using internal query
    const fact = await ctx.runQuery(
      internal.functions.facts.getFactInternal,
      { factId }
    );

    if (!fact) {
      console.error(`Fact not found: ${factId}`);
      return;
    }

    // 2. Skip if already enriched (idempotency check)
    if (fact.embedding && fact.embedding.length > 0) {
      console.log(`Fact ${factId} already enriched, skipping`);
      return;
    }

    // 3. Generate embedding via Cohere
    console.log(`Generating embedding for fact ${factId}`);
    const embedding = await generateEmbedding(fact.content);

    // 4. Calculate refined importance score
    const systemImportance = await ctx.runQuery(internal.functions.config.getConfig, {
      key: "importance_weights",
    });
    const weights =
      systemImportance && typeof systemImportance.value === "object"
        ? (systemImportance.value as Record<string, number>)
        : undefined;
    const importanceScore = calculateImportanceWithWeights(
      {
      factType: fact.factType,
      emotionalWeight: fact.emotionalWeight,
      entityIds: fact.entityIds,
      content: fact.content,
      },
      weights ?? {
        decision: 0.8,
        error: 0.7,
        insight: 0.75,
        correction: 0.7,
        steering_rule: 0.85,
        learning: 0.65,
        session_summary: 0.6,
        plan: 0.6,
        observation: 0.5,
      }
    );

    // 5. Write enrichment results back
    await ctx.runMutation(internal.functions.facts.updateEnrichment, {
      factId,
      embedding,
      importanceScore,
    });
    await ctx.runMutation(internal.functions.events.emit, {
      eventType: "fact.enriched",
      factId,
      scopeId: fact.scopeId,
      agentId: fact.createdBy,
      payload: { importanceScore },
    });

    // 6. Route fact notifications to relevant agents
    await ctx.scheduler.runAfter(0, internal.actions.route.routeToAgents, {
      factId,
    });

    console.log(
      `Enriched fact ${factId}: embedding (${embedding.length}d), ` +
      `importance: ${importanceScore.toFixed(3)}`
    );
  },
});
