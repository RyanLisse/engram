/**
 * Context primitives — decomposed from memory_get_context
 *
 * memory_resolve_scopes     — scope name→ID + permitted scope discovery
 * memory_load_budgeted_facts — token-budget-aware fact loading
 * memory_search_daily_notes — vault daily notes search
 * memory_get_graph_neighbors — find facts connected via shared entities
 * memory_get_activity_stats — agent activity tracking (factsStoredToday, recallsToday)
 * memory_get_workspace_info — other agents, shared scope stats
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { loadBudgetAwareContext, detectQueryIntent } from "../lib/budget-aware-loader.js";
import fs from "node:fs/promises";
import path from "node:path";

// ── memory_resolve_scopes ───────────────────────────

export const resolveScopesSchema = z.object({
  scopeId: z.string().optional().describe("Scope name or ID to resolve (omit for all permitted scopes)"),
  agentId: z.string().optional().describe("Agent ID (defaults to current agent)"),
});

export async function resolveScopes(
  input: z.infer<typeof resolveScopesSchema>,
  currentAgentId: string
): Promise<{ scopeIds: string[]; resolved: Array<{ name?: string; id: string }> } | { isError: true; message: string }> {
  const agentId = input.agentId ?? currentAgentId;

  if (input.scopeId) {
    // Name provided — resolve to ID
    if (!input.scopeId.startsWith("j")) {
      const scope = await convex.getScopeByName(input.scopeId);
      if (!scope) {
        return { isError: true, message: `Scope "${input.scopeId}" not found` };
      }
      return { scopeIds: [scope._id], resolved: [{ name: input.scopeId, id: scope._id }] };
    }
    // Already an ID
    return { scopeIds: [input.scopeId], resolved: [{ id: input.scopeId }] };
  }

  // Get all permitted scopes
  const permitted = await convex.getPermittedScopes(agentId);
  if (!permitted || !Array.isArray(permitted)) {
    return { scopeIds: [], resolved: [] };
  }
  return {
    scopeIds: permitted.map((s: any) => s._id),
    resolved: permitted.map((s: any) => ({ name: s.name, id: s._id })),
  };
}

// ── memory_load_budgeted_facts ──────────────────────

export const loadBudgetedFactsSchema = z.object({
  query: z.string().describe("Topic or search query"),
  tokenBudget: z.number().optional().default(4000).describe("Max token budget"),
  scopeId: z.string().optional().describe("Scope ID to search within"),
  maxFacts: z.number().optional().default(20).describe("Maximum facts to load"),
  profile: z.enum(["default", "planning", "incident", "handoff"]).optional().default("default").describe("Context profile"),
});

export async function loadBudgetedFacts(input: z.infer<typeof loadBudgetedFactsSchema>) {
  const profileBudgetMultiplier =
    input.profile === "incident" ? 0.8 : input.profile === "planning" ? 1.1 : 1;

  const budgeted = await loadBudgetAwareContext({
    query: input.query,
    tokenBudget: Math.floor(input.tokenBudget * profileBudgetMultiplier),
    scopeId: input.scopeId,
    maxFacts: input.maxFacts,
  });

  let facts = budgeted.facts.map((item) => item.fact);

  if (input.profile === "incident") {
    facts = facts
      .filter((f: any) => f.observationTier !== "background")
      .sort((a: any, b: any) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0));
  }
  if (input.profile === "handoff") {
    facts = facts.filter((f: any) => f.factType === "session_summary" || f.factType === "decision");
  }

  return {
    facts,
    usedTokens: budgeted.usedTokens,
    tokenBudget: budgeted.tokenBudget,
    strategy: budgeted.strategy,
    queryIntent: detectQueryIntent(input.query),
    profile: input.profile,
    count: facts.length,
  };
}

// ── memory_search_daily_notes ───────────────────────

export const searchDailyNotesSchema = z.object({
  query: z.string().describe("Text to search for in daily notes"),
  maxFiles: z.number().optional().default(5).describe("Maximum files to scan"),
  snippetLength: z.number().optional().default(160).describe("Max snippet characters"),
});

export async function searchDailyNotes(input: z.infer<typeof searchDailyNotesSchema>) {
  const vaultRoot = process.env.VAULT_ROOT || path.resolve(process.cwd(), "..", "vault");
  const dailyDir = path.join(vaultRoot, "daily");
  const results: Array<{ path: string; snippet: string }> = [];

  try {
    const files = await fs.readdir(dailyDir);
    for (const file of files.filter((f) => f.endsWith(".md")).slice(0, input.maxFiles)) {
      const fullPath = path.join(dailyDir, file);
      const content = await fs.readFile(fullPath, "utf8");
      if (!content.toLowerCase().includes(input.query.toLowerCase())) continue;
      results.push({
        path: path.relative(vaultRoot, fullPath),
        snippet: content.replace(/\s+/g, " ").slice(0, input.snippetLength),
      });
    }
  } catch {
    // daily notes directory not present
  }

  return { notes: results, count: results.length, vaultRoot };
}

// ── memory_get_graph_neighbors ──────────────────────

export const getGraphNeighborsSchema = z.object({
  entityIds: z.array(z.string()).describe("Entity IDs to find connected facts for"),
  scopeIds: z.array(z.string()).optional().describe("Scope IDs to search within"),
  limit: z.number().optional().default(20).describe("Maximum results"),
});

export async function getGraphNeighbors(input: z.infer<typeof getGraphNeighborsSchema>) {
  const entitySet = new Set(input.entityIds);

  // Search for facts that reference any of the provided entities
  const allFacts: any[] = [];
  for (const entityId of input.entityIds) {
    const results = await convex.searchFacts({
      query: entityId,
      limit: input.limit,
      scopeIds: input.scopeIds,
    });
    if (Array.isArray(results)) {
      allFacts.push(...results);
    }
  }

  // Deduplicate and filter to facts with entity overlap
  const seen = new Set<string>();
  const neighbors = allFacts.filter((fact: any) => {
    if (seen.has(fact._id)) return false;
    seen.add(fact._id);
    const factEntities = fact.entityIds ?? [];
    return factEntities.some((id: string) => entitySet.has(id));
  }).slice(0, input.limit);

  return { neighbors, count: neighbors.length };
}

// ── memory_get_activity_stats ───────────────────────

export const getActivityStatsSchema = z.object({
  agentId: z.string().optional().describe("Agent ID (defaults to current agent)"),
  periodHours: z.number().optional().default(24).describe("Lookback period in hours"),
});

export async function getActivityStats(
  input: z.infer<typeof getActivityStatsSchema>,
  currentAgentId: string
) {
  const agentId = input.agentId ?? currentAgentId;
  const since = Date.now() - (input.periodHours * 60 * 60 * 1000);

  // Poll events to count activity
  const events = await convex.pollEvents({
    agentId,
    watermark: since,
    limit: 1000,
  });

  const eventList = events?.events ?? [];
  const factsStored = eventList.filter((e: any) => e.type === "fact_stored" || e.type === "fact_created").length;
  const recalls = eventList.filter((e: any) => e.type === "recall" || e.type === "search").length;
  const signals = eventList.filter((e: any) => e.type === "signal_recorded").length;
  const handoffs = eventList.filter((e: any) => e.type === "session_ended" || e.type === "handoff").length;

  return {
    agentId,
    periodHours: input.periodHours,
    factsStored,
    recalls,
    signals,
    handoffs,
    totalEvents: eventList.length,
  };
}

// ── memory_get_workspace_info ───────────────────────

export const getWorkspaceInfoSchema = z.object({
  agentId: z.string().optional().describe("Agent ID (defaults to current agent)"),
});

export async function getWorkspaceInfo(
  input: z.infer<typeof getWorkspaceInfoSchema>,
  currentAgentId: string
) {
  const agentId = input.agentId ?? currentAgentId;

  // List all registered agents
  const agents = await convex.listAgents();
  const agentList = Array.isArray(agents) ? agents : [];

  // Get shared scopes
  const scopes = await convex.getPermittedScopes(agentId);
  const scopeList = Array.isArray(scopes) ? scopes : [];

  const sharedScopes = scopeList.filter((s: any) =>
    s.members && Array.isArray(s.members) && s.members.length > 1
  );

  return {
    agents: agentList.map((a: any) => ({
      agentId: a.agentId,
      name: a.name,
      capabilities: a.capabilities ?? [],
      telos: a.telos,
      lastActiveAt: a.lastActiveAt,
    })),
    agentCount: agentList.length,
    scopes: scopeList.map((s: any) => ({
      id: s._id,
      name: s.name,
      memberCount: s.members?.length ?? 0,
    })),
    sharedScopeCount: sharedScopes.length,
    totalScopeCount: scopeList.length,
  };
}
