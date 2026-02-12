/**
 * memory_record_signal — Record ratings/sentiment feedback on facts (PAI pattern)
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const recordSignalSchema = z.object({
  factId: z.string().optional().describe("Fact ID to signal about (optional for general signals)"),
  signalType: z
    .string()
    .describe("Signal type (rating, sentiment, usefulness, correctness, etc.)"),
  value: z.number().describe("Signal value (e.g., 1-10 for rating, -1 to 1 for sentiment)"),
  comment: z.string().optional().describe("Optional comment explaining the signal"),
  context: z.string().optional().describe("Context in which signal was generated"),
});

export type RecordSignalInput = z.infer<typeof recordSignalSchema>;

export async function recordSignal(
  input: RecordSignalInput,
  agentId: string
): Promise<{ signalId: string } | { isError: true; message: string }> {
  try {
    const result = await convex.recordSignal({
      factId: input.factId,
      agentId,
      signalType: input.signalType,
      value: input.value,
      comment: input.comment,
      context: input.context ? { text: input.context } : undefined,
    });

    if (!result || typeof result !== "object") {
      return {
        isError: true,
        message: "Failed to record signal",
      };
    }

    return {
      signalId: result._id || result.signalId,
    };
  } catch (error: any) {
    console.error("[record-signal] Error:", error);
    return {
      isError: true,
      message: `Failed to record signal: ${error.message}`,
    };
  }
}
