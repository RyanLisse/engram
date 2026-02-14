/**
 * memory_get_context — Warm start with token-aware injection
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const getContextSchema = z.object({
  topic: z.string().describe("Topic to gather context about"),
  maxFacts: z.number().optional().default(20).describe("Maximum facts to include"),
  includeEntities: z.boolean().optional().default(true).describe("Include related entities"),
  includeThemes: z.boolean().optional().default(true).describe("Include thematic clusters"),
  scopeId: z.string().optional().describe("Scope to search within"),
});

export type GetContextInput = z.infer<typeof getContextSchema>;

export async function getContext(
  input: GetContextInput,
  agentId: string
): Promise<
  | {
      facts: any[];
      entities: any[];
      themes: any[];
      recentHandoffs: any[];
      summary: string;
    }
  | { isError: true; message: string }
> {
  try {
    // Resolve scope
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
      const permitted = await convex.getPermittedScopes(agentId);
      if (permitted && Array.isArray(permitted)) {
        scopeIds = permitted.map((s: any) => s._id);
      }
    }

    // Search for relevant facts
    const facts = await convex.searchFacts({
      query: input.topic,
      limit: input.maxFacts,
      scopeIds,
    });

    if (!Array.isArray(facts)) {
      return {
        isError: true,
        message: "Invalid facts response",
      };
    }

    // Gather entities if requested
    let entities: any[] = [];
    if (input.includeEntities) {
      const entityResults = await convex.searchEntities({
        query: input.topic,
        limit: 10,
      });
      if (Array.isArray(entityResults)) {
        entities = entityResults;
      }
    }

    // Gather themes if requested
    let themes: any[] = [];
    if (input.includeThemes && scopeIds && scopeIds.length > 0) {
      // Get themes from first scope (simplified)
      const themeResults = await convex.getThemesByScope(scopeIds[0]);
      if (Array.isArray(themeResults)) {
        // Filter themes relevant to topic (simple string match)
        themes = themeResults.filter(
          (theme: any) =>
            theme.title?.toLowerCase().includes(input.topic.toLowerCase()) ||
            theme.description?.toLowerCase().includes(input.topic.toLowerCase())
        );
      }
    }

    // Get recent handoffs from other agents
    let recentHandoffs: any[] = [];
    if (scopeIds && scopeIds.length > 0) {
      try {
        recentHandoffs = await convex.getRecentHandoffs(agentId, scopeIds, 5);
      } catch (error) {
        console.error("[get-context] Failed to fetch handoffs:", error);
      }
    }

    // Generate summary
    const summary = `Context for "${input.topic}": ${facts.length} facts, ${entities.length} entities, ${themes.length} themes, ${recentHandoffs.length} recent handoffs`;

    return {
      facts,
      entities,
      themes,
      recentHandoffs,
      summary,
    };
  } catch (error: any) {
    console.error("[get-context] Error:", error);
    return {
      isError: true,
      message: `Failed to get context: ${error.message}`,
    };
  }
}
