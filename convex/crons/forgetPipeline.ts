/**
 * Active Forgetting Pipeline (ALMA) — Daily cron at 2:30 UTC
 *
 * Enhanced forget pipeline that evaluates facts against ALMA criteria:
 * 1. shouldForget: forgetScore > 0.8, accessedCount < 2, age > 30 days, no temporal links, not in active episode
 * 2. shouldArchiveSuperseded: supersededBy is set + newer fact higher confidence
 * 3. shouldCompressBackground: background observation tier, never accessed in 7 days
 *
 * Respects temporal links as protection — facts linked in the temporal graph are preserved.
 */
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { identifyForgetCandidates, identifySuperseded } from "../forget";

export const runForgetPipeline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // 1. Load active facts batch
    const facts = await ctx.db
      .query("facts")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycleState", "active"))
      .take(500);

    if (facts.length === 0) return;
    const [forgetCandidates, supersededCandidates] = await Promise.all([
      identifyForgetCandidates(ctx, { now, limit: 500 }),
      identifySuperseded(ctx, { limit: 500 }),
    ]);
    const forgetCandidateIds = new Set(forgetCandidates.map((fact) => String(fact._id)));
    const supersededCandidateIds = new Set(supersededCandidates.map((fact) => String(fact._id)));

    let archived = 0;
    let compressed = 0;
    let superseded = 0;

    for (const fact of facts) {
      const factId = String(fact._id);

      // ── Check shouldForget ──
      if (forgetCandidateIds.has(factId)) {
        await ctx.db.patch(fact._id, {
          lifecycleState: "archived",
          forgetScore: fact.forgetScore ?? 0,
          ...(fact.vaultPath ? { vaultPath: undefined } : {}),
          updatedAt: now,
        });
        archived++;
        continue;
      }

      // ── Check shouldArchiveSuperseded ──
      if (supersededCandidateIds.has(factId) && fact.supersededBy) {
        const newerFact = await ctx.db.get(fact.supersededBy);
        if (newerFact && (newerFact.confidence ?? 0.5) > (fact.confidence ?? 0.5)) {
          await ctx.db.patch(fact._id, {
            lifecycleState: "archived",
            ...(fact.vaultPath ? { vaultPath: undefined } : {}),
            updatedAt: now,
          });
          superseded++;
          continue;
        }
      }

      // ── Check shouldCompressBackground ──
      const ageMs = now - fact.timestamp;
      if (
        fact.observationTier === "background" &&
        fact.accessedCount === 0 &&
        ageMs > 7 * 24 * 60 * 60 * 1000
      ) {
        await ctx.db.patch(fact._id, {
          observationCompressed: true,
          updatedAt: now,
        });
        compressed++;
      }
    }

    if (archived > 0 || superseded > 0 || compressed > 0) {
      console.log(
        `[forget-pipeline] archived=${archived}, superseded=${superseded}, compressed=${compressed} (of ${facts.length} evaluated)`
      );
    }

    // Self-schedule if batch was full
    if (facts.length === 500) {
      await ctx.scheduler.runAfter(0, internal.crons.forgetPipeline.runForgetPipeline, {});
    }
  },
});
