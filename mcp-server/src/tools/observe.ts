/**
 * memory_observe — Fire-and-forget passive observation storage
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const observeSchema = z.object({
  observation: z.string().describe("Observation to record"),
  emotionalContext: z.string().optional().describe("Emotional context or sentiment"),
  scopeId: z.string().optional().describe("Scope to store in (defaults to agent's private scope)"),
});

export type ObserveInput = z.infer<typeof observeSchema>;

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

    // Store as observation fact (fire-and-forget)
    await convex.storeFact({
      content: input.observation,
      source: "observation",
      createdBy: agentId,
      scopeId: resolvedScopeId as string,
      factType: "observation",
      emotionalContext: input.emotionalContext,
    });

    return { ack: true };
  } catch (error: any) {
    console.error("[observe] Error:", error);
    return {
      isError: true,
      message: `Failed to record observation: ${error.message}`,
    };
  }
}
