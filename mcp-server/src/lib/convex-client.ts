/**
 * Convex HTTP Client Wrapper
 *
 * Provides a singleton client and helper functions for calling Convex API endpoints.
 * Since MCP server is a separate package, we use string-based function paths instead of generated types.
 */

import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | null = null;
const configCache = new Map<string, { value: any; expiresAt: number }>();
const CONFIG_TTL_MS = 60 * 60 * 1000;

/**
 * Get or create the singleton Convex client
 */
export function getConvexClient(): ConvexHttpClient {
  if (!client) {
    const url = process.env.CONVEX_URL;
    if (!url) {
      throw new Error("CONVEX_URL environment variable is required");
    }
    client = new ConvexHttpClient(url);
    console.error(`[convex-client] Connected to ${url}`);
  }
  return client;
}

// Helper type for Convex function results
type ConvexResult<T> = T | { isError: true; message: string };

/**
 * Call a Convex query function
 */
async function query<T = any>(functionPath: string, args: Record<string, any> = {}): Promise<T> {
  const client = getConvexClient();
  return await client.query(functionPath as any, args);
}

/**
 * Call a Convex mutation function
 */
async function mutate<T = any>(functionPath: string, args: Record<string, any> = {}): Promise<T> {
  const client = getConvexClient();
  return await client.mutation(functionPath as any, args);
}

/**
 * Call a Convex action function
 */
async function action<T = any>(functionPath: string, args: Record<string, any> = {}): Promise<T> {
  const client = getConvexClient();
  return await client.action(functionPath as any, args);
}

// ========================================
// Facts API
// ========================================

export async function storeFact(args: {
  content: string;
  source?: string;
  createdBy: string;
  scopeId: string;
  factType?: string;
  entityIds?: string[];
  tags?: string[];
  emotionalContext?: string;
  conversationId?: string;
}) {
  return await mutate("functions/facts:storeFact", args);
}

export async function getUnmirroredFacts(args: {
  scopeId?: string;
  limit?: number;
}) {
  return await query("functions/facts:getUnmirrored", args);
}

export async function updateVaultPath(args: {
  factId: string;
  vaultPath: string;
  vaultSyncedAt?: number;
}) {
  return await mutate("functions/facts:updateVaultPath", args);
}

export async function applyVaultEdit(args: {
  factId?: string;
  content: string;
  scopeId: string;
  createdBy: string;
  tags?: string[];
  entityIds?: string[];
  vaultPath: string;
  updatedAt?: number;
}) {
  return await mutate("functions/facts:applyVaultEdit", args);
}

export async function runReconcileFromVault(args: { filePath: string }) {
  return await action("actions/reconcileFromVault:reconcileFromVault", args);
}

export async function classifyObservation(args: { factId: string }) {
  return await action("actions/classifyObservation:classifyObservation", args);
}

export async function searchFacts(args: {
  query: string;
  limit?: number;
  scopeIds?: string[];
  factType?: string;
  minImportance?: number;
}) {
  // Convex searchFacts expects singular scopeId, not an array
  const { scopeIds, minImportance, ...rest } = args;
  const convexArgs: Record<string, any> = { ...rest };
  if (scopeIds && scopeIds.length === 1) {
    convexArgs.scopeId = scopeIds[0];
  }
  // When multiple scopes or no scope, search without scope filter
  return await query("functions/facts:searchFacts", convexArgs);
}

export async function searchFactsMulti(args: {
  query: string;
  scopeIds: string[];
  factType?: string;
  createdBy?: string;
  limit?: number;
}) {
  return await query("functions/facts:searchFactsMulti", args);
}

export async function vectorRecall(args: {
  embedding: number[];
  scopeIds: string[];
  limit?: number;
}) {
  return await query("functions/facts:vectorRecall", args);
}

export async function listFactsByScope(args: {
  scopeId: string;
  limit?: number;
}) {
  return await query("functions/facts:listByScopePublic", args);
}

export async function getFact(factId: string) {
  return await query("functions/facts:getFact", { factId });
}

export async function updateFact(args: {
  factId: string;
  content?: string;
  tags?: string[];
  factType?: string;
}) {
  return await mutate("functions/facts:updateFact", args);
}

export async function archiveFactPublic(factId: string) {
  return await mutate("functions/facts:archiveFactPublic", { factId });
}

