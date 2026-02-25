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

export async function vectorSearchEpisodes(args: {
  query: string;
  scopeId?: string;
  agentId?: string;
  limit?: number;
}) {
  return await action(PATHS.actions.vectorSearchEpisodes, args);
}
