import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Sleep-Time Reflection: runs every 4h to consolidate recent memories.
 * Reads recent facts, identifies patterns/preferences/corrections,
 * and stores consolidated reflections without blocking agents.
 *
 * Process:
 * 1. Query facts from last 4 hours across all scopes
 * 2. Group facts by scope
 * 3. For scopes with >3 new facts, extract patterns and create reflection
 * 4. Dedup check before inserting (avoid creating near-duplicate reflections)
 * 5. Tag reflections with source="consolidation" and factType="reflection"
 * 6. Notify active agents in the scope about the new reflection
 */
export const runReflection = internalMutation({
  args: {},
  handler: async (ctx) => {
    const HOURS_BACK = 4;
    const cutoff = Date.now() - HOURS_BACK * 60 * 60 * 1000;
    const now = Date.now();
    const AGENT_ACTIVE_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

    // Get all scopes to process
    const scopes = await ctx.db.query("memory_scopes").collect();
    let reflectionsCreated = 0;
    let scopesProcessed = 0;
    let notificationsSent = 0;

    for (const scope of scopes) {
      // Query recent facts in this scope
      const recentFacts = await ctx.db
        .query("facts")
        .withIndex("by_scope", (q) => q.eq("scopeId", scope._id))
        .filter((q) => q.gte(q.field("timestamp"), cutoff))
        .take(100);

      // Skip scopes with too few facts
      if (recentFacts.length < 3) continue;
      scopesProcessed++;

      // Group facts by type and extract patterns
      const factsByType: Record<string, typeof recentFacts> = {};
      const entityCounts: Record<string, number> = {};
      const allTags = new Set<string>();

      for (const fact of recentFacts) {
        // Group by type
        if (!factsByType[fact.factType]) {
          factsByType[fact.factType] = [];
        }
        factsByType[fact.factType].push(fact);

        // Count entities
        for (const entityId of fact.entityIds) {
          entityCounts[entityId] = (entityCounts[entityId] ?? 0) + 1;
        }

        // Collect tags
        for (const tag of fact.tags) {
          allTags.add(tag);
        }
      }

      // Build reflection summary
      const typeBreakdown = Object.entries(factsByType)
        .map(([type, facts]) => `${type} (${facts.length})`)
        .join(", ");

      const topEntities = Object.entries(entityCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => `${id} mentioned ${count}x`)
        .join("; ");

      const reflectionContent = [
        `**4-Hour Reflection for scope [${scope.name}]**`,
        ``,
        `**Summary**: ${recentFacts.length} facts consolidated in last 4 hours`,
        `**Types**: ${typeBreakdown}`,
        topEntities ? `**Key entities**: ${topEntities}` : "",
        allTags.size > 0 ? `**Tags seen**: ${Array.from(allTags).slice(0, 10).join(", ")}` : "",
        `**Timestamp**: ${new Date(now).toISOString()}`,
      ]
        .filter(Boolean)
        .join("\n");

      // Dedup check: search for similar reflections from last 24h
      const dedupCutoff = now - 24 * 60 * 60 * 1000;
      const existingReflections = await ctx.db
        .query("facts")
        .withIndex("by_scope", (q) => q.eq("scopeId", scope._id))
        .filter((q) =>
          q.and(
            q.gte(q.field("timestamp"), dedupCutoff),
            q.eq(q.field("factType"), "reflection"),
            q.eq(q.field("source"), "consolidation")
          )
        )
        .take(5);

      // Simple dedup: skip if very similar reflection exists
      const isDuplicate = existingReflections.some((existing) => {
        // Check if content is very similar (substring match for simplicity)
        return existing.content.includes(typeBreakdown);
      });

      if (isDuplicate) {
        continue;
      }

      // Create reflection fact
      const reflectionId = await ctx.db.insert("facts", {
        content: reflectionContent,
        timestamp: now,
        updatedAt: now,
        source: "consolidation",
        factType: "reflection",
        scopeId: scope._id,
        tags: ["sleep-time", "auto-reflection"],
        entityIds: [],
        relevanceScore: 0.6, // Moderate — agents can boost if useful
        accessedCount: 0,
        importanceScore: 0.6,
        lifecycleState: "active",
        createdBy: "system:reflection",
      });

      reflectionsCreated++;

      // Notify active agents in this scope about the new reflection
      const scopeMembers = scope.members ?? [];
      const activeAgentWindow = now - AGENT_ACTIVE_WINDOW;
      let scopeNotifications = 0;

      for (const agentId of scopeMembers) {
        // Check if agent is still active (lastSeen within 24h)
        const agent = await ctx.db
          .query("agents")
          .withIndex("by_agent_id", (q) => q.eq("agentId", agentId))
          .first();

        if (!agent || agent.lastSeen < activeAgentWindow) {
          continue;
        }

        // Create notification for this agent
        const reflectionSummary = reflectionContent.slice(0, 100);
        await ctx.runMutation(internal.functions.notifications.create, {
          agentId: agent.agentId,
          factId: reflectionId,
          reason: `New reflection: ${reflectionSummary}...`,
          expiresAt: now + 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        scopeNotifications++;
        notificationsSent++;

        // Limit notifications per sweep (max 10 total)
        if (notificationsSent >= 10) {
          console.log(
            `[reflection] Reached max notifications (${notificationsSent}) — stopping early`
          );
          break;
        }
      }

      if (scopeNotifications > 0) {
        console.log(
          `[reflection] Notified ${scopeNotifications} active agents for scope ${scope.name}`
        );
      }

      // Limit reflections per sweep (max 3 per scope to avoid bloat)
      if (reflectionsCreated >= scopesProcessed * 3) {
        console.log(
          `[reflection] Reached max reflections (${reflectionsCreated}) — stopping early`
        );
        break;
      }
    }

    console.log(
      `[reflection] Processed ${scopesProcessed} scopes, created ${reflectionsCreated} reflections, sent ${notificationsSent} notifications`
    );

    return { scopesProcessed, reflectionsCreated, notificationsSent };
  },
});
