/**
 * Context Primitives (6) + System Prompt Builder (1) entries.
 */

import type { ToolEntry } from "./types.js";

import {
  resolveScopes, resolveScopesSchema,
  loadBudgetedFacts, loadBudgetedFactsSchema,
  searchDailyNotes, searchDailyNotesSchema,
  getGraphNeighbors, getGraphNeighborsSchema,
  getActivityStats, getActivityStatsSchema,
  getWorkspaceInfo, getWorkspaceInfoSchema,
} from "../../tools/context-primitives.js";

import { buildFullSystemPrompt, buildFullSystemPromptSchema } from "../../tools/system-prompt-builder.js";

export const entries: readonly ToolEntry[] = [
  // ── Context Primitives (decomposed from get_context) ──
  {
    tool: {
      name: "memory_resolve_scopes",
      description: "Primitive: resolve scope name\u2192ID or get all permitted scopes for agent. Use before any scoped search.",
      inputSchema: {
        type: "object",
        properties: {
          scopeId: { type: "string", description: "Scope name or ID to resolve (omit for all permitted)" },
          agentId: { type: "string", description: "Agent ID (defaults to current)" },
        },
      },
    },
    zodSchema: resolveScopesSchema,
    handler: (args, agentId) => resolveScopes(args, agentId),
  },
  {
    tool: {
      name: "memory_load_budgeted_facts",
      description: "Primitive: token-budget-aware fact loading with query intent detection. Profiles: default, planning, incident, handoff.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Topic or search query" },
          tokenBudget: { type: "number", description: "Max token budget (default: 4000)" },
          scopeId: { type: "string", description: "Scope ID to search within" },
          maxFacts: { type: "number", description: "Max facts to load (default: 20)" },
          profile: { type: "string", enum: ["default", "planning", "incident", "handoff"], description: "Context profile" },
        },
        required: ["query"],
      },
    },
    zodSchema: loadBudgetedFactsSchema,
    handler: (args) => loadBudgetedFacts(args),
  },
  {
    tool: {
      name: "memory_search_daily_notes",
      description: "Primitive: search vault daily notes for matching text.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text to search for" },
          maxFiles: { type: "number", description: "Max files to scan (default: 5)" },
          snippetLength: { type: "number", description: "Max snippet chars (default: 160)" },
        },
        required: ["query"],
      },
    },
    zodSchema: searchDailyNotesSchema,
    handler: (args) => searchDailyNotes(args),
  },
  {
    tool: {
      name: "memory_get_graph_neighbors",
      description: "Primitive: find facts connected via shared entity IDs (knowledge graph traversal).",
      inputSchema: {
        type: "object",
        properties: {
          entityIds: { type: "array", items: { type: "string" }, description: "Entity IDs to find connected facts for" },
          scopeIds: { type: "array", items: { type: "string" }, description: "Scope IDs to search within" },
          limit: { type: "number", description: "Max results (default: 20)" },
        },
        required: ["entityIds"],
      },
    },
    zodSchema: getGraphNeighborsSchema,
    handler: (args) => getGraphNeighbors(args),
  },
  {
    tool: {
      name: "memory_get_activity_stats",
      description: "Primitive: agent activity tracking \u2014 factsStored, recalls, signals, handoffs in a period.",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Agent ID (defaults to current)" },
          periodHours: { type: "number", description: "Lookback period in hours (default: 24)" },
        },
      },
    },
    zodSchema: getActivityStatsSchema,
    handler: (args, agentId) => getActivityStats(args, agentId),
  },
  {
    tool: {
      name: "memory_get_workspace_info",
      description: "Primitive: workspace awareness \u2014 other agents, their capabilities, shared scopes and member counts.",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Agent ID (defaults to current)" },
        },
      },
    },
    zodSchema: getWorkspaceInfoSchema,
    handler: (args, agentId) => getWorkspaceInfo(args, agentId),
  },

  // ── System Prompt Builder ──────────────
  {
    tool: {
      name: "memory_build_system_prompt",
      description: "Aggregator: build a complete system prompt context block with identity, activity, config, workspace, notifications, and handoffs.",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Agent ID (defaults to current)" },
          includeActivity: { type: "boolean", description: "Include activity stats (default: true)" },
          includeConfig: { type: "boolean", description: "Include config context (default: true)" },
          includeWorkspace: { type: "boolean", description: "Include workspace info (default: true)" },
          includeNotifications: { type: "boolean", description: "Include notifications (default: true)" },
          includeHandoffs: { type: "boolean", description: "Include recent handoffs (default: true)" },
          format: { type: "string", enum: ["markdown", "xml", "plain"], description: "Output format (default: markdown)" },
        },
      },
    },
    zodSchema: buildFullSystemPromptSchema,
    handler: (args, agentId) => buildFullSystemPrompt(args, agentId),
  },
];
