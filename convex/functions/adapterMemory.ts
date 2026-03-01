import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * Doc-to-LoRA Adapter Memory Integration
 *
 * Builds adapter-ready memory documents from consolidated facts.
 * Phase 1: Returns dense documents for context injection.
 * Phase 2: Will trigger D2L hypernetwork to generate LoRA adapters.
 */

// ─── Helper Functions ────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build a dense document from facts, prioritizing factualSummary and QA pairs
 */
function buildDocumentFromFacts(
  facts: any[],
  includeEntities: boolean = false
): { document: string; entityCount: number } {
  const sections: string[] = [];
  const entitySet = new Set<string>();

  // Group facts by type for structured output
  const factsByType = new Map<string, any[]>();
  for (const fact of facts) {
    const type = fact.factType || "observation";
    if (!factsByType.has(type)) {
      factsByType.set(type, []);
    }
    factsByType.get(type)!.push(fact);
  }

  // Build document sections by fact type
  for (const [type, typeFacts] of factsByType) {
    const typeHeader = `## ${type.toUpperCase()}\n`;
    const entries: string[] = [];

    for (const fact of typeFacts) {
      // Collect entities
      if (fact.entityIds?.length) {
        fact.entityIds.forEach((e: string) => entitySet.add(e));
      }

      // Prefer factualSummary, fallback to content
      const mainText = fact.factualSummary || fact.content;

      // Build entry with QA pairs if available
      let entry = `- ${mainText}`;
      if (fact.qaQuestion && fact.qaAnswer) {
        entry += `\n  Q: ${fact.qaQuestion}\n  A: ${fact.qaAnswer}`;
      }
      entries.push(entry);
    }

    if (entries.length > 0) {
      sections.push(typeHeader + entries.join("\n"));
    }
  }

  // Add entity section if requested
  if (includeEntities && entitySet.size > 0) {
    const entityHeader = `## ENTITIES\n`;
    const entityList = Array.from(entitySet)
      .map((e) => `- ${e}`)
      .join("\n");
    sections.push(entityHeader + entityList);
  }

  return {
    document: sections.join("\n\n"),
    entityCount: entitySet.size,
  };
}

// ─── Queries ─────────────────────────────────────────────────────────

/**
 * Build an adapter-ready memory document from facts in a scope.
 * Filters by importance, lifecycle state (active only), and optional fact types.
 */
export const buildAdapterDocument = query({
  args: {
    scopeId: v.id("memory_scopes"),
    factTypes: v.optional(v.array(v.string())),
    maxFacts: v.optional(v.number()),
    minImportance: v.optional(v.float64()),
    includeEntities: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const maxFacts = args.maxFacts ?? 100;
    const minImportance = args.minImportance ?? 0.3;
    const includeEntities = args.includeEntities ?? false;

    // Query facts by scope, ordered by importance
    let facts = await ctx.db
      .query("facts")
      .withIndex("by_scope", (q) => q.eq("scopeId", args.scopeId))
      .filter((q) =>
        q.and(
          q.eq(q.field("lifecycleState"), "active"),
          q.gte(q.field("importanceScore"), minImportance)
        )
      )
      .take(maxFacts * 2); // Fetch extra for filtering

    // Filter by fact types if specified
    if (args.factTypes && args.factTypes.length > 0) {
      facts = facts.filter((f) => args.factTypes!.includes(f.factType));
    }

    // Sort by importance and take top maxFacts
    facts.sort((a, b) => b.importanceScore - a.importanceScore);
    facts = facts.slice(0, maxFacts);

    if (facts.length === 0) {
      return null;
    }

    // Build document
    const { document, entityCount } = buildDocumentFromFacts(facts, includeEntities);

    return {
      document,
      factCount: facts.length,
      entityCount,
      documentLength: document.length,
      tokenEstimate: estimateTokens(document),
      generatedAt: Date.now(),
    };
  },
});

/**
 * List memory modules (adapter-ready knowledge domains) for an agent.
 * Returns scopes with fact counts and metadata.
 */
