/**
 * Convex HTTP Client — Agents, Scopes, and Sessions domain
 */

import { query, mutate, action, PATHS } from "./core.js";

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
  return await mutate(PATHS.agents.register, args);
}

export async function embedAgentCapabilities(agentId: string) {
  return await action(PATHS.actions.embedAgentCapabilities, { agentId });
}

export async function getAgentByAgentId(agentId: string) {
  return await query(PATHS.agents.getByAgentId, { agentId });
}

export async function listAgents() {
  return await query(PATHS.agents.list, {});
}

export async function updateAgent(args: {
  agentId: string;
  name?: string;
  capabilities?: string[];
  defaultScope?: string;
  telos?: string;
  settings?: unknown;
}) {
  return await mutate(PATHS.agents.updateAgent, args);
}

// ========================================
// Scopes API
// ========================================

const scopeCache = new Map<string, { value: any; expiresAt: number }>();
const SCOPE_TTL_MS = 5 * 60 * 1000; // 5 min TTL — scopes rarely change

export async function getScopeByName(name: string) {
  const cacheKey = `scope:name:${name}`;
  const hit = scopeCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await query(PATHS.scopes.getByName, { name });
  scopeCache.set(cacheKey, { value, expiresAt: Date.now() + SCOPE_TTL_MS });
  return value;
}

export async function getPermittedScopes(agentId: string) {
  const cacheKey = `scope:permitted:${agentId}`;
  const hit = scopeCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await query(PATHS.scopes.getPermitted, { agentId });
  scopeCache.set(cacheKey, { value, expiresAt: Date.now() + SCOPE_TTL_MS });
  return value;
}

export async function deleteScope(args: { scopeId: string; hardDelete?: boolean; force?: boolean }) {
  scopeCache.clear();
  return await mutate(PATHS.scopes.deleteScope, args);
}

export async function createScope(args: {
  name: string;
  description: string;
  members: string[];
  readPolicy: string;
  writePolicy: string;
  retentionDays?: number;
}) {
  scopeCache.clear();
  return await mutate(PATHS.scopes.create, args);
}

export async function addScopeMember(args: {
  scopeId: string;
  agentId: string;
}) {
  scopeCache.clear();
  return await mutate(PATHS.scopes.addMember, args);
}

export async function listScopes(agentId: string) {
  return await query(PATHS.scopes.getPermitted, { agentId });
}

export async function deleteSubspace(args: { subspaceId: string }) {
  return await mutate(PATHS.subspaces.deleteSubspace, args);
}

// ========================================
// Agent Knowledge Profiles API
// ========================================

export async function learnAgentProfile(args: {
  agentId: string;
  scopeId: string;
  usedFactIds: string[];
}): Promise<{ learned: boolean; reason?: string; profileId?: string; axisWeights?: number[]; learnedFrom?: number }> {
  return await mutate(PATHS.agentProfiles.learn, args);
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
  return await mutate(PATHS.sessions.create, args);
}

export async function getSessionsByAgent(agentId: string) {
  return await query(PATHS.sessions.getByAgent, { agentId });
}

export async function deleteSession(args: { sessionId: string; hardDelete?: boolean }) {
  return await mutate(PATHS.sessions.deleteSession, args);
}
