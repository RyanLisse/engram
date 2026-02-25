/**
 * Episodic memory MCP tool handlers.
 *
 * Five atomic primitives for managing episodes:
 * - create_episode: Group facts into a coherent episode
 * - get_episode: Retrieve episode by ID
 * - search_episodes: Semantic search over episodes
 * - link_facts_to_episode: Add fact IDs to existing episode
 * - close_episode: Set endTime and trigger re-embedding
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

// ── Schemas ──────────────────────────────────────────

export const createEpisodeSchema = z.object({
  title: z.string().describe("Episode title (e.g., 'Debugging auth timeout')"),
  factIds: z.array(z.string()).describe("Fact IDs to include in this episode"),
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent's private scope)"),
  startTime: z.number().optional().describe("Episode start timestamp (ms). Defaults to now."),
  endTime: z.number().optional().describe("Episode end timestamp (ms). Omit for ongoing episodes."),
  tags: z.array(z.string()).optional().describe("Tags for categorization"),
  importanceScore: z.number().optional().describe("Importance score 0-1 (default 0.5)"),
  summary: z.string().optional().describe("Brief summary of the episode"),
});

export const getEpisodeSchema = z.object({
  episodeId: z.string().describe("Episode ID to retrieve"),
});

export const searchEpisodesSchema = z.object({
  query: z.string().describe("Search query for finding episodes"),
  scopeId: z.string().optional().describe("Scope to search within"),
  limit: z.number().optional().describe("Maximum results (default 10)"),
});

export const recallEpisodesSchema = z.object({
  query: z.string().optional().describe("Semantic query for episode recall"),
  scopeId: z.string().optional().describe("Scope to search within"),
  startAfter: z.number().optional().describe("Return episodes with startTime >= this timestamp (ms)"),
  startBefore: z.number().optional().describe("Return episodes with startTime < this timestamp (ms)"),
  limit: z.number().optional().describe("Maximum results (default 10)"),
});

export const linkFactsToEpisodeSchema = z.object({
  episodeId: z.string().describe("Episode ID to add facts to"),
  factIds: z.array(z.string()).describe("Fact IDs to link to this episode"),
});

export const closeEpisodeSchema = z.object({
  episodeId: z.string().describe("Episode ID to close"),
  endTime: z.number().optional().describe("End timestamp (ms). Defaults to now."),
  summary: z.string().optional().describe("Final summary for the episode"),
});

// ── Handlers ─────────────────────────────────────────

export async function createEpisode(
  input: z.infer<typeof createEpisodeSchema>,
  agentId: string
) {
  // Resolve scope
  let scopeId = input.scopeId;
  if (!scopeId || !scopeId.startsWith("j")) {
    const scopeName = scopeId ?? `private-${agentId}`;
    const scope = await convex.getScopeByName(scopeName);
    if (!scope) {
      return { isError: true, message: `Scope "${scopeName}" not found` };
    }
    scopeId = scope._id;
  }

  const result = await convex.createEpisode({
    title: input.title,
    agentId,
    scopeId: scopeId!,
    factIds: input.factIds,
    startTime: input.startTime ?? Date.now(),
    endTime: input.endTime,
    tags: input.tags,
    importanceScore: input.importanceScore,
    summary: input.summary,
  });

  return result;
}

export async function getEpisode(input: z.infer<typeof getEpisodeSchema>) {
  const episode = await convex.getEpisode({ episodeId: input.episodeId });
  if (!episode) {
    return { isError: true, message: `Episode not found: ${input.episodeId}` };
  }
  return episode;
}

export async function searchEpisodes(
  input: z.infer<typeof searchEpisodesSchema>,
  agentId: string
) {
  return await recallEpisodes(
    {
      query: input.query,
      scopeId: input.scopeId,
      limit: input.limit,
    },
    agentId,
  );
}

function applyTemporalFilters(
  episodes: Array<{ startTime?: number }>,
  startAfter?: number,
  startBefore?: number,
) {
  return episodes.filter((episode) => {
    const startTime = episode.startTime;
    if (typeof startTime !== "number") return true;
    if (startAfter !== undefined && startTime < startAfter) return false;
    if (startBefore !== undefined && startTime >= startBefore) return false;
    return true;
  });
}

export async function recallEpisodes(
  input: z.infer<typeof recallEpisodesSchema>,
  agentId: string,
) {
  let scopeId = input.scopeId;
  if (scopeId && !scopeId.startsWith("j")) {
    const scope = await convex.getScopeByName(scopeId);
    if (scope) scopeId = scope._id;
  }

  const recallResult = await convex.recallEpisodes({
    query: input.query,
    scopeId: scopeId as any,
    agentId,
    startAfter: input.startAfter,
    startBefore: input.startBefore,
    limit: input.limit,
  });

  const episodes = applyTemporalFilters(
    Array.isArray(recallResult.episodes) ? recallResult.episodes : [],
    input.startAfter,
    input.startBefore,
  );
  return { episodes, count: episodes.length, strategy: recallResult.strategy };
}

export async function linkFactsToEpisode(
  input: z.infer<typeof linkFactsToEpisodeSchema>
) {
  const result = await convex.updateEpisode({
    episodeId: input.episodeId,
    addFactIds: input.factIds,
  });

  return result;
}

export async function closeEpisode(
  input: z.infer<typeof closeEpisodeSchema>
) {
  const result = await convex.updateEpisode({
    episodeId: input.episodeId,
    endTime: input.endTime ?? Date.now(),
    summary: input.summary,
  });
  return result;
}
