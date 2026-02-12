import { internalMutation } from "../_generated/server";

export const runCleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Clean up archived facts in scopes with retentionDays
    const scopes = await ctx.db.query("memory_scopes").collect();

    for (const scope of scopes) {
      if (scope.retentionDays) {
        const cutoffTime = Date.now() - scope.retentionDays * 24 * 60 * 60 * 1000;

        // Find archived facts beyond retention
        const archivedFacts = await ctx.db
          .query("facts")
          .withIndex("by_scope", (q) => q.eq("scopeId", scope._id))
          .collect();

        for (const fact of archivedFacts) {
          if (
            fact.lifecycleState === "archived" &&
            fact.timestamp < cutoffTime
          ) {
            // Mark as pruned instead of deleting (never true-delete)
            await ctx.db.patch(fact._id, {
              lifecycleState: "pruned",
              updatedAt: Date.now(),
            });
          }
        }
      }
    }

    // Clean old sync_log entries (> 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const oldSyncLogs = await ctx.db
      .query("sync_log")
      .collect();

    for (const log of oldSyncLogs) {
      if (log.lastSyncTimestamp < thirtyDaysAgo) {
        await ctx.db.delete(log._id);
      }
    }
  },
});
