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

// ── Stats helpers ──────────────────────────────────────

export async function getStats(agentId: string) {
  const [agent, scopes, sessions] = await Promise.all([
    getAgent(agentId).catch(() => null),
    getPermittedScopes(agentId).catch(() => []),
    getSessionsByAgent(agentId).catch(() => []),
  ]);
  return { agent, scopes, sessions };
}
