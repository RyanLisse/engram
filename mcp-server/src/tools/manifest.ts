/**
 * memory_get_manifest — Tiered context overview for Progressive Disclosure.
 *
 * Returns pinned facts (always-loaded tier) + a category distribution
 * (count + recent snippet per factType) without loading the full corpus.
 * Agents use this to decide which categories to recall on-demand.
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { resolveScopes } from "./context-primitives.js";

export const getManifestSchema = z.object({
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent's private scope)"),
  includePinnedContent: z.boolean().optional().default(true).describe("Include full content of pinned facts (false returns summaries only)"),
});

export type GetManifestInput = z.infer<typeof getManifestSchema>;

interface ManifestCategory {
  type: string;
  count: number;
  recentSummary: string; // snippet from the most recent fact in this category
}

interface ManifestResult {
  pinned: Array<{
    factId: string;
    content?: string;
    summary?: string;
    tags: string[];
    timestamp: number;
  }>;
  categories: ManifestCategory[];
  totalFacts: number;
  totalPinned: number;
  scopeId: string;
  hint: string;
}

export async function getManifest(
  input: GetManifestInput,
  agentId: string
): Promise<ManifestResult | { isError: true; message: string }> {
  try {
    // ── 1. Resolve scope ──────────────────────────────────────────
    let resolvedScopeId = input.scopeId;

    if (!resolvedScopeId) {
      const privateScope = await convex.getScopeByName(`private-${agentId}`);
      if (privateScope) {
        resolvedScopeId = privateScope._id;
      } else {
        const agent = await convex.getAgentByAgentId(agentId);
        if (agent?.defaultScope) resolvedScopeId = agent.defaultScope;
      }
    }

    if (!resolvedScopeId) {
      return { isError: true, message: `No scope found for agent ${agentId}` };
    }

    // Resolve name → Convex ID if needed (names don't start with "j")
    if (!resolvedScopeId.startsWith("j")) {
      const scope = await convex.getScopeByName(resolvedScopeId);
      if (!scope) {
        return { isError: true, message: `Scope "${resolvedScopeId}" not found` };
      }
      resolvedScopeId = scope._id;
    }

    // ── 2. Fetch pinned facts using the by_pinned_scope index ─────
    const pinnedRaw = await convex.getPinnedFacts({ scopeId: resolvedScopeId });
    const pinnedFacts = (Array.isArray(pinnedRaw) ? pinnedRaw : []) as any[];

    // ── 3. Fetch a representative sample for distribution ─────────
    // Load up to 300 recent active facts to count by factType.
    // We never need embeddings for a manifest, just metadata.
    const allRaw = await convex.listFactsByScope({ scopeId: resolvedScopeId, limit: 300 });
    const allFacts = (Array.isArray(allRaw) ? allRaw : []) as any[];

    // ── 4. Compute category distribution ─────────────────────────
    const typeMap = new Map<string, { count: number; recent: any }>();
    for (const fact of allFacts) {
      if (fact.lifecycleState === "pruned" || fact.lifecycleState === "merged") continue;
      const type: string = fact.factType ?? "unknown";
      const existing = typeMap.get(type);
      if (!existing) {
        typeMap.set(type, { count: 1, recent: fact });
      } else {
        existing.count++;
        // Keep the most recent fact per type (facts are newest-first from the index)
        if (!existing.recent || fact.timestamp > existing.recent.timestamp) {
          existing.recent = fact;
        }
      }
    }

    const categories: ManifestCategory[] = Array.from(typeMap.entries())
      .sort((a, b) => b[1].count - a[1].count) // most common types first
      .map(([type, { count, recent }]) => ({
        type,
        count,
        recentSummary: recent
          ? (recent.summary ?? (recent.content as string ?? "").slice(0, 120))
          : "",
      }));

    // ── 5. Build pinned result entries ────────────────────────────
    const pinned = pinnedFacts.map((fact: any) => {
      const entry: ManifestResult["pinned"][number] = {
        factId: fact._id,
        summary: fact.summary,
        tags: fact.tags ?? [],
        timestamp: fact.timestamp,
      };
      if (input.includePinnedContent !== false) {
        entry.content = fact.content;
      }
      return entry;
    });

    return {
      pinned,
      categories,
      totalFacts: allFacts.filter(
        (f: any) => f.lifecycleState !== "pruned" && f.lifecycleState !== "merged"
      ).length,
      totalPinned: pinned.length,
      scopeId: resolvedScopeId,
      hint: "Pinned facts are always loaded. Use memory_recall to load specific categories on-demand.",
    };
  } catch (error: any) {
    console.error("[getManifest] Error:", error);
    return { isError: true, message: `Failed to get manifest: ${error.message}` };
  }
}
