/**
 * Weekly defrag: Runs Sunday 14:30 UTC
 *
 * Rebalances fact categories by:
 * 1. Finding scopes with >500 active facts
 * 2. Archiving low-importance dormant facts older than 90 days
 * 3. Merging near-duplicate facts based on content similarity
 * 4. Logging defrag stats as a memory_event
 */

import { internalMutation } from "../_generated/server";

export const runDefrag = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

    let totalArchived = 0;
    let totalMerged = 0;
    const scopeStats: Record<string, { activeCount: number; archived: number; merged: number }> = {};

    // Get all scopes
    const scopes = await ctx.db.query("memory_scopes").collect();

    for (const scope of scopes) {
      const scopeId = scope._id;

      // Count active facts in this scope
      const activeFacts = await ctx.db
        .query("facts")
        .withIndex("by_scope", (q) => q.eq("scopeId", scopeId))
        .filter((q) => q.eq(q.field("lifecycleState"), "active"))
        .collect();

      const activeCount = activeFacts.length;
      let archived = 0;
      let merged = 0;

      scopeStats[scopeId.toString()] = { activeCount, archived, merged };

      // Only process scopes above threshold
      if (activeCount > 500) {
        // Phase 1: Archive low-importance dormant facts older than 90 days
        const dormantOldFacts = await ctx.db
          .query("facts")
          .withIndex("by_lifecycle", (q) => q.eq("lifecycleState", "dormant"))
          .filter((q) =>
            q.and(
              q.eq(q.field("scopeId"), scopeId),
              q.lt(q.field("timestamp"), ninetyDaysAgo),
              q.lt(q.field("importanceScore"), 0.3)
            )
          )
          .take(100); // Cap at 100 per run

        for (const fact of dormantOldFacts) {
          await ctx.db.patch(fact._id, {
            lifecycleState: "archived",
            updatedAt: now,
          });
          archived++;
          totalArchived++;
        }

        // Phase 2: Merge near-duplicate facts based on content similarity
        // Find facts with identical or very similar content (simple approach: exact substring match)
        const activeInScope = await ctx.db
          .query("facts")
          .withIndex("by_scope", (q) => q.eq("scopeId", scopeId))
          .filter((q) => q.eq(q.field("lifecycleState"), "active"))
          .take(200); // Sample for merging

        const contentGroups = new Map<string, typeof activeInScope>();

        for (const fact of activeInScope) {
          const content = fact.content.substring(0, 50); // Use first 50 chars as key
          if (!contentGroups.has(content)) {
            contentGroups.set(content, []);
          }
          contentGroups.get(content)!.push(fact);
        }

        // Process groups with 2+ identical/similar facts
        for (const [, factsInGroup] of contentGroups) {
          if (factsInGroup.length < 2) continue;
          if (merged >= 50) break; // Cap at 50 merges per run

          // Sort by importance score (descending) — keep the most important one
          const sorted = [...factsInGroup].sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0));
          const primaryFact = sorted[0];

          // Merge others into primary
          for (let i = 1; i < sorted.length; i++) {
            const fact = sorted[i];
            await ctx.db.patch(fact._id, {
              lifecycleState: "merged",
              mergedInto: primaryFact._id,
              updatedAt: now,
            });
            merged++;
            totalMerged++;
          }

          // Update primary fact to track what was merged into it
          await ctx.db.patch(primaryFact._id, {
            consolidatedFrom: sorted
              .slice(1)
              .map((f) => f._id),
            updatedAt: now,
          });
        }

        // Update stats
        scopeStats[scopeId.toString()] = { activeCount, archived, merged };
      }
    }

    // Log defrag stats as a memory_event
    const eventPayload = {
      totalScopes: scopes.length,
      scopesProcessed: Object.values(scopeStats).filter((s) => s.archived > 0 || s.merged > 0).length,
      totalArchived,
      totalMerged,
      scopeStats: JSON.stringify(scopeStats),
    };

    // Compute watermark (use current timestamp as watermark)
    const watermark = now;

    await ctx.db.insert("memory_events", {
      eventType: "defrag",
      payload: eventPayload,
      watermark,
      createdAt: now,
    });

    return {
      success: true,
      totalScopes: scopes.length,
      totalArchived,
      totalMerged,
      scopeStats,
    };
  },
});
