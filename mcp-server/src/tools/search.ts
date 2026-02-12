/**
 * memory_search — Full-text + structured filters for precise lookups
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const searchSchema = z.object({
  text: z.string().optional().describe("Full-text search query"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  factType: z.string().optional().describe("Filter by fact type"),
  agentId: z.string().optional().describe("Filter by creator agent ID"),
  dateRange: z
    .object({
      start: z.number().describe("Start timestamp (ms)"),
      end: z.number().describe("End timestamp (ms)"),
    })
    .optional()
    .describe("Filter by creation date range"),
  scopeId: z.string().optional().describe("Scope ID or name to search within"),
  limit: z.number().optional().default(20).describe("Maximum results"),
});

export type SearchInput = z.infer<typeof searchSchema>;

export async function search(
  input: SearchInput,
  agentId: string
): Promise<{ facts: any[] } | { isError: true; message: string }> {
  try {
    // Resolve scopeId if provided
    let scopeIds: string[] | undefined;

    if (input.scopeId) {
      if (!input.scopeId.startsWith("j")) {
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
      // Get all permitted scopes
      const permitted = await convex.getPermittedScopes(agentId);
      if (permitted && Array.isArray(permitted)) {
        scopeIds = permitted.map((s: any) => s._id);
      }
    }

    // Build search args
    const searchArgs: any = {
      query: input.text || "",
      limit: input.limit,
      scopeIds,
      factType: input.factType,
    };

    // Call searchFacts (it handles full-text + filters)
    const results = await convex.searchFacts(searchArgs);

    if (!results || !Array.isArray(results)) {
      return {
        isError: true,
        message: "Invalid search response",
      };
    }

    // Apply additional filters client-side (tags, agentId, dateRange)
    let filtered = results;

    if (input.tags && input.tags.length > 0) {
      filtered = filtered.filter((fact: any) =>
        input.tags!.some((tag) => fact.tags?.includes(tag))
      );
    }

    if (input.agentId) {
      filtered = filtered.filter((fact: any) => fact.createdBy === input.agentId);
    }

    if (input.dateRange) {
      filtered = filtered.filter(
        (fact: any) =>
          fact._creationTime >= input.dateRange!.start &&
          fact._creationTime <= input.dateRange!.end
      );
    }

    return { facts: filtered };
  } catch (error: any) {
    console.error("[search] Error:", error);
    return {
      isError: true,
      message: `Search failed: ${error.message}`,
    };
  }
}
