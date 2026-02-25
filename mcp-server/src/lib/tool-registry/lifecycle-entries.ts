/**
 * Fact Lifecycle (6) + Delete Operations (5) + Theme Creation (1) + Agent Identity (3) entries.
 */

import type { ToolEntry } from "./types.js";

import {
  archiveFact, archiveFactSchema,
  boostRelevance, boostRelevanceSchema,
  createTheme, createThemeSchema,
  deleteConversation, deleteConversationSchema,
  deleteEntity, deleteEntitySchema,
  deleteScope, deleteScopeSchema,
  deleteSession, deleteSessionSchema,
  deleteTheme, deleteThemeSchema,
  getAgentInfo, getAgentInfoSchema,
  getAgentContext, getAgentContextSchema,
  getSystemPrompt, getSystemPromptSchema,
  updateFact, updateFactSchema,
} from "../../tools/admin-primitives.js";
import { forget, forgetSchema } from "../../tools/forget.js";
import { pinFact, pinFactSchema, unpinFact, unpinFactSchema } from "../../tools/pin-fact.js";
import { factHistory, factHistorySchema, factRollback, factRollbackSchema } from "../../tools/fact-history.js";
import { defrag, defragSchema } from "../../tools/defrag.js";

import {
  listStaleFacts, listStaleFactsSchema,
  markFactsMerged, markFactsMergedSchema,
  markFactsPruned, markFactsPrunedSchema,
} from "../../tools/primitive-retrieval.js";

