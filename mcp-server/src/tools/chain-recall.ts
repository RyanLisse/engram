/**
 * memory_chain_recall — Multi-hop QA retrieval using reasoning chains.
 *
 * Uses QA pairs as the entry point for structured retrieval:
 *   Hop 1: QA index search (qaQuestion/qaAnswer semantic match)
 *   Hop 2: Entity expansion — find facts sharing entities with hop 1 results
 *   Hop 3: Causal traversal — follow temporalLinks from hop 2 top facts
 *
 * Each fact is annotated with _hopDepth. Deduplication across hops keeps
 * the shallowest depth (closest to the query).
 */

import { z } from "zod";
import { resolveScopes } from "./context-primitives.js";
import { getEntitiesPrimitive } from "./primitive-retrieval.js";
import * as convex from "../lib/convex-client.js";

export const chainRecallSchema = z.object({
  query: z.string().describe("Initial query to start the chain"),
  maxHops: z.number().min(1).max(5).optional().default(3).describe("Maximum reasoning hops (1–5)"),
  scopeId: z.string().optional().describe("Scope to search within (defaults to all permitted scopes)"),
  limit: z.number().optional().default(10).describe("Max facts per hop"),
});

export type ChainRecallInput = z.infer<typeof chainRecallSchema>;

/** Batch-fetch facts by ID, silently skipping missing/errored ones. */
async function getFactsByIds(factIds: string[]): Promise<any[]> {
  if (factIds.length === 0) return [];
  const results = await Promise.all(
    factIds.map((id) => convex.getFact(id).catch(() => null))
  );
  return results.filter(Boolean) as any[];
}

export async function chainRecall(
  input: ChainRecallInput,
  agentId: string
): Promise<
  | { chain: any[]; totalHops: number; factsPerHop: number[] }
  | { isError: true; message: string }
