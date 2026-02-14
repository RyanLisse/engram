"use node";

/**
 * Main enrichment pipeline orchestrator.
 * Runs asynchronously after a fact is stored.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { generateEmbedding } from "./embed";
import { calculateImportance } from "./importance";

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
    const importanceScore = calculateImportance({
      factType: fact.factType,
      emotionalWeight: fact.emotionalWeight,
      entityIds: fact.entityIds,
      content: fact.content,
    });

    // 5. Write enrichment results back
    await ctx.runMutation(internal.functions.facts.updateEnrichment, {
      factId,
      embedding,
      importanceScore,
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
