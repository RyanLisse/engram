/**
 * Primitive Retrieval (11) + Rank Candidates (1) + Hierarchical Recall (1) entries.
 */

import type { ToolEntry } from "./types.js";

import { rankCandidatesPrimitive, rankCandidatesSchema } from "../../tools/rank-candidates.js";
import { hierarchicalRecall, hierarchicalRecallSchema } from "../../tools/hierarchical-recall.js";
import {
  bumpAccessBatch, bumpAccessSchema,
  getEntitiesPrimitive, getEntitiesPrimitiveSchema,
  getHandoffs, getHandoffsSchema,
  getObservations, getObservationsSchema,
  getThemesPrimitive, getThemesPrimitiveSchema,
  listStaleFacts, listStaleFactsSchema,
  recordRecall, recordRecallSchema,
  searchEntitiesPrimitive, searchEntitiesSchema,
  searchFactsPrimitive, searchFactsSchema,
  searchThemesPrimitive, searchThemesSchema,
  textSearch, textSearchSchema,
  vectorSearch, vectorSearchSchema,
} from "../../tools/primitive-retrieval.js";

export const entries: readonly ToolEntry[] = [
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
      description: "Primitive: hybrid ranking of candidate facts. Scores = 0.40\u00d7semantic + 0.15\u00d7lexical + 0.20\u00d7importance + 0.10\u00d7freshness + 0.10\u00d7outcome + 0.05\u00d7emotional.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Query for lexical scoring" },
          candidates: { type: "array", items: { type: "object", properties: { _id: { type: "string" }, content: { type: "string" }, timestamp: { type: "number" }, importanceScore: { type: "number" }, outcomeScore: { type: "number" }, emotionalWeight: { type: "number" }, _score: { type: "number" } }, required: ["_id", "content", "timestamp"] }, description: "Candidate facts to rank" },
          limit: { type: "number", description: "Max results (default: 10)" },
        },
        required: ["query", "candidates"],
      },
    },
    zodSchema: rankCandidatesSchema,
    handler: (args) => rankCandidatesPrimitive(args),
  },

  // ── Hierarchical Recall ──────────────────────────
  {
    tool: {
      name: "memory_hierarchical_recall",
      description: "PageIndex-inspired graph traversal retrieval. Traverses entity\u2192fact backlinks\u2192relationships\u2192temporal links for structured knowledge retrieval. Falls back to text search when no entities match.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query \u2014 matched against entity names and fact content" },
          scopeId: { type: "string", description: "Scope ID or name to filter results" },
          entityTypes: { type: "array", items: { type: "string" }, description: "Filter root entities by type (person|project|tool|concept|company)" },
          maxDepth: { type: "number", description: "Max traversal depth (0=entities only, 1=+relationships, 2=+temporal links, default: 2)" },
          limit: { type: "number", description: "Maximum facts to return (default: 15)" },
        },
        required: ["query"],
      },
    },
    zodSchema: hierarchicalRecallSchema,
    handler: (args, agentId) => hierarchicalRecall(args, agentId),
  },
];
