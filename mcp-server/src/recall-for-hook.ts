/**
 * Minimal hybrid recall for the auto-recall hook (UserPromptSubmit).
 * Uses vector + text search and RRF so the hook gets the same quality as memory_recall with strategy "hybrid".
 */

import { resolveScopes } from "./tools/context-primitives.js";
import { vectorSearch, textSearch } from "./tools/primitive-retrieval.js";
import { reciprocalRankFusion } from "./lib/rrf.js";
import * as convex from "./lib/convex-client.js";

export type RecallForHookResult =
  | { ok: true; facts: Array<{ content: string }> }
  | { ok: false; message: string };

/**
 * Run hybrid (vector + text) recall with RRF, return top N fact contents.
 * Used by .claude/hooks/auto-recall.sh so the hook gets RRF-fused results.
 */
export async function recallForHook(
  query: string,
  agentId: string,
  limit: number = 3
): Promise<RecallForHookResult> {
  try {
    const [limitConfig, rrfKConfig, strategyConfig] = await Promise.all([
      convex.getConfig("auto_recall_limit").catch(() => null),
      convex.getConfig("auto_recall_rrf_k").catch(() => null),
      convex.getConfig("auto_recall_strategy").catch(() => null),
    ]);

    const configuredLimit = Number(limitConfig?.value ?? limit);
    const finalLimit = Number.isFinite(configuredLimit) && configuredLimit > 0
      ? Math.floor(configuredLimit)
      : limit;
    const configuredRrfK = Number(rrfKConfig?.value ?? 60);
    const rrfK = Number.isFinite(configuredRrfK) ? configuredRrfK : 60;
    const strategyRaw = String(strategyConfig?.value ?? "hybrid");
    const strategy = strategyRaw === "vector-only" || strategyRaw === "text-only"
      ? strategyRaw
      : "hybrid";

    const resolved = await resolveScopes({}, agentId);
    if ("isError" in resolved) {
      return { ok: false, message: resolved.message };
    }
    const scopeIds = resolved.scopeIds;
    if (!scopeIds.length) {
      return { ok: true, facts: [] };
    }

    const [vectorResults, textResults] = await Promise.all([
      strategy === "text-only"
        ? Promise.resolve([])
        : vectorSearch({ query, scopeIds, agentId, limit: finalLimit + 5 }),
      strategy === "vector-only"
        ? Promise.resolve([])
        : textSearch({ query, scopeIds, limit: finalLimit + 5 }),
    ]);

    const vectorList = Array.isArray(vectorResults) ? vectorResults : [];
    const textList = Array.isArray(textResults) ? textResults : [];
    const fused =
      strategy === "vector-only"
        ? vectorList
        : strategy === "text-only"
          ? textList
          : reciprocalRankFusion([vectorList, textList], rrfK);

    const facts = fused.slice(0, finalLimit).map((f: any) => ({
      content: typeof f.content === "string" ? f.content : String(f.content ?? ""),
    }));

    return { ok: true, facts };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
