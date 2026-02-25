/**
 * memory_observe — Fire-and-forget passive observation storage
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { sanitizeObservation } from "../lib/observer-prompts.js";

export const observeSchema = z.object({
  observation: z.string().describe("Observation to record"),
  emotionalContext: z.string().optional().describe("Emotional context or sentiment"),
  scopeId: z.string().optional().describe("Scope to store in (defaults to agent's private scope)"),
});

export type ObserveInput = z.infer<typeof observeSchema>;

function detectEmotion(observation: string): { emotionalContext?: string; emotionalWeight?: number } {
  const lower = observation.toLowerCase();

  if (/\b(failed|error|broken|frustrat|blocked|stuck)\b/.test(lower)) {
    return { emotionalContext: "frustrated", emotionalWeight: 0.7 };
  }
  if (/\b(success|resolved|fixed|shipped|great|win)\b/.test(lower)) {
    return { emotionalContext: "confident", emotionalWeight: 0.55 };
  }
  if (/\b(surpris|unexpected|wow)\b/.test(lower)) {
    return { emotionalContext: "surprised", emotionalWeight: 0.45 };
  }
  if (/\b(proud|excited)\b/.test(lower)) {
    return { emotionalContext: "proud", emotionalWeight: 0.5 };
  }

  return {};
}

export async function observe(
  input: ObserveInput,
  agentId: string
): Promise<{ ack: true } | { isError: true; message: string }> {
  try {
    // Resolve scope (default to private)
    let resolvedScopeId = input.scopeId;

    if (!resolvedScopeId) {
      const agent = await convex.getAgentByAgentId(agentId);
      if (agent && agent.defaultScope) {
        resolvedScopeId = agent.defaultScope;
      }
      if (!resolvedScopeId) {
        const privateScope = await convex.getScopeByName(`private-${agentId}`);
        if (privateScope) {
          resolvedScopeId = privateScope._id;
        } else {
          return {
            isError: true,
            message: `No default scope for agent ${agentId}`,
          };
        }
      }
    }

    // Resolve name to Convex ID if needed
    if (resolvedScopeId && !resolvedScopeId.startsWith("j")) {
      const scope = await convex.getScopeByName(resolvedScopeId);
      if (!scope) {
        return {
          isError: true,
          message: `Scope "${resolvedScopeId}" not found`,
        };
      }
      resolvedScopeId = scope._id;
    }

    // Sanitize before storage (strip injection vectors, normalize whitespace)
    const sanitized = sanitizeObservation(input.observation);
    const detected = input.emotionalContext ? {} : detectEmotion(sanitized);
    const emotionalContext = input.emotionalContext ?? detected.emotionalContext;
    const emotionalWeight = detected.emotionalWeight;

    // Store as observation fact (fire-and-forget)
    const stored = await convex.storeFact({
      content: sanitized,
      source: "observation",
      createdBy: agentId,
      scopeId: resolvedScopeId as string,
      factType: "observation",
      emotionalContext,
      emotionalWeight,
    });
    if (stored?.factId) {
      await convex.classifyObservation({ factId: stored.factId });
    }

    // Track observation tokens in session (best-effort, non-blocking)
    try {
      const tokenEstimate = Math.ceil(input.observation.length / 4);
      await convex.incrementObservationTokens(
        resolvedScopeId as string,
        agentId,
        tokenEstimate
      );
    } catch (err: any) {
      // Non-blocking — don't fail the observation if token tracking fails
      console.error("[observe] Token tracking error (non-blocking):", err.message);
    }

    return { ack: true };
  } catch (error: any) {
    console.error("[observe] Error:", error);
    return {
      isError: true,
      message: `Failed to record observation: ${error.message}`,
    };
  }
}
