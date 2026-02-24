export type SearchStrategy = "vector-only" | "text-only" | "hybrid";

export interface RankCandidate {
  _id: string;
  content?: string;
  timestamp: number;
  importanceScore?: number;
  outcomeScore?: number;
  _score?: number;
  lexicalScore?: number;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function freshnessScore(timestamp: number): number {
  const ageDays = (Date.now() - timestamp) / (24 * 60 * 60 * 1000);
  return clamp(1 - ageDays / 30);
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
  return [...candidates]
    .map((c) => {
      const semantic = clamp(c._score ?? 0);
      const lexical = clamp(c.lexicalScore ?? lexicalScore(query, c.content));
      const importance = clamp(c.importanceScore ?? 0);
      const freshness = freshnessScore(c.timestamp);
      const outcome = clamp(c.outcomeScore ?? 0.5);
      const hybridScore =
        0.45 * semantic +
        0.15 * lexical +
        0.2 * importance +
        0.1 * freshness +
        0.1 * outcome;
      return { ...c, _score: hybridScore };
    })
    .sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
}
