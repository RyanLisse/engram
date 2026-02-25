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

const VAULT_INDEX_CACHE_KEY = "vault_index";

type VaultIndexEntityAnchor = {
  name: string;
  type?: string;
  matchedBy: "entity" | "fact";
};

type ParsedVaultIndex = {
  scopes: Array<{
    name: string;
    entities: Array<{
      name: string;
      type?: string;
      facts: string[];
    }>;
  }>;
};

const TYPE_BY_HEADING: Record<string, string> = {
  people: "person",
  projects: "project",
  tools: "tool",
  concepts: "concept",
  companies: "company",
};

function parseCachedVaultIndex(indexContent: string): ParsedVaultIndex {
  const scopes: ParsedVaultIndex["scopes"] = [];
  let currentScope: ParsedVaultIndex["scopes"][number] | null = null;
  let currentType: string | undefined;
  let currentEntity: ParsedVaultIndex["scopes"][number]["entities"][number] | null = null;

  for (const rawLine of indexContent.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    if (line.startsWith("## Scope: ")) {
      currentScope = { name: line.slice("## Scope: ".length).trim(), entities: [] };
      scopes.push(currentScope);
      currentType = undefined;
      currentEntity = null;
      continue;
    }

    if (line.startsWith("### ")) {
      const heading = line.slice(4).trim().toLowerCase();
      currentType = TYPE_BY_HEADING[heading];
      currentEntity = null;
      continue;
    }

    if (!currentScope) continue;

    if (line.startsWith("- ") && !line.startsWith("- (")) {
      currentEntity = {
        name: line.slice(2).trim(),
        type: currentType,
        facts: [],
      };
      currentScope.entities.push(currentEntity);
      continue;
    }

    if (line.startsWith("  - ") && currentEntity) {
      currentEntity.facts.push(line.slice(4).trim());
    }
  }

  return { scopes };
}

