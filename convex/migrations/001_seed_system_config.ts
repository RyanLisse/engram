import { internalMutation } from "../_generated/server";

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const defaults = [
      ["default_recall_limit", 10, "tool_defaults", "Recall default limit"],
      ["default_token_budget", 4000, "tool_defaults", "Get-context token budget"],
      ["forget_archive_threshold", 0.7, "lifecycle", "Forget threshold"],
      ["prune_age_threshold_days", 90, "lifecycle", "Prune threshold in days"],
    ] as const;

    let inserted = 0;
    for (const [key, value, category, description] of defaults) {
      const existing = await ctx.db.query("system_config").withIndex("by_key", (q) => q.eq("key", key)).first();
      if (existing) continue;
      await ctx.db.insert("system_config", {
        key,
        value,
        category,
        description,
        version: 1,
        updatedAt: now,
        updatedBy: "migration",
      });
      inserted += 1;
    }

    return { inserted };
  },
});
