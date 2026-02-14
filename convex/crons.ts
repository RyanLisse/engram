import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily: Garbage collection (earliest, at 2:00 UTC)
crons.daily("cleanup", { hourUTC: 2, minuteUTC: 0 }, internal.crons.cleanup.runCleanup);

// Daily: Differential relevance decay
crons.daily("decay", { hourUTC: 3, minuteUTC: 0 }, internal.crons.decay.runDecay);

// Daily: Active forgetting
crons.daily("forget", { hourUTC: 3, minuteUTC: 30 }, internal.crons.forget.runForget);

// Daily: Conversation compaction
crons.daily("compact", { hourUTC: 4, minuteUTC: 0 }, internal.crons.compact.runCompact);

// Weekly: Fact consolidation into themes (Sunday at 5:00 UTC)
crons.weekly("consolidate", { dayOfWeek: "sunday", hourUTC: 5, minuteUTC: 0 }, internal.crons.consolidate.runConsolidate);

// Weekly: Importance recalculation (Sunday at 6:00 UTC)
crons.weekly("rerank", { dayOfWeek: "sunday", hourUTC: 6, minuteUTC: 0 }, internal.crons.rerank.runRerank);

// Daily: Steering rule extraction (runs daily but only processes on 1st of month)
crons.daily("rules", { hourUTC: 7, minuteUTC: 0 }, internal.crons.rules.runRules);

// Every 5 min: Mirror sync heartbeat (MCP daemon performs IO)
crons.interval("vault-sync-heartbeat", { minutes: 5 }, internal.crons.sync.runSync);

// Every 5 min: Vault index regeneration trigger
crons.interval(
  "vault-regenerate-indices",
  { minutes: 5 },
  internal.crons.regenerateIndices.runRegenerateIndices
);

export default crons;