export async function boostRelevance(args: { factId: string; boost?: number }) {
  return await mutate("functions/facts:boostRelevance", args);
}

export async function bumpAccess(factId: string) {
  return await mutate("functions/facts:bumpAccess", { factId });
}

export async function getRecentHandoffs(
  currentAgentId: string,
  scopeIds: string[],
  limit?: number
) {
  return await query("functions/facts:getRecentHandoffs", {
    currentAgentId,
    scopeIds,
    limit,
  });
}

// ========================================
// Entities API
// ========================================

export async function upsertEntity(args: {
  entityId: string;
  name: string;
  type: string;
  metadata?: Record<string, any>;
  createdBy: string;
}) {
  return await mutate("functions/entities:upsert", args);
}

export async function getEntityByEntityId(entityId: string) {
  return await query("functions/entities:getByEntityId", { entityId });
}

export async function deleteEntity(args: { entityId: string; hardDelete?: boolean }) {
  return await mutate("functions/entities:deleteEntity", args);
}

export async function searchEntities(args: {
  query: string;
  type?: string;
  limit?: number;
}) {
  return await query("functions/entities:search", args);
}

export async function addRelationship(args: {
  entityId: string;
  targetId: string;
  relationType: string;
}) {
  return await mutate("functions/entities:addRelationship", args);
}

export async function updateBacklinks(args: {
  factId: string;
  entityNames: string[];
}) {
  return await mutate("functions/entities:updateBacklinks", args);
}

// ========================================
// Agents API
// ========================================

export async function registerAgent(args: {
  agentId: string;
  name: string;
  capabilities: string[];
  defaultScope: string;
  telos?: string;
  isInnerCircle?: boolean;
}) {
  return await mutate("functions/agents:register", args);
}

export async function embedAgentCapabilities(agentId: string) {
  return await action("actions/embedAgentCapabilities:embedAgentCapabilities", { agentId });
}

export async function getAgentByAgentId(agentId: string) {
  return await query("functions/agents:getByAgentId", { agentId });
}

// ========================================
// Scopes API
// ========================================

export async function getScopeByName(name: string) {
  return await query("functions/scopes:getByName", { name });
}

export async function getPermittedScopes(agentId: string) {
  return await query("functions/scopes:getPermitted", { agentId });
}

export async function deleteScope(args: { scopeId: string; hardDelete?: boolean; force?: boolean }) {
  return await mutate("functions/scopes:deleteScope", args);
}

export async function createScope(args: {
  name: string;
  description: string;
  members: string[];
  readPolicy: string;
  writePolicy: string;
  retentionDays?: number;
}) {
  return await mutate("functions/scopes:create", args);
}

export async function addScopeMember(args: {
  scopeId: string;
  agentId: string;
}) {
  return await mutate("functions/scopes:addMember", args);
}

// ========================================
// Sessions API
// ========================================

export async function createSession(args: {
  agentId: string;
  contextSummary: string;
  parentSession?: string;
  nodeId?: string;
}) {
  return await mutate("functions/sessions:create", args);
}

export async function getSessionsByAgent(agentId: string) {
  return await query("functions/sessions:getByAgent", { agentId });
}

export async function deleteSession(args: { sessionId: string; hardDelete?: boolean }) {
  return await mutate("functions/sessions:deleteSession", args);
}

// ========================================
// Conversations API
// ========================================

export async function createConversation(args: {
  sessionId: string;
  participants: string[];
  contextSummary: string;
  tags: string[];
  importance?: number;
}) {
  return await mutate("functions/conversations:create", args);
}

export async function addFactToConversation(args: {
  conversationId: string;
  factId: string;
}) {
  return await mutate("functions/conversations:addFact", args);
}

export async function addHandoff(args: {
  conversationId: string;
  fromAgent: string;
  toAgent: string;
  contextSummary: string;
}) {
  return await mutate("functions/conversations:addHandoff", args);
}

/** Record handoff on a conversation (session end). Uses empty toAgent when not yet known. */
export async function addHandoffToConversation(args: {
  conversationId: string;
  fromAgent: string;
  summary: string;
}) {
  return await mutate("functions/conversations:addHandoff", {
    conversationId: args.conversationId,
    fromAgent: args.fromAgent,
    toAgent: "",
    contextSummary: args.summary,
  });
}

