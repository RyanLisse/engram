/**
 * memory_get_context — Warm start with token-aware injection
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { loadBudgetAwareContext } from "../lib/budget-aware-loader.js";
import fs from "node:fs/promises";
import path from "node:path";

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

    // Search for relevant facts with budget-aware prioritization
    const profileBudgetMultiplier =
      input.profile === "incident" ? 0.8 : input.profile === "planning" ? 1.1 : 1;

    const budgeted = await loadBudgetAwareContext({
      query: input.topic,
      tokenBudget: Math.floor(input.tokenBudget * profileBudgetMultiplier),
      scopeId: scopeIds?.[0],
      maxFacts: input.maxFacts,
    });
    let facts = budgeted.facts.map((item) => item.fact);

    if (input.profile === "incident") {
      facts = facts
        .filter((f: any) => f.observationTier !== "background")
        .sort((a: any, b: any) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0));
    }
    if (input.profile === "handoff") {
      facts = facts.filter((f: any) => f.factType === "session_summary" || f.factType === "decision");
    }

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
            theme.name?.toLowerCase().includes(input.topic.toLowerCase()) ||
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

    let notifications: any[] = [];
    try {
      const unread = await convex.getUnreadNotifications({ agentId, limit: 10 });
      if (Array.isArray(unread)) {
        notifications = unread;
        await convex.markNotificationsRead(unread.map((n: any) => n._id));
      }
    } catch (error) {
      console.error("[get-context] Failed to fetch notifications:", error);
    }

    const observations = facts.filter((f: any) =>
      ["critical", "notable", "background"].includes(f.observationTier)
    );

    const dailyNotes: Array<{ path: string; snippet: string }> = [];
    try {
      const vaultRoot = process.env.VAULT_ROOT || path.resolve(process.cwd(), "..", "vault");
      const dailyDir = path.join(vaultRoot, "daily");
      const files = await fs.readdir(dailyDir);
      for (const file of files.filter((f) => f.endsWith(".md")).slice(0, 5)) {
        const fullPath = path.join(dailyDir, file);
        const content = await fs.readFile(fullPath, "utf8");
        if (!content.toLowerCase().includes(input.topic.toLowerCase())) continue;
        dailyNotes.push({
          path: path.relative(vaultRoot, fullPath),
          snippet: content.replace(/\s+/g, " ").slice(0, 160),
        });
      }
    } catch {
      // optional source
    }

    const searchResults = facts.slice(0, 10);
    const topicEntities = new Set(entities.map((e: any) => e.entityId || e.name));
    const graphNeighbors = facts.filter((fact: any) =>
      (fact.entityIds ?? []).some((id: string) => topicEntities.has(id))
    );

    // Generate summary
    const summary = `Context(${input.profile}) for "${input.topic}": ${facts.length} facts (${budgeted.usedTokens}/${budgeted.tokenBudget} tokens), ${entities.length} entities, ${themes.length} themes, ${recentHandoffs.length} handoffs, ${notifications.length} notifications, ${dailyNotes.length} daily notes`;

    return {
      facts,
      entities,
      themes,
      recentHandoffs,
      notifications,
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
