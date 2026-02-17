import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Agent Health Monitor — Check for stale agents and send notifications.
 *
 * Runs every 30 minutes. Flags agents that haven't had activity in 24h+
 * and creates notifications for workspace awareness.
 */
export const runAgentHealth = internalAction({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.runQuery(internal.functions.agents.listAgents, {});

    if (!agents || agents.length === 0) return;

    const now = Date.now();
    const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

    let staleCount = 0;
    for (const agent of agents) {
      // agents table uses lastSeen, not lastActiveAt
      const lastActive = agent.lastSeen ?? agent._creationTime;
      if (now - lastActive > STALE_THRESHOLD_MS) {
        staleCount++;
        // Create a notification for active agents about the stale one
        try {
          await ctx.runMutation(internal.functions.notifications.createNotification, {
            agentId: "system",
            type: "agent_stale",
            title: `Agent "${agent.name || agent.agentId}" inactive for 24h+`,
            payload: {
              staleAgentId: agent.agentId,
              lastActiveAt: lastActive,
              hoursInactive: Math.round((now - lastActive) / (60 * 60 * 1000)),
            },
          });
        } catch (e) {
          // Notification creation may fail if the function doesn't exist yet
          console.error(`[agent-health] Notification failed for ${agent.agentId}:`, e);
        }
      }
    }

    if (staleCount > 0) {
      console.log(`[agent-health] ${staleCount}/${agents.length} agents stale (>24h inactive)`);
    }
  },
});
