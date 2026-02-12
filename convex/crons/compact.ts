import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

export const runCompact = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all conversations and filter in-memory
    const allConversations = await ctx.db
      .query("conversations")
      .take(500);

    const conversations = allConversations.filter(
      (c) => c.threadFacts.length > 50
    );

    for (const conversation of conversations) {
      // Get all facts in this conversation
      const threadFacts = await Promise.all(
        conversation.threadFacts.map((factId) => ctx.db.get(factId))
      );

      // Filter out null facts and sort by importance ascending
      const validFacts = threadFacts
        .filter((f) => f !== null)
        .sort((a, b) => (a.importanceScore || 0) - (b.importanceScore || 0));

      // Mark oldest low-importance facts as dormant (keep top 50)
      const factsToMakeDormant = validFacts.slice(0, -50);
      for (const fact of factsToMakeDormant) {
        if (fact && fact.lifecycleState === "active" && fact.importanceScore < 0.5) {
          await ctx.db.patch(fact._id, {
            lifecycleState: "dormant",
            updatedAt: Date.now(),
          });
        }
      }
    }

    // Self-schedule continuation if there are more
    if (allConversations.length === 500) {
      await ctx.scheduler.runAfter(0, internal.crons.compact.runCompact, {});
    }
  },
});