export const entries: readonly ToolEntry[] = [
  // ── Fact Lifecycle ────────────────────────────────
  {
    tool: {
      name: "memory_update_fact",
      description: "Update a fact's content, tags, type, pinned status, or summary.",
      inputSchema: { type: "object", properties: { factId: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } }, factType: { type: "string" }, pinned: { type: "boolean" }, summary: { type: "string" } }, required: ["factId"] },
    },
    zodSchema: updateFactSchema,
    handler: (args) => updateFact(args),
  },
  {
    tool: {
      name: "memory_archive_fact",
      description: "Archive a fact (soft delete, recoverable).",
      inputSchema: { type: "object", properties: { factId: { type: "string" } }, required: ["factId"] },
    },
    zodSchema: archiveFactSchema,
    handler: (args) => archiveFact(args),
  },
  {
    tool: {
      name: "memory_forget",
      description: "Intentionally forget facts by ID or query match (soft-archive + event log).",
      inputSchema: {
        type: "object",
        properties: {
          factId: { type: "string", description: "Fact ID to forget (direct)" },
          query: { type: "string", description: "Find and forget facts matching this query" },
          reason: { type: "string", description: "Why this fact should be forgotten" },
          limit: { type: "number", description: "Max facts to forget when using query (default: 1, max: 10)" },
        },
        required: ["reason"],
      },
    },
    zodSchema: forgetSchema,
    handler: (args, agentId) => forget(args, agentId),
  },
  {
    tool: {
      name: "memory_boost_relevance",
      description: "Boost a fact's relevance score.",
      inputSchema: { type: "object", properties: { factId: { type: "string" }, boost: { type: "number" } }, required: ["factId"] },
    },
    zodSchema: boostRelevanceSchema,
    handler: (args) => boostRelevance(args),
  },
  {
    tool: {
      name: "memory_pin",
      description: "Pin a fact to always-loaded context (max 20 per scope).",
      inputSchema: { type: "object", properties: { factId: { type: "string", description: "Fact ID to pin" }, scopeId: { type: "string", description: "Scope for pin limit enforcement" } }, required: ["factId"] },
    },
    zodSchema: pinFactSchema,
    handler: (args, agentId) => pinFact(args, agentId),
  },
  {
    tool: {
      name: "memory_unpin",
      description: "Remove pin from a fact.",
      inputSchema: { type: "object", properties: { factId: { type: "string", description: "Fact ID to unpin" } }, required: ["factId"] },
    },
    zodSchema: unpinFactSchema,
    handler: (args) => unpinFact(args),
  },
  {
    tool: {
      name: "memory_history",
      description: "Retrieve version history for a fact (all edits, archives, merges).",
      inputSchema: { type: "object", properties: { factId: { type: "string", description: "Fact ID to get history for" }, limit: { type: "number", description: "Maximum versions to return (default: 20)" } }, required: ["factId"] },
    },
    zodSchema: factHistorySchema,
    handler: (args) => factHistory(args),
  },
  {
    tool: {
      name: "memory_rollback",
      description: "Restore a fact to a previous version from its edit history.",
      inputSchema: { type: "object", properties: { factId: { type: "string", description: "Fact ID to rollback" }, versionId: { type: "string", description: "Version ID to restore to (defaults to most recent)" }, reason: { type: "string", description: "Reason for rollback" } }, required: ["factId"] },
    },
    zodSchema: factRollbackSchema,
    handler: (args) => factRollback(args),
  },
  {
    tool: {
      name: "memory_list_stale_facts",
      description: "List stale facts candidates for pruning or summarization.",
      inputSchema: { type: "object", properties: { scopeId: { type: "string" }, olderThanDays: { type: "number" }, limit: { type: "number" } } },
    },
    zodSchema: listStaleFactsSchema,
    handler: (args) => listStaleFacts(args),
  },
  {
    tool: {
      name: "memory_mark_facts_merged",
      description: "Mark source facts as merged into a target fact.",
      inputSchema: { type: "object", properties: { sourceFactIds: { type: "array", items: { type: "string" } }, targetFactId: { type: "string" } }, required: ["sourceFactIds", "targetFactId"] },
    },
    zodSchema: markFactsMergedSchema,
    handler: (args) => markFactsMerged(args),
  },
  {
    tool: {
      name: "memory_mark_facts_pruned",
      description: "Mark facts as pruned (batch archive).",
      inputSchema: { type: "object", properties: { factIds: { type: "array", items: { type: "string" } } }, required: ["factIds"] },
    },
    zodSchema: markFactsPrunedSchema,
    handler: (args) => markFactsPruned(args),
  },
  {
    tool: {
      name: "memory_defrag",
      description: "Defragment a memory scope: merge near-duplicate facts and archive low-value dormant facts.",
      inputSchema: {
        type: "object",
        properties: {
          scopeId: { type: "string", description: "Scope to defrag (defaults to agent's private scope)" },
          dryRun: { type: "boolean", description: "If true, report what would be defragged without making changes (default: true)" },
          mergeThreshold: { type: "number", description: "Jaccard similarity threshold for merging (0.5-0.9, default: 0.7)" },
          archiveOlderThanDays: { type: "number", description: "Archive dormant facts older than N days (default: 90)" },
        },
      },
    },
    zodSchema: defragSchema,
    handler: (args, agentId) => defrag(args, agentId),
  },

  // ── Delete Operations ─────────────────────────────
  {
    tool: {
      name: "memory_delete_entity",
      description: "Delete or archive an entity.",
      inputSchema: { type: "object", properties: { entityId: { type: "string" }, hardDelete: { type: "boolean" } }, required: ["entityId"] },
    },
    zodSchema: deleteEntitySchema,
    handler: (args) => deleteEntity(args),
  },
  {
    tool: {
      name: "memory_delete_scope",
      description: "Delete or archive a scope.",
      inputSchema: { type: "object", properties: { scopeId: { type: "string" }, hardDelete: { type: "boolean" }, force: { type: "boolean" } }, required: ["scopeId"] },
    },
    zodSchema: deleteScopeSchema,
    handler: (args) => deleteScope(args),
  },
  {
    tool: {
      name: "memory_delete_conversation",
      description: "Delete or archive a conversation.",
      inputSchema: { type: "object", properties: { conversationId: { type: "string" }, hardDelete: { type: "boolean" } }, required: ["conversationId"] },
    },
    zodSchema: deleteConversationSchema,
    handler: (args) => deleteConversation(args),
  },
  {
    tool: {
      name: "memory_delete_session",
      description: "Delete or archive a session.",
      inputSchema: { type: "object", properties: { sessionId: { type: "string" }, hardDelete: { type: "boolean" } }, required: ["sessionId"] },
    },
    zodSchema: deleteSessionSchema,
    handler: (args) => deleteSession(args),
  },
  {
    tool: {
      name: "memory_delete_theme",
      description: "Delete or archive a theme.",
      inputSchema: { type: "object", properties: { themeId: { type: "string" }, hardDelete: { type: "boolean" } }, required: ["themeId"] },
    },
    zodSchema: deleteThemeSchema,
    handler: (args) => deleteTheme(args),
  },

  // ── Theme Creation ────────────────────────────────
  {
    tool: {
      name: "memory_create_theme",
      description: "Create a thematic cluster grouping related facts and entities.",
      inputSchema: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, factIds: { type: "array", items: { type: "string" } }, entityIds: { type: "array", items: { type: "string" } }, scopeId: { type: "string" }, importance: { type: "number" } }, required: ["name", "description", "factIds", "entityIds", "scopeId"] },
    },
    zodSchema: createThemeSchema,
    handler: (args) => createTheme(args),
  },

  // ── Agent Identity ────────────────────────────────
  {
    tool: {
      name: "memory_get_agent_info",
      description: "Get agent identity context and accessible scopes.",
      inputSchema: { type: "object", properties: { agentId: { type: "string" } } },
    },
    zodSchema: getAgentInfoSchema,
    handler: (args, agentId) => getAgentInfo(args, agentId),
  },
  {
    tool: {
      name: "memory_get_agent_context",
      description: "Get full agent identity context with capabilities, scope policies, and system health for system prompt injection.",
      inputSchema: { type: "object", properties: { agentId: { type: "string" } } },
    },
    zodSchema: getAgentContextSchema,
    handler: (args, agentId) => getAgentContext(args, agentId),
  },
  {
    tool: {
      name: "memory_get_system_prompt",
      description: "Generate agent-native system prompt context block for injection.",
      inputSchema: { type: "object", properties: { agentId: { type: "string" } } },
    },
    zodSchema: getSystemPromptSchema,
    handler: (args, agentId) => getSystemPrompt(args, agentId),
  },
];
