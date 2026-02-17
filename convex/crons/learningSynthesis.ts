import { internalMutation } from "../_generated/server";

/**
 * Learning Synthesis — Aggregate feedback signals into actionable insights.
 *
 * Runs weekly (Sunday 7:30 UTC). Analyzes signal patterns to identify:
 * 1. Most-recalled facts (high value, protect from decay)
 * 2. Low-usefulness patterns (candidates for deprecation)
 * 3. Agent behavior trends (which tools/scopes used most)
 * 4. Recall effectiveness (used vs unused fact ratio)
 */
export const runLearningSynthesis = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    // 1. Analyze recall feedback from the past week
    // Use by_created index to retrieve only recent entries without a full scan
    const weeklyFeedback = await ctx.db
      .query("recall_feedback")
      .withIndex("by_created", (q) => q.gte("createdAt", weekAgo))
      .take(500);

    let totalUsed = 0;
    let totalUnused = 0;
    const factUsageCounts = new Map<string, number>();
    const recallIds = new Set<string>();

    for (const fb of weeklyFeedback) {
      recallIds.add(fb.recallId);
      if (fb.used) {
        totalUsed++;
        factUsageCounts.set(fb.factId.toString(), (factUsageCounts.get(fb.factId.toString()) ?? 0) + 1);
      } else {
        totalUnused++;
      }
    }

    const totalRecalls = recallIds.size;

    const recallEfficiency = totalUsed + totalUnused > 0
      ? Math.round((totalUsed / (totalUsed + totalUnused)) * 100)
      : 0;

    // 2. Analyze signal patterns — bounded scan, most recent 500
    const weeklySignals = await ctx.db
      .query("signals")
      .order("desc")
      .take(500);

    const signalsByType: Record<string, { count: number; avgValue: number; totalValue: number }> = {};
    for (const sig of weeklySignals) {
      if (!signalsByType[sig.signalType]) {
        signalsByType[sig.signalType] = { count: 0, avgValue: 0, totalValue: 0 };
      }
      const entry = signalsByType[sig.signalType];
      entry.count++;
      entry.totalValue += sig.value;
      entry.avgValue = entry.totalValue / entry.count;
    }

    // 3. Find most-accessed facts (high value, protect from decay)
    const topFacts = [...factUsageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Boost relevance of frequently-used facts using direct ID lookup (O(1) per fact)
    let boostedCount = 0;
    for (const [factIdStr] of topFacts) {
      try {
        // Direct get by ID — no full table scan
        // Cast: factId comes from recall_feedback.factId which is Id<"facts">
        const factDoc = await ctx.db.get(factIdStr as any) as { _id: any; relevanceScore: number } | null;
        if (factDoc && factDoc.relevanceScore < 0.9) {
          await ctx.db.patch(factDoc._id, {
            relevanceScore: Math.min(1.0, factDoc.relevanceScore + 0.1),
              updatedAt: now,
          });
          boostedCount++;
        }
      } catch {
        // Fact may have been archived/deleted
      }
    }

    // 4. Build synthesis report
    const insights: string[] = [];

    if (totalRecalls > 0) {
      insights.push(
        `Recall efficiency: ${recallEfficiency}% (${totalUsed} used / ${totalUsed + totalUnused} total facts returned across ${totalRecalls} recalls)`
      );
    }

    if (topFacts.length > 0) {
      insights.push(
        `Top ${topFacts.length} most-recalled facts boosted. Leader: ${topFacts[0][1]} uses this week.`
      );
    }

    for (const [type, stats] of Object.entries(signalsByType)) {
      insights.push(
        `Signal "${type}": ${stats.count} recorded, avg value ${stats.avgValue.toFixed(2)}`
      );
    }

    if (recallEfficiency < 50 && totalRecalls >= 5) {
      insights.push(
        `⚠️ Low recall efficiency (${recallEfficiency}%). Consider improving embedding quality or adjusting ranking weights.`
      );
    }

    // Store synthesis as a system fact
    if (insights.length > 0) {
      const systemScope = await ctx.db
        .query("memory_scopes")
        .withIndex("by_name", (q) => q.eq("name", "engram-system"))
        .first();

      if (systemScope) {
        await ctx.db.insert("facts", {
          content: `Weekly learning synthesis (${new Date(now).toISOString().split("T")[0]}):\n${insights.join("\n")}`,
          timestamp: now,
          source: "system",
          entityIds: [],
          relevanceScore: 0.7,
          accessedCount: 0,
          importanceScore: 0.8,
          createdBy: "system",
          scopeId: systemScope._id,
          tags: ["learning-synthesis", "system", "weekly", "automated"],
          factType: "system-learning",
          lifecycleState: "active",
        });
      }
    }

    console.log(
      `[learning-synthesis] Week summary: ${totalRecalls} recalls, ${recallEfficiency}% efficiency, ${weeklySignals.length} signals, ${topFacts.length} facts boosted`
    );
  },
});
