import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

export const runRules = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Only run on 1st of month
    const now = new Date();
    if (now.getUTCDate() !== 1) {
      return; // Early exit if not 1st of month
    }

    // Find error/correction facts with low relevance (candidates for steering rules)
    // Use .take(500) to avoid unbounded full table scans
    const errorFacts = await ctx.db
      .query("facts")
      .withIndex("by_type", (q) => q.eq("factType", "error"))
      .take(500);

    const correctionFacts = await ctx.db
      .query("facts")
      .withIndex("by_type", (q) => q.eq("factType", "correction"))
      .take(500);

    const candidates = [...errorFacts, ...correctionFacts];

    // Process facts with low relevance (< 0.3)
    let processed = 0;
    for (const fact of candidates) {
      if (fact.relevanceScore < 0.3) {
        // Extract pattern from error/correction fact
        // For v1, we create a simple steering rule from the content
        const ruleContent = `Avoid: ${fact.content.substring(0, 100)}...`;

        // Create a steering_rule fact
        await ctx.db.insert("facts", {
          content: ruleContent,
          timestamp: Date.now(),
          source: "consolidation",
          entityIds: fact.entityIds,
          relevanceScore: 0.8, // New rules start with high relevance
          accessedCount: 0,
          importanceScore: 0.7,
          createdBy: "system",
          scopeId: fact.scopeId,
          tags: ["auto-generated", "steering"],
          factType: "steering_rule",
          lifecycleState: "active",
        });

        // Mark original fact as archived since the pattern is now captured
        await ctx.db.patch(fact._id, {
          lifecycleState: "archived",
          updatedAt: Date.now(),
        });
        processed++;
      }
    }

    // Self-schedule continuation if either batch was full (more may remain)
    if (errorFacts.length === 500 || correctionFacts.length === 500) {
      await ctx.scheduler.runAfter(0, internal.crons.rules.runRules, {});
    }

    return { processed };
  },
});
