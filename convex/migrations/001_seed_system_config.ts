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
      ["auto_recall_limit", 3, "prompt_native", "Auto-recall top-K facts on user prompt hooks"],
      ["auto_recall_rrf_k", 60, "prompt_native", "RRF k parameter for auto-recall ranking"],
      ["auto_recall_strategy", "hybrid", "prompt_native", "Auto-recall strategy: hybrid or vector-only"],
      ["system_prompt_sections", null, "prompt_native", "Optional JSON string to control system prompt section order/titles"],
      ["recall_ranking_weights", null, "prompt_native", "Optional JSON string for recall blend weights"],
      ["budget_compact_threshold_ratio", 0.7, "prompt_native", "Context loader compact threshold ratio"],
      ["budget_offload_threshold_ratio", 2, "prompt_native", "Context loader offload threshold ratio"],
      ["intent_detection_threshold", 0.6, "prompt_native", "Intent detection sensitivity threshold"],
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
