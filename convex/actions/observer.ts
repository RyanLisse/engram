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
// Returns { system, user } for prompt caching — system is stable, user is dynamic.
function buildObserverPrompt(
  observations: Array<{ content: string; timestamp: number; observationTier?: string }>,
  previousSummary: string | undefined,
  compressionLevel: number
): { system: string; user: string } {
  const guidance: Record<number, string> = {
    0: "Preserve all meaningful details. Use concise sentences. Target 60% compression ratio.",
    1: "Merge related observations. Drop redundant details. Target 40% of input length.",
    2: "Aggressive compression. Keep only state changes, decisions, and key insights. Target 25% of input length.",
    3: "Maximum density. Extract only the essential state snapshot. Target 15% of input length.",
  };

  // Synced from mcp-server/src/lib/observer-prompts.ts — keep in sync manually
  const system = `You are the Observer in a memory compression pipeline. Your job is to compress raw observations into a dense, structured observation log.

## Rules
1. Use priority emojis: 🔴 critical, 🟡 notable, 🟢 background
2. Track state changes explicitly: "X changed from A to B"
3. Distinguish assertions (facts stated) from questions (uncertainties raised)
4. Preserve temporal ordering — most recent observations carry more weight
5. Never invent information not present in the observations
6. ${guidance[compressionLevel] ?? guidance[0]}

## Categories
Each observation MUST be tagged with one of these category codes:
- **PREF** — Preferences — user likes/dislikes, style preferences, tool preferences
- **PROJ** — Projects — active work, codebases, repos, deployments
- **TECH** — Technical — stack choices, configurations, versions, APIs
- **DEC** — Decisions — choices made with rationale, trade-offs evaluated
- **REL** — Relationships — people, teams, organizations, collaborators
- **EVENT** — Events — meetings, deadlines, milestones, releases
- **EMO** — Emotions — frustration, excitement, concerns, morale
- **LEARN** — Learning — new concepts, corrections, insights, discoveries
- **STATE** — State Changes — X changed from A to B, migrations, updates
- **OTHER** — observations that don't fit any category above

## Format
Output a single dense observation log. Each line should be:
<emoji> [CATEGORY] <compressed observation>

Where CATEGORY is one of: PREF, PROJ, TECH, DEC, REL, EVENT, EMO, LEARN, STATE, OTHER.

Group related observations. Merge duplicates. Drop noise.

Produce the compressed observation log now. Output ONLY the log, no preamble.`;

  const obsBlock = observations
    .map((o, i) => {
      const date = new Date(o.timestamp).toISOString().slice(0, 19);
      const tier = o.observationTier ? ` [${o.observationTier}]` : "";
      return `[${i + 1}] ${date}${tier}: ${o.content}`;
    })
    .join("\n");

  const previousBlock = previousSummary
    ? `<previous_summary>\n${previousSummary}\n</previous_summary>\n\n`
    : "";

  const user = `${previousBlock}<observations>
${obsBlock}
</observations>`;

  return { system, user };
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

// Shared LLM caller with prompt caching support (matches reflector pattern)
async function callLLM(
  systemMsg: string,
  userMsg: string,
  apiKey: string,
  model: string,
): Promise<{ content: string; success: boolean; promptCached: boolean; error?: string }> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: [
        { type: "text", text: systemMsg, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    return { content: "", success: false, promptCached: false, error: `${resp.status} ${errorText}` };
  }

  const json = await resp.json() as any;
  const text = json.content?.[0]?.text ?? "";
  const cached = (json.usage?.cache_read_input_tokens ?? 0) > 0;
  return { content: text, success: !!text, promptCached: cached };
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

    // 4. Build prompt and call LLM (split system/user for prompt caching)
    const { system, user } = buildObserverPrompt(
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

    let llmResult = await callLLM(system, user, apiKey, model);
    if (!llmResult.success) {
      console.error(`[observer] LLM call failed: ${llmResult.error}`);
      return { skipped: true, reason: `LLM error: ${llmResult.error}` };
    }

    let summaryContent = llmResult.content;
    let promptCached = llmResult.promptCached;
    let retried = false;

    // 5. Estimate tokens and validate compression (output < input)
    const inputTokens = observations.reduce(
      (sum, o) => sum + Math.ceil(o.content.length / 4), 0
    );
    let outputTokens = Math.ceil(summaryContent.length / 4);

    if (outputTokens >= inputTokens && level < 3) {
      // Retry at higher compression level (max 1 retry)
      retried = true;
      console.log(`[observer] Output (${outputTokens}t) >= input (${inputTokens}t), retrying at level ${level + 1}`);
      const retryPrompt = buildObserverPrompt(
        observations.map((o) => ({
          content: o.content,
          timestamp: o.timestamp,
          observationTier: o.observationTier,
        })),
        previousSummary,
        Math.min(level + 1, 3)
      );
      llmResult = await callLLM(retryPrompt.system, retryPrompt.user, apiKey, model);
      if (!llmResult.success) {
        return { skipped: true, reason: `LLM retry failed: ${llmResult.error}` };
      }
      summaryContent = llmResult.content;
      promptCached = llmResult.promptCached;
      outputTokens = Math.ceil(summaryContent.length / 4);
    }

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
      retried,
      promptCached,
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
