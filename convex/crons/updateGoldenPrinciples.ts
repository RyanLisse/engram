import { internalMutation } from "../_generated/server";

export const runUpdateGoldenPrinciples = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

    const recent = await ctx.db
      .query("agent_performance")
      .withIndex("by_success", (q) => q.eq("success", true).gte("endTime", monthAgo))
      .take(1000);

    if (recent.length === 0) {
      return { analyzed: 0, suggested: 0 };
    }

    const patternCounts = new Map<string, number>();
    for (const row of recent) {
      for (const pattern of row.patternsFollowed) {
        patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
      }
    }

    const candidates = [...patternCounts.entries()]
      .filter(([, count]) => count >= 5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern, count]) => `- ${pattern} (used ${count} times in successful tasks)`);

    const systemScope = await ctx.db
      .query("memory_scopes")
      .withIndex("by_name", (q) => q.eq("name", "engram-system"))
      .first();

    if (systemScope && candidates.length > 0) {
      await ctx.db.insert("facts", {
        content:
          `Golden principles candidate update (${new Date(now).toISOString().split("T")[0]}):\n` +
          candidates.join("\n"),
        timestamp: now,
        source: "system",
        entityIds: [],
        relevanceScore: 0.75,
        accessedCount: 0,
        importanceScore: 0.85,
        createdBy: "system",
        scopeId: systemScope._id,
        tags: ["golden-principles", "pattern-insights", "automated", "monthly"],
        factType: "system-learning",
        lifecycleState: "active",
      });
    }

    return { analyzed: recent.length, suggested: candidates.length };
  },
});
