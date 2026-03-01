/**
 * memory_recall — Quad-pathway retrieval (semantic + symbolic + topological + local-cache)
 *
 * Adds intent-aware routing and optional token-budget truncation.
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  bumpAccessBatch,
  recordRecall,
  textSearch,
  vectorSearch,
} from "./primitive-retrieval.js";
import { searchByQA as convexSearchByQA } from "../lib/convex-client.js";
import { rankCandidatesPrimitive } from "./rank-candidates.js";
import { resolveScopes, getGraphNeighbors } from "./context-primitives.js";
import { reciprocalRankFusion, extractEntityIds } from "../lib/rrf.js";
import type { SearchStrategy } from "../lib/ranking.js";
import { applyTokenBudget, type TokenUsage } from "../lib/token-budget.js";
import { classifyIntent, type QueryIntent } from "../lib/intent-classifier.js";
import * as convex from "../lib/convex-client.js";

export const recallSchema = z.object({
  query: z.string().describe("Search query for semantic recall"),
  limit: z.number().optional().prefault(10).describe("Maximum number of facts to return"),
  scopeId: z.string().optional().describe("Scope ID or name to search within"),
  factType: z.string().optional().describe("Filter by fact type"),
  minImportance: z.number().optional().describe("Minimum importance score (0-1)"),
  searchStrategy: z
    .enum(["vector-only", "text-only", "hybrid"])
    .optional()
    .prefault("hybrid")
    .describe("Recall strategy"),
  tokenBudget: z.number().optional().describe("Max tokens to return (soft limit)"),
  maxTokens: z
    .number()
    .optional()
    .describe("Deprecated alias of tokenBudget for backward compatibility."),
});

export type RecallInput = z.infer<typeof recallSchema>;

type RecallSuccess = {
  facts: any[];
  recallId: string;
  pathways: string[];
  intent: QueryIntent;
  tokenUsage?: TokenUsage;
  tokenBudget?: number | null;
  tokensUsed?: number;
  tokensAvailable?: number | null;
  factsTruncated?: boolean;
};

const RECALL_PATHWAY_WEIGHTS: Record<string, number> = {
  kv: 1.1,
  semantic: 1.0,
  symbolic: 0.95,
  qa: 1.15,
  graph: 0.9,
  "local-cache": 0.92,
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function annotatePathwayResults(rows: any[], pathway: keyof typeof RECALL_PATHWAY_WEIGHTS): any[] {
  const pathwayWeight = RECALL_PATHWAY_WEIGHTS[pathway];
  return rows.map((row: any) => {
    const baseScore =
      typeof row._score === "number"
        ? row._score
        : pathway === "qa"
          ? row.qaConfidence ?? 0.7
          : pathway === "kv"
            ? 0.98
            : pathway === "graph"
              ? 0.58
              : 0.65;

    return {
      ...row,
      _pathways: Array.from(new Set([...(row._pathways ?? []), pathway])),
      _score: clampScore(baseScore * pathwayWeight),
    };
  });
}

function applyExplicitFusedWeighting(fused: any[]): any[] {
  const maxRrf = Math.max(1e-9, ...fused.map((fact) => fact.rrf_score ?? 0));
  return fused.map((fact) => {
    const pathways = Array.isArray(fact._pathways) ? fact._pathways : [];
    const strongestWeight = pathways.reduce(
      (max: number, pathway: string) => Math.max(max, RECALL_PATHWAY_WEIGHTS[pathway] ?? 1),
      1
    );
    const qaConfidenceBoost = fact._qaMatch ? (fact.qaConfidence ?? 0.7) / 0.7 : 1;

    return {
      ...fact,
      _score: clampScore(((fact.rrf_score ?? 0) / maxRrf) * strongestWeight * qaConfidenceBoost),
    };
  });
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function extractPotentialKVKeys(query: string): string[] {
  const keys = new Set<string>();
  const normalized = query.trim().toLowerCase();
  if (/^[a-z0-9_.-]+$/.test(normalized) && !normalized.includes(" ")) {
    keys.add(normalized);
  }

  const preferMatch = normalized.match(/what does (\w+) prefer for ([\w\s-]+)/i);
  if (preferMatch) {
    keys.add(`${preferMatch[1]}.preference.${preferMatch[2].trim().replace(/[\s-]+/g, "_")}`);
  }

  const possessiveMatch = normalized.match(/(\w+)'s preference for ([\w\s-]+)/i);
  if (possessiveMatch) {
    keys.add(`${possessiveMatch[1]}.preference.${possessiveMatch[2].trim().replace(/[\s-]+/g, "_")}`);
  }

  const genericKeyMatch = normalized.match(/(?:key|value|setting|config)\s+([a-z0-9_.-]+)/i);
  if (genericKeyMatch) {
    keys.add(genericKeyMatch[1]);
  }

  return [...keys];
}

async function kvLookup(query: string, scopeIds: string[]): Promise<any[]> {
  if (scopeIds.length === 0) return [];

  const candidateKeys = extractPotentialKVKeys(query);
  if (candidateKeys.length === 0) return [];

  const results: any[] = [];
  for (const key of candidateKeys) {
    for (const scopeId of scopeIds) {
      try {
        const kvEntry = await convex.kvGet({ key, scopeId });
        if (!kvEntry) continue;
        results.push({
          _id: `kv:${scopeId}:${key}`,
          key,
          content: kvEntry.value,
          factType: kvEntry.category ?? "tool_state",
          importanceScore: 0.95,
          relevanceScore: 1.0,
          timestamp: kvEntry.updatedAt,
          tokenEstimate: estimateTokens(kvEntry.value),
          _source: "kv",
          _kvMatch: true,
        });
      } catch (err: any) {
        console.error("[recall] KV lookup failed (non-fatal):", err?.message ?? err);
      }
    }
  }

  return results;
}

async function qaSearch(query: string, scopeIds: string[], limit: number): Promise<any[]> {
  if (scopeIds.length === 0) return [];
  try {
    const results = await convexSearchByQA({ query, scopeIds, limit });
    return annotatePathwayResults(
      (results as any[]).map((r: any) => ({ ...r, _qaMatch: true })),
      "qa"
    );
  } catch (err: any) {
    console.error("[recall] QA search failed (non-fatal):", err?.message ?? err);
    return [];
  }
}

function mergeAndDeduplicate(results: any[][]): any[] {
  const byId = new Map<string, any>();

  for (const rows of results) {
    for (const row of rows) {
      const existing = byId.get(row._id);
      if (existing) {
        byId.set(row._id, {
          ...existing,
          ...row,
          _score: Math.max(existing._score ?? 0, row._score ?? 0),
        });
      } else {
        byId.set(row._id, row);
      }
    }
  }

  return [...byId.values()];
}

export async function recall(
  input: RecallInput,
  agentId: string
): Promise<RecallSuccess | { isError: true; message: string }> {
  try {
    console.error("[deprecation] memory_recall is a compatibility wrapper over primitive tools (quad-pathway)");

    const intent = classifyIntent(input.query);
    const effectiveTokenBudget = input.tokenBudget ?? input.maxTokens;
    const limit = input.limit ?? 10;

    const vaultRoot = process.env.VAULT_ROOT || path.resolve(process.cwd(), "..", "vault");
    const indexPath = path.join(vaultRoot, ".index", "vault-index.md");
    let queryText = input.query;
    try {
      const indexContent = await fs.readFile(indexPath, "utf8");
      if (indexContent.toLowerCase().includes(input.query.toLowerCase())) {
        queryText = `${input.query} critical notable`;
      }
    } catch {
      // index not present yet
    }

    const scopeResolution = await resolveScopes({ scopeId: input.scopeId }, agentId);
    if ("isError" in scopeResolution) {
      return scopeResolution;
    }
    const scopeIds = scopeResolution.scopeIds;

    const kvResults = intent === "lookup" ? await kvLookup(input.query, scopeIds) : [];
    const strategy = input.searchStrategy as SearchStrategy;

    const shouldRunVector =
      scopeIds.length > 0 &&
      strategy !== "text-only" &&
      (intent === "explore" || intent === "relational" || intent === "temporal" || strategy === "vector-only");
    const shouldRunText =
      scopeIds.length > 0 &&
      strategy !== "vector-only";
    const shouldRunQA =
      scopeIds.length > 0 &&
      strategy === "hybrid";

    const [textResults, qaResults] = await Promise.all([
      shouldRunText
        ? textSearch({ query: queryText, limit, scopeIds, factType: input.factType }).then((rows) =>
            annotatePathwayResults(rows as any[], "symbolic")
          )
        : Promise.resolve([]),
      shouldRunQA
        ? qaSearch(input.query, scopeIds, limit)
        : Promise.resolve([]),
    ]);

    let vectorResults: any[] = [];
    if (shouldRunVector) {
      try {
        vectorResults = (await vectorSearch({
          query: input.query,
          scopeIds,
          agentId,
          limit,
        })) as any[];
      } catch (err: any) {
        console.error("[recall] Vector search unavailable, falling back to text/hybrid ranking:", err?.message ?? err);
      }
    }

    const localCacheResults = annotatePathwayResults(
      vectorResults.filter((r: any) => r._source === "local-cache"),
      "local-cache"
    );
    const remoteVectorResults = annotatePathwayResults(
      vectorResults.filter((r: any) => r._source !== "local-cache"),
      "semantic"
    );

    const pathways: string[] = [];
    if (kvResults.length > 0) pathways.push("kv");
    if (remoteVectorResults.length > 0) pathways.push("semantic");
    if (textResults.length > 0) pathways.push("symbolic");
    if (qaResults.length > 0) pathways.push("qa");
    if (localCacheResults.length > 0) pathways.push("local-cache");

    const allInitialResults = [...textResults, ...remoteVectorResults, ...localCacheResults, ...qaResults];
    const entityIds = extractEntityIds(allInitialResults);

    let graphResults: any[] = [];
    if (entityIds.length > 0 && (intent === "relational" || intent === "explore")) {
      try {
        const graphResponse = await getGraphNeighbors({
          entityIds,
          scopeIds: scopeIds.length > 0 ? scopeIds : undefined,
          limit: 10,
        });
        graphResults = graphResponse.neighbors ?? [];
        if (graphResults.length > 0) pathways.push("graph");
      } catch (err: any) {
        console.error("[recall] Graph expansion failed (non-fatal):", err?.message ?? err);
      }
    }

    const rrfInputSets: Array<Array<{ _id: string; [key: string]: any }>> = [];
    if (kvResults.length > 0) rrfInputSets.push(kvResults);
    if (remoteVectorResults.length > 0) rrfInputSets.push(remoteVectorResults);
    if (textResults.length > 0) rrfInputSets.push(textResults as any[]);
    if (qaResults.length > 0) rrfInputSets.push(qaResults);
    if (graphResults.length > 0) rrfInputSets.push(graphResults);
    if (localCacheResults.length > 0) rrfInputSets.push(localCacheResults);

    let rankedResults: any[] = [];
    if (rrfInputSets.length >= 2) {
      const fused = applyExplicitFusedWeighting(reciprocalRankFusion(rrfInputSets));
      const ranked = await rankCandidatesPrimitive({
        query: input.query,
        candidates: fused as any,
        limit,
      });
      rankedResults = ranked.ranked;
    } else {
      const merged = mergeAndDeduplicate([
        kvResults,
        textResults as any[],
        remoteVectorResults as any[],
        qaResults,
        graphResults,
        localCacheResults as any[],
      ]);
      const ranked = await rankCandidatesPrimitive({
        query: input.query,
        candidates: merged,
        limit,
      });
      rankedResults = ranked.ranked;
    }

    if (!Array.isArray(rankedResults)) {
      return { isError: true, message: "Invalid response from search" };
    }

    // Apply 1.2x boost to facts retroactively enriched in the last 7 days
    const enrichedFactIds = await convex.getRecentlyEnrichedFactIds(7);
    if (enrichedFactIds.size > 0) {
      rankedResults = rankedResults.map((fact: any) => {
        if (enrichedFactIds.has(fact._id)) {
          return {
            ...fact,
            _score: (fact._score ?? 0) * 1.2,
            retroactivelyRelevant: true,
          };
        }
        return fact;
      });
      // Re-sort after boost adjustments
      rankedResults.sort((a: any, b: any) => (b._score ?? 0) - (a._score ?? 0));
    }

    const minImportance = input.minImportance;
    const filteredResults =
      minImportance === undefined
        ? rankedResults
        : rankedResults.filter((fact: any) => (fact.importanceScore ?? 0) >= minImportance);

    let prioritized = [...filteredResults].sort((a: any, b: any) => {
      const tierWeight = (tier?: string) =>
        tier === "critical" ? 3 : tier === "notable" ? 2 : tier === "background" ? 1 : 0;
      const byTier = tierWeight(b.observationTier) - tierWeight(a.observationTier);
      if (byTier !== 0) return byTier;
      return (b.importanceScore ?? 0) - (a.importanceScore ?? 0);
    });

    if (intent === "temporal") {
      prioritized = [...prioritized].sort((a: any, b: any) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    }

    if (kvResults.length > 0) {
      const kvIds = new Set(kvResults.map((row) => row._id));
      const kvFirst = prioritized.filter((row) => kvIds.has(row._id));
      const nonKv = prioritized.filter((row) => !kvIds.has(row._id));
      prioritized = [...kvFirst, ...nonKv];
    }

    const factIdsForSignals = prioritized
      .map((fact: any) => fact._id)
      .filter((factId: string) => !factId.startsWith("kv:"));

    if (factIdsForSignals.length > 0) {
      await bumpAccessBatch({ factIds: factIdsForSignals }).catch((err) => {
        console.error("[recall] Failed to bump access for some facts:", err);
      });
    }

    const recallId = randomUUID();
    if (factIdsForSignals.length > 0) {
      await recordRecall({ recallId, factIds: factIdsForSignals });
    }

    let responseFacts = prioritized;
    let tokenUsage: TokenUsage | undefined;
    let factsTruncated = false;
    let tokensUsed: number | undefined;
    let tokensAvailable: number | null | undefined;

    if (effectiveTokenBudget !== undefined) {
      const budgeted = applyTokenBudget(prioritized, effectiveTokenBudget);
      responseFacts = budgeted.facts;
      tokenUsage = budgeted.tokenUsage;
      factsTruncated = budgeted.tokenUsage.truncated;
      tokensUsed = budgeted.tokenUsage.used;
      tokensAvailable = effectiveTokenBudget - budgeted.tokenUsage.used;
    }

    await convex
      .logEvent({
        eventType: "recall_completed",
        agentId,
        scopeId: scopeIds[0],
        payload: {
          recallId,
          query: input.query.slice(0, 300),
          factCount: responseFacts.length,
          tokensUsed:
            tokensUsed ??
            responseFacts.reduce((sum: number, fact: any) => sum + (fact.tokenEstimate ?? estimateTokens(fact.content ?? "")), 0),
          tokenBudget: effectiveTokenBudget ?? null,
          factsTruncated,
          searchStrategy: input.searchStrategy ?? "hybrid",
          intent,
        },
      })
      .catch((err) => {
        console.error("[recall] Event logging failed (non-fatal):", err);
      });

    return {
      facts: responseFacts,
      recallId,
      pathways: pathways.length > 0 ? pathways : ["none"],
      intent,
      tokenUsage,
      tokenBudget: effectiveTokenBudget ?? null,
      tokensUsed,
      tokensAvailable,
      factsTruncated,
    };
  } catch (error: any) {
    console.error("[recall] Error:", error);
    return {
      isError: true,
      message: `Recall failed: ${error.message}`,
    };
  }
}
