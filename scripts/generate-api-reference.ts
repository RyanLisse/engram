#!/usr/bin/env tsx
/**
 * Auto-generate API-REFERENCE.md from the tool registry.
 * Run: npx tsx scripts/generate-api-reference.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registryPath = path.resolve(__dirname, "../mcp-server/dist/lib/tool-registry.js");

async function main() {
  const { TOOL_REGISTRY } = await import(registryPath);

  const lines: string[] = [
    "# Engram API Reference",
    "",
    `> Auto-generated from \`mcp-server/src/lib/tool-registry.ts\` — ${TOOL_REGISTRY.length} tools`,
    `> Generated: ${new Date().toISOString().split("T")[0]}`,
    "",
    "## Table of Contents",
    "",
  ];

  // Group tools by prefix category
  const categories = new Map<string, any[]>();
  for (const entry of TOOL_REGISTRY) {
    const name: string = entry.tool.name;
    // Derive category from tool name patterns
    let cat = "Other";
    if (name.match(/^memory_(store_fact|recall|search|observe|link_entity|get_context)$/)) cat = "Core";
    else if (name.match(/^memory_(update_fact|archive_fact|boost_relevance|list_stale|mark_facts)/)) cat = "Fact Lifecycle";
    else if (name.match(/^memory_record_(signal|feedback|recall)$/)) cat = "Signals";
    else if (name.match(/^memory_(register_agent|end_session|get_agent|get_system_prompt)/)) cat = "Agent";
    else if (name.match(/^memory_(poll_events|get_notifications|mark_notifications)/)) cat = "Events";
    else if (name.match(/^memory_(subscribe|unsubscribe|list_subscriptions|poll_subscription)/)) cat = "Subscriptions";
    else if (name.match(/^memory_(get_config|list_configs|set_config|set_scope)/)) cat = "Config";
    else if (name.match(/^memory_(vector_search|text_search|rank_candidates|bump_access|get_observations|get_entities|get_themes|get_handoffs|search_facts|search_entities|search_themes)/)) cat = "Retrieval";
    else if (name.match(/^memory_(resolve_scopes|load_budgeted|search_daily|get_graph|get_activity|get_workspace|build_system)/)) cat = "Context";
    else if (name.match(/^memory_delete_/)) cat = "Delete";
    else if (name.match(/^memory_(summarize|prune|create_theme|query_raw)/)) cat = "Composition";
    else if (name.match(/^memory_vault_/)) cat = "Vault";
    else if (name.match(/^memory_(vault_sync|query_vault|export_graph|checkpoint|wake)/)) cat = "Vault";
    else if (name === "memory_health") cat = "Health";
    else if (name === "memory_list_capabilities") cat = "Discovery";

    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(entry);
  }

  // TOC
  for (const [cat] of categories) {
    lines.push(`- [${cat}](#${cat.toLowerCase().replace(/\s+/g, "-")})`);
  }
  lines.push("");

  // Tool details
  for (const [cat, entries] of categories) {
    lines.push(`## ${cat}`);
    lines.push("");

    for (const entry of entries) {
      const { tool } = entry;
      lines.push(`### \`${tool.name}\``);
      lines.push("");
      lines.push(tool.description);
      lines.push("");

      const schema = tool.inputSchema;
      if (schema?.properties && Object.keys(schema.properties).length > 0) {
        lines.push("**Parameters:**");
        lines.push("");
        lines.push("| Name | Type | Required | Description |");
        lines.push("|------|------|----------|-------------|");

        const required = new Set(schema.required ?? []);
        for (const [propName, propDef] of Object.entries(schema.properties) as [string, any][]) {
          const type = propDef.type ?? (propDef.enum ? `enum(${propDef.enum.join("|")})` : "any");
          const desc = propDef.description ?? "—";
          const req = required.has(propName) ? "✓" : "";
          lines.push(`| \`${propName}\` | ${type} | ${req} | ${desc} |`);
        }
        lines.push("");
      } else {
        lines.push("**Parameters:** None");
        lines.push("");
      }
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(`*${TOOL_REGISTRY.length} tools across ${categories.size} categories*`);

  const output = lines.join("\n");
  const outPath = path.resolve(__dirname, "../docs/API-REFERENCE.md");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output, "utf8");
  console.log(`Generated ${outPath} (${TOOL_REGISTRY.length} tools, ${categories.size} categories)`);
}

main().catch(console.error);
