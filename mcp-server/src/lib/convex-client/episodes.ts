/**
 * Convex HTTP Client — Episodes domain
 */

import { query, mutate, action, PATHS } from "./core.js";

export async function createEpisode(args: {
  title: string;
  agentId: string;
  scopeId: string;
  factIds: string[];
  startTime: number;
  endTime?: number;
  tags?: string[];
  importanceScore?: number;
  summary?: string;
}) {
  return await mutate(PATHS.episodes.createEpisode, args);
}

export async function getEpisode(args: { episodeId: string }) {
  return await query(PATHS.episodes.getEpisode, args);
}

export async function listEpisodes(args: {
  agentId?: string;
  scopeId?: string;
  startAfter?: number;
  startBefore?: number;
  limit?: number;
}) {
  return await query(PATHS.episodes.listEpisodes, args);
}

export async function searchEpisodes(args: {
  query: string;
  scopeId?: string;
  limit?: number;
}) {
  return await query(PATHS.episodes.searchEpisodes, args);
}

export async function updateEpisode(args: {
  episodeId: string;
  title?: string;
  summary?: string;
  endTime?: number;
  tags?: string[];
  importanceScore?: number;
  addFactIds?: string[];
}) {
  return await mutate(PATHS.episodes.updateEpisode, args);
}

export async function deleteEpisode(args: {
  episodeId: string;
  agentId?: string;
}) {
  return await mutate(PATHS.episodes.deleteEpisode, args);
}

export async function vectorSearchEpisodes(args: {
  query: string;
  scopeId?: string;
  agentId?: string;
  limit?: number;
}) {
  return await action(PATHS.actions.vectorSearchEpisodes, args);
}

export async function recallEpisodes(args: {
  query?: string;
  scopeId?: string;
  agentId?: string;
  startAfter?: number;
  startBefore?: number;
  limit?: number;
}) {
  if (!args.query) {
    const episodes = await listEpisodes({
      scopeId: args.scopeId,
      agentId: args.agentId,
      startAfter: args.startAfter,
      startBefore: args.startBefore,
      limit: args.limit,
    });
    return { episodes, strategy: "temporal" as const };
  }

  try {
    const vector = await vectorSearchEpisodes({
      query: args.query,
      scopeId: args.scopeId,
      agentId: args.agentId,
      limit: args.limit,
    });
    if (Array.isArray(vector) && vector.length > 0) {
      return { episodes: vector, strategy: "vector" as const };
    }
  } catch {
    // Fall through to text search.
  }

  const text = await searchEpisodes({
    query: args.query,
    scopeId: args.scopeId,
    limit: args.limit,
  });
  return { episodes: text, strategy: "text" as const };
}
