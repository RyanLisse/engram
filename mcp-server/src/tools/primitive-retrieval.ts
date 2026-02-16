import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { generateEmbedding } from "../lib/embeddings.js";

export const vectorSearchSchema = z.object({ query: z.string(), scopeIds: z.array(z.string()), limit: z.number().optional().prefault(10) });
export async function vectorSearch(input: z.infer<typeof vectorSearchSchema>) {
  const embedding = await generateEmbedding(input.query, "search_query");
  return await convex.vectorRecall({ embedding, scopeIds: input.scopeIds, limit: input.limit });
}

export const textSearchSchema = z.object({ query: z.string(), scopeIds: z.array(z.string()), limit: z.number().optional().prefault(10), factType: z.string().optional() });
export async function textSearch(input: z.infer<typeof textSearchSchema>) {
  return await convex.searchFactsMulti(input);
}

export const searchFactsSchema = textSearchSchema;
export async function searchFactsPrimitive(input: z.infer<typeof searchFactsSchema>) {
  return await textSearch(input);
}

export const bumpAccessSchema = z.object({ factIds: z.array(z.string()) });
export async function bumpAccessBatch(input: z.infer<typeof bumpAccessSchema>) {
  for (const factId of input.factIds) {
    await convex.bumpAccess(factId);
  }
  return { bumped: input.factIds.length };
}

export const recordRecallSchema = z.object({ recallId: z.string(), factIds: z.array(z.string()) });
export async function recordRecall(input: z.infer<typeof recordRecallSchema>) {
  return await convex.recordRecallResult(input);
}

export const getObservationsSchema = z.object({ scopeIds: z.array(z.string()), tier: z.string().optional(), limit: z.number().optional().prefault(20) });
export async function getObservations(input: z.infer<typeof getObservationsSchema>) {
  const rows = await convex.searchFactsMulti({ query: "", scopeIds: input.scopeIds, factType: "observation", limit: input.limit });
  if (!input.tier) return rows;
  return (rows as any[]).filter((r) => r.observationTier === input.tier);
}

export const getEntitiesPrimitiveSchema = z.object({ query: z.string(), limit: z.number().optional().prefault(20), type: z.string().optional() });
export async function getEntitiesPrimitive(input: z.infer<typeof getEntitiesPrimitiveSchema>) {
  return await convex.searchEntities(input);
}

export const searchEntitiesSchema = getEntitiesPrimitiveSchema;
export async function searchEntitiesPrimitive(input: z.infer<typeof searchEntitiesSchema>) {
  return await getEntitiesPrimitive(input);
}

export const getThemesPrimitiveSchema = z.object({ scopeId: z.string(), limit: z.number().optional().prefault(20) });
export async function getThemesPrimitive(input: z.infer<typeof getThemesPrimitiveSchema>) {
  return await convex.getThemesByScope(input.scopeId);
}

export const searchThemesSchema = z.object({ scopeId: z.string(), limit: z.number().optional().prefault(20) });
export async function searchThemesPrimitive(input: z.infer<typeof searchThemesSchema>) {
  return await getThemesPrimitive(input);
}

export const getHandoffsSchema = z.object({ scopeIds: z.array(z.string()), limit: z.number().optional().prefault(5) });
export async function getHandoffs(input: z.infer<typeof getHandoffsSchema>, agentId: string) {
  return await convex.getRecentHandoffs(agentId, input.scopeIds, input.limit);
}

export const getNotificationsSchema = z.object({ limit: z.number().optional().prefault(20) });
export async function getNotifications(input: z.infer<typeof getNotificationsSchema>, agentId: string) {
  return await convex.getUnreadNotifications({ agentId, limit: input.limit });
}

export const markNotificationsReadSchema = z.object({ notificationIds: z.array(z.string()) });
export async function markNotificationsRead(input: z.infer<typeof markNotificationsReadSchema>) {
  await convex.markNotificationsRead(input.notificationIds);
  return { marked: input.notificationIds.length };
}

export const listStaleFactsSchema = z.object({ scopeId: z.string().optional(), olderThanDays: z.number().optional().prefault(90), limit: z.number().optional().prefault(200) });
export async function listStaleFacts(input: z.infer<typeof listStaleFactsSchema>) {
  return await convex.listStaleFacts(input);
}

export const markFactsMergedSchema = z.object({ sourceFactIds: z.array(z.string()), targetFactId: z.string() });
export async function markFactsMerged(input: z.infer<typeof markFactsMergedSchema>) {
  return await convex.markFactsMerged(input);
}

export const markFactsPrunedSchema = z.object({ factIds: z.array(z.string()) });
export async function markFactsPruned(input: z.infer<typeof markFactsPrunedSchema>) {
  return await convex.markPruned(input.factIds);
}
