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

    return { ack: true };
  } catch (error: any) {
    console.error("[record-feedback] Error:", error);
    return {
      isError: true,
      message: `Failed to record feedback: ${error.message}`,
    };
  }
}
