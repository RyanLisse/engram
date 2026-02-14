/**
 * memory_prune — Agent-initiated cleanup of stale facts (AgeMem FILTER pattern)
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const pruneSchema = z.object({
  scopeId: z.string().optional().describe("Scope to prune (defaults to agent's private scope)"),
  olderThanDays: z.number().optional().default(90).describe("Prune facts older than N days"),
  maxForgetScore: z
    .number()
    .optional()
    .default(0.3)
    .describe("Maximum forget score (0-1) to prune"),
  dryRun: z.boolean().optional().default(true).describe("If true, only report what would be pruned"),
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

    // Calculate cutoff timestamp
    const cutoffTime = Date.now() - input.olderThanDays * 24 * 60 * 60 * 1000;

    // Search for old facts in scope
    const resolvedScopeId = scopeId!;
    const allFacts = await convex.listFactsByScope({
      scopeId: resolvedScopeId,
      limit: 1000,
    });

    if (!Array.isArray(allFacts)) {
      return {
        isError: true,
        message: "Failed to retrieve facts",
      };
    }

    // Filter candidates: old + low importance + low access
    const candidates = allFacts.filter((fact: any) => {
      const isOld = fact._creationTime < cutoffTime;
      const lowImportance = (fact.importanceScore ?? 0.5) < input.maxForgetScore;
      const lowAccess = (fact.accessCount ?? 0) < 3;
      return isOld && lowImportance && lowAccess && fact.lifecycleState !== "pruned";
    });

    const candidateIds = candidates.map((f: any) => f._id);

    if (input.dryRun) {
      return {
        prunedCount: candidates.length,
        prunedFactIds: candidateIds,
        dryRun: true,
      };
    }

    // Actually prune: mark facts as pruned via Convex mutation
    if (candidateIds.length > 0) {
      await convex.markPruned(candidateIds);
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
