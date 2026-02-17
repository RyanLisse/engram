import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

function normalize(content: string): string {
  return content.toLowerCase().replace(/\s+/g, " ").trim();
}

function detectContradiction(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  const polarityPairs: Array<[string, string]> = [
    ["enabled", "disabled"],
    ["allow", "deny"],
    ["approved", "rejected"],
    ["success", "failed"],
    ["true", "false"],
    ["active", "inactive"],
    ["on", "off"],
  ];
  for (const [positive, negative] of polarityPairs) {
    if (
      (left.includes(positive) && right.includes(negative)) ||
      (left.includes(negative) && right.includes(positive))
    ) return true;
  }
  return false;
}

export const runForget = internalMutation({
  args: {},
  handler: async (ctx) => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const facts = await ctx.db
      .query("facts")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycleState", "active"))
      .take(500);

    // Group by scopeId to batch scope-level queries (O(scopes) not O(facts))
    const scopeIds = [...new Set(facts.map((f) => f.scopeId))];

    // Load all active facts per scope once — reuse for all facts in that scope
    const scopeFactsMap = new Map<string, any[]>();
    await Promise.all(
      scopeIds.map(async (scopeId) => {
        const scopeFacts = await ctx.db
          .query("facts")
          .withIndex("by_scope", (q) => q.eq("scopeId", scopeId))
          .filter((q) => q.eq(q.field("lifecycleState"), "active"))
          .collect();
        scopeFactsMap.set(String(scopeId), scopeFacts);
      })
    );

    for (const fact of facts) {
      let forgetScore = 0;

      if (fact.supersededBy) forgetScore += 0.3;

      const ageInDays = (now - fact.timestamp) / 86_400_000;
      if (fact.accessedCount < 2 && ageInDays > 30) forgetScore += 0.2;
      if (fact.importanceScore < 0.3) forgetScore += 0.2;

      // Pre-computed contradictions from enrichment pipeline (O(1) read)
      if ((fact.contradictsWith?.length ?? 0) > 0) {
        forgetScore += 0.1;
      } else if (
        (fact.entityIds?.length ?? 0) > 0 &&
        (!fact.lastContradictionCheck || now - fact.lastContradictionCheck > SEVEN_DAYS)
      ) {
        // Fallback: check using pre-loaded scope facts (no extra DB queries)
        const scopeFacts = scopeFactsMap.get(String(fact.scopeId)) ?? [];
        const related = scopeFacts.filter(
          (other) =>
            other._id !== fact._id &&
            other.importanceScore > fact.importanceScore &&
            fact.entityIds.some((e: any) => (other.entityIds ?? []).includes(e))
        );

        const hasContradiction = related.some((other) =>
          detectContradiction(fact.content, other.content)
        );

        if (hasContradiction) forgetScore += 0.1;

        // Mark as checked — skip for 7 days
        await ctx.db.patch(fact._id, { lastContradictionCheck: now });
      }

      if (forgetScore > 0.7) {
        await ctx.db.patch(fact._id, {
          lifecycleState: "archived",
          forgetScore,
          updatedAt: now,
        });
      }
    }

    if (facts.length === 500) {
      await ctx.scheduler.runAfter(0, internal.crons.forget.runForget, {});
    }
  },
});
