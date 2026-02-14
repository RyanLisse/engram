/**
 * memory_end_session — Store session handoff summary for cross-agent continuity
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const endSessionSchema = z.object({
  summary: z.string().describe("Session summary for handoff to other agents"),
  conversationId: z.string().optional().describe("Conversation ID to link handoff to"),
});

export type EndSessionInput = z.infer<typeof endSessionSchema>;

export async function endSession(
  input: EndSessionInput,
  agentId: string
): Promise<{ factId: string; handoffRecorded: boolean } | { isError: true; message: string }> {
  try {
    // Get shared-personal scope
    const sharedScope = await convex.getScopeByName("shared-personal");
    if (!sharedScope) {
      return {
        isError: true,
        message: "shared-personal scope not found (inner circle agents only)",
      };
    }

    // Store session_summary fact in shared scope
    const fact = await convex.storeFact({
      content: input.summary,
      createdBy: agentId,
      factType: "session_summary",
      scopeId: sharedScope._id,
      source: "direct",
      tags: ["handoff", "session-end"],
      conversationId: input.conversationId,
    });

    if (!fact) {
      return {
        isError: true,
        message: "Failed to store session summary",
      };
    }

    // If conversationId provided, record handoff in conversation
    let handoffRecorded = false;
    if (input.conversationId) {
      try {
        await convex.addHandoffToConversation({
          conversationId: input.conversationId,
          fromAgent: agentId,
          summary: input.summary,
        });
        handoffRecorded = true;
      } catch (error) {
        console.error("[end-session] Failed to record handoff:", error);
        // Non-fatal - fact is already stored
      }
    }

    return {
      factId: fact.factId,
      handoffRecorded,
    };
  } catch (error: any) {
    console.error("[end-session] Error:", error);
    return {
      isError: true,
      message: `Failed to end session: ${error.message}`,
    };
  }
}
