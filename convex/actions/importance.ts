"use node";

/**
 * Multi-factor importance scoring for facts.
 * Pure calculation - no API calls needed.
 */

interface FactForScoring {
  factType: string;
  emotionalWeight?: number;
  entityIds?: string[];
  content: string;
}

const FACT_TYPE_SCORES: Record<string, number> = {
  decision: 0.8,
  error: 0.7,
  insight: 0.75,
  correction: 0.7,
  steering_rule: 0.85,
  learning: 0.65,
  session_summary: 0.6,
  plan: 0.6,
  observation: 0.5,
};

/**
 * Calculate importance score based on multiple factors:
 * - factType weight (decisions: 0.8, errors: 0.7, insights: 0.75, etc.)
 * - emotionalWeight boost (0.0-1.0, adds up to 0.2 to score)
 * - Entity count (more entities = more interconnected = slightly more important)
 * - Content length factor (very short or very long content slightly less important)
 */
export function calculateImportance(fact: FactForScoring): number {
  return calculateImportanceWithWeights(fact, FACT_TYPE_SCORES);
}

export function calculateImportanceWithWeights(
  fact: FactForScoring,
  weights: Record<string, number>
): number {
  let score = weights[fact.factType] ?? 0.5;

  // 2. Emotional weight boost (up to +0.2)
  if (fact.emotionalWeight !== undefined && fact.emotionalWeight > 0) {
    score += fact.emotionalWeight * 0.2;
  }

  // 3. Entity interconnection bonus (more entities = more important)
  const entityCount = fact.entityIds?.length ?? 0;
  if (entityCount > 0) {
    // Add up to +0.1 based on entity count (logarithmic)
    const entityBonus = Math.min(0.1, Math.log(entityCount + 1) * 0.05);
    score += entityBonus;
  }

  // 4. Content length factor
  const contentLength = fact.content.length;
  if (contentLength < 20) {
    // Very short content is likely less important
    score *= 0.9;
  } else if (contentLength > 2000) {
    // Very long content might be less focused
    score *= 0.95;
  }

  // 5. Clamp to [0.0, 1.0]
  return Math.max(0.0, Math.min(1.0, score));
}
