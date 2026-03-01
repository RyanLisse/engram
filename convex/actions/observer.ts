"use node";

/**
 * Observer Action — compresses raw observations into dense summary facts.
 *
 * Pipeline:
 * 1. Fetch uncompressed observations for scope+agent (max 200)
 * 2. Skip if <3 observations
 * 3. Build observer prompt with priority emojis, compression level
 * 4. Call LLM via Anthropic API
 * 5. Store compressed output as observation_summary fact
 * 6. Mark source observations as merged
 * 7. Update observation session state
 */

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// Minimal prompt builder (can't import from MCP server in Convex actions)
function buildObserverPrompt(
  observations: Array<{ content: string; timestamp: number; observationTier?: string }>,
  previousSummary: string | undefined,
  compressionLevel: number
): string {
  const guidance: Record<number, string> = {
    0: "Preserve all meaningful details. Use concise sentences. Target 60% compression ratio.",
    1: "Merge related observations. Drop redundant details. Target 40% of input length.",
    2: "Aggressive compression. Keep only state changes, decisions, and key insights. Target 25% of input length.",
    3: "Maximum density. Extract only the essential state snapshot. Target 15% of input length.",
  };

  const obsBlock = observations
    .map((o, i) => {
      const date = new Date(o.timestamp).toISOString().slice(0, 19);
      const tier = o.observationTier ? ` [${o.observationTier}]` : "";
      return `[${i + 1}] ${date}${tier}: ${o.content}`;
    })
    .join("\n");

  const previousBlock = previousSummary
    ? `\n<previous_summary>\n${previousSummary}\n</previous_summary>\n`
    : "";

  return `You are the Observer in a memory compression pipeline. Your job is to compress raw observations into a dense, structured observation log.

## Rules
1. Use priority emojis: 🔴 critical, 🟡 notable, 🟢 background
2. Track state changes explicitly: "X changed from A to B"
3. Distinguish assertions (facts stated) from questions (uncertainties raised)
4. Preserve temporal ordering — most recent observations carry more weight
5. Never invent information not present in the observations
6. ${guidance[compressionLevel] ?? guidance[0]}

## Format
Output a single dense observation log. Each line should be:
<emoji> <category>: <compressed observation>

Group related observations. Merge duplicates. Drop noise.
${previousBlock}
<observations>
${obsBlock}
</observations>

Produce the compressed observation log now. Output ONLY the log, no preamble.`;
}

// Inline DJB2 fingerprint — cannot import from MCP server in Convex runtime
function djb2Fingerprint(
  observations: Array<{ content: string; observationTier?: string }>
): string {
  const normalized = observations
    .map(o => `${o.observationTier ?? ""}:${o.content.trim()}`)
    .sort()
    .join("\n");
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const runObserver = internalAction({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
    compressionLevel: v.optional(v.number()),
  },
  handler: async (ctx, { scopeId, agentId, compressionLevel }) => {
    // 1. Fetch uncompressed observations
    const observations = await ctx.runQuery(
      internal.functions.facts.listUncompressedObservations,
      { scopeId, agentId, limit: 200 }
    );

    if (observations.length < 3) {
      return {
        skipped: true,
        reason: `Only ${observations.length} observations (need ≥3)`,
      };
    }

    // 2. Get current observation session
    const session = await ctx.runQuery(
      internal.functions.facts.getObservationSessionInternal,
      { scopeId, agentId }
    );
    const level = compressionLevel ?? session?.compressionLevel ?? 0;
    const generation = (session?.observerGeneration ?? 0) + 1;

    // 2b. Fingerprint check — skip LLM if observation window unchanged
    const fingerprint = djb2Fingerprint(
      observations.map(o => ({
        content: o.content,
        observationTier: o.observationTier,
      }))
    );
    if (session?.lastObserverFingerprint === fingerprint) {
      // Update lastObserverRun so the sweep cron doesn't re-invoke every 10 minutes
      await ctx.runMutation(internal.functions.facts.upsertObservationSession, {
        scopeId,
        agentId,
        lastObserverRun: Date.now(),
      });
      return {
        skipped: true,
        reason: "observation_fingerprint_match",
        fingerprint,
        inputObservations: observations.length,
      };
    }

    // 3. Get previous summary for continuity
    const previousSummaries = await ctx.runQuery(
      internal.functions.facts.listObservationSummaries,
      { scopeId, agentId, limit: 1 }
    );
    const previousSummary = previousSummaries.length > 0
      ? previousSummaries[0].content
      : undefined;

    // 4. Build prompt and call LLM
    const prompt = buildObserverPrompt(
      observations.map((o) => ({
        content: o.content,
        timestamp: o.timestamp,
        observationTier: o.observationTier,
      })),
      previousSummary,
      level
    );

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { skipped: true, reason: "ANTHROPIC_API_KEY not set" };
    }

    const model = process.env.ENGRAM_OBSERVER_MODEL ?? "claude-haiku-4-20250414";

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
      console.error(`[observer] LLM call failed: ${response.status} ${errorText}`);
      return { skipped: true, reason: `LLM error: ${response.status}` };
    }

    const llmResult = await response.json() as any;
    const summaryContent = llmResult.content?.[0]?.text ?? "";

    if (!summaryContent) {
      return { skipped: true, reason: "Empty LLM response" };
    }

    // 5. Estimate tokens
    const inputTokens = observations.reduce(
      (sum, o) => sum + Math.ceil(o.content.length / 4), 0
    );
    const outputTokens = Math.ceil(summaryContent.length / 4);

    // 6. Store as observation_summary fact
    const summaryFactId = await ctx.runMutation(internal.functions.facts.storeFactInternal, {
      content: summaryContent,
      source: "observer",
      createdBy: agentId,
      scopeId,
      factType: "observation_summary",
      tags: ["observer", `generation-${generation}`],
      observationGeneration: generation,
    });

    // 7. Mark source observations as merged
    for (const obs of observations) {
      await ctx.runMutation(internal.functions.facts.updateLifecycleWithMerge, {
        factId: obs._id,
        lifecycleState: "merged",
        mergedInto: summaryFactId.factId,
      });
    }

    // 8. Update observation session
    await ctx.runMutation(internal.functions.facts.upsertObservationSession, {
      scopeId,
      agentId,
      pendingTokenEstimate: 0,
      summaryTokenEstimate: (session?.summaryTokenEstimate ?? 0) + outputTokens,
      observerGeneration: generation,
      lastObserverRun: Date.now(),
      lastObserverFingerprint: fingerprint,
    });

    return {
      skipped: false,
      inputObservations: observations.length,
      inputTokens,
      outputTokens,
      compressionRatio: inputTokens > 0 ? (outputTokens / inputTokens).toFixed(2) : "N/A",
      summaryFactId: summaryFactId.factId,
      generation,
    };
  },
});

/** Public wrapper for MCP server HTTP client access. */
export const runObserverPublic = action({
  args: {
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
    compressionLevel: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(internal.actions.observer.runObserver, args);
  },
});
