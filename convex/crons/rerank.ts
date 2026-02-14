import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

export const runRerank = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Process in batches of 500
    const facts = await ctx.db
      .query("facts")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycleState", "active"))
      .take(500);

    for (const fact of facts) {
      // Recalculate importance based on:
      // 1. Access count (more access = more important)
      // 2. Signal feedback (high ratings boost importance)
      // 3. Recency (newer facts get slight boost)
      // 4. Entity connections (facts linking many entities are more important)

      let newImportance = fact.importanceScore || 0;

      // Access count factor (0.0-0.3 boost)
      const accessFactor = Math.min(fact.accessedCount * 0.05, 0.3);
      newImportance += accessFactor;

      // Get signal feedback for this fact
      const signals = await ctx.db
        .query("signals")
        .withIndex("by_fact", (q) => q.eq("factId", fact._id))
        .collect();

      if (signals.length > 0) {
        // Average explicit ratings
        const ratings = signals.filter((s) => s.signalType === "explicit_rating");
        if (ratings.length > 0) {
          const avgRating = ratings.reduce((sum, s) => sum + s.value, 0) / ratings.length;
          const ratingFactor = (avgRating / 10) * 0.2; // 0.0-0.2 boost
          newImportance += ratingFactor;
        }

        // Average sentiment scores
        const sentiments = signals.filter((s) => s.signalType === "implicit_sentiment");
        if (sentiments.length > 0) {
          const avgSentiment = sentiments.reduce((sum, s) => sum + s.value, 0) / sentiments.length;
          const sentimentFactor = (avgSentiment + 1) * 0.1; // 0.0-0.2 boost
          newImportance += sentimentFactor;
        }
      }

      // Recency boost (newer facts get slight boost)
      const ageInDays = (Date.now() - fact.timestamp) / (1000 * 60 * 60 * 24);
      if (ageInDays < 7) {
        newImportance += 0.1;
      } else if (ageInDays < 30) {
        newImportance += 0.05;
      }

      // Entity connections boost (facts linking many entities are more important)
      const entityBoost = Math.min(fact.entityIds.length * 0.05, 0.2);
      newImportance += entityBoost;

      // Outcome utility boost/penalty from feedback loop (centered around 0.5)
      if (fact.outcomeScore !== undefined) {
        newImportance += (fact.outcomeScore - 0.5) * 0.25;
      }

      // Cap at 1.0
      newImportance = Math.min(newImportance, 1.0);

      // Update if changed significantly
      if (Math.abs(newImportance - fact.importanceScore) > 0.01) {
        await ctx.db.patch(fact._id, {
          importanceScore: newImportance,
          updatedAt: Date.now(),
        });
      }
    }

    // Self-schedule continuation if there are more
    if (facts.length === 500) {
      await ctx.scheduler.runAfter(0, internal.crons.rerank.runRerank, {});
    }
  },
});
