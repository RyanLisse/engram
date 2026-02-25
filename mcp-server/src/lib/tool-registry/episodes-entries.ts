/**
 * Episodes (5) — Episodic memory tool entries.
 */

import type { ToolEntry } from "./types.js";

import {
  createEpisode, createEpisodeSchema,
  getEpisode, getEpisodeSchema,
  recallEpisodes, recallEpisodesSchema,
  searchEpisodes, searchEpisodesSchema,
  linkFactsToEpisode, linkFactsToEpisodeSchema,
  closeEpisode, closeEpisodeSchema,
} from "../../tools/episodes.js";

export const entries: readonly ToolEntry[] = [
  {
    tool: {
      name: "memory_create_episode",
      description: "Create an episode grouping related facts into a coherent unit (e.g., a debugging session, a planning cycle). Triggers async embedding.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Episode title (e.g., 'Debugging auth timeout')" },
          factIds: { type: "array", items: { type: "string" }, description: "Fact IDs to include" },
          scopeId: { type: "string", description: "Scope ID or name" },
          startTime: { type: "number", description: "Start timestamp (ms). Defaults to now." },
          endTime: { type: "number", description: "End timestamp (ms). Omit for ongoing." },
          tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
          importanceScore: { type: "number", description: "Importance 0-1 (default 0.5)" },
          summary: { type: "string", description: "Brief summary" },
        },
        required: ["title", "factIds"],
      },
    },
    zodSchema: createEpisodeSchema,
    handler: (args, agentId) => createEpisode(args, agentId),
  },
  {
    tool: {
      name: "memory_get_episode",
      description: "Retrieve a single episode by ID, including its fact IDs, summary, tags, and embedding status.",
      inputSchema: {
        type: "object",
        properties: {
          episodeId: { type: "string", description: "Episode ID to retrieve" },
        },
        required: ["episodeId"],
      },
    },
    zodSchema: getEpisodeSchema,
    handler: (args) => getEpisode(args),
  },
  {
    tool: {
      name: "memory_recall_episodes",
      description: "Recall episodes via semantic and/or temporal queries. Uses vector search when query is provided, with text fallback.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Semantic query (optional for temporal-only recall)" },
          scopeId: { type: "string", description: "Scope to search within" },
          startAfter: { type: "number", description: "Return episodes with startTime >= timestamp (ms)" },
          startBefore: { type: "number", description: "Return episodes with startTime < timestamp (ms)" },
          limit: { type: "number", description: "Maximum results (default 10)" },
        },
        required: [],
      },
    },
    zodSchema: recallEpisodesSchema,
    handler: (args, agentId) => recallEpisodes(args, agentId),
  },
  {
    tool: {
      name: "memory_search_episodes",
      description: "Semantic search over episodes. Tries vector search first, falls back to text matching on title/summary/tags.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          scopeId: { type: "string", description: "Scope to search within" },
          limit: { type: "number", description: "Maximum results (default 10)" },
        },
        required: ["query"],
      },
    },
    zodSchema: searchEpisodesSchema,
    handler: (args, agentId) => searchEpisodes(args, agentId),
  },
  {
    tool: {
      name: "memory_link_facts_to_episode",
      description: "Add fact IDs to an existing episode. Deduplicates against already-linked facts.",
      inputSchema: {
        type: "object",
        properties: {
          episodeId: { type: "string", description: "Episode ID" },
          factIds: { type: "array", items: { type: "string" }, description: "Fact IDs to link" },
        },
        required: ["episodeId", "factIds"],
      },
    },
    zodSchema: linkFactsToEpisodeSchema,
    handler: (args) => linkFactsToEpisode(args),
  },
  {
    tool: {
      name: "memory_close_episode",
      description: "Close an episode by setting its endTime. Optionally attach a final summary.",
      inputSchema: {
        type: "object",
        properties: {
          episodeId: { type: "string", description: "Episode ID to close" },
          endTime: { type: "number", description: "End timestamp (ms). Defaults to now." },
          summary: { type: "string", description: "Final summary for the episode" },
        },
        required: ["episodeId"],
      },
    },
    zodSchema: closeEpisodeSchema,
    handler: (args) => closeEpisode(args),
  },
];
