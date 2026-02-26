/**
 * Minimal hybrid recall for the auto-recall hook (UserPromptSubmit).
 * Uses vector + text search and RRF so the hook gets the same quality as memory_recall with strategy "hybrid".
 */

import { resolveScopes } from "./tools/context-primitives.js";
import { vectorSearch, textSearch } from "./tools/primitive-retrieval.js";
import { reciprocalRankFusion } from "./lib/rrf.js";

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
    const resolved = await resolveScopes({}, agentId);
    if ("isError" in resolved) {
      return { ok: false, message: resolved.message };
    }
    const scopeIds = resolved.scopeIds;
    if (!scopeIds.length) {
      return { ok: true, facts: [] };
    }

    const [vectorResults, textResults] = await Promise.all([
      vectorSearch({ query, scopeIds, agentId, limit: limit + 5 }),
      textSearch({ query, scopeIds, limit: limit + 5 }),
    ]);

    const vectorList = Array.isArray(vectorResults) ? vectorResults : [];
    const textList = Array.isArray(textResults) ? textResults : [];
    const fused = reciprocalRankFusion([vectorList, textList], 60);

    const facts = fused.slice(0, limit).map((f: any) => ({
      content: typeof f.content === "string" ? f.content : String(f.content ?? ""),
    }));

    return { ok: true, facts };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
