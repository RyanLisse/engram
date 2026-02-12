/**
 * memory_summarize — Consolidate facts on a topic (AgeMem SUMMARY pattern)
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const summarizeSchema = z.object({
  topic: z.string().describe("Topic to summarize"),
  scopeId: z.string().optional().describe("Scope to search within"),
  maxFacts: z.number().optional().default(50).describe("Maximum facts to consolidate"),
});

export type SummarizeInput = z.infer<typeof summarizeSchema>;

export async function summarize(
  input: SummarizeInput,
  agentId: string
): Promise<
  | {
      summaryFactId: string;
      consolidatedCount: number;
    }
  | { isError: true; message: string }
> {
  try {
    // Resolve scope
    let scopeIds: string[] | undefined;

    if (input.scopeId) {
      if (!input.scopeId.startsWith("j")) {
        const scope = await convex.getScopeByName(input.scopeId);
        if (!scope) {
          return {
            isError: true,
            message: `Scope "${input.scopeId}" not found`,
          };
        }
        scopeIds = [scope._id];
      } else {
        scopeIds = [input.scopeId];
      }
    } else {
      const permitted = await convex.getPermittedScopes(agentId);
      if (permitted && Array.isArray(permitted)) {
        scopeIds = permitted.map((s: any) => s._id);
      }
    }

    // Search for facts on topic
    const facts = await convex.searchFacts({
      query: input.topic,
      limit: input.maxFacts,
      scopeIds,
    });

    if (!Array.isArray(facts) || facts.length === 0) {
      return {
        isError: true,
        message: `No facts found for topic "${input.topic}"`,
      };
    }

    // Create summary fact
    const summaryContent = `Summary of ${facts.length} facts about "${input.topic}":\n\n${facts
      .slice(0, 10)
      .map((f: any, i: number) => `${i + 1}. ${f.content}`)
      .join("\n")}${facts.length > 10 ? `\n\n... and ${facts.length - 10} more facts` : ""}`;

    const summaryResult = await convex.storeFact({
      content: summaryContent,
      source: "consolidation",
      createdBy: agentId,
      scopeId: scopeIds![0],
      factType: "summary",
      entityIds: facts
        .flatMap((f: any) => f.entityIds || [])
        .filter((id: string, i: number, arr: string[]) => arr.indexOf(id) === i) // unique
        .slice(0, 10),
    });

    if (!summaryResult) {
      return {
        isError: true,
        message: "Failed to create summary fact",
      };
    }

    return {
      summaryFactId: summaryResult.factId,
      consolidatedCount: facts.length,
    };
  } catch (error: any) {
    console.error("[summarize] Error:", error);
    return {
      isError: true,
      message: `Failed to summarize: ${error.message}`,
    };
  }
}
