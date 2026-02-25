/**
 * Knowledge Subspace tools (5): create, get, list, consolidate, query.
 */

import type { ToolEntry } from "./types.js";

import {
  createSubspace, createSubspaceSchema,
  getSubspace, getSubspaceSchema,
  listSubspaces, listSubspacesSchema,
  consolidateEmbeddingsTool, consolidateEmbeddingsSchema,
  querySubspace, querySubspaceSchema,
} from "../../tools/subspaces.js";

export const entries: readonly ToolEntry[] = [
  {
    tool: {
      name: "memory_create_subspace",
      description: "Create a knowledge subspace from a set of fact IDs. Auto-computes SVD centroid and principal components.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name for the subspace" },
          description: { type: "string", description: "Description of the semantic cluster" },
          factIds: { type: "array", items: { type: "string" }, description: "Fact IDs to include" },
          scopeId: { type: "string", description: "Scope ID or name" },
          k: { type: "number", description: "Number of principal components (default: 3)" },
        },
        required: ["name", "factIds"],
      },
    },
    zodSchema: createSubspaceSchema,
    handler: (args, agentId) => createSubspace(args, agentId),
  },
  {
    tool: {
      name: "memory_get_subspace",
      description: "Retrieve a knowledge subspace by ID.",
      inputSchema: {
        type: "object",
        properties: {
          subspaceId: { type: "string", description: "Subspace ID" },
        },
        required: ["subspaceId"],
      },
    },
    zodSchema: getSubspaceSchema,
    handler: (args, agentId) => getSubspace(args, agentId),
  },
  {
    tool: {
      name: "memory_list_subspaces",
      description: "List knowledge subspaces for an agent or scope.",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Filter by agent ID" },
          scopeId: { type: "string", description: "Scope ID or name" },
          limit: { type: "number", description: "Max results (default: 50)" },
        },
      },
    },
    zodSchema: listSubspacesSchema,
    handler: (args, agentId) => listSubspaces(args, agentId),
  },
  {
    tool: {
      name: "memory_consolidate_embeddings",
      description: "Trigger SVD recomputation for a subspace. Recomputes centroid and principal components from current fact embeddings.",
      inputSchema: {
        type: "object",
        properties: {
          subspaceId: { type: "string", description: "Subspace ID to recompute" },
          k: { type: "number", description: "Number of principal components (default: 3)" },
        },
        required: ["subspaceId"],
      },
    },
    zodSchema: consolidateEmbeddingsSchema,
    handler: (args, agentId) => consolidateEmbeddingsTool(args, agentId),
  },
  {
    tool: {
      name: "memory_query_subspace",
      description: "Semantic search across subspaces. Embeds your query and ranks subspaces by cosine similarity to their centroids.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Semantic search query" },
          scopeId: { type: "string", description: "Scope ID or name" },
          limit: { type: "number", description: "Max subspaces to return (default: 5)" },
        },
        required: ["query"],
      },
    },
    zodSchema: querySubspaceSchema,
    handler: (args, agentId) => querySubspace(args, agentId),
  },
];
