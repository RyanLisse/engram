/**
 * adapter_memory — Doc-to-LoRA integration for Engram
 *
 * Builds adapter-ready memory documents from consolidated facts.
 * Phase 1: Returns dense documents for context injection.
 * Phase 2: Will trigger D2L hypernetwork to generate LoRA adapters.
 *
 * Based on Sakana AI's Doc-to-LoRA (arxiv:2602.15902):
 * "A hypernetwork that meta-learns to perform approximate context
 *  distillation within a single forward pass."
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

// ─── Helper Functions ──────────────────────────────────────────────

async function resolveScopeId(
  scopeId: string | undefined,
  agentId: string
): Promise<string | null> {
  if (scopeId) {
    if (scopeId.startsWith("j") || scopeId.startsWith("k")) return scopeId; // Convex ID
    const scope = await convex.getScopeByName(scopeId);
    return scope?._id ?? null;
  }

  // Default to agent's private scope
  const agent = await convex.getAgentByAgentId(agentId);
  if (agent?.defaultScope) return agent.defaultScope;

  const privateScope = await convex.getScopeByName(`private-${agentId}`);
  return privateScope?._id ?? null;
}

// ─── Schemas ───────────────────────────────────────────────────────

export const buildAdapterDocumentSchema = z.object({
  scopeId: z.string().describe("Memory scope ID or name to consolidate"),
  factTypes: z
    .array(z.string())
    .optional()
    .describe("Filter by fact types (e.g., ['decision', 'insight'])"),
  maxFacts: z
    .number()
    .optional()
    .describe("Maximum facts to include (default: 100)"),
  minImportance: z
    .number()
    .optional()
    .describe("Minimum importance score (default: 0.3)"),
  includeEntities: z
    .boolean()
    .optional()
    .describe("Include entity relationship statements"),
});

export const listMemoryModulesSchema = z.object({
  agentId: z.string().describe("Agent ID to list modules for"),
});

export const buildEntityClusterDocumentSchema = z.object({
  entityId: z.string().describe("Root entity ID for cluster"),
  scopeId: z.string().describe("Memory scope ID or name"),
  maxDepth: z.number().optional().describe("Max relationship hops (default: 1)"),
  maxFacts: z.number().optional().describe("Max facts per cluster (default: 50)"),
});

// ─── Tool Implementations ──────────────────────────────────────────

export async function buildAdapterDocument(
  args: z.infer<typeof buildAdapterDocumentSchema>,
  agentId: string
): Promise<any> {
  const scopeId = await resolveScopeId(args.scopeId, agentId);

  const result = await convex.query("functions/adapterMemory:buildAdapterDocument", {
    scopeId,
    factTypes: args.factTypes,
    maxFacts: args.maxFacts,
    minImportance: args.minImportance,
    includeEntities: args.includeEntities,
  });

  if (!result) {
    return { error: "No facts found for this scope" };
  }

  return {
    document: result.document,
    metadata: {
      factCount: result.factCount,
      entityCount: result.entityCount,
      documentLength: result.documentLength,
      tokenEstimate: result.tokenEstimate,
      generatedAt: result.generatedAt,
    },
    // Phase 2 hint
    d2lCompatible: true,
    internalizationHint:
      "This document is formatted for Doc-to-LoRA internalization. " +
      "Use model.internalize(document) with a D2L-enabled model.",
  };
}

export async function listMemoryModules(
  args: z.infer<typeof listMemoryModulesSchema>,
  _agentId: string
): Promise<any> {
  return await convex.query("functions/adapterMemory:listMemoryModules", {
    agentId: args.agentId,
  });
}

export async function buildEntityClusterDocument(
  args: z.infer<typeof buildEntityClusterDocumentSchema>,
  agentId: string
): Promise<any> {
  const scopeId = await resolveScopeId(args.scopeId, agentId);

  const result = await convex.query(
    "functions/adapterMemory:buildEntityClusterDocument",
    {
      entityId: args.entityId,
      scopeId,
      maxDepth: args.maxDepth,
      maxFacts: args.maxFacts,
    }
  );

  if (!result) {
    return { error: "Entity not found or no facts in cluster" };
  }

  return {
    document: result.document,
    metadata: {
      rootEntity: result.rootEntity,
      clusterSize: result.entityCluster.length,
      factCount: result.factCount,
      tokenEstimate: result.tokenEstimate,
    },
  };
}
