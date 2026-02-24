/**
 * memory_end_session — Store session handoff summary for cross-agent continuity
 *
 * Auto-generates a structured session_summary fact from the agent's recent
 * activity, or uses a caller-supplied contextSummary when provided.
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import fs from "node:fs/promises";
import path from "node:path";

export const endSessionSchema = z.object({
  summary: z.string().describe("Session summary for handoff to other agents"),
  conversationId: z.string().optional().describe("Conversation ID to link handoff to"),
  contextSummary: z
    .string()
    .optional()
    .describe(
      "Optional agent-supplied context summary. When provided, used as the session_summary fact content instead of auto-generation."
    ),
});

export type EndSessionInput = z.infer<typeof endSessionSchema>;

// ── Helpers ──────────────────────────────────────────

/**
 * Build a deterministic session summary from recent facts.
 * No LLM calls — pure string assembly from stored data.
 */
async function buildAutoSummary(
  agentId: string,
  scopeId: string,
  sessionStartTime: number
): Promise<string> {
  // Fetch the agent's recent facts from their private scope
  let recentFacts: any[] = [];
  try {
    recentFacts = await convex.listFactsByScope({ scopeId, limit: 100 });
  } catch {
    // If query fails, we still produce a minimal summary
  }

  // Filter to facts created by this agent during this session window
  const sessionFacts = recentFacts.filter(
    (f: any) =>
      f.createdBy === agentId &&
      f.timestamp >= sessionStartTime &&
      f.lifecycleState !== "archived" &&
      f.lifecycleState !== "pruned"
  );

  const endTime = new Date().toISOString();
  const startTime = new Date(sessionStartTime).toISOString();

  // Gather decisions and insights (max 3 each)
  const decisions = sessionFacts
    .filter((f: any) => f.factType === "decision")
    .slice(0, 3)
    .map((f: any) => f.content.slice(0, 120));

  const insights = sessionFacts
    .filter((f: any) => f.factType === "insight")
    .slice(0, 3)
    .map((f: any) => f.content.slice(0, 120));

  // Build structured summary
  const lines: string[] = [
    `Session Summary (agent: ${agentId}, ${startTime} → ${endTime})`,
    `Facts stored: ${sessionFacts.length}`,
  ];

  if (decisions.length > 0) {
    lines.push(`Key decisions: ${decisions.join("; ")}`);
  } else {
    lines.push("Key decisions: none");
  }

  if (insights.length > 0) {
    lines.push(`Key insights: ${insights.join("; ")}`);
  } else {
    lines.push("Key insights: none");
  }

  return lines.join("\n");
}

// ── Main handler ─────────────────────────────────────

export async function endSession(
  input: EndSessionInput,
  agentId: string
): Promise<
  | { factId: string; handoffRecorded: boolean; sessionSummaryFactId: string | null }
  | { isError: true; message: string }
> {
  try {
    const checkpointDir = process.env.CHECKPOINT_DIR || path.resolve(process.cwd(), ".checkpoints");
    const dirtyFlag = path.join(checkpointDir, "DIRTY_DEATH.flag");

    // Resolve target scope: prefer shared-personal, fall back to private scope
    const sharedScope = await convex.getScopeByName("shared-personal");
    const privateScope = await convex.getScopeByName(`private-${agentId}`);
    const targetScopeId = sharedScope?._id ?? privateScope?._id;

    if (!targetScopeId) {
      return {
        isError: true,
        message: `No scope found for agent ${agentId} (tried shared-personal and private-${agentId})`,
      };
    }

    // Build session summary content: prefer contextSummary, then auto-generate
    const sessionStartTime = Date.now() - 2 * 60 * 60 * 1000;
    const sourceScopeId = privateScope?._id ?? targetScopeId;

    let summaryContent: string;
    if (input.contextSummary) {
      summaryContent = `Session Summary (agent: ${agentId}, ${new Date(sessionStartTime).toISOString()} → ${new Date().toISOString()})\n${input.contextSummary}`;
    } else {
      const autoSummary = await buildAutoSummary(agentId, sourceScopeId, sessionStartTime);
      // Combine caller's summary with structured auto-summary
      summaryContent = `${autoSummary}\nContext: ${input.summary}`;
    }

    // Store a single session_summary fact (not two)
    const fact = await convex.storeFact({
      content: summaryContent,
      createdBy: agentId,
      factType: "session_summary",
      scopeId: targetScopeId,
      source: "consolidation",
      tags: ["session_summary", "handoff"],
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

    await fs.rm(dirtyFlag, { force: true }).catch(() => {});

    return {
      factId: fact.factId,
      handoffRecorded,
      sessionSummaryFactId: fact.factId,
    };
  } catch (error: any) {
    console.error("[end-session] Error:", error);
    return {
      isError: true,
      message: `Failed to end session: ${error.message}`,
    };
  }
}
