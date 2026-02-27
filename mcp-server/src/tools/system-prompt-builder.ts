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
import { formatFactsAsObservationBlocks } from "../lib/budget-aware-loader.js";
import { getActivityStats } from "./context-primitives.js";
import { getNotifications } from "./primitive-retrieval.js";

export const buildFullSystemPromptSchema = z.object({
  agentId: z.string().optional().describe("Agent ID (defaults to current agent)"),
  tokenBudget: z.number().optional().describe("Total token budget (default: 8000)"),
  includePinned: z.boolean().optional().prefault(true).describe("Include pinned memories"),
  includeManifest: z.boolean().optional().prefault(true).describe("Include memory manifest"),
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
  const tokenBudget = input.tokenBudget ?? 8000;
  const sections: Array<{ id: string; title: string; lines: string[] }> = [];
  const addSection = (id: string, title: string, lines: string[]) => {
    sections.push({ id, title, lines });
  };
  let tokensUsed = 0;

  // 1. Agent identity
  const agent = await convex.getAgentByAgentId(agentId);
  const permitted = await convex.getPermittedScopes(agentId);
  const scopeList = Array.isArray(permitted) ? permitted : [];

  addSection("agent_identity", "Agent Identity", [
    `Agent ID: ${agentId}`,
    `Name: ${agent?.name ?? "unknown"}`,
    `Telos: ${agent?.telos ?? "none"}`,
    `Capabilities: ${(agent?.capabilities ?? []).join(", ") || "none"}`,
    `Default Scope: ${agent?.defaultScope ?? "none"}`,
    `Permitted Scopes: ${scopeList.map((s: any) => s.name).join(", ") || "none"}`,
  ]);
  const agentIdentityText = formatSection(input.format, "Agent Identity", [
    `Agent ID: ${agentId}`,
    `Name: ${agent?.name ?? "unknown"}`,
    `Telos: ${agent?.telos ?? "none"}`,
    `Capabilities: ${(agent?.capabilities ?? []).join(", ") || "none"}`,
    `Default Scope: ${agent?.defaultScope ?? "none"}`,
    `Permitted Scopes: ${scopeList.map((s: any) => s.name).join(", ") || "none"}`,
  ]);
  tokensUsed += Math.ceil(agentIdentityText.length / 4);

  // 1.5. Pinned Memories (Progressive Disclosure)
  if (input.includePinned) {
    try {
      const scopeIds = scopeList.map((s: any) => s._id);
      const pinnedBudget = Math.floor(tokenBudget * 0.3); // Max 30% of budget
      let pinnedTokens = 0;

      const pinnedFacts: string[] = [];
      for (const scopeId of scopeIds) {
        const pinned = await convex.listPinnedByScope({ scopeId, limit: 50 });
        const pinnedList = Array.isArray(pinned) ? pinned : [];

        for (const fact of pinnedList) {
          const factTokens = Math.ceil((fact.content?.length ?? 0) / 4);
          if (pinnedTokens + factTokens > pinnedBudget) break; // Stop if exceeds budget
          pinnedFacts.push(`- ${fact.content ?? "(empty)"} [${fact.factType ?? "unknown"}]`);
          pinnedTokens += factTokens;
        }
        if (pinnedTokens >= pinnedBudget) break;
      }

      if (pinnedFacts.length > 0) {
        addSection("pinned_memories", "Pinned Memories", pinnedFacts);
        const pinnedSection = formatSection(input.format, "Pinned Memories", pinnedFacts);
        tokensUsed += Math.max(pinnedTokens, Math.ceil(pinnedSection.length / 4));
      }
    } catch {
      // skip pinned if unavailable
    }
  }

  // 1.6. Memory Manifest (Category Summary)
  if (input.includeManifest) {
    try {
      const scopeIds = scopeList.map((s: any) => s._id);
      const manifestLines: string[] = [];
      const factTypeCounts: Record<string, number> = {};
      let totalFacts = 0;

      // Count facts by type across all scopes
      for (const scopeId of scopeIds) {
        const facts = await convex.listFactsByScope({ scopeId, limit: 1000 });
        const factList = Array.isArray(facts) ? facts : [];
        for (const fact of factList) {
          const type = fact.factType ?? "unknown";
          factTypeCounts[type] = (factTypeCounts[type] ?? 0) + 1;
          totalFacts++;
        }
      }

      // Format as manifest entries
      for (const [type, count] of Object.entries(factTypeCounts).sort((a, b) => b[1] - a[1])) {
        manifestLines.push(`${type}: ${count} facts`);
      }

      if (manifestLines.length > 0) {
        manifestLines.unshift(`Total Facts: ${totalFacts}`);
        addSection("memory_manifest", "Memory Manifest", manifestLines);
        const manifestSection = formatSection(input.format, "Memory Manifest", manifestLines);
        tokensUsed += Math.ceil(manifestSection.length / 4);
      }
    } catch {
      // skip manifest if unavailable
    }
  }

  // 2. Observation Log (most compressed form available, with emoji tier prefixes)
  try {
    const scopeIds = scopeList.map((s: any) => s._id);
    const defaultScopeId = scopeIds.length > 0 ? scopeIds[0] : null;
    if (defaultScopeId) {
      // Prefer observation_digest (most compressed) -> fallback to observation_summary
      const digests = await convex.searchFacts({
        query: "observation digest",
        scopeIds: [defaultScopeId],
        factType: "observation_digest",
        limit: 1,
      });
      const digestList = Array.isArray(digests) ? digests : [];

      if (digestList.length > 0) {
        // Format digest facts with emoji observation blocks
        const formatted = formatFactsAsObservationBlocks(digestList);
        if (formatted) {
          addSection("observation_log", "Observation Log", [formatted]);
        } else {
          addSection("observation_log", "Observation Log", [digestList[0].content]);
        }
      } else {
        // Fallback to observation summaries with emoji prefixes based on importance
        const summaries = await convex.listObservationSummaries(defaultScopeId, agentId, 3);
        const summaryList = Array.isArray(summaries) ? summaries : [];
        if (summaryList.length > 0) {
          const formatted = formatFactsAsObservationBlocks(summaryList);
          if (formatted) {
            addSection("observation_log", "Observation Log", [formatted]);
          } else {
            // Final fallback: emoji prefix based on importance score
            const tierEmoji = (s: any) => {
              if (s.observationTier === "critical") return "\u{1F534}";
              if (s.observationTier === "notable") return "\u{1F7E1}";
              if (s.observationTier === "background") return "\u{1F7E2}";
              if ((s.importanceScore ?? 0) >= 0.8) return "\u{1F534}";
              if ((s.importanceScore ?? 0) >= 0.5) return "\u{1F7E1}";
              return "\u{1F7E2}";
            };
            addSection(
              "observation_log",
              "Observation Log",
              summaryList.map((s: any) => `${tierEmoji(s)} ${s.content}`),
            );
          }
        }
      }
    }
  } catch {
    // skip -- observation log is optional
  }

  // 3. Activity stats
  if (input.includeActivity) {
    try {
      const stats = await getActivityStats({ periodHours: 24 }, agentId);
      addSection("activity", "Activity (Last 24h)", [
        `Facts Stored: ${stats.factsStored}`,
        `Recalls: ${stats.recalls}`,
        `Signals: ${stats.signals}`,
        `Handoffs: ${stats.handoffs}`,
        `Total Events: ${stats.totalEvents}`,
      ]);
    } catch {
      addSection("activity", "Activity", ["Unavailable"]);
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
      addSection("configuration", "Configuration", configLines.length > 0 ? configLines : ["No configs set"]);
    } catch {
      addSection("configuration", "Configuration", ["Unavailable"]);
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
      addSection("workspace", "Workspace", [
        `Other Agents: ${otherAgents.length}`,
        ...agentLines,
        `Shared Scopes: ${sharedScopes.map((s: any) => `${s.name} (${s.members?.length} members)`).join(", ") || "none"}`,
      ]);
    } catch {
      addSection("workspace", "Workspace", ["Unavailable"]);
    }
  }

  // 6. Notifications
  if (input.includeNotifications) {
    try {
      const notifications = await getNotifications({ limit: 5 }, agentId);
      const noteList = Array.isArray(notifications) ? notifications : [];
      if (noteList.length > 0) {
        addSection(
          "notifications",
          "Unread Notifications",
          noteList.map((n: any) => `[${n.type}] ${n.message ?? n.content ?? "notification"}`),
        );
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
          addSection(
            "handoffs",
            "Recent Handoffs",
            handoffList.map((h: any) => `From ${h.fromAgent}: ${h.summary ?? "no summary"}`),
          );
        }
      }
    } catch {
      // skip
    }
  }

  addSection(
    "capabilities_hint",
    "Capabilities",
    ["To list all memory tools, use memory_list_capabilities."],
  );

  let orderedSections = sections;
  try {
    const sectionConfig = await convex.getConfig("system_prompt_sections");
    const raw = sectionConfig?.value;
    if (typeof raw === "string" && raw.trim().length > 0) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const byId = new Map(sections.map((section) => [section.id, section]));
        const configured: typeof sections = [];
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const id = typeof item.id === "string" ? item.id : "";
          if (!id) continue;
          const source = byId.get(id);
          if (!source) continue;
          if (item.includeByDefault === false) continue;
          configured.push({
            ...source,
            title:
              typeof item.title === "string" && item.title.trim().length > 0
                ? item.title
                : source.title,
          });
          byId.delete(id);
        }
        orderedSections = [...configured, ...Array.from(byId.values())];
      }
    }
  } catch {
    // Keep default ordering/titles.
  }

  const prompt = orderedSections
    .map((section) => formatSection(input.format, section.title, section.lines))
    .join("\n\n");
  const estimatedTokens = Math.ceil(prompt.length / 4);
  return {
    prompt,
    agentId,
    format: input.format,
    sectionCount: orderedSections.length,
    estimatedTokens,
    tokenBudget,
    tokensUsed: Math.max(tokensUsed, estimatedTokens),
    withinBudget: estimatedTokens <= tokenBudget,
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
