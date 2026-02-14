"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Lightweight mirror signal.
 * The MCP daemon polls unmirrored facts and writes markdown files.
 */
export const mirrorToVault = internalAction({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    const fact = await ctx.runQuery(internal.functions.facts.getFactInternal, { factId });
    if (!fact) return { queued: false, reason: "missing_fact" };
    if (fact.lifecycleState !== "active") return { queued: false, reason: "inactive_fact" };
    return { queued: true };
  },
});
