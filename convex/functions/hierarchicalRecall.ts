import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * Hierarchical Recall — PageIndex-inspired retrieval.
 *
 * Instead of flat vector similarity, this traverses the entity→fact graph:
 * 1. Find relevant entities (top-level "pages")
 * 2. Follow backlinks to facts
 * 3. Follow temporal links to related facts
 * 4. Rank by importance × recency × depth (not just embedding distance)
 *
 * "Similarity ≠ relevance" — @akshay_pachaar
 */

export const hierarchicalRecall = query({
  args: {
    query: v.string(),
    scopeIds: v.optional(v.array(v.id("memory_scopes"))),
    entityTypes: v.optional(v.array(v.string())), // filter by entity type
    maxDepth: v.optional(v.number()), // how many hops to follow (default: 2)
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const maxDepth = args.maxDepth ?? 2;

    // ─── Step 1: Find root entities (the "pages") ─────────────────
    const entities = await ctx.db
      .query("entities")
      .withSearchIndex("search_name", (s) => {
        let search = s.search("name", args.query);
        if (args.entityTypes?.length === 1) {
          search = search.eq("type", args.entityTypes[0]);
        }
        return search;
      })
      .take(5);

    if (entities.length === 0) {
      // Fallback to full-text search on facts if no entities match
      return await ctx.db
        .query("facts")
        .withSearchIndex("search_content", (q) => q.search("content", args.query))
        .take(limit);
    }

    // ─── Step 2: Collect backlinked facts from entities ────────────
    const seen = new Set<string>();
    const scoredFacts: Array<{
      fact: any;
      score: number;
      depth: number;
      path: string[];
    }> = [];

    for (const entity of entities) {
      const entityImportance = entity.importanceScore ?? 0.5;

      // Direct backlinks (depth 0 — most relevant)
      if (entity.backlinks) {
        for (const factId of entity.backlinks) {
          if (seen.has(factId.toString())) continue;
          seen.add(factId.toString());

          const fact = await ctx.db.get(factId);
          if (!fact || fact.lifecycleState !== "active") continue;

          // Scope filter
          if (args.scopeIds?.length && !args.scopeIds.includes(fact.scopeId)) continue;

          const recencyDecay = Math.exp(
            -(Date.now() - fact.timestamp) / (30 * 24 * 60 * 60 * 1000) // 30-day half-life
          );

          scoredFacts.push({
            fact,
            score: (fact.importanceScore ?? 0.5) * entityImportance * recencyDecay * 1.0,
            depth: 0,
            path: [entity.name],
          });
        }
      }

      // ─── Step 3: Follow entity relationships (depth 1) ──────────
      if (maxDepth >= 1 && entity.relationships) {
        for (const rel of entity.relationships.slice(0, 5)) {
          const relatedEntity = await ctx.db
            .query("entities")
            .withIndex("by_entity_id", (q) => q.eq("entityId", rel.targetId))
            .unique();

          if (!relatedEntity?.backlinks) continue;

          for (const factId of relatedEntity.backlinks.slice(0, 10)) {
            if (seen.has(factId.toString())) continue;
            seen.add(factId.toString());

            const fact = await ctx.db.get(factId);
            if (!fact || fact.lifecycleState !== "active") continue;
            if (args.scopeIds?.length && !args.scopeIds.includes(fact.scopeId)) continue;

            const recencyDecay = Math.exp(
              -(Date.now() - fact.timestamp) / (30 * 24 * 60 * 60 * 1000)
            );

            // Depth 1 gets a 0.6x penalty
            scoredFacts.push({
              fact,
              score: (fact.importanceScore ?? 0.5) * recencyDecay * 0.6,
              depth: 1,
              path: [entity.name, rel.relationType, relatedEntity.name],
            });
          }
        }
      }
    }

    // ─── Step 4: Follow temporal links from top facts (depth 2) ───
    if (maxDepth >= 2) {
      const topFacts = scoredFacts
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      for (const { fact, path } of topFacts) {
        if (!fact.temporalLinks) continue;

        for (const link of fact.temporalLinks.slice(0, 3)) {
          if (seen.has(link.targetFactId.toString())) continue;
          seen.add(link.targetFactId.toString());

          const linked = await ctx.db.get(link.targetFactId);
          if (!linked || linked.lifecycleState !== "active") continue;
          if (args.scopeIds?.length && !args.scopeIds.includes(linked.scopeId)) continue;

          const recencyDecay = Math.exp(
            -(Date.now() - linked.timestamp) / (30 * 24 * 60 * 60 * 1000)
          );

          // Depth 2 gets 0.3x, weighted by link confidence
          scoredFacts.push({
            fact: linked,
            score: (linked.importanceScore ?? 0.5) * recencyDecay * 0.3 * (link.confidence ?? 0.5),
            depth: 2,
            path: [...path, link.relation, linked.content.slice(0, 40)],
          });
        }
      }
    }

    // ─── Step 5: Sort by composite score, return ──────────────────
    scoredFacts.sort((a, b) => b.score - a.score);

    return scoredFacts.slice(0, limit).map(({ fact, score, depth, path }) => ({
      ...fact,
      _hierarchicalScore: score,
      _traversalDepth: depth,
      _traversalPath: path,
    }));
  },
});

/**
 * Hybrid recall: combines hierarchical graph traversal with vector similarity.
 * Best of both worlds — structural relevance + semantic similarity.
 */
export const hybridRecall = query({
  args: {
    query: v.string(),
    embedding: v.optional(v.array(v.float64())),
    scopeIds: v.optional(v.array(v.id("memory_scopes"))),
    limit: v.optional(v.number()),
    graphWeight: v.optional(v.float64()), // 0.0 = pure vector, 1.0 = pure graph. Default: 0.6
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const graphWeight = args.graphWeight ?? 0.6;
    const vectorWeight = 1.0 - graphWeight;

    // Get graph results
    const graphResults = await hierarchicalRecall(ctx, {
      query: args.query,
      scopeIds: args.scopeIds,
      limit: limit * 2,
    });

    // Get vector results if embedding provided
    let vectorResults: any[] = [];
    if (args.embedding) {
      for (const scopeId of args.scopeIds ?? []) {
        try {
          const rows = await (ctx as any).vectorSearch("facts", "vector_search", {
            vector: args.embedding,
            limit: limit,
            filter: (q: any) => q.eq("scopeId", scopeId),
          });
          vectorResults.push(...rows);
        } catch {
          // vectorSearch not available in all contexts
        }
      }
    }

    // Merge: normalize scores and combine
    const maxGraph = Math.max(...graphResults.map((r: any) => r._hierarchicalScore || 0), 0.001);
    const maxVector = Math.max(...vectorResults.map((r: any) => r._score || 0), 0.001);

    const merged = new Map<string, { fact: any; score: number }>();

    for (const r of graphResults) {
      const id = r._id.toString();
      const normalized = ((r as any)._hierarchicalScore || 0) / maxGraph;
      merged.set(id, {
        fact: r,
        score: normalized * graphWeight,
      });
    }

    for (const r of vectorResults) {
      const id = r._id.toString();
      const normalized = (r._score || 0) / maxVector;
      const existing = merged.get(id);
      if (existing) {
        existing.score += normalized * vectorWeight;
      } else {
        merged.set(id, {
          fact: r,
          score: normalized * vectorWeight,
        });
      }
    }

    const results = Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results.map(({ fact, score }) => ({
      ...fact,
      _hybridScore: score,
    }));
  },
});
