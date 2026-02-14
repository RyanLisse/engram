import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

const HARDCODED_DEFAULTS: Record<string, any> = {
  default_recall_limit: 10,
  default_token_budget: 4000,
  prune_age_threshold_days: 90,
  forget_archive_threshold: 0.7,
  importance_weights: {
    decision: 0.8,
    error: 0.7,
    insight: 0.75,
    correction: 0.7,
    steering_rule: 0.85,
    learning: 0.65,
    session_summary: 0.6,
    plan: 0.6,
    observation: 0.5,
  },
  decay_rates: {
    decision: 0.998,
    error: 0.995,
    correction: 0.995,
    insight: 0.997,
    steering_rule: 0.999,
    learning: 0.996,
    session_summary: 0.99,
    plan: 0.995,
    observation: 0.99,
  },
};

export async function getConfig(
  ctx: QueryCtx | MutationCtx,
  key: string,
  scopeId?: Id<"memory_scopes">
): Promise<any> {
  if (scopeId) {
    const policy = await ctx.db
      .query("memory_policies")
      .withIndex("by_scope_key", (q) => q.eq("scopeId", scopeId).eq("policyKey", key))
      .first();
    if (policy) return policy.policyValue;
  }

  const config = await ctx.db
    .query("system_config")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (config) return config.value;

  return HARDCODED_DEFAULTS[key];
}
