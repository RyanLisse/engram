/**
 * Doc-to-LoRA Adapter Memory (3) tool registry entries.
 *
 * adapter_build_document        — Build adapter-ready memory document from scope
 * adapter_list_modules          — List memory modules for an agent
 * adapter_build_entity_cluster  — Build document for entity relationship cluster
 */

import type { ToolEntry } from "./types.js";
import {
  buildAdapterDocument,
  buildAdapterDocumentSchema,
} from "../../tools/adapter-memory.js";
import {
  listMemoryModules,
  listMemoryModulesSchema,
} from "../../tools/adapter-memory.js";
import {
  buildEntityClusterDocument,
  buildEntityClusterDocumentSchema,
} from "../../tools/adapter-memory.js";

export const entries: readonly ToolEntry[] = [
  {
    tool: {
      name: "adapter_build_document",
      description:
        "Build an adapter-ready memory document from facts in a scope. " +
        "Returns a dense, factual document optimized for Doc-to-LoRA internalization. " +
        "Phase 1: use as context injection. Phase 2: feed to D2L hypernetwork for adapter generation.",
      inputSchema: {
        type: "object",
        properties: {
          scopeId: {
            type: "string",
            description: "Scope ID or name to consolidate facts from.",
          },
          factTypes: {
            type: "array",
            items: { type: "string" },
            description:
              "Filter by fact types (e.g., ['decision', 'insight']). Omit to include all types.",
          },
          maxFacts: {
            type: "number",
            description: "Maximum facts to include (default: 100).",
          },
          minImportance: {
            type: "number",
            description: "Minimum importance score (default: 0.3).",
          },
          includeEntities: {
            type: "boolean",
            description:
              "Include entity relationship statements in the document.",
          },
        },
        required: ["scopeId"],
      },
    },
    zodSchema: buildAdapterDocumentSchema,
    handler: (args, agentId) => buildAdapterDocument(args, agentId),
  },
  {
    tool: {
      name: "adapter_list_modules",
      description:
        "List memory modules available for an agent. Shows scope-level " +
        "knowledge domains with fact counts and adapter status. " +
        "Each module represents a discrete knowledge unit that can be internalized.",
      inputSchema: {
        type: "object",
        properties: {
          agentId: {
            type: "string",
            description: "Agent ID to list modules for.",
          },
        },
        required: ["agentId"],
      },
    },
    zodSchema: listMemoryModulesSchema,
    handler: (args, agentId) => listMemoryModules(args, agentId),
  },
  {
    tool: {
      name: "adapter_build_entity_cluster",
      description:
        "Build an adapter document for a specific entity and its relationship cluster. " +
        "More targeted than scope-level documents — follows entity graph to gather related knowledge. " +
        "Useful for domain-specific adapters (e.g., 'everything about Project X').",
      inputSchema: {
        type: "object",
        properties: {
          entityId: {
            type: "string",
            description:
              "Root entity ID for the cluster (e.g., 'entity-ryan', 'entity-briefly').",
          },
          scopeId: {
            type: "string",
            description: "Scope ID or name to search within.",
          },
          maxDepth: {
            type: "number",
            description:
              "Maximum relationship hops from root entity (default: 1).",
          },
          maxFacts: {
            type: "number",
            description: "Maximum facts to include in cluster (default: 50).",
          },
        },
        required: ["entityId", "scopeId"],
      },
    },
    zodSchema: buildEntityClusterDocumentSchema,
    handler: (args, agentId) => buildEntityClusterDocument(args, agentId),
  },
];
