/**
 * memory_rank_candidates — Exposed ranking primitive
 *
 * Takes raw candidate facts and applies the hybrid scoring algorithm:
 * 0.45 semantic + 0.15 lexical + 0.20 importance + 0.10 freshness + 0.10 outcome
 *
 * Agents can use this to re-rank any fact set with custom weights.
 */

import { z } from "zod";
import { rankCandidates as hybridRank, type RankCandidate } from "../lib/ranking.js";

export const rankCandidatesSchema = z.object({
  query: z.string().describe("Query used for lexical scoring"),
  candidates: z.array(z.object({
    _id: z.string(),
    content: z.string(),
    timestamp: z.number(),
    importanceScore: z.number().optional(),
    outcomeScore: z.number().optional(),
    _score: z.number().optional(),
  })).describe("Candidate facts to rank"),
  limit: z.number().optional().default(10).describe("Maximum results to return"),
  weights: z.object({
    semantic: z.number().optional(),
    lexical: z.number().optional(),
    importance: z.number().optional(),
    freshness: z.number().optional(),
    outcome: z.number().optional(),
  }).optional().describe("Custom weight overrides (sum should ≈ 1.0)"),
});

export async function rankCandidatesPrimitive(input: z.infer<typeof rankCandidatesSchema>) {
  const ranked = hybridRank(input.query, input.candidates as RankCandidate[]);
  return {
    ranked: ranked.slice(0, input.limit),
    totalCandidates: input.candidates.length,
    returnedCount: Math.min(ranked.length, input.limit),
  };
}