export async function deleteConversation(args: { conversationId: string; hardDelete?: boolean }) {
  return await mutate("functions/conversations:deleteConversation", args);
}

// ========================================
// Signals API
// ========================================

export async function recordSignal(args: {
  factId?: string;
  agentId: string;
  signalType: string;
  value: number;
  comment?: string;
  context?: string;
}) {
  return await mutate("functions/signals:recordSignal", args);
}

export async function getUnreadNotifications(args: { agentId: string; limit?: number }) {
  return await query("functions/notifications:getUnreadByAgent", args);
}

export async function markNotificationsRead(notificationIds: string[]) {
  for (const notificationId of notificationIds) {
    await mutate("functions/notifications:markRead", { notificationId });
  }
}

export async function recordRecallResult(args: { recallId: string; factIds: string[] }) {
  return await mutate("functions/recallFeedback:recordRecall", args);
}

export async function recordRecallUsage(args: {
  recallId: string;
  usedFactIds: string[];
  unusedFactIds?: string[];
}) {
  return await mutate("functions/recallFeedback:recordUsage", args);
}

export async function markPruned(factIds: string[]) {
  return await mutate("functions/facts:markPruned", { factIds });
}

export async function listStaleFacts(args: {
  scopeId?: string;
  olderThanDays?: number;
  limit?: number;
}) {
  return await query("functions/facts:listStaleFacts", args);
}

export async function markFactsMerged(args: {
  sourceFactIds: string[];
  targetFactId: string;
}) {
  return await mutate("functions/facts:markFactsMerged", args);
}

export async function listAgents() {
  return await query("functions/agents:list", {});
}

export async function listScopes(agentId: string) {
  return await query("functions/scopes:getPermitted", { agentId });
}

export async function getSignalsByFact(factId: string) {
  return await query("functions/signals:getByFact", { factId });
}

// ========================================
// Themes API
// ========================================

export async function getThemesByScope(scopeId: string) {
  return await query("functions/themes:getByScope", { scopeId });
}

export async function createTheme(args: {
  name: string;
  description: string;
  factIds: string[];
  entityIds: string[];
  scopeId: string;
  importance?: number;
}) {
  return await mutate("functions/themes:create", args);
}

export async function deleteTheme(args: { themeId: string; hardDelete?: boolean }) {
  return await mutate("functions/themes:deleteTheme", args);
}

// ========================================
// Config API
// ========================================

export async function getConfig(key: string) {
  const hit = configCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await query("functions/config:getConfig", { key });
  configCache.set(key, { value, expiresAt: Date.now() + CONFIG_TTL_MS });
  return value;
}

export async function listConfigs(category?: string) {
  const cacheKey = `list:${category ?? "*"}`;
  const hit = configCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await query("functions/config:listConfigs", { category });
  configCache.set(cacheKey, { value, expiresAt: Date.now() + CONFIG_TTL_MS });
  return value;
}

export async function setConfig(args: {
  key: string;
  value: string | number | boolean | null;
  category: string;
  description: string;
  updatedBy: string;
}) {
  const result = await mutate("functions/config:setConfig", args);
  configCache.clear();
  return result;
}

export async function setScopePolicy(args: {
  scopeId: string;
  policyKey: string;
  policyValue: string | number | boolean | null;
  priority?: number;
  createdBy: string;
}) {
  const result = await mutate("functions/config:setScopePolicy", args);
  configCache.clear();
  return result;
}

export async function listScopePolicies(scopeId: string) {
  return await query("functions/config:listScopePolicies", { scopeId });
}

// ========================================
// Events API
// ========================================

export async function pollEvents(args: {
  agentId: string;
  watermark?: number;
  scopeId?: string;
  limit?: number;
}) {
  return await query("functions/events:poll", args);
}

// ========================================
// Sync API
// ========================================

export async function getFactsSince(args: {
  scopeId: string;
  since: number;
  limit?: number;
}) {
  return await query("functions/sync:getFactsSince", args);
}

export async function updateSyncLog(args: {
  nodeId: string;
  factsSynced: number;
  status: "ok" | "error" | "syncing";
}) {
  return await mutate("functions/sync:updateSyncLog", args);
}

export async function getSyncStatus(nodeId: string) {
  return await query("functions/sync:getSyncStatus", { nodeId });
}
