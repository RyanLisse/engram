/**
 * Observer Sweep Cron — periodically checks all observation sessions
 * and schedules Observer/Reflector actions when thresholds are crossed.
 *
 * Runs every 10 minutes. Checks:
 * - pendingTokenEstimate >= observerThreshold → schedule Observer
 * - summaryTokenEstimate >= reflectorThreshold → schedule Reflector
 */

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

export const runObserverSweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("observation_sessions").collect();

    let observerScheduled = 0;
    let reflectorScheduled = 0;

    for (const session of sessions) {
      // Check Observer threshold
      if (session.pendingTokenEstimate >= session.observerThreshold) {
        await ctx.scheduler.runAfter(0, internal.actions.observer.runObserver, {
          scopeId: session.scopeId,
          agentId: session.agentId,
        });
        observerScheduled++;
      }

      // Check Reflector threshold
      if (session.summaryTokenEstimate >= session.reflectorThreshold) {
        await ctx.scheduler.runAfter(0, internal.actions.reflector.runReflector, {
          scopeId: session.scopeId,
          agentId: session.agentId,
        });
        reflectorScheduled++;
      }
    }

    if (observerScheduled > 0 || reflectorScheduled > 0) {
      console.log(
        `[observer-sweep] Scheduled: ${observerScheduled} observers, ${reflectorScheduled} reflectors`
      );
    }
  },
});
