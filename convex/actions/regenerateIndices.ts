"use node";

import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { generateHierarchicalVaultIndex, VAULT_INDEX_CACHE_KEY } from "../lib/vaultIndex";

/**
 * Regenerate hierarchical vault index and cache it in system_config.
 * This provides deterministic index retrieval for recall pipelines.
 */
export const regenerateIndices = action({
  args: {},
  handler: async (ctx) => {
    const scopes = await ctx.runQuery(api.functions.scopes.listAll, {});
    const entities = await ctx.runQuery(internal.functions.entities.listAllInternal, {});

    const factsByScope: Record<string, any[]> = {};
    let factCount = 0;
    for (const scope of scopes) {
      const facts = await ctx.runQuery(internal.functions.facts.listByScope, {
        scopeId: scope._id,
        limit: 5000,
      });
      const activeFacts = facts.filter((fact) => fact.lifecycleState === "active");
      factsByScope[scope._id] = activeFacts;
      factCount += activeFacts.length;
    }

    const index = generateHierarchicalVaultIndex({
      scopes: scopes.map((scope) => ({ _id: scope._id as string, name: scope.name })),
      entities: entities.map((entity) => ({
        entityId: entity.entityId,
        name: entity.name,
        type: entity.type,
      })),
      factsByScope: Object.fromEntries(
        Object.entries(factsByScope).map(([scopeId, facts]) => [
          scopeId,
          facts.map((fact) => ({
            _id: fact._id as string,
            content: fact.content,
            scopeId: fact.scopeId as string,
            entityIds: fact.entityIds,
            timestamp: fact.timestamp,
            importanceScore: fact.importanceScore,
            lifecycleState: fact.lifecycleState,
          })),
        ])
      ),
    });

    const cacheResult = await ctx.runMutation(api.functions.config.setConfig, {
      key: VAULT_INDEX_CACHE_KEY,
      value: index,
      category: "cache",
      description: "Hierarchical vault index cache for retrieval pipelines",
      updatedBy: "system:vault-index-regenerator",
    });

    return {
      ok: true,
      scopeCount: Array.isArray(scopes) ? scopes.length : 0,
      entityCount: Array.isArray(entities) ? entities.length : 0,
      factCount,
      indexLength: index.length,
      cacheKey: VAULT_INDEX_CACHE_KEY,
      cacheResult,
      regeneratedAt: Date.now(),
    };
  },
});
