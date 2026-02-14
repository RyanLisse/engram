#!/usr/bin/env node

/**
 * Engram MCP Server
 *
 * Provides 13 memory tools for multi-agent systems:
 * - memory_store_fact, memory_recall, memory_search
 * - memory_link_entity, memory_get_context, memory_observe
 * - memory_register_agent, memory_end_session, memory_query_raw
 * - memory_record_signal, memory_record_feedback
 * - memory_summarize, memory_prune
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Import all tool handlers
import { storeFact, storeFactSchema } from "./tools/store-fact.js";
import { recall, recallSchema } from "./tools/recall.js";
import { search, searchSchema } from "./tools/search.js";
import { linkEntity, linkEntitySchema } from "./tools/link-entity.js";
import { getContext, getContextSchema } from "./tools/get-context.js";
import { observe, observeSchema } from "./tools/observe.js";
import { registerAgent, registerAgentSchema } from "./tools/register-agent.js";
import { queryRaw, queryRawSchema } from "./tools/query-raw.js";
import { recordSignal, recordSignalSchema } from "./tools/record-signal.js";
import { recordFeedback, recordFeedbackSchema } from "./tools/record-feedback.js";
import { summarize, summarizeSchema } from "./tools/summarize.js";
import { prune, pruneSchema } from "./tools/prune.js";
import { endSession, endSessionSchema } from "./tools/end-session.js";
import { vaultSync, vaultSyncSchema } from "./tools/vault-sync.js";
import { queryVault, queryVaultSchema } from "./tools/query-vault.js";
import { exportGraph, exportGraphSchema } from "./tools/export-graph.js";
import { checkpoint, checkpointSchema } from "./tools/checkpoint.js";
import { wake, wakeSchema } from "./tools/wake.js";
import {
  archiveFact,
  archiveFactSchema,
  boostRelevance,
  boostRelevanceSchema,
  createTheme,
  createThemeSchema,
  deleteConversation,
  deleteConversationSchema,
  deleteEntity,
  deleteEntitySchema,
  deleteScope,
  deleteScopeSchema,
  deleteSession,
  deleteSessionSchema,
  deleteTheme,
  deleteThemeSchema,
  getConfig,
  getConfigSchema,
  getAgentInfo,
  getAgentContext,
  getAgentContextSchema,
  getAgentInfoSchema,
  getSystemPrompt,
  getSystemPromptSchema,
  listConfigs,
  listConfigsSchema,
  pollEvents,
  pollEventsSchema,
  setConfig,
  setConfigSchema,
  setScopePolicy,
  setScopePolicySchema,
  updateFact,
  updateFactSchema,
} from "./tools/admin-primitives.js";
import {
  bumpAccessBatch,
  bumpAccessSchema,
  getEntitiesPrimitive,
  getEntitiesPrimitiveSchema,
  getHandoffs,
  getHandoffsSchema,
  getNotifications,
  getNotificationsSchema,
  getObservations,
  getObservationsSchema,
  getThemesPrimitive,
  getThemesPrimitiveSchema,
  listStaleFacts,
  listStaleFactsSchema,
  markNotificationsRead,
  markNotificationsReadSchema,
  markFactsMerged,
  markFactsMergedSchema,
  markFactsPruned,
  markFactsPrunedSchema,
  recordRecall,
  recordRecallSchema,
  searchEntitiesPrimitive,
  searchEntitiesSchema,
  searchFactsPrimitive,
  searchFactsSchema,
  searchThemesPrimitive,
  searchThemesSchema,
  textSearch,
  textSearchSchema,
  vectorSearch,
  vectorSearchSchema,
} from "./tools/primitive-retrieval.js";
import { health } from "./tools/health.js";

// Get agent ID from env (defaults to "indy")
const AGENT_ID = process.env.ENGRAM_AGENT_ID || "indy";
const MCP_API_KEY = process.env.ENGRAM_API_KEY;
const RATE_LIMIT_PER_MIN = 100;
const requestBuckets = new Map<string, { windowStart: number; count: number }>();

// Ensure CONVEX_URL is set
if (!process.env.CONVEX_URL) {
  console.error("[engram-mcp] ERROR: CONVEX_URL environment variable is required");
  process.exit(1);
}
if (MCP_API_KEY && process.env.ENGRAM_CLIENT_KEY !== MCP_API_KEY) {
  console.error("[engram-mcp] ERROR: ENGRAM_CLIENT_KEY does not match ENGRAM_API_KEY");
  process.exit(1);
}

console.error("[engram-mcp] Starting Engram MCP Server...");
console.error(`[engram-mcp] Agent ID: ${AGENT_ID}`);
console.error(`[engram-mcp] Convex URL: ${process.env.CONVEX_URL}`);

// Define all 13 tools
const TOOLS: Tool[] = [
  {
    name: "memory_store_fact",
    description:
      "Store an atomic fact with async enrichment (embeddings, compression, entity extraction). Returns factId and importanceScore.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The fact content to store" },
        source: {
          type: "string",
          description: "Source of the fact (e.g., conversation, observation)",
        },
        entityIds: {
          type: "array",
          items: { type: "string" },
          description: "Entity IDs related to this fact",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization",
        },
        factType: {
          type: "string",
          description: "Type of fact (e.g., decision, observation, insight)",
        },
        scopeId: {
          type: "string",
          description: "Scope ID or name (defaults to agent's private scope)",
        },
        emotionalContext: {
          type: "string",
          description: "Emotional context or sentiment",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_recall",
    description:
      "Semantic search for facts (primary retrieval). Returns facts and a recallId for feedback tracking.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for semantic recall" },
        limit: {
          type: "number",
          description: "Maximum number of facts to return (default: 10)",
        },
        scopeId: { type: "string", description: "Scope ID or name to search within" },
        factType: { type: "string", description: "Filter by fact type" },
        minImportance: {
          type: "number",
          description: "Minimum importance score (0-1)",
        },
        searchStrategy: {
          type: "string",
          enum: ["vector-only", "text-only", "hybrid"],
          description: "Recall strategy",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_search",
    description:
      "Full-text + structured filters for precise lookups. Supports text, tags, factType, agentId, dateRange, scopeId filters.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Full-text search query" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags",
        },
        factType: { type: "string", description: "Filter by fact type" },
        agentId: { type: "string", description: "Filter by creator agent ID" },
        dateRange: {
          type: "object",
          properties: {
            start: { type: "number", description: "Start timestamp (ms)" },
            end: { type: "number", description: "End timestamp (ms)" },
          },
          description: "Filter by creation date range",
        },
        scopeId: { type: "string", description: "Scope ID or name to search within" },
        limit: { type: "number", description: "Maximum results (default: 20)" },
      },
    },
  },
  {
    name: "memory_link_entity",
    description:
      "Create/update entities and relationships. Returns entity object and created flag.",
    inputSchema: {
      type: "object",
      properties: {
        entityId: {
          type: "string",
          description: "Unique entity ID (e.g., person:john, project:engram)",
        },
        name: { type: "string", description: "Human-readable name" },
        type: {
          type: "string",
          description: "Entity type (person, project, company, concept, tool)",
        },
        metadata: {
          type: "object",
          description: "Additional entity metadata",
        },
        relationships: {
          type: "array",
          items: {
            type: "object",
            properties: {
              toEntityId: { type: "string", description: "Target entity ID" },
              relationType: {
                type: "string",
                description: "Relationship type (e.g., colleague, dependency)",
              },
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
  {
    name: "memory_get_context",
    description:
      "Warm start with token-aware injection. Returns facts, entities, themes, and a summary for a given topic.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic to gather context about" },
        maxFacts: {
          type: "number",
          description: "Maximum facts to include (default: 20)",
        },
        tokenBudget: {
          type: "number",
          description: "Token budget for context loading (default: 4000)",
        },
        profile: {
          type: "string",
          enum: ["default", "planning", "incident", "handoff"],
          description: "Context profile",
        },
        includeEntities: {
          type: "boolean",
          description: "Include related entities (default: true)",
        },
        includeThemes: {
          type: "boolean",
          description: "Include thematic clusters (default: true)",
        },
        scopeId: { type: "string", description: "Scope to search within" },
      },
      required: ["topic"],
    },
  },
  {
    name: "memory_observe",
    description:
      "Fire-and-forget passive observation storage. Records observation as a fact without blocking.",
    inputSchema: {
      type: "object",
      properties: {
        observation: { type: "string", description: "Observation to record" },
        emotionalContext: {
          type: "string",
          description: "Emotional context or sentiment",
        },
        scopeId: {
          type: "string",
          description: "Scope to store in (defaults to agent's private scope)",
        },
      },
      required: ["observation"],
    },
  },
  {
    name: "memory_register_agent",
    description:
      "Agent self-registration with capabilities and scopes. Creates private scope if needed. Inner-circle agents auto-join shared-personal scope.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Unique agent identifier" },
        name: { type: "string", description: "Human-readable agent name" },
        capabilities: {
          type: "array",
          items: { type: "string" },
          description: "Agent capabilities/skills",
        },
        defaultScope: {
          type: "string",
          description: "Default scope name (will create if not exists)",
        },
        telos: { type: "string", description: "Agent's telos/purpose" },
        isInnerCircle: {
          type: "boolean",
          description: "If true, agent joins shared-personal scope for cross-agent memory",
        },
      },
      required: ["agentId", "name"],
    },
  },
  {
    name: "memory_end_session",
    description:
      "Store a session handoff summary for cross-agent continuity. Writes a session_summary fact to shared-personal scope (inner-circle agents only).",
    inputSchema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Session summary for the next agent",
        },
        conversationId: {
          type: "string",
          description: "Optional conversation ID to link handoff to",
        },
      },
      required: ["summary"],
    },
  },
  {
    name: "memory_query_raw",
    description:
      "Escape hatch for direct Convex queries (read-only). Query any table: facts, entities, agents, scopes, sessions, signals, themes, sync_log.",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description:
            "Table to query (facts, entities, agents, scopes, sessions, conversations, signals, themes, sync_log)",
        },
        filter: {
          type: "object",
          description: "Filter conditions",
        },
        limit: { type: "number", description: "Maximum results (default: 50)" },
      },
      required: ["table"],
    },
  },
  {
    name: "memory_record_signal",
    description:
      "Record ratings/sentiment feedback on facts (PAI pattern). Returns signalId.",
    inputSchema: {
      type: "object",
      properties: {
        factId: {
          type: "string",
          description: "Fact ID to signal about (optional for general signals)",
        },
        signalType: {
          type: "string",
          description:
            "Signal type: rating, sentiment, usefulness, correctness, or failure",
        },
        value: {
          type: "number",
          description: "Signal value (e.g., 1-10 for rating, -1 to 1 for sentiment)",
        },
        comment: {
          type: "string",
          description: "Optional comment explaining the signal",
        },
        context: {
          type: "string",
          description: "Context in which signal was generated",
        },
      },
      required: ["signalType", "value"],
    },
  },
  {
    name: "memory_record_feedback",
    description:
      "Post-recall usefulness tracking (ALMA pattern). Records which facts from a recall were actually useful.",
    inputSchema: {
      type: "object",
      properties: {
        recallId: {
          type: "string",
          description: "Recall ID from memory_recall response",
        },
        usedFactIds: {
          type: "array",
          items: { type: "string" },
          description: "Fact IDs that were actually useful",
        },
        unusedFactIds: {
          type: "array",
          items: { type: "string" },
          description: "Fact IDs that were not useful",
        },
      },
      required: ["recallId", "usedFactIds"],
    },
  },
  {
    name: "memory_summarize",
    description:
      "Consolidate facts on a topic (AgeMem SUMMARY pattern). Creates a summary fact. Returns summaryFactId and consolidatedCount.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic to summarize" },
        scopeId: { type: "string", description: "Scope to search within" },
        maxFacts: {
          type: "number",
          description: "Maximum facts to consolidate (default: 50)",
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "memory_prune",
    description:
      "Agent-initiated cleanup of stale facts (AgeMem FILTER pattern). Marks old, low-importance facts as pruned. Returns prunedCount and prunedFactIds.",
    inputSchema: {
      type: "object",
      properties: {
        scopeId: {
          type: "string",
          description: "Scope to prune (defaults to agent's private scope)",
        },
        olderThanDays: {
          type: "number",
          description: "Prune facts older than N days (default: 90)",
        },
        maxForgetScore: {
          type: "number",
          description: "Maximum forget score (0-1) to prune (default: 0.3)",
        },
        dryRun: {
          type: "boolean",
          description: "If true, only report what would be pruned (default: true)",
        },
      },
    },
  },
  {
    name: "memory_vault_sync",
    description: "Sync Convex facts with Obsidian vault files (export/import/both).",
    inputSchema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["export", "import", "both"],
          description: "Sync direction",
        },
        force: { type: "boolean", description: "Force large batch processing" },
        dryRun: { type: "boolean", description: "Preview only, no writes" },
        scopeId: { type: "string", description: "Optional scope filter" },
      },
    },
  },
  {
    name: "memory_query_vault",
    description: "Query markdown vault files directly for local-first retrieval.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text" },
        limit: { type: "number", description: "Max files to return" },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_export_graph",
    description: "Export Obsidian graph JSON from wiki-links in vault notes.",
    inputSchema: {
      type: "object",
      properties: {
        includeContent: { type: "boolean", description: "Read file content for edge detection" },
      },
    },
  },
  {
    name: "memory_checkpoint",
    description: "Create a durable checkpoint snapshot for session wake/resume.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        scopeId: { type: "string" },
        summary: { type: "string" },
      },
    },
  },
  {
    name: "memory_wake",
    description: "Restore context from a previously stored checkpoint.",
    inputSchema: {
      type: "object",
      properties: {
        checkpointId: { type: "string" },
      },
      required: ["checkpointId"],
    },
  },
  {
    name: "memory_poll_events",
    description: "Poll memory event stream with watermark support.",
    inputSchema: { type: "object", properties: { watermark: { type: "number" }, agentId: { type: "string" }, scopeId: { type: "string" }, limit: { type: "number" } } },
  },
  { name: "memory_get_config", description: "Get system config by key.", inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } },
  { name: "memory_list_configs", description: "List system configs.", inputSchema: { type: "object", properties: { category: { type: "string" } } } },
  {
    name: "memory_set_config",
    description: "Set system config value.",
    inputSchema: { type: "object", properties: { key: { type: "string" }, value: {}, category: { type: "string" }, description: { type: "string" } }, required: ["key", "value", "category", "description"] },
  },
  {
    name: "memory_set_scope_policy",
    description: "Set scope policy override.",
    inputSchema: { type: "object", properties: { scopeId: { type: "string" }, policyKey: { type: "string" }, policyValue: {}, priority: { type: "number" } }, required: ["scopeId", "policyKey", "policyValue"] },
  },
  { name: "memory_delete_entity", description: "Delete or archive entity.", inputSchema: { type: "object", properties: { entityId: { type: "string" }, hardDelete: { type: "boolean" } }, required: ["entityId"] } },
  { name: "memory_delete_scope", description: "Delete or archive scope.", inputSchema: { type: "object", properties: { scopeId: { type: "string" }, hardDelete: { type: "boolean" }, force: { type: "boolean" } }, required: ["scopeId"] } },
  { name: "memory_delete_conversation", description: "Delete or archive conversation.", inputSchema: { type: "object", properties: { conversationId: { type: "string" }, hardDelete: { type: "boolean" } }, required: ["conversationId"] } },
  { name: "memory_delete_session", description: "Delete or archive session.", inputSchema: { type: "object", properties: { sessionId: { type: "string" }, hardDelete: { type: "boolean" } }, required: ["sessionId"] } },
  { name: "memory_delete_theme", description: "Delete or archive theme.", inputSchema: { type: "object", properties: { themeId: { type: "string" }, hardDelete: { type: "boolean" } }, required: ["themeId"] } },
  { name: "memory_update_fact", description: "Update fact fields.", inputSchema: { type: "object", properties: { factId: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } }, factType: { type: "string" } }, required: ["factId"] } },
  { name: "memory_archive_fact", description: "Archive a fact.", inputSchema: { type: "object", properties: { factId: { type: "string" } }, required: ["factId"] } },
  { name: "memory_boost_relevance", description: "Boost fact relevance score.", inputSchema: { type: "object", properties: { factId: { type: "string" }, boost: { type: "number" } }, required: ["factId"] } },
  { name: "memory_create_theme", description: "Create theme.", inputSchema: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, factIds: { type: "array", items: { type: "string" } }, entityIds: { type: "array", items: { type: "string" } }, scopeId: { type: "string" }, importance: { type: "number" } }, required: ["name", "description", "factIds", "entityIds", "scopeId"] } },
  { name: "memory_get_agent_info", description: "Get agent identity context and scopes.", inputSchema: { type: "object", properties: { agentId: { type: "string" } } } },
  { name: "memory_get_agent_context", description: "Get full agent identity context, scope policies, and health.", inputSchema: { type: "object", properties: { agentId: { type: "string" } } } },
  { name: "memory_get_system_prompt", description: "Generate agent-native system prompt context.", inputSchema: { type: "object", properties: { agentId: { type: "string" } } } },
  { name: "memory_vector_search", description: "Primitive vector recall by query+scopes.", inputSchema: { type: "object", properties: { query: { type: "string" }, scopeIds: { type: "array", items: { type: "string" } }, limit: { type: "number" } }, required: ["query", "scopeIds"] } },
  { name: "memory_text_search", description: "Primitive text recall by query+scopes.", inputSchema: { type: "object", properties: { query: { type: "string" }, scopeIds: { type: "array", items: { type: "string" } }, limit: { type: "number" }, factType: { type: "string" } }, required: ["query", "scopeIds"] } },
  { name: "memory_bump_access", description: "Primitive access bump for fact IDs.", inputSchema: { type: "object", properties: { factIds: { type: "array", items: { type: "string" } } }, required: ["factIds"] } },
  { name: "memory_record_recall", description: "Primitive recall tracking.", inputSchema: { type: "object", properties: { recallId: { type: "string" }, factIds: { type: "array", items: { type: "string" } } }, required: ["recallId", "factIds"] } },
  { name: "memory_get_observations", description: "Primitive observation fetch.", inputSchema: { type: "object", properties: { scopeIds: { type: "array", items: { type: "string" } }, tier: { type: "string" }, limit: { type: "number" } }, required: ["scopeIds"] } },
  { name: "memory_get_entities", description: "Primitive entity fetch.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" }, type: { type: "string" } }, required: ["query"] } },
  { name: "memory_get_themes", description: "Primitive theme fetch.", inputSchema: { type: "object", properties: { scopeId: { type: "string" }, limit: { type: "number" } }, required: ["scopeId"] } },
  { name: "memory_get_handoffs", description: "Primitive handoff fetch.", inputSchema: { type: "object", properties: { scopeIds: { type: "array", items: { type: "string" } }, limit: { type: "number" } }, required: ["scopeIds"] } },
  { name: "memory_get_notifications", description: "Primitive unread notification fetch.", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "memory_mark_notifications_read", description: "Primitive notification ack.", inputSchema: { type: "object", properties: { notificationIds: { type: "array", items: { type: "string" } } }, required: ["notificationIds"] } },
  { name: "memory_search_facts", description: "Primitive facts search.", inputSchema: { type: "object", properties: { query: { type: "string" }, scopeIds: { type: "array", items: { type: "string" } }, limit: { type: "number" }, factType: { type: "string" } }, required: ["query", "scopeIds"] } },
  { name: "memory_search_entities", description: "Primitive entities search.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" }, type: { type: "string" } }, required: ["query"] } },
  { name: "memory_search_themes", description: "Primitive themes search.", inputSchema: { type: "object", properties: { scopeId: { type: "string" }, limit: { type: "number" } }, required: ["scopeId"] } },
  { name: "memory_list_stale_facts", description: "List stale facts for prune/summarize composition.", inputSchema: { type: "object", properties: { scopeId: { type: "string" }, olderThanDays: { type: "number" }, limit: { type: "number" } } } },
  { name: "memory_mark_facts_merged", description: "Mark source facts as merged into target fact.", inputSchema: { type: "object", properties: { sourceFactIds: { type: "array", items: { type: "string" } }, targetFactId: { type: "string" } }, required: ["sourceFactIds", "targetFactId"] } },
  { name: "memory_mark_facts_pruned", description: "Mark facts as pruned.", inputSchema: { type: "object", properties: { factIds: { type: "array", items: { type: "string" } } }, required: ["factIds"] } },
  { name: "memory_health", description: "Runtime health and event lag snapshot.", inputSchema: { type: "object", properties: {} } },
];

// Create server instance
const server = new Server(
  {
    name: "engram-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[engram-mcp] Tool called: ${name}`);
  const now = Date.now();
  const bucket = requestBuckets.get(AGENT_ID);
  if (!bucket || now - bucket.windowStart > 60_000) {
    requestBuckets.set(AGENT_ID, { windowStart: now, count: 1 });
  } else {
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT_PER_MIN) {
      return {
        content: [{ type: "text", text: JSON.stringify({ isError: true, message: "Rate limit exceeded" }) }],
        isError: true,
      };
    }
  }

  try {
    switch (name) {
      case "memory_store_fact": {
        const validated = storeFactSchema.parse(args);
        const result = await storeFact(validated, AGENT_ID);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_recall": {
        const validated = recallSchema.parse(args);
        const result = await recall(validated, AGENT_ID);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_search": {
        const validated = searchSchema.parse(args);
        const result = await search(validated, AGENT_ID);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_link_entity": {
        const validated = linkEntitySchema.parse(args);
        const result = await linkEntity(validated, AGENT_ID);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_get_context": {
        const validated = getContextSchema.parse(args);
        const result = await getContext(validated, AGENT_ID);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_observe": {
        const validated = observeSchema.parse(args);
        const result = await observe(validated, AGENT_ID);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_register_agent": {
        const validated = registerAgentSchema.parse(args);
        const result = await registerAgent(validated);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_end_session": {
        const validated = endSessionSchema.parse(args);
        const result = await endSession(validated, AGENT_ID);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_query_raw": {
        const validated = queryRawSchema.parse(args);
        const result = await queryRaw(validated, AGENT_ID);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_record_signal": {
        const validated = recordSignalSchema.parse(args);
        const result = await recordSignal(validated, AGENT_ID);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_record_feedback": {
        const validated = recordFeedbackSchema.parse(args);
        const result = await recordFeedback(validated, AGENT_ID);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_summarize": {
        const validated = summarizeSchema.parse(args);
        const result = await summarize(validated, AGENT_ID);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_prune": {
        const validated = pruneSchema.parse(args);
        const result = await prune(validated, AGENT_ID);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_vault_sync": {
        const validated = vaultSyncSchema.parse(args);
        const result = await vaultSync(validated);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_query_vault": {
        const validated = queryVaultSchema.parse(args);
        const result = await queryVault(validated);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_export_graph": {
        const validated = exportGraphSchema.parse(args);
        const result = await exportGraph(validated);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_checkpoint": {
        const validated = checkpointSchema.parse(args);
        const result = await checkpoint(validated, AGENT_ID);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "memory_wake": {
        const validated = wakeSchema.parse(args);
        const result = await wake(validated);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }
      case "memory_poll_events": {
        const validated = pollEventsSchema.parse(args);
        const result = await pollEvents(validated, AGENT_ID);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_get_config": {
        const validated = getConfigSchema.parse(args);
        const result = await getConfig(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_list_configs": {
        const validated = listConfigsSchema.parse(args);
        const result = await listConfigs(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_set_config": {
        const validated = setConfigSchema.parse(args);
        const result = await setConfig(validated, AGENT_ID);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_set_scope_policy": {
        const validated = setScopePolicySchema.parse(args);
        const result = await setScopePolicy(validated, AGENT_ID);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_delete_entity": {
        const validated = deleteEntitySchema.parse(args);
        const result = await deleteEntity(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_delete_scope": {
        const validated = deleteScopeSchema.parse(args);
        const result = await deleteScope(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_delete_conversation": {
        const validated = deleteConversationSchema.parse(args);
        const result = await deleteConversation(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_delete_session": {
        const validated = deleteSessionSchema.parse(args);
        const result = await deleteSession(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_delete_theme": {
        const validated = deleteThemeSchema.parse(args);
        const result = await deleteTheme(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_update_fact": {
        const validated = updateFactSchema.parse(args);
        const result = await updateFact(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_archive_fact": {
        const validated = archiveFactSchema.parse(args);
        const result = await archiveFact(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_boost_relevance": {
        const validated = boostRelevanceSchema.parse(args);
        const result = await boostRelevance(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_create_theme": {
        const validated = createThemeSchema.parse(args);
        const result = await createTheme(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_get_agent_info": {
        const validated = getAgentInfoSchema.parse(args);
        const result = await getAgentInfo(validated, AGENT_ID);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_get_agent_context": {
        const validated = getAgentContextSchema.parse(args);
        const result = await getAgentContext(validated, AGENT_ID);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_get_system_prompt": {
        const validated = getSystemPromptSchema.parse(args);
        const result = await getSystemPrompt(validated, AGENT_ID);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_vector_search": {
        const validated = vectorSearchSchema.parse(args);
        const result = await vectorSearch(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_text_search": {
        const validated = textSearchSchema.parse(args);
        const result = await textSearch(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_bump_access": {
        const validated = bumpAccessSchema.parse(args);
        const result = await bumpAccessBatch(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_record_recall": {
        const validated = recordRecallSchema.parse(args);
        const result = await recordRecall(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_get_observations": {
        const validated = getObservationsSchema.parse(args);
        const result = await getObservations(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_get_entities": {
        const validated = getEntitiesPrimitiveSchema.parse(args);
        const result = await getEntitiesPrimitive(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_get_themes": {
        const validated = getThemesPrimitiveSchema.parse(args);
        const result = await getThemesPrimitive(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_get_handoffs": {
        const validated = getHandoffsSchema.parse(args);
        const result = await getHandoffs(validated, AGENT_ID);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_get_notifications": {
        const validated = getNotificationsSchema.parse(args);
        const result = await getNotifications(validated, AGENT_ID);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_mark_notifications_read": {
        const validated = markNotificationsReadSchema.parse(args);
        const result = await markNotificationsRead(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_search_facts": {
        const validated = searchFactsSchema.parse(args);
        const result = await searchFactsPrimitive(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_search_entities": {
        const validated = searchEntitiesSchema.parse(args);
        const result = await searchEntitiesPrimitive(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_search_themes": {
        const validated = searchThemesSchema.parse(args);
        const result = await searchThemesPrimitive(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_list_stale_facts": {
        const validated = listStaleFactsSchema.parse(args);
        const result = await listStaleFacts(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_mark_facts_merged": {
        const validated = markFactsMergedSchema.parse(args);
        const result = await markFactsMerged(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_mark_facts_pruned": {
        const validated = markFactsPrunedSchema.parse(args);
        const result = await markFactsPruned(validated);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "memory_health": {
        const result = await health();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                isError: true,
                message: `Unknown tool: ${name}`,
              }),
            },
          ],
          isError: true,
        };
    }
  } catch (error: any) {
    console.error(`[engram-mcp] Error in ${name}:`, error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            isError: true,
            message: error.message || "Internal error",
          }),
        },
      ],
      isError: true,
    };
  }
});

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[engram-mcp] Server running on stdio");
}

main().catch((error) => {
  console.error("[engram-mcp] Fatal error:", error);
  process.exit(1);
});
