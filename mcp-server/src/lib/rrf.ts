/**
 * Reciprocal Rank Fusion (RRF) — merges ranked result sets from multiple
 * retrieval pathways into a single unified ranking.
 *
 * Used by the tri-pathway recall pipeline to fuse:
 *   1. Semantic (vector search)
 *   2. Symbolic (text search)
 *   3. Topological (graph expansion)
 *
 * Reference: Cormack, Clarke & Butt (2009) — "Reciprocal Rank Fusion
 * outperforms Condorcet and individual rank learning methods"
 */

/**
 * Merge multiple ranked result sets using Reciprocal Rank Fusion.
 *
 * @param resultSets - Array of ranked result arrays (each ordered by relevance)
 * @param k - Smoothing constant (default 60, per the original paper)
 * @returns Merged results sorted by descending RRF score
 */
export function reciprocalRankFusion(
  resultSets: Array<Array<{ _id: string; [key: string]: any }>>,
  k: number = 60
): Array<{ _id: string; rrf_score: number; [key: string]: any }> {
  const scores = new Map<string, { score: number; fact: any }>();

  for (const results of resultSets) {
    for (let rank = 0; rank < results.length; rank++) {
      const fact = results[rank];
      const existing = scores.get(fact._id);
      const rrf = 1 / (k + rank + 1);
      if (existing) {
        existing.score += rrf;
        const existingPathways = new Set<string>(existing.fact._pathways ?? []);
        const newPathways = Array.isArray(fact._pathways) ? fact._pathways : [];
        for (const pathway of newPathways) existingPathways.add(pathway);
        existing.fact = {
          ...existing.fact,
          ...fact,
          _pathways: [...existingPathways],
          _qaMatch: existing.fact._qaMatch || fact._qaMatch || undefined,
          qaConfidence: Math.max(existing.fact.qaConfidence ?? 0, fact.qaConfidence ?? 0) || undefined,
        };
      } else {
        scores.set(fact._id, { score: rrf, fact });
      }
    }
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ score, fact }) => ({ ...fact, rrf_score: score }));
}

/**
 * Extract unique entity IDs from a set of facts.
 * Used to determine whether graph expansion is worthwhile.
 */
export function extractEntityIds(facts: Array<{ entityIds?: string[]; [key: string]: any }>): string[] {
  const ids = new Set<string>();
  for (const fact of facts) {
    if (fact.entityIds && Array.isArray(fact.entityIds)) {
      for (const id of fact.entityIds) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}
