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
  ];

  for (const [positive, negative] of polarityPairs) {
    const leftPositive = left.includes(positive);
    const leftNegative = left.includes(negative);
    const rightPositive = right.includes(positive);
    const rightNegative = right.includes(negative);
    if ((leftPositive && rightNegative) || (leftNegative && rightPositive)) {
      return true;
    }
  }

  return false;
}

export const runForget = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Process in batches of 500
    const facts = await ctx.db
      .query("facts")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycleState", "active"))
      .take(500);

    for (const fact of facts) {
      let forgetScore = 0;

      // Superseded by newer fact: +0.3
      if (fact.supersededBy) {
        forgetScore += 0.3;
      }

      // Low access count + old: +0.2
      const ageInDays = (Date.now() - fact.timestamp) / (1000 * 60 * 60 * 24);
      if (fact.accessedCount < 2 && ageInDays > 30) {
        forgetScore += 0.2;
      }

      // Low importance: +0.2
      if (fact.importanceScore < 0.3) {
        forgetScore += 0.2;
      }

      // Contradicts higher-importance fact: +0.1 (entity-linked heuristic)
      if ((fact.entityIds?.length ?? 0) > 0) {
        const related = await ctx.db
          .query("facts")
          .withIndex("by_scope", (q) => q.eq("scopeId", fact.scopeId))
          .filter((q) =>
            q.and(
              q.neq(q.field("_id"), fact._id),
              q.eq(q.field("lifecycleState"), "active"),
              q.gt(q.field("importanceScore"), fact.importanceScore)
            )
          )
          .take(100);

        const hasContradiction = related.some((other) => {
          const sharesEntity = fact.entityIds.some((entityId) =>
            (other.entityIds ?? []).includes(entityId)
          );
          return sharesEntity && detectContradiction(fact.content, other.content);
        });

        if (hasContradiction) {
          forgetScore += 0.1;
        }
      }

      // Archive facts with forgetScore > 0.7
      if (forgetScore > 0.7) {
        await ctx.db.patch(fact._id, {
          lifecycleState: "archived",
          forgetScore: forgetScore,
          updatedAt: Date.now(),
        });
      }
    }

    // Self-schedule continuation if there are more
    if (facts.length === 500) {
      await ctx.scheduler.runAfter(0, internal.crons.forget.runForget, {});
    }
  },
});
