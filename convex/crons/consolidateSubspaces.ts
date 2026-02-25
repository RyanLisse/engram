import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Weekly cron: Recompute subspace centroids and prune tiny subspaces.
 *
 * 1. Finds subspaces not updated in 7+ days
 * 2. Recomputes centroids from current fact embeddings
 * 3. Prunes subspaces with < 3 active facts
 */
export const runConsolidateSubspaces = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Get all subspaces (small table — full scan is fine)
    const allSubspaces = await ctx.db.query("knowledge_subspaces").take(500);
    const stale = allSubspaces.filter((s) => s.updatedAt < sevenDaysAgo);

    let recomputed = 0;
    let pruned = 0;

    for (const subspace of stale) {
      // Collect active fact embeddings
      const embeddings: number[][] = [];
      const activeFactIds: typeof subspace.factIds = [];

      for (const factId of subspace.factIds) {
        const fact = await ctx.db.get(factId);
        if (fact && fact.lifecycleState === "active" && fact.embedding?.length) {
          embeddings.push(fact.embedding);
          activeFactIds.push(factId);
        }
      }

      // Prune subspaces with fewer than 3 active facts
      if (activeFactIds.length < 3) {
        await ctx.db.delete(subspace._id);
        pruned++;
        continue;
      }

      // Recompute centroid (mean of all active embeddings)
      const d = embeddings[0].length;
      const centroid = new Array(d).fill(0);
      for (const emb of embeddings) {
        for (let j = 0; j < d; j++) {
          centroid[j] += emb[j];
        }
      }
      for (let j = 0; j < d; j++) {
        centroid[j] /= embeddings.length;
      }

      // Compute variance (average squared distance from centroid)
      let variance = 0;
      for (const emb of embeddings) {
        for (let j = 0; j < d; j++) {
          const diff = emb[j] - centroid[j];
          variance += diff * diff;
        }
      }
      variance /= embeddings.length;

      await ctx.db.patch(subspace._id, {
        centroid,
        variance,
        factIds: activeFactIds,
        dimensionality: d,
        updatedAt: Date.now(),
      });
      recomputed++;
    }

    if (recomputed > 0 || pruned > 0) {
      console.log(
        `[consolidate-subspaces] Recomputed ${recomputed}, pruned ${pruned} (of ${stale.length} stale)`
      );
    }
  },
});