export const listMemoryModules = query({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, { agentId }) => {
    // Find all scopes this agent is a member of
    const memberships = await ctx.db
      .query("scope_memberships")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .collect();

    const scopeIds = memberships.map((m) => m.scopeId);

    // Get scope details and count facts
    const modules = await Promise.all(
      scopeIds.map(async (scopeId) => {
        const scope = await ctx.db.get(scopeId);
        if (!scope) return null;

        // Count active facts in this scope
        const facts = await ctx.db
          .query("facts")
          .withIndex("by_scope", (q) => q.eq("scopeId", scopeId))
          .filter((q) => q.eq(q.field("lifecycleState"), "active"))
          .take(1000);

        const factCount = facts.length;
        const totalTokens = facts.reduce(
          (sum, f) => sum + (f.tokenEstimate ?? 0),
          0
        );

        return {
          scopeId: scopeId as string,
          name: scope.name,
          description: scope.description,
          mode: "retrieval", // Phase 1: all modules are retrieval mode
          status: factCount > 0 ? "ready" : "empty",
          factCount,
          tokenEstimate: totalTokens,
          lastGeneratedAt: Date.now(),
        };
      })
    );

    return modules.filter((m) => m !== null);
  },
});

/**
 * Build an adapter document for a specific entity and its relationship cluster.
 * Uses BFS to traverse entity relationships up to maxDepth hops.
 */
export const buildEntityClusterDocument = query({
  args: {
    entityId: v.string(),
    scopeId: v.id("memory_scopes"),
    maxDepth: v.optional(v.number()),
    maxFacts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxDepth = args.maxDepth ?? 1;
    const maxFacts = args.maxFacts ?? 50;

    // Find the root entity
    const rootEntity = await ctx.db
      .query("entities")
      .withIndex("by_entity_id", (q) => q.eq("entityId", args.entityId))
      .first();

    if (!rootEntity) {
      return null;
    }

    // BFS to find connected entities
    const visited = new Set<string>([args.entityId]);
    const queue: Array<{ entityId: string; depth: number }> = [
      { entityId: args.entityId, depth: 0 },
    ];
    const clusterEntityIds: string[] = [args.entityId];

    while (queue.length > 0) {
      const { entityId, depth } = queue.shift()!;

      if (depth >= maxDepth) continue;

      // Find entity
      const entity = await ctx.db
        .query("entities")
        .withIndex("by_entity_id", (q) => q.eq("entityId", entityId))
        .first();

      if (!entity) continue;

      // Add related entities to queue
      for (const rel of entity.relationships || []) {
        if (!visited.has(rel.targetId)) {
          visited.add(rel.targetId);
          clusterEntityIds.push(rel.targetId);
          queue.push({ entityId: rel.targetId, depth: depth + 1 });
        }
      }
    }

    // Find facts that reference any entity in the cluster
    const facts = await ctx.db
      .query("facts")
      .withIndex("by_scope", (q) => q.eq("scopeId", args.scopeId))
      .filter((q) =>
        q.and(
          q.eq(q.field("lifecycleState"), "active"),
          q.gt(q.field("importanceScore"), 0.3)
        )
      )
      .take(maxFacts * 2);

    // Filter facts that reference cluster entities
    const clusterFacts = facts
      .filter((f) =>
        f.entityIds?.some((e: string) => clusterEntityIds.includes(e))
      )
      .sort((a, b) => b.importanceScore - a.importanceScore)
      .slice(0, maxFacts);

    if (clusterFacts.length === 0) {
      return null;
    }

    // Build document
    const { document } = buildDocumentFromFacts(clusterFacts, true);

    return {
      document,
      rootEntity: {
        entityId: rootEntity.entityId,
        name: rootEntity.name,
        type: rootEntity.type,
      },
      entityCluster: clusterEntityIds,
      factCount: clusterFacts.length,
      tokenEstimate: estimateTokens(document),
    };
  },
});
