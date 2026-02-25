/**
 * Subspace Re-merge Cron — Weekly at Sunday 9:00 UTC
 *
 * When streaming integration (integrateNewFact) expands subspaces beyond
 * k > MAX_K principal components, this cron compresses them back to TARGET_K
 * and recomputes centroids from current active fact embeddings.
 *
 * Algorithm:
 * 1. Scan all subspaces (small table)
 * 2. For subspaces where principalVectors.length > MAX_K:
 *    a. Fetch active fact embeddings
 *    b. Recompute centroid (mean of all active embeddings)
 *    c. Recompute variance (avg squared distance from centroid)
 *    d. Truncate principalVectors to TARGET_K (first k explain most variance)
 *    e. Bump subspace version to signal downstream consumers
 * 3. Log results via memory_events
 *
 * Note: Full SVD re-extraction lives in the MCP server (svd-consolidation.ts)
 * and cannot run in Convex. Truncating the first TARGET_K vectors is a valid
 * approximation since power iteration extracts components in variance-descending
 * order — the most important directions come first.
 */
import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";

const MAX_K = 128;    // trigger: expanded beyond this many principal vectors
const TARGET_K = 64;  // compress back to this many

export const runSubspaceRemerge = internalAction({
  args: {},
  handler: async (ctx) => {
    // olderThanDays:0 → cutoff = now → s.updatedAt < now is true for all
    const allSubspaces = await ctx.runQuery(
      internal.functions.subspaces.listStaleSubspaces,
      { olderThanDays: 0, limit: 500 },
    );

    let remerged = 0;
    let skipped = 0;

    for (const subspace of allSubspaces) {
      const currentK = subspace.principalVectors?.length ?? 0;

      // Only process subspaces expanded beyond the threshold
      if (currentK <= MAX_K) {
        skipped++;
        continue;
      }

      // Fetch active fact embeddings (excludes archived/pruned facts)
      const factEmbeddings = await ctx.runQuery(
        internal.functions.subspaces.getFactEmbeddings,
        { factIds: subspace.factIds },
      );

      if (factEmbeddings.length < 3) continue;

      // Recompute centroid: mean of all active embeddings
      const d = factEmbeddings[0].embedding.length;
      const centroid = new Array<number>(d).fill(0);
      for (const { embedding } of factEmbeddings) {
        for (let j = 0; j < d; j++) centroid[j] += embedding[j];
      }
      for (let j = 0; j < d; j++) centroid[j] /= factEmbeddings.length;

      // Recompute variance: average squared distance from centroid
      let variance = 0;
      for (const { embedding } of factEmbeddings) {
        for (let j = 0; j < d; j++) {
          const diff = embedding[j] - centroid[j];
          variance += diff * diff;
        }
      }
      variance /= factEmbeddings.length;

      // Truncate to TARGET_K: earlier components explain the most variance
      const trimmedVectors = (subspace.principalVectors ?? []).slice(0, TARGET_K);
      const activeFactIds = factEmbeddings.map((f) => f.factId);

      // Single update: centroid + trimmed principal vectors + version bump
      await ctx.runMutation(api.functions.subspaces.updateSubspace, {
        subspaceId: subspace._id,
        centroid,
        variance,
        principalVectors: trimmedVectors,
        k: TARGET_K,
        version: (subspace.version ?? 0) + 1,
        dimensionality: d,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        factIds: activeFactIds as any,
      });

      // Retroactively re-project recent facts onto the compressed basis.
      // Runs synchronously within this cron (actions can call mutations directly).
      await ctx.runMutation(api.functions.retroactiveEnrich.retroactiveReproject, {
        subspaceId: subspace._id,
        daysBack: 30,
        agentId: "system:subspace-remerge",
      });

      remerged++;
    }

    console.log(
      `[subspace-remerge] Re-merged ${remerged} subspaces (${skipped} within k≤${MAX_K}, total ${allSubspaces.length})`,
    );

    // Log results to memory_events so agents can observe the cron's activity
    if (remerged > 0) {
      await ctx.runMutation(internal.functions.events.emit, {
        eventType: "subspace_remerge",
        agentId: "system",
        payload: {
          remerged,
          skipped,
          total: allSubspaces.length,
          targetK: TARGET_K,
          maxK: MAX_K,
        },
      });
    }
  },
});
