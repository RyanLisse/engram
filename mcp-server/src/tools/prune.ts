/**
 * memory_prune — Agent-initiated cleanup of stale facts (AgeMem FILTER pattern)
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { listStaleFacts, markFactsPruned } from "./primitive-retrieval.js";

export const pruneSchema = z.object({
  scopeId: z.string().optional().describe("Scope to prune (defaults to agent's private scope)"),
  olderThanDays: z.number().optional().prefault(90).describe("Prune facts older than N days"),
  maxForgetScore: z
    .number()
    .optional()
    .prefault(0.3)
    .describe("Maximum forget score (0-1) to prune"),
  dryRun: z.boolean().optional().prefault(true).describe("If true, only report what would be pruned"),
});

export type PruneInput = z.infer<typeof pruneSchema>;

export async function prune(
  input: PruneInput,
  agentId: string
): Promise<
  | {
      prunedCount: number;
      prunedFactIds: string[];
      dryRun: boolean;
    }
  | { isError: true; message: string }
> {
  try {
    console.error("[deprecation] memory_prune is a compatibility wrapper over primitive tools");
    // Resolve scope
    let scopeId = input.scopeId;

    if (!scopeId) {
      const agent = await convex.getAgentByAgentId(agentId);
      if (agent && agent.defaultScope) {
        scopeId = agent.defaultScope;
      }
      if (!scopeId) {
        const privateScope = await convex.getScopeByName(`private-${agentId}`);
        if (privateScope) {
          scopeId = privateScope._id;
        } else {
          return {
            isError: true,
            message: `No default scope for agent ${agentId}`,
          };
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

    const candidates = await listStaleFacts({
      scopeId: scopeId!,
      olderThanDays: input.olderThanDays,
      limit: 1000,
    });

    const candidateIds = (candidates as any[])
      .filter((fact) => (fact.forgetScore ?? 1) <= input.maxForgetScore)
      .map((f: any) => f._id);

    if (input.dryRun) {
      return {
        prunedCount: candidates.length,
        prunedFactIds: candidateIds,
        dryRun: true,
      };
    }

    // Actually prune: mark facts as pruned via Convex mutation
    if (candidateIds.length > 0) {
      await markFactsPruned({ factIds: candidateIds });
    }

    return {
      prunedCount: candidateIds.length,
      prunedFactIds: candidateIds,
      dryRun: false,
    };
  } catch (error: any) {
    console.error("[prune] Error:", error);
    return {
      isError: true,
      message: `Failed to prune: ${error.message}`,
    };
  }
}
