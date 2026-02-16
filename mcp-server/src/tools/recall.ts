/**
 * memory_recall — Semantic search for facts (primary retrieval method)
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
import { resolveScopes } from "./context-primitives.js";
import type { SearchStrategy } from "../lib/ranking.js";

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
});

export type RecallInput = z.infer<typeof recallSchema>;

export async function recall(
  input: RecallInput,
  agentId: string
): Promise<{ facts: any[]; recallId: string } | { isError: true; message: string }> {
  try {
    console.error("[deprecation] memory_recall is a compatibility wrapper over primitive tools");
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

    const byId = new Map<string, any>();
    for (const row of textResults as any[]) byId.set(row._id, { ...row, lexicalScore: 1 });
    for (const row of vectorResults as any[]) {
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
    const results = ranked.ranked;

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

    return {
      facts: prioritized,
      recallId,
    };
  } catch (error: any) {
    console.error("[recall] Error:", error);
    return {
      isError: true,
      message: `Recall failed: ${error.message}`,
    };
  }
}
