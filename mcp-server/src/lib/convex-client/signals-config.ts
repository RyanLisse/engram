/**
 * Convex HTTP Client — Signals, Config, Events, Conversations, Themes, Sync, Observations
 */

import { query, mutate, action, PATHS } from "./core.js";

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
  return await mutate(PATHS.signals.recordSignal, args);
}

export async function getSignalsByFact(factId: string) {
  return await query(PATHS.signals.getByFact, { factId });
}

// ========================================
// Notifications API
// ========================================

export async function getUnreadNotifications(args: { agentId: string; limit?: number }) {
  return await query(PATHS.notifications.getUnreadByAgent, args);
}

export async function markNotificationsRead(notificationIds: string[]) {
  // Batch mark-read in parallel (max 10 concurrent) instead of sequential N+1
  const BATCH_SIZE = 10;
  for (let i = 0; i < notificationIds.length; i += BATCH_SIZE) {
    const batch = notificationIds.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((notificationId) =>
        mutate(PATHS.notifications.markRead, { notificationId })
      )
    );
  }
}

// ========================================
// Recall Feedback API
// ========================================

export async function recordRecallResult(args: { recallId: string; factIds: string[] }) {
  return await mutate(PATHS.recallFeedback.recordRecall, args);
}

export async function recordRecallUsage(args: {
  recallId: string;
  agentId?: string;
  usedFactIds: string[];
  unusedFactIds?: string[];
}) {
  return await mutate(PATHS.recallFeedback.recordUsage, args);
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
  return await mutate(PATHS.conversations.create, args);
}

export async function addFactToConversation(args: {
  conversationId: string;
  factId: string;
}) {
  return await mutate(PATHS.conversations.addFact, args);
}

export async function addHandoff(args: {
  conversationId: string;
  fromAgent: string;
  toAgent: string;
  contextSummary: string;
}) {
  return await mutate(PATHS.conversations.addHandoff, args);
}

/** Record handoff on a conversation (session end). Uses empty toAgent when not yet known. */
export async function addHandoffToConversation(args: {
  conversationId: string;
  fromAgent: string;
  summary: string;
}) {
  return await mutate(PATHS.conversations.addHandoff, {
    conversationId: args.conversationId,
    fromAgent: args.fromAgent,
    toAgent: "",
    contextSummary: args.summary,
  });
}

export async function deleteConversation(args: { conversationId: string; hardDelete?: boolean }) {
  return await mutate(PATHS.conversations.deleteConversation, args);
}

// ========================================
// Themes API
// ========================================

export async function getThemesByScope(scopeId: string) {
  return await query(PATHS.themes.getByScope, { scopeId });
}

export async function createTheme(args: {
  name: string;
  description: string;
  factIds: string[];
  entityIds: string[];
  scopeId: string;
  importance?: number;
}) {
  return await mutate(PATHS.themes.create, args);
}

export async function updateTheme(args: {
  themeId: string;
  name?: string;
  description?: string;
  factIds?: string[];
  entityIds?: string[];
  importance?: number;
}) {
  return await mutate(PATHS.themes.update, args);
}

export async function deleteTheme(args: { themeId: string; hardDelete?: boolean }) {
  return await mutate(PATHS.themes.deleteTheme, args);
}

// ========================================
// Config API
// ========================================

const configCache = new Map<string, { value: any; expiresAt: number }>();
const CONFIG_TTL_MS = 60 * 60 * 1000;

export async function getConfig(key: string) {
  const hit = configCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await query(PATHS.config.getConfig, { key });
  configCache.set(key, { value, expiresAt: Date.now() + CONFIG_TTL_MS });
  return value;
}

export async function listConfigs(category?: string) {
  const cacheKey = `list:${category ?? "*"}`;
  const hit = configCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await query(PATHS.config.listConfigs, { category });
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
  const result = await mutate(PATHS.config.setConfig, args);
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
  const result = await mutate(PATHS.config.setScopePolicy, args);
  configCache.clear();
  return result;
}

export async function listScopePolicies(scopeId: string) {
  return await query(PATHS.config.listScopePolicies, { scopeId });
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
  return await query(PATHS.events.poll, args);
}

// ========================================
// Sync API
// ========================================

export async function getFactsSince(args: {
  scopeId: string;
  since: number;
  limit?: number;
}) {
  return await query(PATHS.sync.getFactsSince, args);
}

export async function updateSyncLog(args: {
  nodeId: string;
  factsSynced: number;
  status: "ok" | "error" | "syncing";
}) {
  return await mutate(PATHS.sync.updateSyncLog, args);
}

export async function getSyncStatus(nodeId: string) {
  return await query(PATHS.sync.getSyncStatus, { nodeId });
}

// ========================================
// Observation Sessions API
// ========================================

export async function getObservationSession(scopeId: string, agentId: string) {
  return await query(PATHS.facts.getObservationSession, { scopeId, agentId });
}

export async function listObservationSummaries(scopeId: string, agentId: string, limit?: number) {
  return await query(PATHS.facts.listObservationSummariesPublic, { scopeId, agentId, limit });
}

export async function incrementObservationTokens(scopeId: string, agentId: string, tokenDelta: number) {
  return await mutate(PATHS.facts.incrementPendingTokensPublic, { scopeId, agentId, tokenDelta });
}

export async function upsertObservationSession(args: {
  scopeId: string;
  agentId: string;
  observerThreshold?: number;
  reflectorThreshold?: number;
}) {
  return await mutate(PATHS.facts.upsertObservationSessionPublic, args);
}

export async function runObserver(scopeId: string, agentId: string, compressionLevel?: number) {
  return await action(PATHS.actions.observer, { scopeId, agentId, compressionLevel });
}

export async function runReflector(
  scopeId: string,
  agentId: string,
  options?: { timeWindowHours?: number; focusEntities?: string[] }
) {
  return await action(PATHS.actions.reflector, {
    scopeId,
    agentId,
    timeWindowHours: options?.timeWindowHours,
    focusEntities: options?.focusEntities,
  });
}
