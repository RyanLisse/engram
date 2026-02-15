import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

/**
 * Embedding Backfill — Re-embed facts that failed or have stale embeddings.
 *
 * Runs every 15 minutes. Finds facts without embeddings (failed enrichment)
 * and triggers re-enrichment.
 */
export const runEmbeddingBackfill = internalAction({
  args: {},
  handler: async (ctx) => {
    // Find facts missing embeddings (enrichment failed or was skipped)
    const stale = await ctx.runQuery(internal.functions.facts.listFactsMissingEmbeddings, {
      limit: 50,
    });

    if (!stale || stale.length === 0) return;

    let backfilled = 0;
    for (const fact of stale) {
      try {
        await ctx.runAction(internal.actions.enrich.enrichFact, {
          factId: fact._id,
        });
        backfilled++;
      } catch (e) {
        // Skip individual failures, continue with others
        console.error(`[embedding-backfill] Failed to re-enrich ${fact._id}:`, e);
      }
    }

    if (backfilled > 0) {
      console.log(`[embedding-backfill] Re-enriched ${backfilled}/${stale.length} facts`);
    }
  },
});
