/**
 * Token budget utilities for recall responses.
 *
 * Wraps the estimateTokens heuristic from token-counter with budget-aware
 * accumulation: walks a relevance-ordered list of facts and stops at the
 * first fact that would exceed the budget. This preserves RRF rank order
 * (best facts first) rather than skipping gaps like budget-aware-loader does.
 *
 * Uses the stored `tokenEstimate` field when available (pre-computed by the
 * async enrichment pipeline), falling back to live estimation otherwise.
 */

import { estimateTokens } from "./token-counter.js";

export interface TokenUsage {
  used: number;
  budget: number;
  truncated: boolean;
}

export interface TokenBudgetResult {
  facts: any[];
  tokenUsage: TokenUsage;
}

/**
 * Estimate token cost for a single fact.
 * Prefers the stored `tokenEstimate` field; falls back to char-count heuristic.
 */
export function estimateFactTokens(fact: any): number {
  if (typeof fact.tokenEstimate === "number" && fact.tokenEstimate > 0) {
    return fact.tokenEstimate;
  }
  return estimateTokens(fact.content ?? "");
}

/**
 * Apply a token budget to a relevance-ordered list of facts.
 *
 * Accumulates facts in order until adding the next one would exceed `maxTokens`,
 * then stops. Returns the included subset and a `tokenUsage` summary.
 *
 * @param facts   Facts ordered by descending relevance (highest priority first).
 * @param maxTokens  Token budget ceiling.
 */
export function applyTokenBudget(facts: any[], maxTokens: number): TokenBudgetResult {
  let used = 0;
  const included: any[] = [];

  for (const fact of facts) {
    const tokens = estimateFactTokens(fact);
    if (used + tokens > maxTokens) break;
    included.push(fact);
    used += tokens;
  }

  return {
    facts: included,
    tokenUsage: {
      used,
      budget: maxTokens,
      truncated: included.length < facts.length,
    },
  };
}
