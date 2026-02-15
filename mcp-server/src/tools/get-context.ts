import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import {
  getEntitiesPrimitive,
  getHandoffs,
  getNotifications,
  getThemesPrimitive,
  markNotificationsRead,
} from "./primitive-retrieval.js";
import {
  getGraphNeighbors,
  loadBudgetedFacts,
  resolveScopes,
  searchDailyNotes,
} from "./context-primitives.js";

export const getContextSchema = z.object({
  topic: z.string().describe("Topic to gather context about"),
  maxFacts: z.number().optional().default(20).describe("Maximum facts to include"),
  tokenBudget: z.number().optional().default(4000).describe("Max token budget"),
  profile: z
    .enum(["default", "planning", "incident", "handoff"])
    .optional()
    .default("default")
    .describe("Context profile"),
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
      notifications: any[];
      agentContext: {
        agentId: string;
        name?: string;
        capabilities: string[];
        telos?: string;
        defaultScope?: string;
        permittedScopes: string[];
      };
      sources: {
        observations: any[];
        dailyNotes: any[];
        searchResults: any[];
        graphNeighbors: any[];
      };
      summary: string;
    }
  | { isError: true; message: string }
> {
  try {
    console.error("[deprecation] memory_get_context is a compatibility wrapper over primitive tools");
    const agent = await convex.getAgentByAgentId(agentId);
    const scopeResolution = await resolveScopes({ scopeId: input.scopeId }, agentId);
    if ("isError" in scopeResolution) {
      return scopeResolution;
    }
    const scopeIds = scopeResolution.scopeIds;

    const budgeted = await loadBudgetedFacts({
      query: input.topic,
      tokenBudget: input.tokenBudget,
      scopeId: scopeIds[0],
      maxFacts: input.maxFacts,
      profile: input.profile,
    });
    let facts = budgeted.facts;

    if (!Array.isArray(facts)) {
      return {
        isError: true,
        message: "Invalid facts response",
      };
    }

    // Gather entities if requested
    let entities: any[] = [];
    if (input.includeEntities) {
      const entityResults = await getEntitiesPrimitive({
        query: input.topic,
        limit: 10,
      });
      if (Array.isArray(entityResults)) {
        entities = entityResults;
      }
    }

    // Gather themes if requested
    let themes: any[] = [];
    if (input.includeThemes && scopeIds.length > 0) {
      const scopedThemes = await getThemesPrimitive({ scopeId: scopeIds[0], limit: 20 });
      if (Array.isArray(scopedThemes)) {
        // Filter themes relevant to topic (simple string match)
        themes = (scopedThemes as any[]).filter(
          (theme: any) =>
            theme.name?.toLowerCase().includes(input.topic.toLowerCase()) ||
            theme.description?.toLowerCase().includes(input.topic.toLowerCase())
        );
      }
    }

    // Get recent handoffs from other agents
    let recentHandoffs: any[] = [];
    if (scopeIds.length > 0) {
      try {
        recentHandoffs = (await getHandoffs({ scopeIds, limit: 5 }, agentId)) as any[];
      } catch (error) {
        console.error("[get-context] Failed to fetch handoffs:", error);
      }
    }

    let notifications: any[] = [];
    try {
      const unread = await getNotifications({ limit: 10 }, agentId);
      if (Array.isArray(unread)) {
        notifications = unread;
        await markNotificationsRead({ notificationIds: unread.map((n: any) => n._id) });
      }
    } catch (error) {
      console.error("[get-context] Failed to fetch notifications:", error);
    }

    const observations = facts.filter((f: any) =>
      ["critical", "notable", "background"].includes(f.observationTier)
    );

    let dailyNotes: Array<{ path: string; snippet: string }> = [];
    try {
      const dailyResults = await searchDailyNotes({
        query: input.topic,
        maxFiles: 5,
        snippetLength: 160,
      });
      dailyNotes = dailyResults.notes;
    } catch {
      // optional source
    }

    const searchResults = facts.slice(0, 10);
    const topicEntityIds = [...new Set(entities.map((e: any) => e.entityId).filter(Boolean))];
    let graphNeighbors: any[] = [];
    if (topicEntityIds.length > 0) {
      try {
        const neighborResults = await getGraphNeighbors({
          entityIds: topicEntityIds,
          scopeIds,
          limit: 20,
        });
        graphNeighbors = neighborResults.neighbors;
      } catch (error) {
        console.error("[get-context] Failed to fetch graph neighbors:", error);
      }
    }

    // Generate summary
    const summary = `Context(${input.profile}) for "${input.topic}": ${facts.length} facts (${budgeted.usedTokens}/${budgeted.tokenBudget} tokens), ${entities.length} entities, ${themes.length} themes, ${recentHandoffs.length} handoffs, ${notifications.length} notifications, ${dailyNotes.length} daily notes`;

    return {
      facts,
      entities,
      themes,
      recentHandoffs,
      notifications,
      agentContext: {
        agentId,
        name: agent?.name,
        capabilities: agent?.capabilities ?? [],
        telos: agent?.telos,
        defaultScope: agent?.defaultScope,
        permittedScopes: scopeIds,
      },
      sources: {
        observations,
        dailyNotes,
        searchResults,
        graphNeighbors,
      },
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
