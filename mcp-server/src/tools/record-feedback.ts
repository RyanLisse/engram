/**
 * memory_record_feedback — Post-recall usefulness tracking (ALMA pattern)
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const recordFeedbackSchema = z.object({
  recallId: z.string().describe("Recall ID from memory_recall response"),
  usedFactIds: z.array(z.string()).describe("Fact IDs that were actually useful"),
  unusedFactIds: z.array(z.string()).optional().describe("Fact IDs that were not useful"),
});

export type RecordFeedbackInput = z.infer<typeof recordFeedbackSchema>;

export async function recordFeedback(
  input: RecordFeedbackInput,
  agentId: string
): Promise<{ ack: true } | { isError: true; message: string }> {
  try {
    await convex.recordRecallUsage({
      recallId: input.recallId,
      agentId,
      usedFactIds: input.usedFactIds,
      unusedFactIds: input.unusedFactIds,
    });

    // Record positive signals for used facts
    await Promise.all(
      input.usedFactIds.map((factId) =>
        convex.recordSignal({
          factId,
          agentId,
          signalType: "usefulness",
          value: 1,
          context: `recall:${input.recallId}`,
        })
      )
    );

    // Record negative signals for unused facts
    if (input.unusedFactIds && input.unusedFactIds.length > 0) {
      await Promise.all(
        input.unusedFactIds.map((factId) =>
          convex.recordSignal({
            factId,
            agentId,
            signalType: "usefulness",
            value: 0,
            context: `recall:${input.recallId}`,
          })
        )
      );
    }

    // Feedback -> Decision Decay Loop
    // Boost or decay importance of decision/insight facts based on usefulness.
    // This creates a read-write loop: recall -> feedback -> importance adjustment
    // so future recalls favor facts that proved useful.
    const DECAY_ELIGIBLE_TYPES = new Set(["decision", "insight"]);
    const BOOST_AMOUNT = 0.05;

    try {
      const allFactIds = [
        ...input.usedFactIds.map((id) => ({ id, boost: BOOST_AMOUNT })),
        ...(input.unusedFactIds ?? []).map((id) => ({ id, boost: -BOOST_AMOUNT })),
      ];

      // Fetch all facts in parallel to check their types
      const factsWithBoost = await Promise.all(
        allFactIds.map(async ({ id, boost }) => {
          try {
            const fact = await convex.getFact(id);
            return { id, boost, factType: fact?.factType };
          } catch {
            return { id, boost, factType: undefined };
          }
        })
      );

      // Filter to only decision/insight types, then apply boosts
      const eligible = factsWithBoost.filter(
        (f) => f.factType && DECAY_ELIGIBLE_TYPES.has(f.factType)
      );

      let boosted = 0;
      let decayed = 0;

      await Promise.all(
        eligible.map(async ({ id, boost }) => {
          try {
            await convex.boostRelevance({ factId: id, boost });
            if (boost > 0) boosted++;
            else decayed++;
          } catch {
            // Best-effort: don't fail the feedback recording
          }
        })
      );

      if (boosted > 0 || decayed > 0) {
        console.error(
          `[record-feedback] Decay loop: boosted ${boosted}, decayed ${decayed} decision/insight facts`
        );
      }
    } catch (decayError) {
      // Best-effort: log but don't fail the overall feedback recording
      console.error("[record-feedback] Decay loop error (non-fatal):", decayError);
    }

    // Profile Learning Loop
    // After feedback is recorded, update the agent's per-scope knowledge profile.
    // The profile stores SVD axis weights — which semantic directions this agent finds useful.
    // Over time this enables profile-aware retrieval that surfaces facts in the agent's
    // "cognitive neighbourhood" even without an explicit query match.
    try {
      const scope = await convex.getScopeByName(`private-${agentId}`);
      if (scope && input.usedFactIds.length > 0) {
        const profileResult = await convex.learnAgentProfile({
          agentId,
          scopeId: scope._id,
          usedFactIds: input.usedFactIds,
        });
        if (profileResult.learned) {
          console.error(
            `[record-feedback] Profile updated for agent ${agentId}: learnedFrom=${profileResult.learnedFrom}, axes=${profileResult.axisWeights?.length ?? 0}`
          );
        } else {
          console.error(
            `[record-feedback] Profile learning skipped: ${profileResult.reason}`
          );
        }
      }
    } catch (profileError) {
      // Best-effort: profile learning should never block feedback recording
      console.error("[record-feedback] Profile learning error (non-fatal):", profileError);
    }

    return { ack: true };
  } catch (error: any) {
    console.error("[record-feedback] Error:", error);
    return {
      isError: true,
      message: `Failed to record feedback: ${error.message}`,
    };
  }
}
