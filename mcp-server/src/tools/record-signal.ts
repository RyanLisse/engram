/**
 * memory_record_signal — Record ratings/sentiment feedback on facts (PAI pattern)
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

const SIGNAL_TYPE_MAP: Record<string, string> = {
  rating: "explicit_rating",
  sentiment: "implicit_sentiment",
  usefulness: "usefulness",
  correctness: "explicit_rating",
  failure: "failure",
  // Also accept the Convex-native names directly
  explicit_rating: "explicit_rating",
  implicit_sentiment: "implicit_sentiment",
};

export const recordSignalSchema = z.object({
  factId: z.string().optional().describe("Fact ID to signal about (optional for general signals)"),
  signalType: z
    .string()
    .describe("Signal type: rating, sentiment, usefulness, correctness, or failure"),
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
    // Map friendly signal type to Convex union value
    const mappedType = SIGNAL_TYPE_MAP[input.signalType];
    if (!mappedType) {
      return {
        isError: true,
        message: `Invalid signal type "${input.signalType}". Valid types: ${Object.keys(SIGNAL_TYPE_MAP).join(", ")}`,
      };
    }

    const result = await convex.recordSignal({
      factId: input.factId,
      agentId,
      signalType: mappedType,
      value: input.value,
      comment: input.comment,
      context: input.context,
    });

    if (!result || typeof result !== "object") {
      return {
        isError: true,
        message: "Failed to record signal",
      };
    }

    return {
      signalId: result._id || result.signalId || String(result),
    };
  } catch (error: any) {
    console.error("[record-signal] Error:", error);
    return {
      isError: true,
      message: `Failed to record signal: ${error.message}`,
    };
  }
}
