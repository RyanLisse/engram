/**
 * Convex HTTP Client for CLI
 */

import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | null = null;

export function getClient(): ConvexHttpClient {
  if (!client) {
    const url = process.env.CONVEX_URL;
    if (!url) {
      throw new Error(
        "CONVEX_URL not set. Export it or create a .env file:\n  export CONVEX_URL=https://your-deployment.convex.cloud"
      );
    }
    client = new ConvexHttpClient(url);
  }
  return client;
}

export function getAgentId(): string {
  return process.env.ENGRAM_AGENT_ID || "cli-user";
}

async function query<T = any>(fn: string, args: Record<string, any> = {}): Promise<T> {
  return await getClient().query(fn as any, args);
}

async function mutate<T = any>(fn: string, args: Record<string, any> = {}): Promise<T> {
  return await getClient().mutation(fn as any, args);
}

async function action<T = any>(fn: string, args: Record<string, any> = {}): Promise<T> {
  return await getClient().action(fn as any, args);
}

// ── Facts ──────────────────────────────────────────────

export async function storeFact(args: {
  content: string;
  source?: string;
  createdBy: string;
  scopeId: string;
  factType?: string;
  entityIds?: string[];
  tags?: string[];
  emotionalContext?: string;
}) {
  return await mutate("functions/facts:storeFact", args);
}

export async function searchFacts(args: {
  query: string;
  limit?: number;
  scopeId?: string;
  factType?: string;
}) {
  return await query("functions/facts:searchFacts", args);
}

export async function searchFactsMulti(args: {
  query: string;
  scopeIds: string[];
  factType?: string;
  limit?: number;
}) {
  return await query("functions/facts:searchFactsMulti", args);
}

export async function listFactsByScope(args: { scopeId: string; limit?: number }) {
  return await query("functions/facts:listByScopePublic", args);
}

export async function getFact(factId: string) {
  return await query("functions/facts:getFact", { factId });
}

export async function archiveFact(factId: string) {
  return await mutate("functions/facts:archiveFactPublic", { factId });
}

export async function listStaleFacts(args: {
  scopeId?: string;
  olderThanDays?: number;
  limit?: number;
}) {
  return await query("functions/facts:listStaleFacts", args);
}

// ── Agents ─────────────────────────────────────────────

export async function registerAgent(args: {
  agentId: string;
  name: string;
  capabilities: string[];
  defaultScope: string;
  telos?: string;
}) {
  return await mutate("functions/agents:register", args);
}

export async function getAgent(agentId: string) {
  return await query("functions/agents:getByAgentId", { agentId });
}

export async function listAgents() {
  return await query("functions/agents:list", {});
}

// ── Scopes ─────────────────────────────────────────────

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
}) {
  return await mutate("functions/scopes:create", args);
}

// ── Entities ───────────────────────────────────────────

export async function searchEntities(args: { query: string; type?: string; limit?: number }) {
  return await query("functions/entities:search", args);
}

export async function upsertEntity(args: {
  entityId: string;
  name: string;
  type: string;
  metadata?: Record<string, any>;
  createdBy: string;
}) {
  return await mutate("functions/entities:upsert", args);
}

// ── Themes ─────────────────────────────────────────────

export async function getThemesByScope(scopeId: string) {
  return await query("functions/themes:getByScope", { scopeId });
}

// ── Sessions ───────────────────────────────────────────

export async function getSessionsByAgent(agentId: string) {
  return await query("functions/sessions:getByAgent", { agentId });
}

// ── Vector Search ──────────────────────────────────────

export async function vectorSearch(args: {
  embedding: number[];
  scopeIds: string[];
  limit?: number;
}) {
  return await query("functions/facts:vectorRecall", args);
}

// ── Signals ────────────────────────────────────────────

export async function recordSignal(args: {
  factId?: string;
  agentId: string;
  signalType: string;
  value: number;
  comment?: string;
}) {
  return await mutate("functions/signals:recordSignal", args);
}

// ── Fact Lifecycle ─────────────────────────────────────

export async function updateFact(args: {
  factId: string;
  content?: string;
  tags?: string[];
  factType?: string;
}) {
  return await mutate("functions/facts:updateFact", args);
}

export async function bumpAccess(factId: string) {
  return await mutate("functions/facts:bumpAccess", { factId });
}

export async function boostRelevance(args: { factId: string; boost?: number }) {
  return await mutate("functions/facts:boostRelevance", args);
}

export async function markPruned(factIds: string[]) {
  return await mutate("functions/facts:markPruned", { factIds });
}

export async function markFactsMerged(args: { sourceFactIds: string[]; targetFactId: string }) {
  return await mutate("functions/facts:markFactsMerged", args);
}

// ── Delete Operations (Action Parity) ─────────────────

export async function deleteEntity(args: { entityId: string; hardDelete?: boolean }) {
  return await mutate("functions/entities:deleteEntity", args);
}

export async function deleteScope(args: { scopeId: string; hardDelete?: boolean; force?: boolean }) {
  return await mutate("functions/scopes:deleteScope", args);
}

