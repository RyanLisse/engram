import type { ToolEntry } from "./types.js";
import {
  blockDelete,
  blockDeleteSchema,
  deleteEpisode,
  deleteEpisodeSchema,
  deleteSubspace,
  deleteSubspaceSchema,
  updateAgent,
  updateAgentSchema,
  updateTheme,
  updateThemeSchema,
} from "../../tools/crud-admin.js";

export const entries: readonly ToolEntry[] = [
  {
    tool: {
      name: "memory_delete_episode",
      description: "Delete an episode by ID.",
      inputSchema: {
        type: "object",
        properties: { episodeId: { type: "string" } },
        required: ["episodeId"],
      },
    },
    zodSchema: deleteEpisodeSchema,
    handler: (args, agentId) => deleteEpisode(args, agentId),
  },
  {
    tool: {
      name: "memory_delete_subspace",
      description: "Delete a knowledge subspace by subspaceId, or by name (+ optional scopeId).",
      inputSchema: {
        type: "object",
        properties: {
          subspaceId: { type: "string" },
          name: { type: "string" },
          scopeId: { type: "string" },
        },
      },
    },
    zodSchema: deleteSubspaceSchema,
    handler: (args, agentId) => deleteSubspace(args, agentId),
  },
  {
    tool: {
      name: "memory_block_delete",
      description: "Delete a memory block by blockId or by label + scope.",
      inputSchema: {
        type: "object",
        properties: {
          blockId: { type: "string" },
          label: { type: "string" },
          scopeId: { type: "string" },
        },
      },
    },
    zodSchema: blockDeleteSchema,
    handler: (args, agentId) => blockDelete(args, agentId),
  },
  {
    tool: {
      name: "memory_update_theme",
      description: "Update a theme (name, description, linked facts/entities, importance).",
      inputSchema: {
        type: "object",
        properties: {
          themeId: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          factIds: { type: "array", items: { type: "string" } },
          entityIds: { type: "array", items: { type: "string" } },
          importance: { type: "number" },
        },
        required: ["themeId"],
      },
    },
    zodSchema: updateThemeSchema,
    handler: (args) => updateTheme(args),
  },
  {
    tool: {
      name: "memory_update_agent",
      description: "Update agent profile fields (name, capabilities, default scope, telos, settings).",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string" },
          name: { type: "string" },
          capabilities: { type: "array", items: { type: "string" } },
          defaultScope: { type: "string" },
          telos: { type: "string" },
          settings: {},
        },
      },
    },
    zodSchema: updateAgentSchema,
    handler: (args, agentId) => updateAgent(args, agentId),
  },
];
