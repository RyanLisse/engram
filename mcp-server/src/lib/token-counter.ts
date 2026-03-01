/**
 * Lightweight token estimation utilities for the Observer/Reflector pipeline.
 *
 * Uses chars/4 heuristic with code-block adjustment. Zero dependencies, <1ms per call.
 * This is intentionally approximate — the pipeline uses thresholds, not exact counts.
 */

/**
 * Estimate token count for a string using chars/4 heuristic.
 * Code blocks get a 1.3x multiplier (tokens are denser in code).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Count code block content separately (denser tokens)
  const codeBlockRegex = /```[\s\S]*?```/g;
  let codeTokens = 0;
  let plainText = text;

  const codeBlocks = text.match(codeBlockRegex);
  if (codeBlocks) {
    for (const block of codeBlocks) {
      codeTokens += Math.ceil(block.length / 3); // code is denser
      plainText = plainText.replace(block, "");
    }
  }

  const plainTokens = Math.ceil(plainText.length / 4);
  return plainTokens + codeTokens;
}

/**
 * Estimate total tokens for an array of facts.
 */
export function estimateTokensForFacts(facts: Array<{ content?: string }>): number {
  return facts.reduce((sum, fact) => sum + estimateTokens(fact.content ?? ""), 0);
}

/**
 * Check whether a token count has crossed a threshold.
 * Returns buffer readiness at 20% of threshold.
 */
export function thresholdCheck(
  tokens: number,
  threshold: number
): { exceeded: boolean; bufferReady: boolean; percentage: number } {
  const percentage = threshold > 0 ? tokens / threshold : 0;
  return {
    exceeded: tokens >= threshold,
    bufferReady: percentage >= 0.2,
    percentage: Math.round(percentage * 100),
  };
}
