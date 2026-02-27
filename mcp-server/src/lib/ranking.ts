export type SearchStrategy = "vector-only" | "text-only" | "hybrid";
import * as convex from "./convex-client.js";

export interface RankCandidate {
  _id: string;
  content?: string;
  timestamp: number;
  importanceScore?: number;
  outcomeScore?: number;
  emotionalWeight?: number;
  relevanceScore?: number;
  _score?: number;
  lexicalScore?: number;
}

type RankingWeights = {
  semantic: number;
  lexical: number;
  importance: number;
  freshness: number;
  outcome: number;
  emotional: number;
};

const DEFAULT_WEIGHTS: RankingWeights = {
  semantic: 0.4,
  lexical: 0.15,
  importance: 0.2,
  freshness: 0.1,
  outcome: 0.1,
  emotional: 0.05,
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function freshnessScore(timestamp: number, relevanceScore?: number): number {
  const ageDays = (Date.now() - timestamp) / (24 * 60 * 60 * 1000);
  const timeFreshness = clamp(1 - ageDays / 30);

  // If relevanceScore available (from decay cron), blend it in.
  // This gives decisions/steering_rules higher freshness even when old.
  if (relevanceScore !== undefined && relevanceScore !== null) {
    const decayFreshness = clamp(relevanceScore);
    return 0.6 * timeFreshness + 0.4 * decayFreshness;
  }

  return timeFreshness;
}

function lexicalScore(query: string, content: string | undefined): number {
  if (!content) return 0;
  const q = query.toLowerCase();
  const c = content.toLowerCase();
  if (!q.trim()) return 0;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((t) => c.includes(t)).length;
  return clamp(hits / tokens.length);
}

export function rankCandidates(query: string, candidates: RankCandidate[]): RankCandidate[] {
  return rankCandidatesWithWeights(query, candidates, DEFAULT_WEIGHTS);
}

function rankCandidatesWithWeights(
  query: string,
  candidates: RankCandidate[],
  weights: RankingWeights,
): RankCandidate[] {
  return [...candidates]
    .map((c) => {
      const semantic = clamp(c._score ?? 0);
      const lexical = clamp(c.lexicalScore ?? lexicalScore(query, c.content));
      const importance = clamp(c.importanceScore ?? 0);
      const freshness = freshnessScore(c.timestamp, c.relevanceScore);
      const outcome = clamp(c.outcomeScore ?? 0.5);
      const emotional = clamp(c.emotionalWeight ?? 0);
      const hybridScore =
        weights.semantic * semantic +
        weights.lexical * lexical +
        weights.importance * importance +
        weights.freshness * freshness +
        weights.outcome * outcome +
        weights.emotional * emotional;
      return { ...c, _score: hybridScore };
    })
    .sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
}

export async function rankCandidatesWithConfig(
  query: string,
  candidates: RankCandidate[],
): Promise<RankCandidate[]> {
  try {
    const config = await convex.getConfig("recall_ranking_weights");
    const rawValue = config?.value;
    if (typeof rawValue === "string" && rawValue.trim().length > 0) {
      const parsed = JSON.parse(rawValue);
      if (parsed && typeof parsed === "object") {
        const weights: RankingWeights = {
          semantic: Number(parsed.semantic ?? DEFAULT_WEIGHTS.semantic),
          lexical: Number(parsed.lexical ?? DEFAULT_WEIGHTS.lexical),
          importance: Number(parsed.importance ?? DEFAULT_WEIGHTS.importance),
          freshness: Number(parsed.freshness ?? DEFAULT_WEIGHTS.freshness),
          outcome: Number(parsed.outcome ?? DEFAULT_WEIGHTS.outcome),
          emotional: Number(parsed.emotional ?? DEFAULT_WEIGHTS.emotional),
        };
        return rankCandidatesWithWeights(query, candidates, weights);
      }
    }
  } catch {
    // fallback to defaults
  }
  return rankCandidatesWithWeights(query, candidates, DEFAULT_WEIGHTS);
}
