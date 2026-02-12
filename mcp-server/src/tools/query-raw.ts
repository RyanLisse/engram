/**
 * memory_query_raw — Escape hatch for direct Convex queries (read-only)
 */

import { z } from "zod";
import { getConvexClient } from "../lib/convex-client.js";

export const queryRawSchema = z.object({
  table: z
    .string()
    .describe("Table to query (facts, entities, agents, scopes, sessions, conversations, signals, themes, sync_log)"),
  filter: z.record(z.any()).optional().describe("Filter conditions"),
  limit: z.number().optional().default(50).describe("Maximum results"),
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
  input: QueryRawInput
): Promise<{ results: any[] } | { isError: true; message: string }> {
  try {
    // Validate table name
    if (!ALLOWED_TABLES.includes(input.table)) {
      return {
        isError: true,
        message: `Invalid table "${input.table}". Allowed: ${ALLOWED_TABLES.join(", ")}`,
      };
    }

    const client = getConvexClient();

    // This is a read-only escape hatch - we can't implement generic queries
    // without knowing the exact Convex function structure.
    // For now, we'll return an error with guidance.

    return {
      isError: true,
      message: `query_raw is not fully implemented yet. Use specific search functions instead (memory_search, memory_recall). Table: ${input.table}`,
    };

    // Future implementation would call a Convex query function that accepts
    // generic table + filter parameters:
    // const results = await client.query("functions/raw:query", {
    //   table: input.table,
    //   filter: input.filter,
    //   limit: input.limit,
    // });
    // return { results };
  } catch (error: any) {
    console.error("[query-raw] Error:", error);
    return {
      isError: true,
      message: `Query failed: ${error.message}`,
    };
  }
}
