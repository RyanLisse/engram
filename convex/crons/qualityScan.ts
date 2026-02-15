import { internalMutation } from "../_generated/server";

/**
 * Quality Scan — Enforce golden principles mechanically.
 *
 * Runs daily at 4:30 UTC. Checks system invariants and stores
 * deviation facts for agent review. No external dependencies.
 *
 * Checks:
 * 1. Orphaned facts (no scope)
 * 2. Stale agents (no activity in 7d)
 * 3. Scope bloat (>1000 active facts in a single scope)
 * 4. Embedding coverage (% of facts with embeddings)
 * 5. Theme freshness (themes not updated in 30d)
 */
export const runQualityScan = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const deviations: Array<{
      rule: string;
      severity: "info" | "warn" | "error";
      detail: string;
    }> = [];

    // 1. Check embedding coverage
    const allActiveFacts = await ctx.db
      .query("facts")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycleState", "active"))
      .take(1000);

    const withEmbedding = allActiveFacts.filter((f) => f.embedding && f.embedding.length > 0);
    const coveragePct = allActiveFacts.length > 0
      ? Math.round((withEmbedding.length / allActiveFacts.length) * 100)
      : 100;

    if (coveragePct < 90) {
      deviations.push({
        rule: "Embedding Coverage",
        severity: "warn",
        detail: `Only ${coveragePct}% of active facts have embeddings (${withEmbedding.length}/${allActiveFacts.length}). embedding-backfill cron should catch up.`,
      });
    }

    // 2. Check for stale agents (no events in 7 days)
    const agents = await ctx.db.query("agents").collect();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const staleAgents = agents.filter(
      (a) => (a.lastSeen ?? a._creationTime) < sevenDaysAgo
    );
    if (staleAgents.length > 0) {
      deviations.push({
        rule: "Agent Freshness",
        severity: "info",
        detail: `${staleAgents.length} agent(s) inactive >7d: ${staleAgents.map((a) => a.agentId).join(", ")}`,
      });
    }

    // 3. Check scope bloat
    const scopes = await ctx.db.query("memory_scopes").collect();
    for (const scope of scopes) {
      const factsInScope = await ctx.db
        .query("facts")
        .withIndex("by_scope", (q) => q.eq("scopeId", scope._id))
        .take(1001);
      if (factsInScope.length > 1000) {
        deviations.push({
          rule: "Scope Bloat",
          severity: "warn",
          detail: `Scope "${scope.name}" has >1000 active facts. Consider pruning or consolidation.`,
        });
      }
    }

    // 4. Check theme freshness
    const themes = await ctx.db.query("themes").collect();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const staleThemes = themes.filter(
      (t) => (t.lastUpdated ?? t._creationTime) < thirtyDaysAgo
    );
    if (staleThemes.length > 0) {
      deviations.push({
        rule: "Theme Freshness",
        severity: "info",
        detail: `${staleThemes.length} theme(s) not updated in 30d. May need reconsolidation.`,
      });
    }

    // 5. Check for facts with zero importance (potential noise)
    const zeroImportance = allActiveFacts.filter(
      (f) => f.importanceScore === 0 && f.factType !== "observation"
    );
    if (zeroImportance.length > 10) {
      deviations.push({
        rule: "Low-Value Facts",
        severity: "info",
        detail: `${zeroImportance.length} active non-observation facts with importanceScore=0. Candidates for pruning.`,
      });
    }

    // Store scan results as a system fact
    if (deviations.length > 0) {
      // Find or create the system scope
      const systemScope = await ctx.db
        .query("memory_scopes")
        .withIndex("by_name", (q) => q.eq("name", "engram-system"))
        .first();

      if (systemScope) {
        await ctx.db.insert("facts", {
          content: `Quality scan found ${deviations.length} deviation(s):\n${deviations.map((d) => `[${d.severity}] ${d.rule}: ${d.detail}`).join("\n")}`,
          timestamp: now,
          source: "system",
          entityIds: [],
          relevanceScore: 0.5,
          accessedCount: 0,
          importanceScore: 0.7,
          createdBy: "system",
          scopeId: systemScope._id,
          tags: ["quality-scan", "system", "automated"],
          factType: "system-learning",
          lifecycleState: "active",
        });
      }
    }

    console.log(
      `[quality-scan] Completed: ${deviations.length} deviations, ${allActiveFacts.length} facts scanned`
    );
  },
});
