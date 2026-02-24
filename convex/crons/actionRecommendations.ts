import { internalAction } from "../_generated/server";
import { internal, api } from "../_generated/api";

/**
 * Action Recommendations Cron — proactively detects conditions that need agent attention
 * and emits action_recommendation events through the event bus.
 *
 * Checks:
 * - review_stale_facts: stale facts exceeding threshold
 * - process_feedback: unprocessed feedback signals
 * - unread_notifications: notification pile-up
 *
 * Cooldown: Skips agents that already received a recommendation in the last 4 hours.
 */

const STALE_FACTS_THRESHOLD = 20;
const UNREAD_NOTIFICATIONS_THRESHOLD = 10;
const FEEDBACK_SIGNALS_THRESHOLD = 5;
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
const STALE_DAYS = 90;

export const runActionRecommendations = internalAction({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.runQuery(api.functions.agents.list, {});

    if (!agents || agents.length === 0) {
      console.log("[action-recommendations] No registered agents, skipping.");
      return;
    }

    const now = Date.now();
    let totalEmitted = 0;

    for (const agent of agents) {
      const agentId = agent.agentId;

      // ── Cooldown check ──────────────────────────────────────────────
      // Query recent action_recommendation events for this agent
      try {
        const recentRecommendations = await ctx.runQuery(
          internal.functions.events.getRecentByAgentAndType,
          { agentId, eventType: "action_recommendation", sinceMs: COOLDOWN_MS }
        );
        if (recentRecommendations && recentRecommendations.length > 0) {
          continue; // Skip — already recommended within cooldown window
        }
      } catch (e) {
        // If the query doesn't exist yet, proceed without cooldown
        console.error(`[action-recommendations] Cooldown check failed for ${agentId}:`, e);
      }

      // ── Check: review_stale_facts ───────────────────────────────────
      try {
        const staleCount = await ctx.runQuery(
          internal.functions.facts.countStaleFacts,
          { agentId, olderThanDays: STALE_DAYS }
        );
        if (staleCount > STALE_FACTS_THRESHOLD) {
          await ctx.runMutation(internal.functions.events.emit, {
            eventType: "action_recommendation",
            agentId,
            payload: {
              action: "review_stale_facts",
              priority: "medium",
              reason: `${staleCount} facts older than ${STALE_DAYS} days need review`,
              count: staleCount,
              threshold: STALE_FACTS_THRESHOLD,
            },
          });
          totalEmitted++;
        }
      } catch (e) {
        console.error(`[action-recommendations] review_stale_facts check failed for ${agentId}:`, e);
      }

      // ── Check: unread_notifications ─────────────────────────────────
      try {
        const unread = await ctx.runQuery(api.functions.notifications.getUnreadByAgent, {
          agentId,
          limit: UNREAD_NOTIFICATIONS_THRESHOLD + 1,
        });
        const unreadCount = unread?.length ?? 0;
        if (unreadCount > UNREAD_NOTIFICATIONS_THRESHOLD) {
          await ctx.runMutation(internal.functions.events.emit, {
            eventType: "action_recommendation",
            agentId,
            payload: {
              action: "unread_notifications",
              priority: "low",
              reason: `${unreadCount} unread notifications piling up`,
              count: unreadCount,
              threshold: UNREAD_NOTIFICATIONS_THRESHOLD,
            },
          });
          totalEmitted++;
        }
      } catch (e) {
        console.error(`[action-recommendations] unread_notifications check failed for ${agentId}:`, e);
      }

      // ── Check: process_feedback ─────────────────────────────────────
      try {
        const recentSignals = await ctx.runQuery(
          internal.functions.signals.countRecentFeedback,
          { agentId, sinceMs: 24 * 60 * 60 * 1000 }
        );
        if (recentSignals > FEEDBACK_SIGNALS_THRESHOLD) {
          await ctx.runMutation(internal.functions.events.emit, {
            eventType: "action_recommendation",
            agentId,
            payload: {
              action: "process_feedback",
              priority: "medium",
              reason: `${recentSignals} feedback signals in last 24h need processing`,
              count: recentSignals,
              threshold: FEEDBACK_SIGNALS_THRESHOLD,
            },
          });
          totalEmitted++;
        }
      } catch (e) {
        console.error(`[action-recommendations] process_feedback check failed for ${agentId}:`, e);
      }
    }

    if (totalEmitted > 0) {
      console.log(
        `[action-recommendations] Emitted ${totalEmitted} recommendations for ${agents.length} agents`
      );
    }
  },
});
