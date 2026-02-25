/**
 * memory_pin and memory_unpin — Progressive disclosure via pinning
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const pinFactSchema = z.object({
  factId: z.string().describe("Fact ID to pin"),
  scopeId: z.string().optional().describe("Scope for pin limit enforcement"),
});

export type PinFactInput = z.infer<typeof pinFactSchema>;

export const unpinFactSchema = z.object({
  factId: z.string().describe("Fact ID to unpin"),
});

export type UnpinFactInput = z.infer<typeof unpinFactSchema>;

/**
 * Pin a fact — adds it to the always-loaded context (max 20 per scope)
 */
export async function pinFact(
  input: PinFactInput,
  agentId: string
): Promise<
  | { pinned: true; factId: string; pinnedCount: number }
  | { isError: true; message: string; pinnedFacts?: any[] }
> {
  try {
    // Verify fact exists and is active
    const fact = await convex.getFact(input.factId);
    if (!fact) {
      return {
        isError: true,
        message: `Fact "${input.factId}" not found`,
      };
    }

    if ((fact as any).archived) {
      return {
        isError: true,
        message: `Cannot pin archived fact "${input.factId}"`,
      };
    }

    // Resolve scope for pin limit enforcement
    let scopeId = input.scopeId || (fact as any).scopeId;

    if (!scopeId) {
      const agent = await convex.getAgentByAgentId(agentId);
      if (agent && agent.defaultScope) {
        scopeId = agent.defaultScope;
      }
      if (!scopeId) {
        const privateScope = await convex.getScopeByName(`private-${agentId}`);
        if (privateScope) {
          scopeId = privateScope._id;
        }
      }
    }

    // Resolve name to Convex ID if needed
    if (scopeId && !scopeId.startsWith("j")) {
      const scope = await convex.getScopeByName(scopeId);
      if (!scope) {
        return {
          isError: true,
          message: `Scope "${scopeId}" not found`,
        };
      }
      scopeId = scope._id;
    }

    // Check pin limit: query Convex for pinned facts in this scope
    const pinnedFacts = await convex.listPinnedByScope({
      scopeId: scopeId!,
      limit: 100,
    });

    const pinnedCount = (pinnedFacts as any[]).length;

    // Check if already pinned
    if ((fact as any).pinned) {
      return {
        pinned: true,
        factId: input.factId,
        pinnedCount,
      };
    }

    // Enforce max 20 pinned per scope
    if (pinnedCount >= 20) {
      return {
        isError: true,
        message: `Cannot pin fact: scope "${scopeId}" already has 20 pinned facts (max limit)`,
        pinnedFacts: pinnedFacts as any[],
      };
    }

    // Update fact: set pinned to true
    await convex.updateFact({
      factId: input.factId,
      pinned: true,
    });

    return {
      pinned: true,
      factId: input.factId,
      pinnedCount: pinnedCount + 1,
    };
  } catch (error: any) {
    console.error("[pinFact] Error:", error);
    return {
      isError: true,
      message: `Failed to pin fact: ${error.message}`,
    };
  }
}

/**
 * Unpin a fact — removes it from always-loaded context
 */
export async function unpinFact(
  input: UnpinFactInput
): Promise<
  | { pinned: false; factId: string }
  | { isError: true; message: string }
> {
  try {
    // Verify fact exists
    const fact = await convex.getFact(input.factId);
    if (!fact) {
      return {
        isError: true,
        message: `Fact "${input.factId}" not found`,
      };
    }

    // Update fact: set pinned to false
    await convex.updateFact({
      factId: input.factId,
      pinned: false,
    });

    return {
      pinned: false,
      factId: input.factId,
    };
  } catch (error: any) {
    console.error("[unpinFact] Error:", error);
    return {
      isError: true,
      message: `Failed to unpin fact: ${error.message}`,
    };
  }
}
