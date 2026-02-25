import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily: notification cleanup
crons.daily(
  "notification-cleanup",
  { hourUTC: 1, minuteUTC: 30 },
  internal.crons.cleanup.cleanExpiredNotifications
);

// Daily: Garbage collection (earliest, at 2:00 UTC)
crons.daily("cleanup", { hourUTC: 2, minuteUTC: 0 }, internal.crons.cleanup.runCleanup);

// Daily: cross-agent deduplication in shared scopes
crons.daily("dedup", { hourUTC: 2, minuteUTC: 30 }, internal.crons.dedup.runDedup);

// Daily: Differential relevance decay
crons.daily("decay", { hourUTC: 3, minuteUTC: 0 }, internal.crons.decay.runDecay);

// Daily: Active forgetting pipeline (ALMA)
crons.daily(
  "forget-pipeline",
  { hourUTC: 3, minuteUTC: 30 },
  internal.crons.forgetPipeline.runForgetPipeline
);

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

// Every 15 min: Re-embed facts that failed enrichment
crons.interval(
  "embedding-backfill",
  { minutes: 15 },
  internal.crons.embeddingBackfill.runEmbeddingBackfill
);

// Every 30 min: Check for stale agents + send notifications
crons.interval(
  "agent-health",
  { minutes: 30 },
  internal.crons.agentHealth.runAgentHealth
);

// Daily: Usage analytics rollup per agent
crons.daily(
  "usage-analytics",
  { hourUTC: 0, minuteUTC: 30 },
  internal.crons.usageAnalytics.runUsageAnalytics
);

// Daily: Golden principles quality scan
crons.daily(
  "quality-scan",
  { hourUTC: 4, minuteUTC: 30 },
  internal.crons.qualityScan.runQualityScan
);

// Weekly: Learning synthesis from feedback signals (Sunday at 7:30 UTC)
crons.weekly(
  "learning-synthesis",
  { dayOfWeek: "sunday", hourUTC: 7, minuteUTC: 30 },
  internal.crons.learningSynthesis.runLearningSynthesis
);

// Weekly: Promote successful patterns into candidate golden principles (Monday 8:00 UTC)
crons.weekly(
  "update-golden-principles",
  { dayOfWeek: "monday", hourUTC: 8, minuteUTC: 0 },
  internal.crons.updateGoldenPrinciples.runUpdateGoldenPrinciples
);

// Every 10 min: Observer/Reflector threshold sweep
crons.interval(
  "observer-sweep",
  { minutes: 10 },
  internal.crons.observerSweep.runObserverSweep
);

// Every 15 min: Proactive action recommendations
crons.interval(
  "action-recommendations",
  { minutes: 15 },
  internal.crons.actionRecommendations.runActionRecommendations
);

// Weekly: Subspace centroid recomputation + pruning (Sunday at 8:30 UTC)
crons.weekly(
  "consolidate-subspaces",
  { dayOfWeek: "sunday", hourUTC: 8, minuteUTC: 30 },
  internal.crons.consolidateSubspaces.runConsolidateSubspaces
);

// Weekly: Subspace re-merge — compress expanded principal vectors back to TARGET_K (Sunday at 9:00 UTC)
crons.weekly(
  "subspace-remerge",
  { dayOfWeek: "sunday", hourUTC: 9, minuteUTC: 0 },
  internal.crons.subspaceRemerge.runSubspaceRemerge
);

export default crons;
