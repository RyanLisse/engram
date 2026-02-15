#!/usr/bin/env npx tsx
/**
 * Tool Complexity Analyzer
 *
 * Harness engineering: mechanical enforcement of simplicity.
 * Scans tool-registry.ts for complexity signals and reports:
 *   1. High parameter count tools (>5 params)
 *   2. Tools missing required fields
 *   3. Category distribution balance
 *   4. Description quality (too short / too long)
 *
 * Usage: npx tsx scripts/analyze-tool-complexity.ts
 */

import { TOOL_REGISTRY, TOOL_MAP } from "../mcp-server/src/lib/tool-registry.js";

interface ToolAnalysis {
  name: string;
  paramCount: number;
  requiredCount: number;
  descriptionLength: number;
  issues: string[];
}

const analyses: ToolAnalysis[] = [];

for (const entry of TOOL_REGISTRY) {
  const { tool } = entry;
  const schema = tool.inputSchema as any;
  const properties = schema?.properties ?? {};
  const required = schema?.required ?? [];
  const paramCount = Object.keys(properties).length;
  const descLen = tool.description?.length ?? 0;
  const issues: string[] = [];

  // Rule: Tools should have ≤5 parameters for agent legibility
  if (paramCount > 5) {
    issues.push(`⚠️  ${paramCount} params (target: ≤5) — consider splitting`);
  }

  // Rule: Descriptions should be 20-120 chars for progressive disclosure
  if (descLen < 20) {
    issues.push(`📝 Description too short (${descLen} chars)`);
  }
  if (descLen > 120) {
    issues.push(`📝 Description long (${descLen} chars) — may waste tokens`);
  }

  // Rule: Tools with >3 required params may be too rigid
  if (required.length > 3) {
    issues.push(`🔒 ${required.length} required params — agents prefer optional defaults`);
  }

  analyses.push({
    name: tool.name,
    paramCount,
    requiredCount: required.length,
    descriptionLength: descLen,
    issues,
  });
}

// Category distribution
const categories: Record<string, string[]> = {
  core: ["memory_store_fact", "memory_recall", "memory_search", "memory_observe", "memory_link_entity", "memory_get_context"],
  lifecycle: ["memory_update_fact", "memory_archive_fact", "memory_boost_relevance", "memory_list_stale_facts", "memory_mark_facts_merged", "memory_mark_facts_pruned"],
  signals: ["memory_record_signal", "memory_record_feedback", "memory_record_recall"],
  agent: ["memory_register_agent", "memory_end_session", "memory_get_agent_info", "memory_get_agent_context", "memory_get_system_prompt"],
  events: ["memory_poll_events", "memory_get_notifications", "memory_mark_notifications_read"],
  subscriptions: ["memory_subscribe", "memory_unsubscribe", "memory_list_subscriptions", "memory_poll_subscription"],
  config: ["memory_get_config", "memory_list_configs", "memory_set_config", "memory_set_scope_policy"],
  retrieval: ["memory_vector_search", "memory_text_search", "memory_rank_candidates", "memory_bump_access", "memory_get_observations", "memory_get_entities", "memory_get_themes", "memory_get_handoffs", "memory_search_facts", "memory_search_entities", "memory_search_themes"],
  delete: ["memory_delete_entity", "memory_delete_scope", "memory_delete_conversation", "memory_delete_session", "memory_delete_theme"],
  composition: ["memory_summarize", "memory_prune", "memory_create_theme", "memory_query_raw"],
  context: ["memory_resolve_scopes", "memory_load_budgeted_facts", "memory_search_daily_notes", "memory_get_graph_neighbors", "memory_get_activity_stats", "memory_get_workspace_info", "memory_build_system_prompt"],
  vault: ["memory_vault_sync", "memory_vault_export", "memory_vault_import", "memory_vault_list_files", "memory_vault_reconcile", "memory_query_vault", "memory_export_graph", "memory_checkpoint", "memory_wake"],
  health: ["memory_health"],
  discovery: ["memory_list_capabilities"],
};

// --- Report ---

console.log("# Engram Tool Complexity Report\n");
console.log(`Total tools: ${TOOL_REGISTRY.length}`);
console.log(`Average params: ${(analyses.reduce((s, a) => s + a.paramCount, 0) / analyses.length).toFixed(1)}`);
console.log(`Average required: ${(analyses.reduce((s, a) => s + a.requiredCount, 0) / analyses.length).toFixed(1)}`);
console.log();

// Tools with issues
const withIssues = analyses.filter((a) => a.issues.length > 0);
if (withIssues.length > 0) {
  console.log(`## Issues Found (${withIssues.length} tools)\n`);
  for (const a of withIssues) {
    console.log(`### ${a.name} (${a.paramCount} params, ${a.requiredCount} required)`);
    for (const issue of a.issues) {
      console.log(`  ${issue}`);
    }
    console.log();
  }
} else {
  console.log("## ✅ No issues found\n");
}

// Category distribution
console.log("## Category Distribution\n");
console.log("| Category | Count | % |");
console.log("|----------|-------|---|");
for (const [cat, tools] of Object.entries(categories)) {
  const pct = ((tools.length / TOOL_REGISTRY.length) * 100).toFixed(0);
  console.log(`| ${cat} | ${tools.length} | ${pct}% |`);
}

// Unregistered tools (tools in registry but not in any category)
const allCategorized = new Set(Object.values(categories).flat());
const uncategorized = TOOL_REGISTRY.filter((e) => !allCategorized.has(e.tool.name));
if (uncategorized.length > 0) {
  console.log(`\n## ⚠️  Uncategorized Tools (${uncategorized.length})\n`);
  for (const e of uncategorized) {
    console.log(`- ${e.tool.name}`);
  }
}

// Parameter histogram
console.log("\n## Parameter Distribution\n");
const histogram = new Map<number, number>();
for (const a of analyses) {
  histogram.set(a.paramCount, (histogram.get(a.paramCount) ?? 0) + 1);
}
for (const [params, count] of [...histogram.entries()].sort((a, b) => a[0] - b[0])) {
  const bar = "█".repeat(count);
  console.log(`  ${params} params: ${bar} (${count})`);
}