export async function deleteSession(args: { sessionId: string; hardDelete?: boolean }) {
  return await mutate("functions/sessions:deleteSession", args);
}

export async function deleteConversation(args: { conversationId: string; hardDelete?: boolean }) {
  return await mutate("functions/conversations:deleteConversation", args);
}

export async function getConversationsBySession(sessionId: string) {
  return await query("functions/conversations:getBySession", { sessionId });
}

export async function deleteTheme(args: { themeId: string; hardDelete?: boolean }) {
  return await mutate("functions/themes:deleteTheme", args);
}

// ── Scope Management ──────────────────────────────────

export async function addScopeMember(args: { scopeId: string; agentId: string }) {
  return await mutate("functions/scopes:addMember", args);
}

// ── Sessions ──────────────────────────────────────────

export async function createSession(args: {
  agentId: string;
  contextSummary: string;
  parentSession?: string;
  nodeId?: string;
}) {
  return await mutate("functions/sessions:create", args);
}

// ── Conversations ─────────────────────────────────────

export async function createConversation(args: {
  sessionId: string;
  participants: string[];
  contextSummary: string;
  tags: string[];
  importance?: number;
}) {
  return await mutate("functions/conversations:create", args);
}

export async function addFactToConversation(args: { conversationId: string; factId: string }) {
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

// ── Notifications ─────────────────────────────────────

export async function getUnreadNotifications(args: { agentId: string; limit?: number }) {
  return await query("functions/notifications:getUnreadByAgent", args);
}

export async function markNotificationsRead(notificationIds: string[]) {
  for (const notificationId of notificationIds) {
    await mutate("functions/notifications:markRead", { notificationId });
  }
}

export async function markAllNotificationsRead(agentId: string) {
  return await mutate("functions/notifications:markAllRead", { agentId });
}

// ── Recall Feedback ───────────────────────────────────

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

// ── Events ────────────────────────────────────────────

export async function pollEvents(args: {
  agentId: string;
  watermark?: number;
  scopeId?: string;
  limit?: number;
}) {
  return await query("functions/events:poll", args);
}

// ── Config ────────────────────────────────────────────

export async function getConfig(key: string) {
  return await query("functions/config:getConfig", { key });
}

export async function listConfigs(category?: string) {
  return await query("functions/config:listConfigs", { category });
}

export async function setConfig(args: {
  key: string;
  value: string | number | boolean | null;
  category: string;
  description: string;
  updatedBy: string;
}) {
  return await mutate("functions/config:setConfig", args);
}

export async function listScopePolicies(scopeId: string) {
  return await query("functions/config:listScopePolicies", { scopeId });
}

export async function setScopePolicy(args: {
  scopeId: string;
  policyKey: string;
  policyValue: string | number | boolean | null;
  priority?: number;
  createdBy: string;
}) {
  return await mutate("functions/config:setScopePolicy", args);
}

// ── Themes ────────────────────────────────────────────

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

// ── Sync ──────────────────────────────────────────────

export async function getSyncStatus(nodeId: string) {
  return await query("functions/sync:getSyncStatus", { nodeId });
}

// ── Handoffs ──────────────────────────────────────────

export async function getRecentHandoffs(currentAgentId: string, scopeIds: string[], limit?: number) {
  return await query("functions/facts:getRecentHandoffs", { currentAgentId, scopeIds, limit });
}

// ── Signals by Fact ───────────────────────────────────

export async function getSignalsByFact(factId: string) {
  return await query("functions/signals:getByFact", { factId });
}

// ── Stats helpers ──────────────────────────────────────

export async function getStats(agentId: string) {
  const [agent, scopes, sessions] = await Promise.all([
    getAgent(agentId).catch(() => null),
    getPermittedScopes(agentId).catch(() => []),
    getSessionsByAgent(agentId).catch(() => []),
  ]);
  return { agent, scopes, sessions };
}

// ── Agent Identity Context (Phase 3) ──────────────────

export async function getAgentContext(agentId: string) {
  const [agent, scopes, sessions, notifications] = await Promise.all([
    getAgent(agentId).catch(() => null),
    getPermittedScopes(agentId).catch(() => []),
    getSessionsByAgent(agentId).catch(() => []),
    getUnreadNotifications({ agentId, limit: 10 }).catch(() => []),
  ]);

  return {
    identity: {
      agentId: agent?.agentId || agentId,
      name: agent?.name,
      telos: agent?.telos,
      capabilities: agent?.capabilities || [],
      defaultScope: agent?.defaultScope,
      factCount: agent?.factCount || 0,
      lastSeen: agent?.lastSeen,
    },
    scopes: Array.isArray(scopes)
      ? scopes.map((s: any) => ({
          scopeId: s._id,
          name: s.name,
          readPolicy: s.readPolicy,
          writePolicy: s.writePolicy,
          memberCount: s.members?.length || 0,
        }))
      : [],
    activeSessions: Array.isArray(sessions) ? sessions.length : 0,
    unreadNotifications: Array.isArray(notifications) ? notifications.length : 0,
  };
}
