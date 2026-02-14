import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

export const runRegenerateIndices = internalAction({
  args: {},
  handler: async (ctx) => {
    return await ctx.runAction(internal.actions.regenerateIndices.regenerateIndices, {});
  },
});
