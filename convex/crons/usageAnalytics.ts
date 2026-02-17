import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Usage Analytics Rollup — Aggregate daily stats per agent.
 *
 * Runs daily at 0:30 UTC. Counts facts stored, recalls, signals,
 * and sessions per agent for the previous 24h window.
 */
export const runUsageAnalytics = internalAction({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.runQuery(internal.functions.agents.listAgents, {});
    if (!agents || agents.length === 0) return;

    const now = Date.now();
    const windowStart = now - 24 * 60 * 60 * 1000;

    for (const agent of agents) {
      try {
        // Count events in the last 24h for this agent
        const events = await ctx.runQuery(internal.functions.events.getEventsByAgent, {
          agentId: agent.agentId,
          since: windowStart,
          limit: 1000,
        });

        if (!events || events.length === 0) continue;

        const stats: Record<string, number> = {};
        for (const event of events) {
          // memory_events stores eventType, not type
          const type = event.eventType ?? "unknown";
          stats[type] = (stats[type] ?? 0) + 1;
        }

        // Store the daily rollup as an event
        await ctx.runMutation(internal.functions.events.recordEvent, {
          agentId: agent.agentId,
          type: "daily_analytics",
          payload: {
            date: new Date(now).toISOString().split("T")[0],
            windowStart,
            windowEnd: now,
            totalEvents: events.length,
            breakdown: stats,
          },
        });
      } catch (e) {
        console.error(`[usage-analytics] Failed for ${agent.agentId}:`, e);
      }
    }
  },
});
