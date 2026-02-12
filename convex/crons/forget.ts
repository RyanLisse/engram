import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

export const runForget = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Process in batches of 500
    const facts = await ctx.db
      .query("facts")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycleState", "active"))
      .take(500);

    for (const fact of facts) {
      let forgetScore = 0;

      // Superseded by newer fact: +0.3
      if (fact.supersededBy) {
        forgetScore += 0.3;
      }

      // Low access count + old: +0.2
      const ageInDays = (Date.now() - fact.timestamp) / (1000 * 60 * 60 * 24);
      if (fact.accessedCount < 2 && ageInDays > 30) {
        forgetScore += 0.2;
      }

      // Low importance: +0.2
      if (fact.importanceScore < 0.3) {
        forgetScore += 0.2;
      }

      // Contradicts higher-importance fact: +0.1 (simplified check)
      // For v1, we skip this as it requires cross-fact comparison
      // TODO: implement in v2 with entity-based contradiction detection

      // Archive facts with forgetScore > 0.7
      if (forgetScore > 0.7) {
        await ctx.db.patch(fact._id, {
          lifecycleState: "archived",
          forgetScore: forgetScore,
          updatedAt: Date.now(),
        });
      }
    }

    // Self-schedule continuation if there are more
    if (facts.length === 500) {
      await ctx.scheduler.runAfter(0, internal.crons.forget.runForget, {});
    }
  },
});
