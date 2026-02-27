/**
 * memory_forget — Intentional forgetting tool
 *
 * Allows agents to explicitly forget a fact by ID or by query match.
 * Soft-deletes by setting lifecycleState = "archived" and logs an event.
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { PATHS } from "../lib/convex-paths.js";

export const forgetSchema = z.object({
  factId: z.string().optional().describe("Fact ID to forget (direct)"),
  query: z.string().optional().describe("Find and forget facts matching this query"),
  reason: z.string().describe("Why this fact should be forgotten"),
  limit: z.number().optional().describe("Max facts to forget when using query (default: 1, max: 10)"),
});

export async function forget(
  input: z.infer<typeof forgetSchema>,
  agentId: string,
) {
  try {
    if (!input.factId && !input.query) {
      return { isError: true, message: "Either factId or query is required" };
    }

    const factsToForget: string[] = [];

    if (input.factId) {
      factsToForget.push(input.factId);
    } else if (input.query) {
      // Resolve agent's scope for search
      const scope = await convex.getScopeByName(`private-${agentId}`);
      const scopeId = scope?._id;

      // Search for matching facts
      const results = await convex.query(PATHS.facts.searchFacts, {
        query: input.query,
        scopeId,
        limit: Math.min(input.limit ?? 1, 10),
      });

      if (!results || results.length === 0) {
        return { isError: true, message: `No facts found matching query: "${input.query}"` };
      }

      for (const fact of results) {
        if (fact.lifecycleState === "active") {
          factsToForget.push(fact._id);
        }
      }

      if (factsToForget.length === 0) {
        return { isError: true, message: "Found facts but none are in active state" };
      }
    }

    // Archive each fact and log events
    const forgotten: string[] = [];
    const errors: string[] = [];

    for (const factId of factsToForget) {
      try {
        await convex.mutate(PATHS.facts.archiveFactPublic, { factId });

        // Log forget event
        await convex.mutate(PATHS.events.logEvent, {
          eventType: "fact.forgotten",
          factId,
          agentId,
          payload: { reason: input.reason },
        });

        forgotten.push(factId);
      } catch (err: any) {
        errors.push(`${factId}: ${err.message ?? String(err)}`);
      }
    }

    return {
      forgotten,
      count: forgotten.length,
      reason: input.reason,
      ...(errors.length > 0 ? { errors } : {}),
    };
  } catch (error: any) {
    return { isError: true, message: error.message ?? String(error) };
  }
}
