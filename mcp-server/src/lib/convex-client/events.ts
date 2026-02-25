/**
 * Convex HTTP Client — Events domain
 */

import { mutate, query, PATHS } from "./core.js";

export async function logEvent(args: {
  eventType: string;
  factId?: string;
  scopeId?: string;
  agentId?: string;
  payload?: Record<string, string | number | boolean | null>;
}) {
  return await mutate(PATHS.events.logEvent, args);
}

/**
 * Returns the set of fact IDs retroactively enriched in the last N days.
 * Used by recall tools to apply a 1.2x relevance boost.
 */
export async function getRecentlyEnrichedFactIds(daysBack = 7): Promise<Set<string>> {
  try {
    const result = await query<{ factIds: string[] }>(
      PATHS.retroactiveEnrich.getRecentlyEnrichedFactIds,
      { daysBack }
    );
    return new Set(result?.factIds ?? []);
  } catch {
    // Non-fatal: if enrichment lookup fails, recall proceeds without boost
    return new Set();
  }
}
