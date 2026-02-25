import { internalAction, internalMutation } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { VAULT_INDEX_DIRTY_KEY } from "../lib/vaultIndex";

/**
 * Mark the vault index as stale. Called (via scheduler) whenever a fact is
 * stored or an entity is upserted. Idempotent — skips the write if already
 * dirty to avoid hot-row contention on system_config during burst writes.
 */
export const markVaultIndexDirty = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", VAULT_INDEX_DIRTY_KEY))
      .first();

    if (existing) {
      // Already dirty — no-op to prevent churn from concurrent fact stores
      if (existing.value !== null) return;
      // Was previously cleared; re-mark dirty
      await ctx.db.patch(existing._id, {
        value: Date.now(),
        updatedAt: Date.now(),
        updatedBy: "system:vault-index-auto-rebuild",
        version: existing.version + 1,
      });
    } else {
      await ctx.db.insert("system_config", {
        key: VAULT_INDEX_DIRTY_KEY,
        value: Date.now(),
        category: "cache",
        description: "Timestamp when vault index was last invalidated by a mutation",
        version: 1,
        updatedAt: Date.now(),
        updatedBy: "system:vault-index-auto-rebuild",
      });
    }
  },
});

/**
 * Scheduled every 5 minutes via crons.ts.
 * Checks the dirty flag; skips regeneration if the index is already up-to-date.
 * Clears the dirty flag after a successful rebuild.
 */
export const runRegenerateIndices = internalAction({
  args: {},
  handler: async (ctx) => {
    // Skip if nothing has changed since the last rebuild
    const dirtyRow = await ctx.runQuery(api.functions.config.getConfig, {
      key: VAULT_INDEX_DIRTY_KEY,
    });
    if (!dirtyRow || dirtyRow.value === null) {
      return { skipped: true, reason: "vault index is clean" };
    }

    // Rebuild
    const result = await ctx.runAction(
      internal.actions.regenerateIndices.regenerateIndices,
      {}
    );

    // Clear dirty flag so the next cron tick can skip
    await ctx.runMutation(api.functions.config.setConfig, {
      key: VAULT_INDEX_DIRTY_KEY,
      value: null,
      category: "cache",
      description: "Timestamp when vault index was last invalidated by a mutation",
      updatedBy: "system:vault-index-regenerator",
    });

    return result;
  },
});