function extractIndexAnchors(args: {
  parsedIndex: ParsedVaultIndex;
  query: string;
  scopeNames?: string[];
  maxAnchors?: number;
}): VaultIndexEntityAnchor[] {
  const normalizedQuery = args.query.toLowerCase().trim();
  if (!normalizedQuery) return [];

  const queryTokens = normalizedQuery.split(/\s+/).filter((token) => token.length >= 2);
  const scopeFilter = args.scopeNames?.length
    ? new Set(args.scopeNames.map((name) => name.toLowerCase()))
    : null;
  const maxAnchors = args.maxAnchors ?? 5;

  const anchors = new Map<string, VaultIndexEntityAnchor>();
  for (const scope of args.parsedIndex.scopes) {
    if (scopeFilter && !scopeFilter.has(scope.name.toLowerCase())) continue;

    for (const entity of scope.entities) {
      const nameLower = entity.name.toLowerCase();
      const matchedByEntity =
        nameLower.includes(normalizedQuery) ||
        queryTokens.some((token) => nameLower.includes(token));
      if (matchedByEntity) {
        anchors.set(entity.name, {
          name: entity.name,
          type: entity.type,
          matchedBy: "entity",
        });
        if (anchors.size >= maxAnchors) return [...anchors.values()];
        continue;
      }

      const matchedByFact = entity.facts.some((factSnippet) => {
        const snippetLower = factSnippet.toLowerCase();
        if (snippetLower.includes(normalizedQuery)) return true;
        return queryTokens.some((token) => snippetLower.includes(token));
      });
      if (!matchedByFact) continue;

      anchors.set(entity.name, {
        name: entity.name,
        type: entity.type,
        matchedBy: "fact",
      });
      if (anchors.size >= maxAnchors) return [...anchors.values()];
    }
  }

  return [...anchors.values()];
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
    if ("isError" in scopeResolution) {
      return scopeResolution;
    }

    const scopeIds = "isError" in scopeResolution ? [] : scopeResolution.scopeIds;
    const resolvedScopeNames = scopeResolution.resolved
      .map((scope) => scope.name)
      .filter((name): name is string => Boolean(name));

    const maxDepth = input.maxDepth ?? 2;
    const seen = new Set<string>();
    const scored: ScoredFact[] = [];
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    let indexCacheHit = false;
    let indexAnchorsUsed = 0;

    const recencyDecay = (timestamp: number) =>
      Math.exp(-(now - timestamp) / THIRTY_DAYS_MS);

    // ─── Index anchor pass: cached vault hierarchy ────────────────
    let indexAnchors: VaultIndexEntityAnchor[] = [];
    try {
      const cachedIndexConfig = await convex.getConfig(VAULT_INDEX_CACHE_KEY);
      const indexValue = cachedIndexConfig?.value;
      if (typeof indexValue === "string" && indexValue.trim().length > 0) {
        indexCacheHit = true;
        const parsedIndex = parseCachedVaultIndex(indexValue);
        indexAnchors = extractIndexAnchors({
          parsedIndex,
          query: input.query,
          scopeNames: resolvedScopeNames,
        });
      }
    } catch {
      // cache unavailable; proceed with graph traversal only
    }

    // ─── Depth 0: Find root entities ──────────────────────────────
    const rootEntityMap = new Map<string, any>();
    const entityBoostById = new Map<string, number>();
    const registerRootEntities = (entitiesToAdd: any[], boost = 0) => {
      for (const entity of entitiesToAdd) {
        const key = entity.entityId ?? entity._id ?? entity.name;
        if (!key) continue;
        if (!rootEntityMap.has(key)) {
          rootEntityMap.set(key, entity);
        }
        if (boost > 0) {
          const existingBoost = entityBoostById.get(key) ?? 0;
          entityBoostById.set(key, Math.max(existingBoost, boost));
        }
      }
    };

    if (indexAnchors.length > 0) {
      for (const anchor of indexAnchors) {
        try {
          const anchoredEntities = await getEntitiesPrimitive({
            query: anchor.name,
            type: input.entityTypes?.length === 1 ? input.entityTypes[0] : undefined,
            limit: 2,
          });
          registerRootEntities(
            anchoredEntities,
            anchor.matchedBy === "entity" ? 0.35 : 0.2,
          );
        } catch {
          // ignore individual anchor misses
        }
      }
      indexAnchorsUsed = indexAnchors.length;
    }

    try {
      const queryEntities = await getEntitiesPrimitive({
        query: input.query,
        type: input.entityTypes?.length === 1 ? input.entityTypes[0] : undefined,
        limit: 5,
      });
      registerRootEntities(queryEntities);
    } catch {
      // fallback handled below
    }
    const entities = [...rootEntityMap.values()];

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
        traversalStats: {
          mode: "fallback-text",
          entities: 0,
          depth: 0,
          indexCacheHit,
          indexAnchorsUsed,
        },
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
        const entityKey = entity.entityId ?? entity._id ?? entity.name;
        const indexBoost = entityBoostById.get(entityKey) ?? 0;
        scored.push({
          fact,
          score:
            (fact.importanceScore ?? 0.5) *
            entityImportance *
            recencyDecay(fact.timestamp) *
            (1 + indexBoost),
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

    // ─── Retroactive enrichment boost (1.2×) ─────────────────────
    // Facts re-projected onto updated subspaces within last 7 days
    // get a relevance boost, and are tagged for caller transparency.
    const enrichedFactIds = await convex.getRecentlyEnrichedFactIds(7);
    if (enrichedFactIds.size > 0) {
      for (const entry of scored) {
        if (enrichedFactIds.has(entry.fact._id)) {
          entry.score *= 1.2;
          entry.fact = { ...entry.fact, retroactivelyRelevant: true };
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
        mode: indexAnchorsUsed > 0 ? "index-anchored" : "graph-only",
        entities: entities.length,
        totalTraversed: seen.size,
        maxDepthReached: Math.max(0, ...results.map((r) => r.depth)),
        returned: results.length,
        indexCacheHit,
        indexAnchorsUsed,
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
