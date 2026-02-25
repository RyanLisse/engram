/**
 * Subspace MCP Tools — create, query, list, and consolidate knowledge subspaces.
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { PATHS } from "../lib/convex-paths.js";
import { consolidateEmbeddings } from "../lib/svd-consolidation.js";

// ── Schemas ───────────────────────────────────────────────

export const createSubspaceSchema = z.object({
  name: z.string().describe("Name for the subspace"),
  description: z.string().optional().describe("Description of the semantic cluster"),
  factIds: z.array(z.string()).min(1).describe("Fact IDs to include in this subspace"),
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent's private scope)"),
  k: z.number().optional().describe("Number of principal components to extract (default: 3)"),
});

export const getSubspaceSchema = z.object({
  subspaceId: z.string().describe("Subspace ID to retrieve"),
});

export const listSubspacesSchema = z.object({
  agentId: z.string().optional().describe("Filter by agent ID"),
  scopeId: z.string().optional().describe("Scope ID or name"),
  limit: z.number().optional().describe("Max results (default: 50)"),
});

export const consolidateEmbeddingsSchema = z.object({
  subspaceId: z.string().describe("Subspace ID to recompute SVD for"),
  k: z.number().optional().describe("Number of principal components (default: 3)"),
});

export const querySubspaceSchema = z.object({
  query: z.string().describe("Semantic search query"),
  scopeId: z.string().optional().describe("Scope ID or name to search within"),
  limit: z.number().optional().describe("Max subspaces to return (default: 5)"),
});

// ── Handlers ──────────────────────────────────────────────

export async function createSubspace(
  input: z.infer<typeof createSubspaceSchema>,
  agentId: string,
) {
  try {
    // Resolve scope
    let resolvedScopeId = input.scopeId;
    if (!resolvedScopeId) {
      const scope = await convex.getScopeByName(`private-${agentId}`);
      if (!scope) return { isError: true, message: `Private scope not found for agent ${agentId}` };
      resolvedScopeId = scope._id;
    } else if (!resolvedScopeId.startsWith("j")) {
      const scope = await convex.getScopeByName(resolvedScopeId);
      if (!scope) return { isError: true, message: `Scope "${resolvedScopeId}" not found` };
      resolvedScopeId = scope._id;
    }

    // Fetch fact embeddings
    const facts = await convex.query(PATHS.facts.getByIds, { factIds: input.factIds });
    const withEmbeddings = facts.filter((f: any) => f?.embedding?.length > 0);

    if (withEmbeddings.length === 0) {
      return { isError: true, message: "No facts with embeddings found. Facts may still be enriching." };
    }

    // Run SVD consolidation
    const embeddings = withEmbeddings.map((f: any) => f.embedding);
    const result = consolidateEmbeddings(embeddings, input.k ?? 3);

    // Create the subspace with computed centroid
    const { subspaceId } = await convex.mutate(PATHS.subspaces.createSubspace, {
      name: input.name,
      description: input.description,
      agentId,
      scopeId: resolvedScopeId,
      factIds: input.factIds,
      centroid: result.centroid,
      dimensionality: result.centroid.length,
      variance: result.varianceExplained,
    });

    return {
      subspaceId,
      factCount: withEmbeddings.length,
      varianceExplained: result.varianceExplained,
      componentCount: result.components.length,
      componentVariances: result.componentVariances,
    };
  } catch (error: any) {
    return { isError: true, message: error.message ?? String(error) };
  }
}

export async function getSubspace(
  input: z.infer<typeof getSubspaceSchema>,
  _agentId: string,
) {
  try {
    const subspace = await convex.query(PATHS.subspaces.getSubspace, {
      subspaceId: input.subspaceId,
    });
    if (!subspace) return { isError: true, message: `Subspace not found: ${input.subspaceId}` };
    return {
      ...subspace,
      // Don't return the full centroid vector to save tokens
      centroid: subspace.centroid ? `[${subspace.centroid.length}-dim vector]` : null,
    };
  } catch (error: any) {
    return { isError: true, message: error.message ?? String(error) };
  }
}

export async function listSubspaces(
  input: z.infer<typeof listSubspacesSchema>,
  agentId: string,
) {
  try {
    let resolvedScopeId = input.scopeId;
    if (resolvedScopeId && !resolvedScopeId.startsWith("j")) {
      const scope = await convex.getScopeByName(resolvedScopeId);
      if (!scope) return { isError: true, message: `Scope "${resolvedScopeId}" not found` };
      resolvedScopeId = scope._id;
    }

    const subspaces = await convex.query(PATHS.subspaces.listSubspaces, {
      agentId: input.agentId ?? agentId,
      scopeId: resolvedScopeId,
      limit: input.limit,
    });

    return subspaces.map((s: any) => ({
      _id: s._id,
      name: s.name,
      description: s.description,
      factCount: s.factIds?.length ?? 0,
      variance: s.variance,
      dimensionality: s.dimensionality,
      updatedAt: s.updatedAt,
    }));
  } catch (error: any) {
    return { isError: true, message: error.message ?? String(error) };
  }
}

export async function consolidateEmbeddingsTool(
  input: z.infer<typeof consolidateEmbeddingsSchema>,
  _agentId: string,
) {
  try {
    // Get the subspace
    const subspace = await convex.query(PATHS.subspaces.getSubspace, {
      subspaceId: input.subspaceId,
    });
    if (!subspace) return { isError: true, message: `Subspace not found: ${input.subspaceId}` };

    // Fetch fact embeddings
    const facts = await convex.query(PATHS.facts.getByIds, { factIds: subspace.factIds });
    const withEmbeddings = facts.filter(
      (f: any) => f?.embedding?.length > 0 && f.lifecycleState === "active",
    );

    if (withEmbeddings.length < 2) {
      return { isError: true, message: "Need at least 2 facts with embeddings to consolidate" };
    }

    // Run SVD
    const embeddings = withEmbeddings.map((f: any) => f.embedding);
    const result = consolidateEmbeddings(embeddings, input.k ?? 3);

    // Update the subspace
    await convex.mutate(PATHS.subspaces.updateSubspace, {
      subspaceId: input.subspaceId,
      centroid: result.centroid,
      dimensionality: result.centroid.length,
      variance: result.varianceExplained,
      factIds: withEmbeddings.map((f: any) => f._id),
    });

    return {
      subspaceId: input.subspaceId,
      factCount: withEmbeddings.length,
      varianceExplained: result.varianceExplained,
      componentCount: result.components.length,
      totalVariance: result.totalVariance,
    };
  } catch (error: any) {
    return { isError: true, message: error.message ?? String(error) };
  }
}

export async function querySubspace(
  input: z.infer<typeof querySubspaceSchema>,
  agentId: string,
) {
  try {
    // Embed the query using the same pipeline
    const { generateEmbedding } = await import("../lib/embeddings.js");
    const queryEmbedding = await generateEmbedding(input.query);

    if (!queryEmbedding || queryEmbedding.length === 0) {
      return { isError: true, message: "Failed to generate query embedding" };
    }

    // Resolve scope
    let resolvedScopeId = input.scopeId;
    if (resolvedScopeId && !resolvedScopeId.startsWith("j")) {
      const scope = await convex.getScopeByName(resolvedScopeId);
      if (!scope) return { isError: true, message: `Scope "${resolvedScopeId}" not found` };
      resolvedScopeId = scope._id;
    }

    // Get all subspaces in scope
    const subspaces = await convex.query(PATHS.subspaces.listSubspaces, {
      agentId,
      scopeId: resolvedScopeId,
      limit: 100,
    });

    // Rank by cosine similarity to query embedding
    const { cosineSimilarity } = await import("../lib/svd-consolidation.js");
    const scored = subspaces
      .filter((s: any) => s.centroid?.length > 0)
      .map((s: any) => ({
        _id: s._id,
        name: s.name,
        description: s.description,
        factCount: s.factIds?.length ?? 0,
        variance: s.variance,
        similarity: cosineSimilarity(queryEmbedding, s.centroid),
      }))
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, input.limit ?? 5);

    return { results: scored, queryEmbeddingDim: queryEmbedding.length };
  } catch (error: any) {
    return { isError: true, message: error.message ?? String(error) };
  }
}
