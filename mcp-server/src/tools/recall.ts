/**
 * memory_recall — Semantic search for facts (primary retrieval method)
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { randomUUID } from "crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { rankCandidates, SearchStrategy } from "../lib/ranking.js";
import {
  bumpAccessBatch,
  recordRecall,
  vectorSearch,
} from "./primitive-retrieval.js";

export const recallSchema = z.object({
  query: z.string().describe("Search query for semantic recall"),
  limit: z.number().optional().default(10).describe("Maximum number of facts to return"),
  scopeId: z.string().optional().describe("Scope ID or name to search within"),
  factType: z.string().optional().describe("Filter by fact type"),
  minImportance: z.number().optional().describe("Minimum importance score (0-1)"),
  searchStrategy: z
    .enum(["vector-only", "text-only", "hybrid"])
    .optional()
    .default("hybrid")
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

    // Resolve scopeId if provided
    let scopeIds: string[] | undefined;

    if (input.scopeId) {
      if (!input.scopeId.startsWith("j")) {
        // Name provided, resolve to ID
        const scope = await convex.getScopeByName(input.scopeId);
        if (!scope) {
          return {
            isError: true,
            message: `Scope "${input.scopeId}" not found`,
          };
        }
        scopeIds = [scope._id];
      } else {
        scopeIds = [input.scopeId];
      }
    } else {
      // Get all permitted scopes for the agent
      const permitted = await convex.getPermittedScopes(agentId);
      if (permitted && Array.isArray(permitted)) {
        scopeIds = permitted.map((s: any) => s._id);
      }
    }

    const strategy = input.searchStrategy as SearchStrategy;
    const textResults =
      strategy === "vector-only"
        ? []
        : await convex.searchFactsMulti({
            query: queryText,
            limit: input.limit,
            scopeIds: scopeIds ?? [],
            factType: input.factType,
          });

    const vectorResults =
      strategy === "text-only" || !scopeIds
        ? []
        : await vectorSearch({
            query: input.query,
            scopeIds,
            limit: input.limit,
          });

    const byId = new Map<string, any>();
    for (const row of textResults as any[]) byId.set(row._id, { ...row, lexicalScore: 1 });
    for (const row of vectorResults as any[]) {
      const id = row._id;
      const merged = byId.get(id);
      if (merged) byId.set(id, { ...merged, _score: Math.max(merged._score ?? 0, row._score ?? 0) });
      else byId.set(id, row);
    }
    const results = rankCandidates(input.query, [...byId.values()]).slice(0, input.limit);

    if (!results || !Array.isArray(results)) {
      return {
        isError: true,
        message: "Invalid response from search",
      };
    }

    // Bump access count on all returned facts
    await bumpAccessBatch({ factIds: results.map((fact: any) => fact._id) }).catch((err) => {
      console.error("[recall] Failed to bump access for some facts:", err);
    });

    // Generate recallId for feedback tracking
    const recallId = randomUUID();
    await recordRecall({
      recallId,
      factIds: results.map((r: any) => r._id),
    });

    const prioritized = [...results].sort((a: any, b: any) => {
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
