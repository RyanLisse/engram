/**
 * Convex HTTP Client — Facts domain
 */

import { query, mutate, action, PATHS } from "./core.js";

export async function storeFact(args: {
  content: string;
  source?: string;
  createdBy: string;
  scopeId: string;
  factType?: string;
  entityIds?: string[];
  tags?: string[];
  emotionalContext?: string;
  emotionalWeight?: number;
  conversationId?: string;
  pinned?: boolean;
  summary?: string;
}) {
  return await mutate(PATHS.facts.storeFact, args);
}

export async function getUnmirroredFacts(args: {
  scopeId?: string;
  limit?: number;
}) {
  return await query(PATHS.facts.getUnmirrored, args);
}

export async function updateVaultPath(args: {
  factId: string;
  vaultPath: string;
  vaultSyncedAt?: number;
}) {
  return await mutate(PATHS.facts.updateVaultPath, args);
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
  return await mutate(PATHS.facts.applyVaultEdit, args);
}

export async function runReconcileFromVault(args: { filePath: string }) {
  return await action(PATHS.actions.reconcileFromVault, args);
}

export async function classifyObservation(args: { factId: string }) {
  return await action(PATHS.actions.classifyObservation, args);
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
  return await query(PATHS.facts.searchFacts, convexArgs);
}

export async function searchFactsMulti(args: {
  query: string;
  scopeIds: string[];
  factType?: string;
  createdBy?: string;
  limit?: number;
}) {
  return await query(PATHS.facts.searchFactsMulti, args);
}

export async function vectorRecall(args: {
  embedding: number[];
  scopeIds: string[];
  agentId?: string;
  limit?: number;
}) {
  // vectorRecall is an action (ctx.vectorSearch is action-only in Convex)
  // Lives at actions/vectorSearch:vectorRecallAction — NOT a query
  return await action(PATHS.actions.vectorRecallAction, args);
}

export async function listFactsByScope(args: {
  scopeId: string;
  limit?: number;
}) {
  return await query(PATHS.facts.listByScopePublic, args);
}

export async function getPinnedFacts(args: { scopeId: string }) {
  return await query(PATHS.facts.getPinnedFacts, args);
}

export async function listPinnedByScope(args: {
  scopeId: string;
  limit?: number;
}) {
  return await query(PATHS.facts.listPinnedByScope, args);
}

export async function getFact(factId: string) {
  return await query(PATHS.facts.getFact, { factId });
}

export async function updateFact(args: {
  factId: string;
  content?: string;
  tags?: string[];
  factType?: string;
  pinned?: boolean;
  summary?: string;
}) {
  return await mutate(PATHS.facts.updateFact, args);
}

export async function archiveFactPublic(factId: string) {
  return await mutate(PATHS.facts.archiveFactPublic, { factId });
}

export async function boostRelevance(args: { factId: string; boost?: number }) {
  return await mutate(PATHS.facts.boostRelevance, args);
}

export async function bumpAccess(factId: string) {
  return await mutate(PATHS.facts.bumpAccess, { factId });
}

export async function bumpAccessBatch(factIds: string[]) {
  return await mutate(PATHS.facts.bumpAccessBatch, { factIds });
}

export async function getRecentHandoffs(
  currentAgentId: string,
  scopeIds: string[],
  limit?: number
) {
  return await query(PATHS.facts.getRecentHandoffs, {
    currentAgentId,
    scopeIds,
    limit,
  });
}

export async function markPruned(factIds: string[]) {
  return await mutate(PATHS.facts.markPruned, { factIds });
}

export async function listStaleFacts(args: {
  scopeId?: string;
  olderThanDays?: number;
  limit?: number;
}) {
  return await query(PATHS.facts.listStaleFacts, args);
}

export async function markFactsMerged(args: {
  sourceFactIds: string[];
  targetFactId: string;
}) {
  return await mutate(PATHS.facts.markFactsMerged, args);
}

export async function getFactVersions(args: {
  factId: string;
  limit?: number;
}) {
  return await query(PATHS.facts.getVersions, args);
}

export async function createVersionSnapshot(args: {
  factId: string;
  previousContent: string;
  previousImportance?: number;
  previousTags?: string[];
  changedBy: string;
  changeType: string;
  reason?: string;
}) {
  return await mutate(PATHS.facts.createVersion, args);
}

export async function searchByQA(args: {
  query: string;
  scopeIds: string[];
  factType?: string;
  limit?: number;
}) {
  return await query(PATHS.facts.searchByQA, args);
}
