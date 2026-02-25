/**
 * Core (6) + Agent Management (2) + Query & Feedback (5) + Observation Memory (3) entries.
 */

import type { ToolEntry } from "./types.js";

import { storeFact, storeFactSchema } from "../../tools/store-fact.js";
import { recall, recallSchema } from "../../tools/recall.js";
import { search, searchSchema } from "../../tools/search.js";
import { linkEntity, linkEntitySchema } from "../../tools/link-entity.js";
import { getContext, getContextSchema } from "../../tools/get-context.js";
import { observe, observeSchema } from "../../tools/observe.js";
import { registerAgent, registerAgentSchema } from "../../tools/register-agent.js";
import { queryRaw, queryRawSchema } from "../../tools/query-raw.js";
import { recordSignal, recordSignalSchema } from "../../tools/record-signal.js";
import { recordFeedback, recordFeedbackSchema } from "../../tools/record-feedback.js";
import { summarize, summarizeSchema } from "../../tools/summarize.js";
import { prune, pruneSchema } from "../../tools/prune.js";
import { endSession, endSessionSchema } from "../../tools/end-session.js";
import {
  omStatus, omStatusSchema,
  observeCompress, observeCompressSchema,
  reflect, reflectSchema,
} from "../../tools/observation-memory.js";

export const entries: readonly ToolEntry[] = [
  // ── Core Primitives ───────────────────────────────
  {
    tool: {
      name: "memory_store_fact",
      description: "Store an atomic fact with async enrichment (embeddings, compression, entity extraction). Returns factId, importanceScore, and deterministic (true when auto-classified as a KV-style fact).",
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
          maxTokens: { type: "number", description: "Token budget ceiling — stops accumulating facts once budget is reached. Response includes tokenUsage: { used, budget, truncated }." },
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
      description: "Store a session handoff summary for cross-agent continuity. Auto-generates a structured session_summary fact from recent activity, or uses a caller-supplied contextSummary.",
      inputSchema: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Session summary for the next agent" },
          conversationId: { type: "string", description: "Optional conversation ID to link handoff to" },
          contextSummary: { type: "string", description: "Optional agent-supplied context summary. When provided, used as the session_summary fact content instead of auto-generation." },
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

  // ── Observation Memory ──────────────────────────────
  {
    tool: {
      name: "memory_om_status",
      description: "Return observation window state: pending tokens, summary tokens, thresholds, compression level, buffer status, last run times.",
      inputSchema: {
        type: "object",
        properties: {
          scopeId: { type: "string", description: "Scope ID or name (defaults to agent's private scope)" },
        },
      },
    },
    zodSchema: omStatusSchema,
    handler: (args, agentId) => omStatus(args, agentId),
  },
  {
    tool: {
      name: "memory_observe_compress",
      description: "Manually trigger Observer compression for a scope. Compresses raw observations into a dense summary.",
      inputSchema: {
        type: "object",
        properties: {
          scopeId: { type: "string", description: "Scope ID or name (defaults to agent's private scope)" },
          compressionLevel: { type: "number", description: "Compression level 0-3 (default: auto from session)" },
        },
      },
    },
    zodSchema: observeCompressSchema,
    handler: (args, agentId) => observeCompress(args, agentId),
  },
  {
    tool: {
      name: "memory_reflect",
      description: "Manually trigger Reflector condensation for a scope. Condenses observation summaries into a dense digest.",
      inputSchema: {
        type: "object",
        properties: {
          scopeId: { type: "string", description: "Scope ID or name (defaults to agent's private scope)" },
        },
      },
    },
    zodSchema: reflectSchema,
    handler: (args, agentId) => reflect(args, agentId),
  },
];
