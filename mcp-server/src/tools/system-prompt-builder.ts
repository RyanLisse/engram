/**
 * memory_build_system_prompt — Full system prompt aggregator
 *
 * Composes a complete agent system prompt context block by gathering:
 * 1. Agent identity (name, capabilities, telos, scopes)
 * 2. Activity stats (facts stored, recalls, signals today)
 * 3. Configuration context (weights, thresholds, taxonomy)
 * 4. Workspace awareness (other agents, shared scopes)
 * 5. Recent notifications
 * 6. Handoff context from previous sessions
 *
 * Returns a single formatted string suitable for system prompt injection.
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { getActivityStats } from "./context-primitives.js";
import { getNotifications } from "./primitive-retrieval.js";

export const buildFullSystemPromptSchema = z.object({
  agentId: z.string().optional().describe("Agent ID (defaults to current agent)"),
  includeActivity: z.boolean().optional().prefault(true).describe("Include activity stats"),
  includeConfig: z.boolean().optional().prefault(true).describe("Include config context"),
  includeWorkspace: z.boolean().optional().prefault(true).describe("Include workspace info"),
  includeNotifications: z.boolean().optional().prefault(true).describe("Include recent notifications"),
  includeHandoffs: z.boolean().optional().prefault(true).describe("Include recent handoffs"),
  format: z.enum(["markdown", "xml", "plain"]).optional().prefault("markdown").describe("Output format"),
});

export async function buildFullSystemPrompt(
  input: z.infer<typeof buildFullSystemPromptSchema>,
  currentAgentId: string
) {
  const agentId = input.agentId ?? currentAgentId;
  const sections: string[] = [];

  // 1. Agent identity
  const agent = await convex.getAgentByAgentId(agentId);
  const permitted = await convex.getPermittedScopes(agentId);
  const scopeList = Array.isArray(permitted) ? permitted : [];

  sections.push(formatSection(input.format, "Agent Identity", [
    `Agent ID: ${agentId}`,
    `Name: ${agent?.name ?? "unknown"}`,
    `Telos: ${agent?.telos ?? "none"}`,
    `Capabilities: ${(agent?.capabilities ?? []).join(", ") || "none"}`,
    `Default Scope: ${agent?.defaultScope ?? "none"}`,
    `Permitted Scopes: ${scopeList.map((s: any) => s.name).join(", ") || "none"}`,
  ]));

  // 2. Observation Log (most compressed form available)
  try {
    const scopeIds = scopeList.map((s: any) => s._id);
    const defaultScopeId = scopeIds.length > 0 ? scopeIds[0] : null;
    if (defaultScopeId) {
      // Prefer observation_digest (most compressed) → fallback to observation_summary
      const digests = await convex.searchFacts({
        query: "observation digest",
        scopeIds: [defaultScopeId],
        factType: "observation_digest",
        limit: 1,
      });
      const digestList = Array.isArray(digests) ? digests : [];

      if (digestList.length > 0) {
        sections.push(formatSection(input.format, "Observation Log", [
          digestList[0].content,
        ]));
      } else {
        // Fallback to observation summaries
        const summaries = await convex.listObservationSummaries(defaultScopeId, agentId, 3);
        const summaryList = Array.isArray(summaries) ? summaries : [];
        if (summaryList.length > 0) {
          sections.push(formatSection(input.format, "Observation Log", summaryList.map((s: any) => s.content)));
        }
      }
    }
  } catch {
    // skip — observation log is optional
  }

  // 3. Activity stats
  if (input.includeActivity) {
    try {
      const stats = await getActivityStats({ periodHours: 24 }, agentId);
      sections.push(formatSection(input.format, "Activity (Last 24h)", [
        `Facts Stored: ${stats.factsStored}`,
        `Recalls: ${stats.recalls}`,
        `Signals: ${stats.signals}`,
        `Handoffs: ${stats.handoffs}`,
        `Total Events: ${stats.totalEvents}`,
      ]));
    } catch {
      sections.push(formatSection(input.format, "Activity", ["Unavailable"]));
    }
  }

  // 4. Configuration context
  if (input.includeConfig) {
    try {
      const configs = await convex.listConfigs();
      const configList = Array.isArray(configs) ? configs : [];
      const configLines = configList.slice(0, 15).map((c: any) =>
        `${c.key}: ${JSON.stringify(c.value)} (${c.category})`
      );
      if (configList.length > 15) configLines.push(`... and ${configList.length - 15} more`);
      sections.push(formatSection(input.format, "Configuration", configLines.length > 0 ? configLines : ["No configs set"]));
    } catch {
      sections.push(formatSection(input.format, "Configuration", ["Unavailable"]));
    }
  }

  // 5. Workspace awareness
  if (input.includeWorkspace) {
    try {
      const agents = await convex.listAgents();
      const agentList = Array.isArray(agents) ? agents : [];
      const otherAgents = agentList.filter((a: any) => a.agentId !== agentId);
      const agentLines = otherAgents.map((a: any) =>
        `${a.agentId} (${a.name}): ${(a.capabilities ?? []).slice(0, 3).join(", ")}`
      );
      const sharedScopes = scopeList.filter((s: any) =>
        s.members && Array.isArray(s.members) && s.members.length > 1
      );
      sections.push(formatSection(input.format, "Workspace", [
        `Other Agents: ${otherAgents.length}`,
        ...agentLines,
        `Shared Scopes: ${sharedScopes.map((s: any) => `${s.name} (${s.members?.length} members)`).join(", ") || "none"}`,
      ]));
    } catch {
      sections.push(formatSection(input.format, "Workspace", ["Unavailable"]));
    }
  }

  // 6. Notifications
  if (input.includeNotifications) {
    try {
      const notifications = await getNotifications({ limit: 5 }, agentId);
      const noteList = Array.isArray(notifications) ? notifications : [];
      if (noteList.length > 0) {
        sections.push(formatSection(input.format, "Unread Notifications", noteList.map((n: any) =>
          `[${n.type}] ${n.message ?? n.content ?? "notification"}`
        )));
      }
    } catch {
      // skip
    }
  }

  // 7. Recent handoffs
  if (input.includeHandoffs) {
    try {
      const scopeIds = scopeList.map((s: any) => s._id);
      if (scopeIds.length > 0) {
        const handoffs = await convex.getRecentHandoffs(agentId, scopeIds, 3);
        const handoffList = Array.isArray(handoffs) ? handoffs : [];
        if (handoffList.length > 0) {
          sections.push(formatSection(input.format, "Recent Handoffs", handoffList.map((h: any) =>
            `From ${h.fromAgent}: ${h.contextSummary ?? h.summary ?? "no summary"}`
          )));
        }
      }
    } catch {
      // skip
    }
  }

  const prompt = sections.join("\n\n");
  return {
    prompt,
    agentId,
    format: input.format,
    sectionCount: sections.length,
    estimatedTokens: Math.ceil(prompt.length / 4),
  };
}

function formatSection(format: string, title: string, lines: string[]): string {
  if (format === "xml") {
    return `<${title.toLowerCase().replace(/\s+/g, "_")}>\n${lines.join("\n")}\n</${title.toLowerCase().replace(/\s+/g, "_")}>`;
  }
  if (format === "plain") {
    return `[${title}]\n${lines.join("\n")}`;
  }
  // markdown
  return `## ${title}\n${lines.map((l) => `- ${l}`).join("\n")}`;
}
