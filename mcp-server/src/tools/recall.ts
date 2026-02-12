/**
 * memory_recall — Semantic search for facts (primary retrieval method)
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { randomUUID } from "crypto";

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
      query: input.query,
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

    return {
      facts: results,
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
