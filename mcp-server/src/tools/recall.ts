/**
 * memory_recall — Semantic search for facts (primary retrieval method)
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { randomUUID } from "crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const recallSchema = z.object({
  query: z.string().describe("Search query for semantic recall"),
  limit: z.number().optional().default(10).describe("Maximum number of facts to return"),
  scopeId: z.string().optional().describe("Scope ID or name to search within"),
  factType: z.string().optional().describe("Filter by fact type"),
  minImportance: z.number().optional().describe("Minimum importance score (0-1)"),
});

export type RecallInput = z.infer<typeof recallSchema>;

export async function recall(
  input: RecallInput,
  agentId: string
): Promise<{ facts: any[]; recallId: string } | { isError: true; message: string }> {
  try {
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

    // Perform search (full-text for now; vector search comes in Phase 3)
    const results = await convex.searchFacts({
      query: queryText,
      limit: input.limit,
      scopeIds,
      factType: input.factType,
      minImportance: input.minImportance,
    });

    if (!results || !Array.isArray(results)) {
      return {
        isError: true,
        message: "Invalid response from search",
      };
    }

    // Bump access count on all returned facts
    await Promise.all(
      results.map((fact: any) =>
        convex.bumpAccess(fact._id).catch((err) => {
          console.error(`[recall] Failed to bump access for ${fact._id}:`, err);
        })
      )
    );

    // Generate recallId for feedback tracking
    const recallId = randomUUID();

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
