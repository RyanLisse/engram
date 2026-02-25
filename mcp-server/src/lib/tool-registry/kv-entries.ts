/**
 * KV Store (4) tool registry entries.
 *
 * memory_kv_set    — Upsert a key-value pair
 * memory_kv_get    — Retrieve a value by key
 * memory_kv_delete — Remove a key-value pair
 * memory_kv_list   — List key-value pairs with optional filters
 */

import type { ToolEntry } from "./types.js";
import { kvSet, kvSetSchema } from "../../tools/kv-store.js";
import { kvGet, kvGetSchema } from "../../tools/kv-store.js";
import { kvDelete, kvDeleteSchema } from "../../tools/kv-store.js";
import { kvList, kvListSchema } from "../../tools/kv-store.js";

export const entries: readonly ToolEntry[] = [
  {
    tool: {
      name: "memory_kv_set",
      description:
        "Upsert a key-value pair in a scope. Values are stored as strings — use JSON.stringify() for structured data. Ideal for agent preferences, config flags, identity facts, and tool state that needs deterministic (non-semantic) lookup.",
      inputSchema: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Key to store. Use dotted namespacing (e.g. 'ui.theme', 'feature.beta_enabled').",
          },
          value: {
            type: "string",
            description: "Value to store. Use JSON.stringify() for structured data.",
          },
          scopeId: {
            type: "string",
            description: "Scope ID or name (defaults to agent's private scope).",
          },
          category: {
            type: "string",
            enum: ["preference", "config", "identity", "tool_state"],
            description: "Category for grouping and filtering entries.",
          },
          metadata: {
            type: "object",
            properties: {
              source: { type: "string" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            description: "Optional provenance metadata.",
          },
        },
        required: ["key", "value"],
      },
    },
    zodSchema: kvSetSchema,
    handler: (args, agentId) => kvSet(args, agentId),
  },
  {
    tool: {
      name: "memory_kv_get",
      description:
        "Retrieve a value by exact key from a scope. Returns the value string, category, and updatedAt timestamp. Returns found: false when the key does not exist.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "Exact key to look up." },
          scopeId: {
            type: "string",
            description: "Scope ID or name (defaults to agent's private scope).",
          },
        },
        required: ["key"],
      },
    },
    zodSchema: kvGetSchema,
    handler: (args, agentId) => kvGet(args, agentId),
  },
  {
    tool: {
      name: "memory_kv_delete",
      description:
        "Remove a key-value pair from a scope. Returns deleted: true if the key existed, false if it was already absent.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "Key to delete." },
          scopeId: {
            type: "string",
            description: "Scope ID or name (defaults to agent's private scope).",
          },
        },
        required: ["key"],
      },
    },
    zodSchema: kvDeleteSchema,
    handler: (args, agentId) => kvDelete(args, agentId),
  },
  {
    tool: {
      name: "memory_kv_list",
      description:
        "List key-value entries in a scope. Supports prefix filtering (e.g. prefix='ui.' returns all ui.* keys) and category filtering. Returns entries array with key, value, category, and updatedAt.",
      inputSchema: {
        type: "object",
        properties: {
          scopeId: {
            type: "string",
            description: "Scope ID or name (defaults to agent's private scope).",
          },
          prefix: {
            type: "string",
            description: "Filter keys by prefix (e.g. 'ui.' returns all ui.* keys).",
          },
          category: {
            type: "string",
            enum: ["preference", "config", "identity", "tool_state"],
            description: "Filter by category.",
          },
          limit: {
            type: "number",
            description: "Max entries to return (default: 100, max: 500).",
          },
        },
      },
    },
    zodSchema: kvListSchema,
    handler: (args, agentId) => kvList(args, agentId),
  },
];