> {
  try {
    // ── Resolve scope(s) ─────────────────────────────────────────
    const scopeResolution = await resolveScopes({ scopeId: input.scopeId }, agentId);
    if ("isError" in scopeResolution) return scopeResolution;
    const scopeIds = scopeResolution.scopeIds;

    const maxHops = input.maxHops ?? 3;
    const perHopLimit = input.limit ?? 10;

    // Dedup registry: factId → _hopDepth (keeps shallowest depth)
    const seen = new Map<string, number>();
    const chain: any[] = [];
    const factsPerHop: number[] = [];

    function addToChain(fact: any, hopDepth: number, provenance?: Record<string, any>): boolean {
      if (!fact?._id) return false;
      if (fact.lifecycleState && fact.lifecycleState !== "active") return false;
      if (scopeIds.length > 0 && !scopeIds.includes(fact.scopeId)) return false;

      const existing = seen.get(fact._id);
      if (existing !== undefined) {
        // Already in chain at a shallower or equal depth — skip
        return false;
      }
      seen.set(fact._id, hopDepth);
      chain.push({ ...fact, _hopDepth: hopDepth, _chainProvenance: provenance });
      return true;
    }

    // ── Hop 1: QA index search ────────────────────────────────────
    let hop1Count = 0;
    let hop1Facts: any[] = [];
    if (scopeIds.length > 0) {
      try {
        const qaResults = await convex.searchByQA({
          query: input.query,
          scopeIds,
          limit: perHopLimit,
        });
        hop1Facts = Array.isArray(qaResults) ? qaResults : [];
      } catch (err: any) {
        console.error("[chain-recall] Hop 1 QA search failed:", err?.message);
      }
    }

    // Fallback: if QA index returns nothing (no qaQuestion fields set yet),
    // use text search so the tool still works on facts without QA enrichment
    if (hop1Facts.length === 0 && scopeIds.length > 0) {
      try {
        const textResults = await convex.searchFactsMulti({
          query: input.query,
          scopeIds,
          limit: perHopLimit,
        });
        hop1Facts = Array.isArray(textResults) ? textResults : [];
      } catch {
        // silently skip
      }
    }

    for (const fact of hop1Facts) {
      const provenance =
        fact.qaQuestion
          ? {
              via: "qa",
              qaQuestion: fact.qaQuestion,
              qaConfidence: fact.qaConfidence ?? null,
            }
          : {
              via: "text-fallback",
              query: input.query,
            };
      if (addToChain(fact, 0, provenance)) hop1Count++;
    }
    factsPerHop.push(hop1Count);

    if (maxHops < 2 || hop1Facts.length === 0) {
      return { chain, totalHops: Math.min(maxHops, 1), factsPerHop };
    }

    // ── Hop 2: Entity expansion ───────────────────────────────────
    // Collect unique entity IDs from hop 1 results, resolve to entities,
    // then follow each entity's backlinks to related facts.
    let hop2Count = 0;
    const hop2CandidateFacts: Array<{ fact: any; provenance: Record<string, any> }> = [];

    const hop1EntityIds = Array.from(
      new Set(
        hop1Facts.flatMap((f: any) => (Array.isArray(f.entityIds) ? f.entityIds : []))
      )
    ).slice(0, 10); // cap entity expansion

    for (const entityId of hop1EntityIds) {
      let entity: any;
      try {
        const matches = await getEntitiesPrimitive({ query: entityId, limit: 1 });
        entity = matches[0];
      } catch {
        continue;
      }

      if (!entity?.backlinks?.length) continue;

      const backlinks = await getFactsByIds(entity.backlinks.slice(0, perHopLimit));
      for (const fact of backlinks) {
        hop2CandidateFacts.push({
          fact,
          provenance: {
            via: "entity-backlink",
            entityId,
            sourceHop: 1,
          },
        });
      }
    }

    // If entity expansion yields nothing (sparse backlinks), broaden with
    // a text search using QA answers from hop 1 as sub-queries
    if (hop2CandidateFacts.length === 0 && scopeIds.length > 0) {
      const qaAnswers = hop1Facts
        .filter((f: any) => f.qaAnswer)
        .map((f: any) => f.qaAnswer as string)
        .slice(0, 3);

      for (const answer of qaAnswers) {
        try {
          const results = await convex.searchFactsMulti({
            query: answer,
            scopeIds,
            limit: Math.ceil(perHopLimit / qaAnswers.length),
          });
          if (Array.isArray(results)) {
            hop2CandidateFacts.push(
              ...results.map((fact: any) => ({
                fact,
                provenance: {
                  via: "qa-answer-search",
                  answer,
                  sourceHop: 1,
                },
              }))
            );
          }
        } catch {
          // skip
        }
      }
    }

    for (const candidate of hop2CandidateFacts) {
      if (addToChain(candidate.fact, 1, candidate.provenance)) hop2Count++;
    }
    factsPerHop.push(hop2Count);

    if (maxHops < 3 || hop2CandidateFacts.length === 0) {
      return { chain, totalHops: Math.min(maxHops, 2), factsPerHop };
    }

    // ── Hop 3: Temporal/causal link traversal ─────────────────────
    // Follow temporalLinks from the highest-importance hop 2 facts
    let hop3Count = 0;

    const hop2Facts = chain.filter((f) => f._hopDepth === 1);
    const topHop2 = hop2Facts
      .sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0))
      .slice(0, 5);

    for (const fact of topHop2) {
      if (!Array.isArray(fact.temporalLinks)) continue;

      for (const link of fact.temporalLinks.slice(0, 4)) {
        const targetId = link.targetFactId;
        if (!targetId || seen.has(targetId)) continue;

        let linked: any;
        try {
          const results = await getFactsByIds([targetId]);
          linked = results[0];
        } catch {
          continue;
        }

        if (
          addToChain(linked, 2, {
            via: "temporal-link",
            sourceFactId: fact._id,
            relation: link.relation,
            confidence: link.confidence ?? null,
          })
        ) hop3Count++;
      }
    }
    factsPerHop.push(hop3Count);

    // For maxHops > 3: additional hops would follow the same temporal/entity
    // expansion pattern. Cap at 3 for now since the graph grows exponentially.
    const actualHops = factsPerHop.filter((n) => n > 0).length;

    return {
      chain,
      totalHops: Math.max(1, actualHops),
      factsPerHop,
    };
  } catch (error: any) {
    console.error("[chain-recall] Error:", error);
    return { isError: true, message: `Chain recall failed: ${error.message}` };
  }
}
