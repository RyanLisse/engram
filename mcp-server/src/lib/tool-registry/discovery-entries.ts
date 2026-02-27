/**
 * Discovery (list_capabilities factory) + Health (1) entries.
 *
 * list_capabilities references TOOL_MAP and TOOL_REGISTRY.length at runtime,
 * so we expose a factory that receives them from the barrel.
 */

import { z } from "zod";
import type { ToolEntry } from "./types.js";
import { health } from "../../tools/health.js";

/**
 * Build the memory_list_capabilities entry. Must be called after
 * the full TOOL_REGISTRY and TOOL_MAP are assembled.
 */
export function makeListCapabilitiesEntry(
  registry: ToolEntry[],
  toolMap: Map<string, ToolEntry>,
): ToolEntry {
  return {
    tool: {
      name: "memory_list_capabilities",
      description: "Discovery: list all available memory tools with descriptions, grouped by category.",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by category (core, lifecycle, signals, agent, events, config, retrieval, delete, observation, composition, vault, health, context, blocks, parity, crud, qmd, discovery)" },
          format: { type: "string", enum: ["list", "table", "json"], description: "Output format (default: list)" },
        },
      },
    },
    zodSchema: z.object({
      category: z.string().optional(),
      format: z.enum(["list", "table", "json"]).optional().prefault("list"),
    }),
    handler: async (args) => {
      const categories: Record<string, string[]> = {
        core: ["memory_store_fact", "memory_recall", "memory_search", "memory_observe", "memory_link_entity", "memory_get_context"],
        lifecycle: ["memory_update_fact", "memory_archive_fact", "memory_boost_relevance", "memory_list_stale_facts", "memory_mark_facts_merged", "memory_mark_facts_pruned"],
        signals: ["memory_record_signal", "memory_record_feedback", "memory_record_recall"],
        agent: ["memory_register_agent", "memory_end_session", "memory_get_agent_info", "memory_get_agent_context", "memory_get_system_prompt"],
        events: ["memory_poll_events", "memory_get_notifications", "memory_mark_notifications_read"],
        subscriptions: ["memory_subscribe", "memory_unsubscribe", "memory_list_subscriptions", "memory_poll_subscription"],
        config: ["memory_get_config", "memory_list_configs", "memory_set_config", "memory_set_scope_policy"],
        retrieval: ["memory_vector_search", "memory_text_search", "memory_rank_candidates", "memory_bump_access", "memory_get_observations", "memory_get_entities", "memory_get_themes", "memory_get_handoffs", "memory_search_facts", "memory_search_entities", "memory_search_themes", "memory_hierarchical_recall"],
        delete: ["memory_delete_entity", "memory_delete_scope", "memory_delete_conversation", "memory_delete_session", "memory_delete_theme"],
        observation: ["memory_om_status", "memory_observe_compress", "memory_reflect"],
        composition: ["memory_summarize", "memory_prune", "memory_create_theme", "memory_query_raw"],
        context: ["memory_resolve_scopes", "memory_load_budgeted_facts", "memory_search_daily_notes", "memory_get_graph_neighbors", "memory_get_activity_stats", "memory_get_workspace_info", "memory_build_system_prompt"],
        vault: ["memory_vault_sync", "memory_vault_export", "memory_vault_import", "memory_vault_list_files", "memory_vault_reconcile", "memory_query_vault", "memory_export_graph", "memory_checkpoint", "memory_wake"],
        blocks: ["memory_block_read", "memory_block_write"],
        parity: [
          "memory_list_scope_policies",
          "memory_create_scope",
          "memory_create_session",
          "memory_create_conversation",
          "memory_add_fact_to_conversation",
          "memory_add_handoff",
        ],
        crud: [
          "memory_delete_episode",
          "memory_delete_subspace",
          "memory_block_delete",
          "memory_update_theme",
          "memory_update_agent",
        ],
        qmd: ["memory_local_search", "memory_local_vsearch", "memory_local_query", "memory_deep_search"],
        health: ["memory_health"],
        discovery: ["memory_list_capabilities"],
      };

      const filtered = args.category
        ? { [args.category]: categories[args.category] ?? [] }
        : categories;

      const totalTools = toolMap.size;
      if (args.format === "json") return { categories: filtered, totalTools };

      const lines: string[] = [];
      for (const [cat, tools] of Object.entries(filtered)) {
        lines.push(`\n### ${cat.charAt(0).toUpperCase() + cat.slice(1)} (${tools.length})`);
        for (const toolName of tools) {
          const entry = toolMap.get(toolName);
          lines.push(`- **${toolName}**: ${entry?.tool.description ?? "\u2014"}`);
        }
      }
      return { capabilities: lines.join("\n"), totalTools };
    },
  };
}

/** Static entries that don't need the factory pattern. */
export const entries: readonly ToolEntry[] = [
  // ── Health ────────────────────────────────────────
  {
    tool: {
      name: "memory_health",
      description: "Runtime health check with event lag measurement.",
      inputSchema: { type: "object", properties: {} },
    },
    zodSchema: z.object({}),
    handler: () => health(),
  },
];
