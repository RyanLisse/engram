"use node";

import { action } from "../_generated/server";
import { api } from "../_generated/api";

/**
 * Placeholder cron action. Actual markdown index generation is performed by MCP vault tools.
 * This action returns counts to keep scheduled jobs observable in Convex.
 */
export const regenerateIndices = action({
  args: {},
  handler: async (ctx) => {
    const scopes = await ctx.runQuery(api.functions.scopes.listAll, {});
    return {
      ok: true,
      scopeCount: Array.isArray(scopes) ? scopes.length : 0,
      regeneratedAt: Date.now(),
    };
  },
});
