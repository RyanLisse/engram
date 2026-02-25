import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { getConfig } from "../lib/configResolver";

export const runDecay = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Decay rates by fact type (differential relevance decay)
    const decayRates = (await getConfig(ctx, "decay_rates")) as Record<string, number> | undefined;
    const rates = decayRates ?? {
      decision: 0.998,
      error: 0.995,
      correction: 0.995,
      insight: 0.997,
      steering_rule: 0.999,
      learning: 0.996,
      session_summary: 0.99,
      plan: 0.995,
      observation: 0.99,
    };

    // Process in batches of 500
    const facts = await ctx.db
      .query("facts")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycleState", "active"))
      .take(500);

    for (const fact of facts) {
      const rate = rates[fact.factType] ?? 0.99;
      let newRelevance = fact.relevanceScore * rate;

      // Emotional weight resists decay
      let emotionalResistance = 1;
      if (fact.emotionalWeight) {
        emotionalResistance += fact.emotionalWeight * 0.5;
      } else if (fact.emotionalContext) {
        // Lightweight fallback when context exists but enrichment has not assigned weight yet.
        emotionalResistance += 0.1;
      }
      newRelevance *= emotionalResistance;

      // Floor at 0.01
      newRelevance = Math.min(Math.max(newRelevance, 0.01), 2.0);

      if (Math.abs(newRelevance - fact.relevanceScore) > 0.001) {
        await ctx.db.patch(fact._id, {
          relevanceScore: newRelevance,
          updatedAt: Date.now(),
        });
      }
    }

    // Self-schedule continuation if there are more
    if (facts.length === 500) {
      await ctx.scheduler.runAfter(0, internal.crons.decay.runDecay, {});
    }
  },
});
