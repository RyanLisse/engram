/**
 * Convex HTTP Client Wrapper
 *
 * Provides a singleton client and helper functions for calling Convex API endpoints.
 * Since MCP server is a separate package, we use string-based function paths instead of generated types.
 */

import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | null = null;

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

export async function listFactsByScope(args: {
  scopeId: string;
  limit?: number;
}) {
  return await query("functions/facts:listByScopePublic", args);
}

export async function getFact(factId: string) {
  return await query("functions/facts:getFact", { factId });
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

export async function markPruned(factIds: string[]) {
  return await mutate("functions/facts:markPruned", { factIds });
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
