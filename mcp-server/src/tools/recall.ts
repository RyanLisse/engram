/**
 * memory_recall — Quad-pathway retrieval (semantic + symbolic + topological + local-cache)
 *
 * Combines up to four retrieval pathways using Reciprocal Rank Fusion (RRF):
 *   1. Semantic — vector search via Cohere embeddings (remote Convex)
 *   2. Symbolic — full-text search via Convex
 *   3. Topological — graph expansion via entity edges (conditional)
 *   4. Local-cache — LanceDB local embedding cache (conditional)
 *
 * The graph pathway only activates when initial results contain entity links,
 * avoiding unnecessary work for simple queries. The local-cache pathway only
 * activates when LanceDB is enabled and returns results.
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
import { rankCandidatesPrimitive } from "./rank-candidates.js";
import { resolveScopes, getGraphNeighbors } from "./context-primitives.js";
import { reciprocalRankFusion, extractEntityIds } from "../lib/rrf.js";
import type { SearchStrategy } from "../lib/ranking.js";
import { applyTokenBudget, type TokenUsage } from "../lib/token-budget.js";

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
  maxTokens: z.number().optional().describe("Token budget ceiling — stops accumulating facts once budget is reached. Returns tokenUsage field with used/budget/truncated."),
});

export type RecallInput = z.infer<typeof recallSchema>;

export async function recall(
  input: RecallInput,
  agentId: string
): Promise<{ facts: any[]; recallId: string; pathways: string[]; tokenUsage?: TokenUsage } | { isError: true; message: string }> {
  try {
    console.error("[deprecation] memory_recall is a compatibility wrapper over primitive tools (quad-pathway)");
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

    const strategy = input.searchStrategy as SearchStrategy;
    const textResults =
      strategy === "vector-only" || scopeIds.length === 0
        ? []
        : await textSearch({
            query: queryText,
            limit: input.limit,
            scopeIds,
            factType: input.factType,
          });

    let vectorResults: any[] = [];
    if (!(strategy === "text-only" || scopeIds.length === 0)) {
      try {
        vectorResults = (await vectorSearch({
          query: input.query,
          scopeIds,
          limit: input.limit,
        })) as any[];
      } catch (err: any) {
        console.error("[recall] Vector search unavailable, falling back to text/hybrid ranking:", err?.message ?? err);
      }
    }

    // ── Separate local-cache results from remote vector results ──
    const localCacheResults = vectorResults.filter((r: any) => r._source === "local-cache");
    const remoteVectorResults = vectorResults.filter((r: any) => r._source !== "local-cache");

    // ── Track which pathways contributed ──
    const pathways: string[] = [];

    if (remoteVectorResults.length > 0) pathways.push("semantic");
    if ((textResults as any[]).length > 0) pathways.push("symbolic");
    if (localCacheResults.length > 0) pathways.push("local-cache");

    // ── Pathway 3: Topological (graph expansion) ──
    // Only invoke when initial results contain entity links to avoid useless work.
    const allInitialResults = [...(textResults as any[]), ...remoteVectorResults, ...localCacheResults];
    const entityIds = extractEntityIds(allInitialResults);

    let graphResults: any[] = [];
    if (entityIds.length > 0) {
      try {
        const graphResponse = await getGraphNeighbors({
          entityIds,
          scopeIds: scopeIds.length > 0 ? scopeIds : undefined,
          limit: 10, // Cap graph expansion to avoid overwhelming results
        });
        graphResults = graphResponse.neighbors ?? [];
        if (graphResults.length > 0) {
          pathways.push("graph");
        }
        console.error(`[recall] Graph expansion: ${entityIds.length} entities -> ${graphResults.length} neighbors`);
      } catch (err: any) {
        console.error("[recall] Graph expansion failed (non-fatal):", err?.message ?? err);
      }
    }

    // ── Reciprocal Rank Fusion across all pathways ──
    // Build ranked lists for RRF. Each pathway contributes its own ordering.
    const rrfInputSets: Array<Array<{ _id: string; [key: string]: any }>> = [];

    if (remoteVectorResults.length > 0) {
      rrfInputSets.push(remoteVectorResults as any[]);
    }
    if ((textResults as any[]).length > 0) {
      rrfInputSets.push(textResults as any[]);
    }
    if (graphResults.length > 0) {
      rrfInputSets.push(graphResults);
    }
    if (localCacheResults.length > 0) {
      rrfInputSets.push(localCacheResults as any[]);
    }

    let results: any[];

    if (rrfInputSets.length >= 2) {
      // Multiple pathways: use RRF to merge
      const fused = reciprocalRankFusion(rrfInputSets);
      // Still apply the hybrid ranker for importance/freshness/outcome scoring.
      // The fused facts retain all original Convex fields; cast to satisfy Zod schema.
      const ranked = await rankCandidatesPrimitive({
        query: input.query,
        candidates: fused as any,
        limit: input.limit,
      });
      results = ranked.ranked;
    } else {
      // Single pathway or no results: fall back to the existing merge logic
      const byId = new Map<string, any>();
      for (const row of textResults as any[]) byId.set(row._id, { ...row, lexicalScore: 1 });
      for (const row of remoteVectorResults as any[]) {
        const id = row._id;
        const merged = byId.get(id);
        if (merged) byId.set(id, { ...merged, _score: Math.max(merged._score ?? 0, row._score ?? 0) });
        else byId.set(id, row);
      }
      for (const row of graphResults) {
        if (!byId.has(row._id)) byId.set(row._id, row);
      }
      for (const row of localCacheResults) {
        const id = row._id;
        const merged = byId.get(id);
        if (merged) byId.set(id, { ...merged, _score: Math.max(merged._score ?? 0, row._score ?? 0) });
        else byId.set(id, row);
      }
      const ranked = await rankCandidatesPrimitive({
        query: input.query,
        candidates: [...byId.values()],
        limit: input.limit,
      });
      results = ranked.ranked;
    }

    if (!results || !Array.isArray(results)) {
      return {
        isError: true,
        message: "Invalid response from search",
      };
    }

    const minImportance = input.minImportance;
    const filteredResults =
      minImportance === undefined
        ? results
        : results.filter((fact: any) => (fact.importanceScore ?? 0) >= minImportance);

    // Bump access count on all returned facts
    await bumpAccessBatch({ factIds: filteredResults.map((fact: any) => fact._id) }).catch((err) => {
      console.error("[recall] Failed to bump access for some facts:", err);
    });

    // Generate recallId for feedback tracking
    const recallId = randomUUID();
    await recordRecall({
      recallId,
      factIds: filteredResults.map((r: any) => r._id),
    });

    const prioritized = [...filteredResults].sort((a: any, b: any) => {
      const tierWeight = (tier?: string) =>
        tier === "critical" ? 3 : tier === "notable" ? 2 : tier === "background" ? 1 : 0;
      const byTier = tierWeight(b.observationTier) - tierWeight(a.observationTier);
      if (byTier !== 0) return byTier;
      return (b.importanceScore ?? 0) - (a.importanceScore ?? 0);
    });

    // ── Token budget: stop accumulating once maxTokens is reached ──
    if (input.maxTokens !== undefined) {
      const budgeted = applyTokenBudget(prioritized, input.maxTokens);
      return {
        facts: budgeted.facts,
        recallId,
        pathways: pathways.length > 0 ? pathways : ["none"],
        tokenUsage: budgeted.tokenUsage,
      };
    }

    return {
      facts: prioritized,
      recallId,
      pathways: pathways.length > 0 ? pathways : ["none"],
    };
  } catch (error: any) {
    console.error("[recall] Error:", error);
    return {
      isError: true,
      message: `Recall failed: ${error.message}`,
    };
  }
}
