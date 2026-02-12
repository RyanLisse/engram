/**
 * memory_store_fact — Store atomic fact with async enrichment
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const storeFactSchema = z.object({
  content: z.string().describe("The fact content to store"),
  source: z.string().optional().describe("Source of the fact (e.g., conversation, observation)"),
  entityIds: z.array(z.string()).optional().describe("Entity IDs related to this fact"),
  tags: z.array(z.string()).optional().describe("Tags for categorization"),
  factType: z.string().optional().describe("Type of fact (e.g., decision, observation, insight)"),
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent's private scope)"),
  emotionalContext: z.string().optional().describe("Emotional context or sentiment"),
});

export type StoreFactInput = z.infer<typeof storeFactSchema>;

export async function storeFact(
  input: StoreFactInput,
  agentId: string
): Promise<{ factId: string; importanceScore: number } | { isError: true; message: string }> {
  try {
    // Resolve scopeId - find a scope reference, then resolve name to ID
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
            message: `Agent ${agentId} has no default scope and private scope not found`,
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

    // Store the fact
    const result = await convex.storeFact({
      content: input.content,
      source: input.source || "direct",
      createdBy: agentId,
      scopeId: resolvedScopeId as string,
      factType: input.factType || "observation",
      entityIds: input.entityIds,
      tags: input.tags,
      emotionalContext: input.emotionalContext,
    });

    if (!result || typeof result !== "object") {
      return {
        isError: true,
        message: "Failed to store fact: invalid response from server",
      };
    }

    return {
      factId: result.factId,
      importanceScore: result.importanceScore ?? 0.5,
    };
  } catch (error: any) {
    console.error("[store-fact] Error:", error);
    return {
      isError: true,
      message: `Failed to store fact: ${error.message}`,
    };
  }
}
