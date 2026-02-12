/**
 * memory_query_raw — Escape hatch for direct Convex queries (read-only)
 *
 * Routes queries to the appropriate Convex function based on table name.
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const queryRawSchema = z.object({
  table: z
    .string()
    .describe("Table to query: facts, entities, agents, scopes, sessions, conversations, signals, themes, sync_log"),
  filter: z.record(z.any()).optional().describe("Filter conditions (table-specific)"),
  limit: z.number().optional().default(50).describe("Maximum results (default: 50, max: 50)"),
});

export type QueryRawInput = z.infer<typeof queryRawSchema>;

const ALLOWED_TABLES = [
  "facts",
  "entities",
  "agents",
  "scopes",
  "sessions",
  "conversations",
  "signals",
  "themes",
  "sync_log",
  "memory_scopes",
];

export async function queryRaw(
  input: QueryRawInput,
  agentId: string
): Promise<{ results: any[]; table: string; count: number } | { isError: true; message: string }> {
  try {
    const table = input.table === "scopes" ? "memory_scopes" : input.table;

    if (!ALLOWED_TABLES.includes(table) && !ALLOWED_TABLES.includes(input.table)) {
      return {
        isError: true,
        message: `Invalid table "${input.table}". Allowed: facts, entities, agents, scopes, sessions, conversations, signals, themes, sync_log`,
      };
    }

    const limit = Math.min(input.limit, 50);
    const filter = input.filter || {};
    let results: any[] = [];

    switch (input.table) {
      case "facts": {
        if (filter.factId) {
          const fact = await convex.getFact(filter.factId);
          results = fact ? [fact] : [];
        } else {
          results = await convex.searchFacts({
            query: filter.query || filter.text || "",
            limit,
            scopeIds: filter.scopeId ? [filter.scopeId] : undefined,
            factType: filter.factType,
          });
          if (!Array.isArray(results)) results = [];
        }
        break;
      }

      case "entities": {
        if (filter.entityId) {
          const entity = await convex.getEntityByEntityId(filter.entityId);
          results = entity ? [entity] : [];
        } else {
          results = await convex.searchEntities({
            query: filter.query || filter.name || "",
            type: filter.type,
            limit,
          });
          if (!Array.isArray(results)) results = [];
        }
        break;
      }

      case "agents": {
        if (filter.agentId) {
          const agent = await convex.getAgentByAgentId(filter.agentId);
          results = agent ? [agent] : [];
        } else {
          results = await convex.listAgents();
          if (!Array.isArray(results)) results = [];
        }
        break;
      }

      case "scopes":
      case "memory_scopes": {
        if (filter.name) {
          const scope = await convex.getScopeByName(filter.name);
          results = scope ? [scope] : [];
        } else {
          results = await convex.getPermittedScopes(agentId);
          if (!Array.isArray(results)) results = [];
        }
        break;
      }

      case "sessions": {
        const targetAgent = filter.agentId || agentId;
        results = await convex.getSessionsByAgent(targetAgent);
        if (!Array.isArray(results)) results = [];
        break;
      }

      case "signals": {
        if (filter.factId) {
          results = await convex.getSignalsByFact(filter.factId);
        } else {
          // No generic signal query — return agent's signals
          return {
            isError: true,
            message: "Signals query requires filter.factId. Use memory_record_signal to record, or filter by factId to read.",
          };
        }
        if (!Array.isArray(results)) results = [];
        break;
      }

      case "themes": {
        if (filter.scopeId) {
          results = await convex.getThemesByScope(filter.scopeId);
        } else {
          // Get themes from agent's default scope
          const agent = await convex.getAgentByAgentId(agentId);
          if (agent?.defaultScope) {
            results = await convex.getThemesByScope(agent.defaultScope);
          }
        }
        if (!Array.isArray(results)) results = [];
        break;
      }

      case "sync_log": {
        const syncAgent = filter.agentId || agentId;
        const status = await convex.getSyncStatus(syncAgent);
        results = status ? (Array.isArray(status) ? status : [status]) : [];
        break;
      }

      default:
        return {
          isError: true,
          message: `Table "${input.table}" not supported`,
        };
    }

    // Apply limit
    results = results.slice(0, limit);

    return {
      results,
      table: input.table,
      count: results.length,
    };
  } catch (error: any) {
    console.error("[query-raw] Error:", error);
    return {
      isError: true,
      message: `Query failed: ${error.message}`,
    };
  }
}
