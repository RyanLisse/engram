/**
 * Declarative tool registry — single source of truth for all Engram MCP tools.
 *
 * Each entry maps a tool name to its JSON Schema, Zod schema, handler, and
 * whether the handler requires the current agentId.
 *
 * Consumers:
 *   - mcp-server/src/index.ts   (MCP stdio transport)
 *   - plugins/claude-code/       (config generation)
 *   - plugins/openclaw/          (native extension)
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodSchema } from "zod";

// ── Tool handler imports ──────────────────────────────

import { storeFact, storeFactSchema } from "../tools/store-fact.js";
import { recall, recallSchema } from "../tools/recall.js";
import { search, searchSchema } from "../tools/search.js";
import { linkEntity, linkEntitySchema } from "../tools/link-entity.js";
import { getContext, getContextSchema } from "../tools/get-context.js";
import { observe, observeSchema } from "../tools/observe.js";
import { registerAgent, registerAgentSchema } from "../tools/register-agent.js";
import { queryRaw, queryRawSchema } from "../tools/query-raw.js";
import { recordSignal, recordSignalSchema } from "../tools/record-signal.js";
import { recordFeedback, recordFeedbackSchema } from "../tools/record-feedback.js";
import { summarize, summarizeSchema } from "../tools/summarize.js";
import { prune, pruneSchema } from "../tools/prune.js";
import { endSession, endSessionSchema } from "../tools/end-session.js";
import { vaultSync, vaultSyncSchema } from "../tools/vault-sync.js";
import { queryVault, queryVaultSchema } from "../tools/query-vault.js";
import { exportGraph, exportGraphSchema } from "../tools/export-graph.js";
import { checkpoint, checkpointSchema } from "../tools/checkpoint.js";
import { wake, wakeSchema } from "../tools/wake.js";
import { health } from "../tools/health.js";

import {
  archiveFact, archiveFactSchema,
  boostRelevance, boostRelevanceSchema,
  createTheme, createThemeSchema,
  deleteConversation, deleteConversationSchema,
  deleteEntity, deleteEntitySchema,
  deleteScope, deleteScopeSchema,
  deleteSession, deleteSessionSchema,
  deleteTheme, deleteThemeSchema,
  getConfig, getConfigSchema,
  getAgentInfo, getAgentInfoSchema,
  getAgentContext, getAgentContextSchema,
  getSystemPrompt, getSystemPromptSchema,
  listConfigs, listConfigsSchema,
  pollEvents, pollEventsSchema,
  setConfig, setConfigSchema,
  setScopePolicy, setScopePolicySchema,
  updateFact, updateFactSchema,
} from "../tools/admin-primitives.js";

import { rankCandidatesPrimitive, rankCandidatesSchema } from "../tools/rank-candidates.js";

import {
  resolveScopes, resolveScopesSchema,
  loadBudgetedFacts, loadBudgetedFactsSchema,
  searchDailyNotes, searchDailyNotesSchema,
  getGraphNeighbors, getGraphNeighborsSchema,
  getActivityStats, getActivityStatsSchema,
  getWorkspaceInfo, getWorkspaceInfoSchema,
} from "../tools/context-primitives.js";

import {
  vaultExport, vaultExportSchema,
  vaultImport, vaultImportSchema,
  vaultListFiles, vaultListFilesSchema,
  vaultReconcile, vaultReconcileSchema,
} from "../tools/vault-primitives.js";

import { buildFullSystemPrompt, buildFullSystemPromptSchema } from "../tools/system-prompt-builder.js";

import {
  subscribe, subscribeSchema,
  unsubscribe, unsubscribeSchema,
  listSubscriptions, listSubscriptionsSchema,
  pollSubscription, pollSubscriptionSchema,
} from "../tools/subscriptions.js";

import {
  bumpAccessBatch, bumpAccessSchema,
  getEntitiesPrimitive, getEntitiesPrimitiveSchema,
  getHandoffs, getHandoffsSchema,
  getNotifications, getNotificationsSchema,
  getObservations, getObservationsSchema,
  getThemesPrimitive, getThemesPrimitiveSchema,
  listStaleFacts, listStaleFactsSchema,
  markNotificationsRead, markNotificationsReadSchema,
  markFactsMerged, markFactsMergedSchema,
  markFactsPruned, markFactsPrunedSchema,
  recordRecall, recordRecallSchema,
  searchEntitiesPrimitive, searchEntitiesSchema,
  searchFactsPrimitive, searchFactsSchema,
  searchThemesPrimitive, searchThemesSchema,
  textSearch, textSearchSchema,
  vectorSearch, vectorSearchSchema,
} from "../tools/primitive-retrieval.js";

// ── Types ─────────────────────────────────────────────

export interface ToolEntry {
  /** MCP Tool definition (name, description, inputSchema) */
  tool: Tool;
  /** Zod validation schema for args */
  zodSchema: ZodSchema;
  /** Handler — receives (parsedArgs, agentId) */
  handler: (args: any, agentId: string) => Promise<any>;
}

