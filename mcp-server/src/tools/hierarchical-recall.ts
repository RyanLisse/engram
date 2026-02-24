/**
 * memory_hierarchical_recall — PageIndex-inspired graph traversal retrieval.
 *
 * Instead of flat vector/text similarity, traverses the entity→fact graph:
 * 1. Find relevant entities by name search
 * 2. Follow backlinks to facts
 * 3. Follow entity relationships (1 hop)
 * 4. Follow temporal links from top facts (2 hops)
 * 5. Rank by importance × recency × depth
 *
 * "Similarity ≠ relevance" — hierarchical traversal beats vector search
 * for structured knowledge retrieval (98.7% accuracy per PageIndex paper).
 */

import { z } from "zod";
import { resolveScopes } from "./context-primitives.js";
import { getEntitiesPrimitive } from "./primitive-retrieval.js";
import * as convex from "../lib/convex-client.js";

export const hierarchicalRecallSchema = z.object({
  query: z.string().describe("Search query — matched against entity names and fact content"),
  scopeId: z.string().optional().describe("Scope ID or name to filter results"),
  entityTypes: z
    .array(z.string())
    .optional()
    .describe("Filter root entities by type (person|project|tool|concept|company)"),
  maxDepth: z
    .number()
    .min(0)
    .max(3)
    .optional()
    .default(2)
    .describe("Max traversal depth (0=entities only, 1=+relationships, 2=+temporal links)"),
  limit: z.number().optional().default(15).describe("Maximum facts to return"),
});

export type HierarchicalRecallInput = z.infer<typeof hierarchicalRecallSchema>;

interface ScoredFact {
  fact: any;
  score: number;
  depth: number;
  path: string[];
}

/** Batch-fetch facts by ID, skipping any that fail or don't exist. */
async function getFactsByIds(factIds: string[]): Promise<any[]> {
  const results = await Promise.all(
    factIds.map((id) => convex.getFact(id).catch(() => null))
  );
  return results.filter(Boolean);
}

export async function hierarchicalRecall(
  input: HierarchicalRecallInput,
  agentId: string
): Promise<{ facts: any[]; traversalStats: any } | { isError: true; message: string }> {
  try {
    const scopeResolution = await resolveScopes({ scopeId: input.scopeId }, agentId);
    const scopeIds = "isError" in scopeResolution ? [] : scopeResolution.scopeIds;

    const maxDepth = input.maxDepth ?? 2;
    const seen = new Set<string>();
    const scored: ScoredFact[] = [];
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    const recencyDecay = (timestamp: number) =>
      Math.exp(-(now - timestamp) / THIRTY_DAYS_MS);

    // ─── Depth 0: Find root entities ──────────────────────────────
    let entities: any[];
    try {
      entities = await getEntitiesPrimitive({
        query: input.query,
        type: input.entityTypes?.length === 1 ? input.entityTypes[0] : undefined,
        limit: 5,
      });
    } catch {
      entities = [];
    }

    if (entities.length === 0) {
      // Fallback: no entities matched, do text search on facts directly
      console.error("[hierarchical-recall] No entities found, falling back to text search");
      // Import dynamically to avoid circular deps
      const { textSearch } = await import("./primitive-retrieval.js");
      const textResults = await textSearch({
        query: input.query,
        limit: input.limit,
        scopeIds,
      });
      return {
        facts: textResults as any[],
        traversalStats: { mode: "fallback-text", entities: 0, depth: 0 },
      };
    }

    // ─── Depth 0: Backlinked facts from root entities ─────────────
    for (const entity of entities) {
      const entityImportance = entity.importanceScore ?? 0.5;
      let backlinks: any[];

      try {
        backlinks = entity.backlinks
          ? await getFactsByIds(entity.backlinks.slice(0, 20))
          : [];
      } catch {
        backlinks = [];
      }

      for (const fact of backlinks) {
        if (!fact || seen.has(fact._id)) continue;
        if (fact.lifecycleState && fact.lifecycleState !== "active") continue;
        if (scopeIds.length && !scopeIds.includes(fact.scopeId)) continue;

        seen.add(fact._id);
        scored.push({
          fact,
          score: (fact.importanceScore ?? 0.5) * entityImportance * recencyDecay(fact.timestamp),
          depth: 0,
          path: [entity.name],
        });
      }
    }

    // ─── Depth 1: Related entities' backlinks ─────────────────────
    if (maxDepth >= 1) {
      for (const entity of entities) {
        if (!entity.relationships) continue;

        for (const rel of entity.relationships.slice(0, 5)) {
          let relatedEntity: any;
          try {
            const results = await getEntitiesPrimitive({ query: rel.targetId, limit: 1 });
            relatedEntity = results[0];
          } catch {
            continue;
          }

          if (!relatedEntity?.backlinks) continue;

          let relBacklinks: any[];
          try {
            relBacklinks = await getFactsByIds(
              relatedEntity.backlinks.slice(0, 10),
            );
          } catch {
            continue;
          }

          for (const fact of relBacklinks) {
            if (!fact || seen.has(fact._id)) continue;
            if (fact.lifecycleState && fact.lifecycleState !== "active") continue;
            if (scopeIds.length && !scopeIds.includes(fact.scopeId)) continue;

            seen.add(fact._id);
            scored.push({
              fact,
              score: (fact.importanceScore ?? 0.5) * recencyDecay(fact.timestamp) * 0.6,
              depth: 1,
              path: [entity.name, rel.relationType, relatedEntity.name],
            });
          }
        }
      }
    }

    // ─── Depth 2: Temporal links from top-scored facts ────────────
    if (maxDepth >= 2 && scored.length > 0) {
      const topFacts = [...scored]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      for (const { fact, path } of topFacts) {
        if (!fact.temporalLinks) continue;

        for (const link of fact.temporalLinks.slice(0, 3)) {
          if (seen.has(link.targetFactId)) continue;

          let linked: any;
          try {
            const results = await getFactsByIds([link.targetFactId]);
            linked = results[0];
          } catch {
            continue;
          }

          if (!linked || (linked.lifecycleState && linked.lifecycleState !== "active")) continue;
          if (scopeIds.length && !scopeIds.includes(linked.scopeId)) continue;

          seen.add(linked._id);
          scored.push({
            fact: linked,
            score:
              (linked.importanceScore ?? 0.5) *
              recencyDecay(linked.timestamp) *
              0.3 *
              (link.confidence ?? 0.5),
            depth: 2,
            path: [...path, link.relation],
          });
        }
      }
    }

    // ─── Sort and return ──────────────────────────────────────────
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, input.limit ?? 15);

    return {
      facts: results.map(({ fact, score, depth, path }) => ({
        ...fact,
        _hierarchicalScore: Math.round(score * 1000) / 1000,
        _traversalDepth: depth,
        _traversalPath: path,
      })),
      traversalStats: {
        entities: entities.length,
        totalTraversed: seen.size,
        maxDepthReached: Math.max(0, ...results.map((r) => r.depth)),
        returned: results.length,
      },
    };
  } catch (error: any) {
    console.error("[hierarchical-recall] Error:", error);
    return {
      isError: true,
      message: `Hierarchical recall failed: ${error.message}`,
    };
  }
}
