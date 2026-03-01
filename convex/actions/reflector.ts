"use node";

/**
 * Reflector Action — condenses observation summaries into denser digests.
 *
 * Same pattern as Observer but operates on observation_summary facts:
 * 1. Fetch active summaries for scope+agent
 * 2. Skip if <2 summaries
 * 3. Escalate compression level
 * 4. Call LLM with reflector prompt
 * 5. Store as observation_digest, mark sources as merged
 * 6. Validate compression (output < input), retry once if needed
 */

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

function buildReflectorPrompt(
  summaries: Array<{ content: string; timestamp: number }>,
  compressionLevel: number
): string {
  const guidance: Record<number, string> = {
    0: "Preserve all meaningful details. Use concise sentences. Target 60% compression ratio.",
    1: "Merge related observations. Drop redundant details. Target 40% of input length.",
    2: "Aggressive compression. Keep only state changes, decisions, and key insights. Target 25% of input length.",
    3: "Maximum density. Extract only the essential state snapshot. Target 15% of input length.",
  };

  const summaryBlock = summaries
    .map((s, i) => {
      const date = new Date(s.timestamp).toISOString().slice(0, 19);
      return `[Summary ${i + 1}] ${date}:\n${s.content}`;
    })
    .join("\n\n");

  return `You are the Reflector in a memory compression pipeline. You receive observation summaries (already compressed once) and must produce an even denser digest.

## Rules
1. Maintain priority emojis: 🔴 critical, 🟡 notable, 🟢 background
2. Merge themes across summaries — combine related items
3. Resolve contradictions: newer observations supersede older ones
4. Track cumulative state: "As of latest, X is Y"
5. Drop observations that are no longer relevant given newer context
6. ${guidance[compressionLevel] ?? guidance[2]}

## Format
Output a single observation digest. This is the agent's compressed memory of all observations to date.
Use the same emoji format. Group by theme rather than chronology.

<summaries>
${summaryBlock}
</summaries>

Produce the compressed observation digest now. Output ONLY the digest, no preamble.`;
}

async function callLLM(
  prompt: string,
  apiKey: string,
  model: string
): Promise<{ content: string; success: boolean; error?: string }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { content: "", success: false, error: `${response.status} ${errorText}` };
  }

  const result = await response.json() as any;
  const content = result.content?.[0]?.text ?? "";
  return { content, success: !!content };
}

export const runReflector = internalAction({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
  },
  handler: async (ctx, { scopeId, agentId }) => {
    // 1. Fetch active summaries
    const summaries = await ctx.runQuery(
      internal.functions.facts.listObservationSummaries,
      { scopeId, agentId, limit: 50 }
    );

    if (summaries.length < 2) {
      return {
        skipped: true,
        reason: `Only ${summaries.length} summaries (need ≥2)`,
      };
    }

    // 2. Get session and escalate compression level
    const session = await ctx.runQuery(
      internal.functions.facts.getObservationSessionInternal,
      { scopeId, agentId }
    );
    const currentLevel = session?.compressionLevel ?? 0;
    const level = Math.min(currentLevel + 1, 3);
    const generation = (session?.reflectorGeneration ?? 0) + 1;

    // 3. Build prompt
    const prompt = buildReflectorPrompt(
      summaries.map((s) => ({
        content: s.content,
        timestamp: s.timestamp,
      })),
      level
    );

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { skipped: true, reason: "ANTHROPIC_API_KEY not set" };
    }

    const model = process.env.ENGRAM_OBSERVER_MODEL ?? "claude-haiku-4-20250414";

    // 4. Call LLM
    let result = await callLLM(prompt, apiKey, model);
    if (!result.success) {
      console.error(`[reflector] LLM call failed: ${result.error}`);
      return { skipped: true, reason: `LLM error: ${result.error}` };
    }

    // 5. Validate compression: output tokens < input tokens
    const inputTokens = summaries.reduce(
      (sum, s) => sum + Math.ceil(s.content.length / 4), 0
    );
    let outputTokens = Math.ceil(result.content.length / 4);

    if (outputTokens >= inputTokens && level < 3) {
      // Retry at higher compression level (max 1 retry)
      console.log(`[reflector] Output (${outputTokens}t) ≥ input (${inputTokens}t), retrying at level ${level + 1}`);
      const retryPrompt = buildReflectorPrompt(
        summaries.map((s) => ({ content: s.content, timestamp: s.timestamp })),
        Math.min(level + 1, 3)
      );
      result = await callLLM(retryPrompt, apiKey, model);
      if (!result.success) {
        return { skipped: true, reason: `LLM retry failed: ${result.error}` };
      }
      outputTokens = Math.ceil(result.content.length / 4);
    }

    // 6. Store as observation_digest fact
    const digestFactId = await ctx.runMutation(internal.functions.facts.storeFactInternal, {
      content: result.content,
      source: "reflector",
      createdBy: agentId,
      scopeId,
      factType: "observation_digest",
      tags: ["reflector", `generation-${generation}`],
    });

    // 7. Mark source summaries as merged
    for (const summary of summaries) {
      await ctx.runMutation(internal.functions.facts.updateLifecycleWithMerge, {
        factId: summary._id,
        lifecycleState: "merged",
        mergedInto: digestFactId.factId,
      });
    }

    // 8. Update observation session
    await ctx.runMutation(internal.functions.facts.upsertObservationSession, {
      scopeId,
      agentId,
      summaryTokenEstimate: 0,
      reflectorGeneration: generation,
      compressionLevel: level,
      lastReflectorRun: Date.now(),
    });

    return {
      skipped: false,
      inputSummaries: summaries.length,
      inputTokens,
      outputTokens,
      compressionRatio: inputTokens > 0 ? (outputTokens / inputTokens).toFixed(2) : "N/A",
      digestFactId: digestFactId.factId,
      compressionLevel: level,
      generation,
    };
  },
});

/** Public wrapper for MCP server HTTP client access. */
export const runReflectorPublic = action({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(internal.actions.reflector.runReflector, args);
  },
});