// ── Registry ──────────────────────────────────────────

export const TOOL_REGISTRY: ToolEntry[] = [
  // ── Core Primitives ───────────────────────────────
  {
    tool: {
      name: "memory_store_fact",
      description: "Store an atomic fact with async enrichment (embeddings, compression, entity extraction). Returns factId and importanceScore.",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "The fact content to store" },
          source: { type: "string", description: "Source of the fact (e.g., conversation, observation)" },
          entityIds: { type: "array", items: { type: "string" }, description: "Entity IDs related to this fact" },
          tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
          factType: { type: "string", description: "Type of fact (e.g., decision, observation, insight)" },
          scopeId: { type: "string", description: "Scope ID or name (defaults to agent's private scope)" },
          emotionalContext: { type: "string", description: "Emotional context or sentiment" },
        },
        required: ["content"],
      },
    },
    zodSchema: storeFactSchema,
    handler: (args, agentId) => storeFact(args, agentId),
  },
  {
    tool: {
      name: "memory_recall",
      description: "Semantic search for facts (primary retrieval). Returns facts and a recallId for feedback tracking.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for semantic recall" },
          limit: { type: "number", description: "Maximum number of facts to return (default: 10)" },
          scopeId: { type: "string", description: "Scope ID or name to search within" },
          factType: { type: "string", description: "Filter by fact type" },
          minImportance: { type: "number", description: "Minimum importance score (0-1)" },
          searchStrategy: { type: "string", enum: ["vector-only", "text-only", "hybrid"], description: "Recall strategy" },
        },
        required: ["query"],
      },
    },
    zodSchema: recallSchema,
    handler: (args, agentId) => recall(args, agentId),
  },
  {
    tool: {
      name: "memory_search",
      description: "Full-text + structured filters for precise lookups. Supports text, tags, factType, agentId, dateRange, scopeId filters.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Full-text search query" },
          tags: { type: "array", items: { type: "string" }, description: "Filter by tags" },
          factType: { type: "string", description: "Filter by fact type" },
          agentId: { type: "string", description: "Filter by creator agent ID" },
          dateRange: {
            type: "object",
            properties: { start: { type: "number" }, end: { type: "number" } },
            description: "Filter by creation date range",
          },
          scopeId: { type: "string", description: "Scope ID or name to search within" },
          limit: { type: "number", description: "Maximum results (default: 20)" },
        },
      },
    },
    zodSchema: searchSchema,
    handler: (args, agentId) => search(args, agentId),
  },
  {
    tool: {
      name: "memory_observe",
      description: "Fire-and-forget passive observation storage. Records observation as a fact without blocking.",
      inputSchema: {
        type: "object",
        properties: {
          observation: { type: "string", description: "Observation to record" },
          emotionalContext: { type: "string", description: "Emotional context or sentiment" },
          scopeId: { type: "string", description: "Scope to store in (defaults to agent's private scope)" },
        },
        required: ["observation"],
      },
    },
    zodSchema: observeSchema,
    handler: (args, agentId) => observe(args, agentId),
  },
  {
    tool: {
      name: "memory_link_entity",
      description: "Create/update entities and relationships. Returns entity object and created flag.",
      inputSchema: {
        type: "object",
        properties: {
          entityId: { type: "string", description: "Unique entity ID (e.g., person:john, project:engram)" },
          name: { type: "string", description: "Human-readable name" },
          type: { type: "string", description: "Entity type (person, project, company, concept, tool)" },
          metadata: { type: "object", description: "Additional entity metadata" },
          relationships: {
            type: "array",
            items: {
              type: "object",
              properties: {
                toEntityId: { type: "string" },
                relationType: { type: "string" },
                metadata: { type: "object" },
              },
              required: ["toEntityId", "relationType"],
            },
            description: "Relationships to create/update",
          },
        },
        required: ["entityId", "name", "type"],
      },
    },
    zodSchema: linkEntitySchema,
    handler: (args, agentId) => linkEntity(args, agentId),
  },
  {
    tool: {
      name: "memory_get_context",
      description: "Warm start with token-aware injection. Returns facts, entities, themes, and a summary for a given topic.",
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Topic to gather context about" },
          maxFacts: { type: "number", description: "Maximum facts to include (default: 20)" },
          tokenBudget: { type: "number", description: "Token budget for context loading (default: 4000)" },
          profile: { type: "string", enum: ["default", "planning", "incident", "handoff"], description: "Context profile" },
          includeEntities: { type: "boolean", description: "Include related entities (default: true)" },
          includeThemes: { type: "boolean", description: "Include thematic clusters (default: true)" },
          scopeId: { type: "string", description: "Scope to search within" },
        },
        required: ["topic"],
      },
    },
    zodSchema: getContextSchema,
    handler: (args, agentId) => getContext(args, agentId),
  },

  // ── Agent Management ──────────────────────────────
  {
    tool: {
      name: "memory_register_agent",
      description: "Agent self-registration with capabilities and scopes. Creates private scope if needed.",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Unique agent identifier" },
          name: { type: "string", description: "Human-readable agent name" },
          capabilities: { type: "array", items: { type: "string" }, description: "Agent capabilities/skills" },
          defaultScope: { type: "string", description: "Default scope name (will create if not exists)" },
          telos: { type: "string", description: "Agent's telos/purpose" },
          isInnerCircle: { type: "boolean", description: "If true, agent joins shared-personal scope" },
        },
        required: ["agentId", "name"],
      },
    },
    zodSchema: registerAgentSchema,
    handler: (args) => registerAgent(args),
  },
  {
    tool: {
      name: "memory_end_session",
      description: "Store a session handoff summary for cross-agent continuity.",
      inputSchema: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Session summary for the next agent" },
          conversationId: { type: "string", description: "Optional conversation ID to link handoff to" },
        },
        required: ["summary"],
      },
    },
    zodSchema: endSessionSchema,
    handler: (args, agentId) => endSession(args, agentId),
  },

  // ── Query & Feedback ──────────────────────────────
  {
    tool: {
      name: "memory_query_raw",
      description: "Escape hatch for direct Convex queries (read-only). Query any table.",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", description: "Table to query (facts, entities, agents, scopes, sessions, conversations, signals, themes, sync_log)" },
          filter: { type: "object", description: "Filter conditions" },
          limit: { type: "number", description: "Maximum results (default: 50)" },
        },
        required: ["table"],
      },
    },
    zodSchema: queryRawSchema,
    handler: (args, agentId) => queryRaw(args, agentId),
  },
  {
    tool: {
      name: "memory_record_signal",
      description: "Record ratings/sentiment feedback on facts (PAI pattern). Returns signalId.",
      inputSchema: {
        type: "object",
        properties: {
          factId: { type: "string", description: "Fact ID to signal about" },
          signalType: { type: "string", description: "Signal type: rating, sentiment, usefulness, correctness, or failure" },
          value: { type: "number", description: "Signal value (e.g., 1-10 for rating, -1 to 1 for sentiment)" },
          comment: { type: "string", description: "Optional comment" },
          context: { type: "string", description: "Context in which signal was generated" },
        },
        required: ["signalType", "value"],
      },
    },
    zodSchema: recordSignalSchema,
    handler: (args, agentId) => recordSignal(args, agentId),
  },
  {
    tool: {
      name: "memory_record_feedback",
      description: "Post-recall usefulness tracking (ALMA pattern). Records which facts were actually useful.",
      inputSchema: {
        type: "object",
        properties: {
          recallId: { type: "string", description: "Recall ID from memory_recall response" },
          usedFactIds: { type: "array", items: { type: "string" }, description: "Fact IDs that were useful" },
          unusedFactIds: { type: "array", items: { type: "string" }, description: "Fact IDs that were not useful" },
        },
        required: ["recallId", "usedFactIds"],
      },
    },
    zodSchema: recordFeedbackSchema,
    handler: (args, agentId) => recordFeedback(args, agentId),
  },
  {
    tool: {
      name: "memory_summarize",
      description: "Consolidate facts on a topic (AgeMem SUMMARY pattern). Returns summaryFactId and consolidatedCount.",
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Topic to summarize" },
          scopeId: { type: "string", description: "Scope to search within" },
          maxFacts: { type: "number", description: "Maximum facts to consolidate (default: 50)" },
        },
        required: ["topic"],
      },
    },
    zodSchema: summarizeSchema,
    handler: (args, agentId) => summarize(args, agentId),
  },
  {
    tool: {
      name: "memory_prune",
      description: "Agent-initiated cleanup of stale facts (AgeMem FILTER pattern). Returns prunedCount.",
      inputSchema: {
        type: "object",
        properties: {
          scopeId: { type: "string", description: "Scope to prune (defaults to agent's private scope)" },
          olderThanDays: { type: "number", description: "Prune facts older than N days (default: 90)" },
          maxForgetScore: { type: "number", description: "Maximum forget score (0-1) to prune (default: 0.3)" },
          dryRun: { type: "boolean", description: "If true, only report what would be pruned (default: true)" },
        },
      },
    },
    zodSchema: pruneSchema,
    handler: (args, agentId) => prune(args, agentId),
  },

  // ── Vault & Checkpoint ────────────────────────────
  {
    tool: {
      name: "memory_vault_sync",
      description: "Sync Convex facts with Obsidian vault files (export/import/both).",
      inputSchema: { type: "object", properties: { direction: { type: "string", enum: ["export", "import", "both"] }, force: { type: "boolean" }, dryRun: { type: "boolean" }, scopeId: { type: "string" } } },
    },
    zodSchema: vaultSyncSchema,
    handler: (args) => vaultSync(args),
  },
  {
    tool: {
      name: "memory_query_vault",
      description: "Query markdown vault files directly for local-first retrieval.",
      inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
    },
    zodSchema: queryVaultSchema,
    handler: (args) => queryVault(args),
  },
  {
    tool: {
      name: "memory_export_graph",
      description: "Export Obsidian graph JSON from wiki-links in vault notes.",
      inputSchema: { type: "object", properties: { includeContent: { type: "boolean" } } },
    },
    zodSchema: exportGraphSchema,
    handler: (args) => exportGraph(args),
  },
  {
    tool: {
      name: "memory_checkpoint",
      description: "Create a durable checkpoint snapshot for session wake/resume.",
      inputSchema: { type: "object", properties: { name: { type: "string" }, scopeId: { type: "string" }, summary: { type: "string" } } },
    },
    zodSchema: checkpointSchema,
    handler: (args, agentId) => checkpoint(args, agentId),
  },
  {
    tool: {
      name: "memory_wake",
      description: "Restore context from a previously stored checkpoint.",
      inputSchema: { type: "object", properties: { checkpointId: { type: "string" } }, required: ["checkpointId"] },
    },
    zodSchema: wakeSchema,
    handler: (args) => wake(args),
  },

  // ── Events & Notifications ────────────────────────
  {
    tool: {
      name: "memory_poll_events",
      description: "Poll memory event stream with watermark support for near-real-time state awareness.",
      inputSchema: { type: "object", properties: { watermark: { type: "number" }, agentId: { type: "string" }, scopeId: { type: "string" }, limit: { type: "number" } } },
    },
    zodSchema: pollEventsSchema,
    handler: (args, agentId) => pollEvents(args, agentId),
  },
  {
    tool: {
      name: "memory_get_notifications",
      description: "Get unread notifications for current agent.",
      inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    },
    zodSchema: getNotificationsSchema,
    handler: (args, agentId) => getNotifications(args, agentId),
  },
  {
    tool: {
      name: "memory_mark_notifications_read",
      description: "Mark notifications as read.",
      inputSchema: { type: "object", properties: { notificationIds: { type: "array", items: { type: "string" } } }, required: ["notificationIds"] },
    },
    zodSchema: markNotificationsReadSchema,
    handler: (args) => markNotificationsRead(args),
  },

  // ── Config Management (Prompt-Native) ─────────────
  {
    tool: {
      name: "memory_get_config",
      description: "Get system config value by key. All weights, rates, thresholds tunable without code changes.",
      inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
    },
    zodSchema: getConfigSchema,
    handler: (args) => getConfig(args),
  },
  {
    tool: {
      name: "memory_list_configs",
      description: "List all system configs, optionally by category.",
      inputSchema: { type: "object", properties: { category: { type: "string" } } },
    },
    zodSchema: listConfigsSchema,
    handler: (args) => listConfigs(args),
  },
  {
    tool: {
      name: "memory_set_config",
      description: "Set a system config value.",
      inputSchema: { type: "object", properties: { key: { type: "string" }, value: {}, category: { type: "string" }, description: { type: "string" } }, required: ["key", "value", "category", "description"] },
    },
    zodSchema: setConfigSchema,
    handler: (args, agentId) => setConfig(args, agentId),
  },
  {
    tool: {
      name: "memory_set_scope_policy",
      description: "Set a scope-specific policy override.",
      inputSchema: { type: "object", properties: { scopeId: { type: "string" }, policyKey: { type: "string" }, policyValue: {}, priority: { type: "number" } }, required: ["scopeId", "policyKey", "policyValue"] },
    },
    zodSchema: setScopePolicySchema,
    handler: (args, agentId) => setScopePolicy(args, agentId),
  },

  // ── Fact Lifecycle ────────────────────────────────
  {
    tool: {
      name: "memory_update_fact",
      description: "Update a fact's content, tags, or type.",
      inputSchema: { type: "object", properties: { factId: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } }, factType: { type: "string" } }, required: ["factId"] },
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
      name: "memory_boost_relevance",
      description: "Boost a fact's relevance score.",
      inputSchema: { type: "object", properties: { factId: { type: "string" }, boost: { type: "number" } }, required: ["factId"] },
    },
    zodSchema: boostRelevanceSchema,
    handler: (args) => boostRelevance(args),
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

  // ── Primitive Retrieval ───────────────────────────
  {
    tool: {
      name: "memory_vector_search",
      description: "Primitive: vector-only recall by query + scope IDs.",
      inputSchema: { type: "object", properties: { query: { type: "string" }, scopeIds: { type: "array", items: { type: "string" } }, limit: { type: "number" } }, required: ["query", "scopeIds"] },
    },
    zodSchema: vectorSearchSchema,
    handler: (args) => vectorSearch(args),
  },
  {
    tool: {
      name: "memory_text_search",
      description: "Primitive: text-only recall by query + scope IDs.",
      inputSchema: { type: "object", properties: { query: { type: "string" }, scopeIds: { type: "array", items: { type: "string" } }, limit: { type: "number" }, factType: { type: "string" } }, required: ["query", "scopeIds"] },
    },
    zodSchema: textSearchSchema,
    handler: (args) => textSearch(args),
  },
  {
    tool: {
      name: "memory_bump_access",
      description: "Primitive: bump access count for fact IDs (ALMA signal).",
      inputSchema: { type: "object", properties: { factIds: { type: "array", items: { type: "string" } } }, required: ["factIds"] },
    },
    zodSchema: bumpAccessSchema,
    handler: (args) => bumpAccessBatch(args),
  },
  {
    tool: {
      name: "memory_record_recall",
      description: "Primitive: record which facts were returned for a recall.",
      inputSchema: { type: "object", properties: { recallId: { type: "string" }, factIds: { type: "array", items: { type: "string" } } }, required: ["recallId", "factIds"] },
    },
    zodSchema: recordRecallSchema,
    handler: (args) => recordRecall(args),
  },
  {
    tool: {
      name: "memory_get_observations",
      description: "Primitive: fetch observations by scope, optionally filtered by tier.",
      inputSchema: { type: "object", properties: { scopeIds: { type: "array", items: { type: "string" } }, tier: { type: "string" }, limit: { type: "number" } }, required: ["scopeIds"] },
    },
    zodSchema: getObservationsSchema,
    handler: (args) => getObservations(args),
  },
  {
    tool: {
      name: "memory_get_entities",
      description: "Primitive: search entities by query, type, and limit.",
      inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" }, type: { type: "string" } }, required: ["query"] },
    },
    zodSchema: getEntitiesPrimitiveSchema,
    handler: (args) => getEntitiesPrimitive(args),
  },
  {
    tool: {
      name: "memory_get_themes",
      description: "Primitive: get themes for a scope.",
      inputSchema: { type: "object", properties: { scopeId: { type: "string" }, limit: { type: "number" } }, required: ["scopeId"] },
    },
    zodSchema: getThemesPrimitiveSchema,
    handler: (args) => getThemesPrimitive(args),
  },
  {
    tool: {
      name: "memory_get_handoffs",
      description: "Primitive: get recent handoff summaries across scopes.",
      inputSchema: { type: "object", properties: { scopeIds: { type: "array", items: { type: "string" } }, limit: { type: "number" } }, required: ["scopeIds"] },
    },
    zodSchema: getHandoffsSchema,
    handler: (args, agentId) => getHandoffs(args, agentId),
  },
  {
    tool: {
      name: "memory_search_facts",
      description: "Primitive: search facts by query across scopes.",
      inputSchema: { type: "object", properties: { query: { type: "string" }, scopeIds: { type: "array", items: { type: "string" } }, limit: { type: "number" }, factType: { type: "string" } }, required: ["query", "scopeIds"] },
    },
    zodSchema: searchFactsSchema,
    handler: (args) => searchFactsPrimitive(args),
  },
  {
    tool: {
      name: "memory_search_entities",
      description: "Primitive: search entities by query and type.",
      inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" }, type: { type: "string" } }, required: ["query"] },
    },
    zodSchema: searchEntitiesSchema,
    handler: (args) => searchEntitiesPrimitive(args),
  },
  {
    tool: {
      name: "memory_search_themes",
      description: "Primitive: search themes by scope.",
      inputSchema: { type: "object", properties: { scopeId: { type: "string" }, limit: { type: "number" } }, required: ["scopeId"] },
    },
    zodSchema: searchThemesSchema,
    handler: (args) => searchThemesPrimitive(args),
  },

  // ── Rank Candidates ────────────────────────────────
  {
    tool: {
      name: "memory_rank_candidates",
      description: "Primitive: hybrid ranking of candidate facts. Scores = 0.45×semantic + 0.15×lexical + 0.20×importance + 0.10×freshness + 0.10×outcome.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Query for lexical scoring" },
          candidates: { type: "array", items: { type: "object", properties: { _id: { type: "string" }, content: { type: "string" }, timestamp: { type: "number" }, importanceScore: { type: "number" }, outcomeScore: { type: "number" }, _score: { type: "number" } }, required: ["_id", "content", "timestamp"] }, description: "Candidate facts to rank" },
          limit: { type: "number", description: "Max results (default: 10)" },
        },
        required: ["query", "candidates"],
      },
    },
    zodSchema: rankCandidatesSchema,
    handler: (args) => rankCandidatesPrimitive(args),
  },

  // ── Context Primitives (decomposed from get_context) ──
  {
    tool: {
      name: "memory_resolve_scopes",
      description: "Primitive: resolve scope name→ID or get all permitted scopes for agent. Use before any scoped search.",
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
      description: "Primitive: agent activity tracking — factsStored, recalls, signals, handoffs in a period.",
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
      description: "Primitive: workspace awareness — other agents, their capabilities, shared scopes and member counts.",
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

  // ── Vault Primitives (decomposed from vault_sync) ──
  {
    tool: {
      name: "memory_vault_export",
      description: "Primitive: export unmirrored facts to vault markdown files.",
      inputSchema: {
        type: "object",
        properties: {
          scopeId: { type: "string", description: "Scope to export (omit for all)" },
          force: { type: "boolean", description: "Force large batch (up to 1000)" },
          dryRun: { type: "boolean", description: "Preview only" },
        },
      },
    },
    zodSchema: vaultExportSchema,
    handler: (args) => vaultExport(args),
  },
  {
    tool: {
      name: "memory_vault_import",
      description: "Primitive: import vault markdown files into Convex facts.",
      inputSchema: {
        type: "object",
        properties: {
          dryRun: { type: "boolean", description: "Preview only" },
          maxFiles: { type: "number", description: "Max files to process (default: 200)" },
        },
      },
    },
    zodSchema: vaultImportSchema,
    handler: (args) => vaultImport(args),
  },
  {
    tool: {
      name: "memory_vault_list_files",
      description: "Primitive: list all markdown files in vault.",
      inputSchema: {
        type: "object",
        properties: {
          maxFiles: { type: "number", description: "Max files to list (default: 50)" },
        },
      },
    },
    zodSchema: vaultListFilesSchema,
    handler: (args) => vaultListFiles(args),
  },
  {
    tool: {
      name: "memory_vault_reconcile",
      description: "Primitive: reconcile a single vault file edit with Convex (conflict detection + merge).",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Absolute path to vault markdown file" },
        },
        required: ["filePath"],
      },
    },
    zodSchema: vaultReconcileSchema,
    handler: (args) => vaultReconcile(args),
  },

  // ── System Prompt Builder (Week 3-4) ──────────────
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

  // ── Real-Time Subscriptions (Week 5-6) ─────────────
  {
    tool: {
      name: "memory_subscribe",
      description: "Subscribe to real-time events. Returns subscriptionId for polling or SSE streaming.",
      inputSchema: {
        type: "object",
        properties: {
          eventTypes: { type: "array", items: { type: "string" }, description: "Event types to watch (e.g., fact_stored, recall, signal_recorded)" },
          scopeIds: { type: "array", items: { type: "string" }, description: "Scope IDs to watch" },
          bufferSize: { type: "number", description: "Max events to buffer (default: 50)" },
        },
      },
    },
    zodSchema: subscribeSchema,
    handler: (args, agentId) => subscribe(args, agentId),
  },
  {
    tool: {
      name: "memory_unsubscribe",
      description: "Remove a real-time event subscription.",
      inputSchema: {
        type: "object",
        properties: {
          subscriptionId: { type: "string", description: "Subscription ID to remove" },
        },
        required: ["subscriptionId"],
      },
    },
    zodSchema: unsubscribeSchema,
    handler: (args) => unsubscribe(args),
  },
  {
    tool: {
      name: "memory_list_subscriptions",
      description: "List active event subscriptions and their buffered event counts.",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Filter by agent ID" },
        },
      },
    },
    zodSchema: listSubscriptionsSchema,
    handler: (args, agentId) => listSubscriptions(args, agentId),
  },
  {
    tool: {
      name: "memory_poll_subscription",
      description: "Poll buffered events from a subscription. Use memory_subscribe first to create one.",
      inputSchema: {
        type: "object",
        properties: {
          subscriptionId: { type: "string", description: "Subscription ID to poll" },
          limit: { type: "number", description: "Max events to return (default: 20)" },
          flush: { type: "boolean", description: "Clear returned events from buffer (default: true)" },
        },
        required: ["subscriptionId"],
      },
    },
    zodSchema: pollSubscriptionSchema,
    handler: (args) => pollSubscription(args),
  },

  // ── Discovery ─────────────────────────────────────
  {
    tool: {
      name: "memory_list_capabilities",
      description: "Discovery: list all available memory tools with descriptions, grouped by category.",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by category (core, lifecycle, signals, agent, events, config, retrieval, delete, composition, vault, health, context, discovery)" },
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
        retrieval: ["memory_vector_search", "memory_text_search", "memory_rank_candidates", "memory_bump_access", "memory_get_observations", "memory_get_entities", "memory_get_themes", "memory_get_handoffs", "memory_search_facts", "memory_search_entities", "memory_search_themes"],
        delete: ["memory_delete_entity", "memory_delete_scope", "memory_delete_conversation", "memory_delete_session", "memory_delete_theme"],
        composition: ["memory_summarize", "memory_prune", "memory_create_theme", "memory_query_raw"],
        context: ["memory_resolve_scopes", "memory_load_budgeted_facts", "memory_search_daily_notes", "memory_get_graph_neighbors", "memory_get_activity_stats", "memory_get_workspace_info", "memory_build_system_prompt"],
        vault: ["memory_vault_sync", "memory_vault_export", "memory_vault_import", "memory_vault_list_files", "memory_vault_reconcile", "memory_query_vault", "memory_export_graph", "memory_checkpoint", "memory_wake"],
        health: ["memory_health"],
        discovery: ["memory_list_capabilities"],
      };

      const filtered = args.category
        ? { [args.category]: categories[args.category] ?? [] }
        : categories;

      if (args.format === "json") return { categories: filtered, totalTools: TOOL_REGISTRY.length };

      const lines: string[] = [];
      for (const [cat, tools] of Object.entries(filtered)) {
        lines.push(`\n### ${cat.charAt(0).toUpperCase() + cat.slice(1)} (${tools.length})`);
        for (const toolName of tools) {
          const entry = TOOL_MAP.get(toolName);
          lines.push(`- **${toolName}**: ${entry?.tool.description ?? "—"}`);
        }
      }
      return { capabilities: lines.join("\n"), totalTools: TOOL_REGISTRY.length };
    },
  },

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

// ── Helpers ───────────────────────────────────────────

/** Pre-built name→entry lookup map */
export const TOOL_MAP = new Map<string, ToolEntry>(
  TOOL_REGISTRY.map((entry) => [entry.tool.name, entry])
);

/** Extract MCP Tool[] array for ListTools handler */
export function getToolDefinitions(): Tool[] {
  return TOOL_REGISTRY.map((entry) => entry.tool);
}

/** Route a tool call: validate + execute. Throws on unknown tool. */
export async function routeToolCall(
  toolName: string,
  args: unknown,
  agentId: string
): Promise<any> {
  const entry = TOOL_MAP.get(toolName);
  if (!entry) throw new Error(`Unknown tool: ${toolName}`);
  const validated = entry.zodSchema.parse(args);
  return await entry.handler(validated, agentId);
}
