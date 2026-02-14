import { internalMutation } from "../_generated/server";

/**
 * Placeholder hook for vault sync observability.
 * The MCP daemon performs actual mirror IO.
 */
export const runSync = internalMutation({
  args: {},
  handler: async () => {
    return {
      ok: true,
      ranAt: Date.now(),
    };
  },
});
