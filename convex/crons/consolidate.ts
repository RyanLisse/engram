import { internalMutation } from "../_generated/server";

export const runConsolidate = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all active facts
    const facts = await ctx.db
      .query("facts")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycleState", "active"))
      .take(500);

    // Group facts by entity sets (facts mentioning the same entities)
    const entitySetGroups: Map<string, typeof facts> = new Map();

    for (const fact of facts) {
      // Create a sorted key from entity ID strings to group facts about same entities
      const entityKey = fact.entityIds.length > 0
        ? fact.entityIds.map((id) => id.toString()).sort().join(",")
        : "no-entities";

      if (!entitySetGroups.has(entityKey)) {
        entitySetGroups.set(entityKey, []);
      }
      entitySetGroups.get(entityKey)!.push(fact);
    }

    // Pre-load all themes ONCE outside the loop (avoids N+1 full table scan)
    const allThemes = await ctx.db.query("themes").take(2000);

    // Build a lookup map: entityKey → theme (O(1) lookup inside loop)
    const themeByEntityKey = new Map<string, typeof allThemes[number]>();
    for (const theme of allThemes) {
      const key = theme.entityIds.length > 0
        ? theme.entityIds.map((id) => id.toString()).sort().join(",")
        : "no-entities";
      if (!themeByEntityKey.has(key)) themeByEntityKey.set(key, theme);
    }

    // Process groups with 3+ facts about the same entity set
    for (const [entityKey, factsInGroup] of entitySetGroups) {
      if (factsInGroup.length < 3) continue;

      const existingTheme = themeByEntityKey.get(entityKey);

      const themeId = existingTheme
        ? existingTheme._id
        : await ctx.db.insert("themes", {
            name: `Theme for entities: ${entityKey.substring(0, 50)}`,
            description: `Consolidated facts about ${factsInGroup.length} related observations`,
            factIds: factsInGroup.map((f) => f._id),
            entityIds: factsInGroup[0] ? (factsInGroup[0].entityIds as any) : [],
            scopeId: factsInGroup[0].scopeId,
            importance:
              factsInGroup.reduce((sum, f) => sum + (f.importanceScore || 0), 0) /
              factsInGroup.length,
            lastUpdated: Date.now(),
          });

      if (existingTheme) {
        // Update existing theme with new facts
        const currentFactIds = new Set(
          existingTheme.factIds.map((id) => id.toString())
        );
        const newFactIds = factsInGroup
          .filter((f) => !currentFactIds.has(f._id.toString()))
          .map((f) => f._id);

        if (newFactIds.length > 0) {
          const avgNewImportance =
            factsInGroup.reduce(
              (sum, f) => sum + (f.importanceScore || 0),
              0
            ) / factsInGroup.length;

          await ctx.db.patch(themeId, {
            factIds: [...existingTheme.factIds, ...newFactIds],
            importance:
              (existingTheme.importance * existingTheme.factIds.length +
                newFactIds.length * avgNewImportance) /
              (existingTheme.factIds.length + newFactIds.length),
            lastUpdated: Date.now(),
          });
        }
      }

      // Mark original facts as merged into a primary fact (consolidation pattern)
      // Pick the first fact as the primary one to consolidate into
      if (factsInGroup.length > 0) {
        const primaryFact = factsInGroup[0];
        for (let i = 1; i < factsInGroup.length; i++) {
          const fact = factsInGroup[i];
          await ctx.db.patch(fact._id, {
            lifecycleState: "merged",
            mergedInto: primaryFact._id,
            updatedAt: Date.now(),
          });
        }

        // Mark primary fact as consolidation point
        await ctx.db.patch(primaryFact._id, {
          consolidatedFrom: factsInGroup
            .slice(1)
            .map((f) => f._id),
          updatedAt: Date.now(),
        });
      }
    }

    // Self-schedule continuation if there are more facts to process
    // (weekly job — continuation is less critical but still correct)
    if (facts.length === 500) {
      // Note: weekly cron — just log; next weekly run will handle remainder
      console.log("[consolidate] Batch full (500 facts) — remainder will process next week");
    }
  },
});
