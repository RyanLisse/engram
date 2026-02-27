/**
 * QMD local search (4) entries.
 *
 * Provides BM25, vector, hybrid, and deep (cloud+local fusion) search
 * over vault markdown files via the QMD engine.
 */

import { z } from "zod";
import type { ToolEntry } from "./types.js";
import { QmdManager, type QmdResult } from "../qmd-manager.js";
import * as convex from "../convex-client.js";
import { generateEmbedding } from "../../lib/embeddings.js";

// ── Shared helpers ──────────────────────────────────

/** Pre-flight check: returns an error response object if QMD is unavailable, or null if clear. */
async function guardQmd(): Promise<{ error: true; message: string } | null> {
  const qmd = QmdManager.getInstance();
  if (!qmd.isEnabled()) {
    return { error: true, message: "QMD integration is disabled. Set ENGRAM_QMD_ENABLED=true to enable." };
  }
  const installed = await qmd.isInstalled();
  if (!installed) {
    return { error: true, message: "qmd binary not found on PATH. Install from github.com/tobi/qmd." };
  }
  return null;
}

/** Format QMD search results into a consistent response shape. */
function formatSearchResponse(
  results: QmdResult[],
  searchMode: string,
  queryTimeMs: number,
) {
  return {
    results,
    totalResults: results.length,
    searchMode,
    queryTimeMs,
  };
}

// ── Reciprocal Rank Fusion ──────────────────────────

function reciprocalRankFusion(
  cloudResults: any[],
  localResults: QmdResult[],
  opts: { k?: number; cloudWeight?: number; localWeight?: number },
) {
  const k = opts.k ?? 60;
  const cw = opts.cloudWeight ?? 0.5;
  const lw = opts.localWeight ?? 0.5;
  const scores = new Map<string, any>();

  cloudResults.forEach((r, rank) => {
    const key = r.factId || r._id || r.path;
    const s = scores.get(key) || { ...r, fusedScore: 0, source: "cloud" };
    s.fusedScore += cw / (k + rank + 1);
    s.cloudScore = r.score ?? r.relevanceScore;
    scores.set(key, s);
  });

  localResults.forEach((r, rank) => {
    const key = r.factId || r.path;
    const existing = scores.get(key);
    if (existing) {
      existing.fusedScore += lw / (k + rank + 1);
      existing.localScore = r.score;
      existing.source = "both";
    } else {
      scores.set(key, {
        ...r,
        fusedScore: lw / (k + rank + 1),
        localScore: r.score,
        source: "local",
      });
    }
  });

  return [...scores.values()].sort((a, b) => b.fusedScore - a.fusedScore);
}

// ── Tool entries ────────────────────────────────────

export const entries: readonly ToolEntry[] = [
  // ── memory_local_search (BM25) ──────────────────
  {
    tool: {
      name: "memory_local_search",
      description:
        "BM25 full-text keyword search across local vault files via QMD. Fast, precise for exact terms.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (default: 10)" },
          minScore: { type: "number", description: "Minimum relevance score (default: 0.2)" },
          scope: { type: "string", description: "Filter by scope path prefix" },
        },
        required: ["query"],
      },
    },
    zodSchema: z.object({
      query: z.string(),
      limit: z.number().optional().default(10),
      minScore: z.number().optional().default(0.2),
      scope: z.string().optional(),
    }),
    handler: async (args) => {
      const guard = await guardQmd();
      if (guard) return guard;

      const start = Date.now();
      const result = await QmdManager.getInstance().search(args.query, "search", {
        limit: args.limit,
        minScore: args.minScore,
        scope: args.scope,
      });

      if (!result.ok) return { error: true, message: result.error.message };
      return formatSearchResponse(result.value, "bm25", Date.now() - start);
    },
  },

  // ── memory_local_vsearch (vector) ───────────────
  {
    tool: {
      name: "memory_local_vsearch",
      description:
        "Semantic vector search across local vault files using on-device embeddings via QMD.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (default: 10)" },
          minScore: { type: "number", description: "Minimum relevance score (default: 0.2)" },
          scope: { type: "string", description: "Filter by scope path prefix" },
        },
        required: ["query"],
      },
    },
    zodSchema: z.object({
      query: z.string(),
      limit: z.number().optional().default(10),
      minScore: z.number().optional().default(0.2),
      scope: z.string().optional(),
    }),
    handler: async (args) => {
      const guard = await guardQmd();
      if (guard) return guard;

      const start = Date.now();
      const result = await QmdManager.getInstance().search(args.query, "vsearch", {
        limit: args.limit,
        minScore: args.minScore,
        scope: args.scope,
      });

      if (!result.ok) return { error: true, message: result.error.message };
      return formatSearchResponse(result.value, "vector", Date.now() - start);
    },
  },

  // ── memory_local_query (hybrid + reranking) ─────
  {
    tool: {
      name: "memory_local_query",
      description:
        "Hybrid search with LLM reranking across local vault files via QMD. Combines BM25 + vector + query expansion + reranking. Most accurate local search.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (default: 10)" },
          minScore: { type: "number", description: "Minimum relevance score (default: 0.2)" },
          scope: { type: "string", description: "Filter by scope path prefix" },
          full: { type: "boolean", description: "Return full document content (default: false)" },
        },
        required: ["query"],
      },
    },
    zodSchema: z.object({
      query: z.string(),
      limit: z.number().optional().default(10),
      minScore: z.number().optional().default(0.2),
      scope: z.string().optional(),
      full: z.boolean().optional().default(false),
    }),
    handler: async (args) => {
      const guard = await guardQmd();
      if (guard) return guard;

      const start = Date.now();
      const result = await QmdManager.getInstance().search(args.query, "query", {
        limit: args.limit,
        minScore: args.minScore,
        scope: args.scope,
        full: args.full,
      });

      if (!result.ok) return { error: true, message: result.error.message };
      return formatSearchResponse(result.value, "hybrid", Date.now() - start);
    },
  },

  // ── memory_deep_search (cloud + local fusion) ───
  {
    tool: {
      name: "memory_deep_search",
      description:
        "Deep search combining Engram cloud semantic search with QMD local hybrid search. Fuses results using Reciprocal Rank Fusion for maximum recall and precision.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (default: 10)" },
          minScore: { type: "number", description: "Minimum relevance score (default: 0.3)" },
          scope: { type: "string", description: "Filter by scope path prefix" },
          weights: {
            type: "object",
            description: "Fusion weights for cloud vs local results",
            properties: {
              cloud: { type: "number", description: "Cloud weight (default: 0.5)" },
              local: { type: "number", description: "Local weight (default: 0.5)" },
            },
          },
        },
        required: ["query"],
      },
    },
    zodSchema: z.object({
      query: z.string(),
      limit: z.number().optional().default(10),
      minScore: z.number().optional().default(0.3),
      scope: z.string().optional(),
      weights: z
        .object({
          cloud: z.number().optional().default(0.5),
          local: z.number().optional().default(0.5),
        })
        .optional(),
    }),
    handler: async (args, agentId) => {
      const start = Date.now();
      const limit = args.limit ?? 10;
      const cloudWeight = args.weights?.cloud ?? 0.5;
      const localWeight = args.weights?.local ?? 0.5;

      // Run cloud and local searches in parallel, gracefully degrading on failure
      const [cloudResult, localResult] = await Promise.allSettled([
        // Cloud: generate embedding then vector search via Convex
        (async () => {
          const embedding = await generateEmbedding(args.query, "search_query");
          const scopeIds = args.scope ? [args.scope] : [];
          return await convex.vectorRecall({
            embedding,
            scopeIds,
            agentId,
            limit,
          });
        })(),
        // Local: QMD hybrid query
        (async () => {
          const qmd = QmdManager.getInstance();
          if (!qmd.isEnabled()) return [];
          const installed = await qmd.isInstalled();
          if (!installed) return [];
          const result = await qmd.search(args.query, "query", {
            limit,
            minScore: args.minScore,
            scope: args.scope,
          });
          return result.ok ? result.value : [];
        })(),
      ]);

      const cloudResults: any[] =
        cloudResult.status === "fulfilled" ? (cloudResult.value as any[]) : [];
      const localResults: QmdResult[] =
        localResult.status === "fulfilled" ? (localResult.value as QmdResult[]) : [];

      // Fuse using Reciprocal Rank Fusion
      const fused = reciprocalRankFusion(cloudResults, localResults, {
        cloudWeight,
        localWeight,
      });

      // Deduplicate by factId (keep highest fusedScore)
      const seen = new Set<string>();
      const deduped = fused.filter((r) => {
        if (!r.factId) return true; // Keep results without factId
        if (seen.has(r.factId)) return false;
        seen.add(r.factId);
        return true;
      });

      // Apply limit
      const limited = deduped.slice(0, limit);

      return {
        results: limited,
        sources: {
          cloud: {
            count: cloudResults.length,
            available: cloudResult.status === "fulfilled",
          },
          local: {
            count: localResults.length,
            available: localResult.status === "fulfilled",
          },
        },
        searchMode: "deep",
        queryTimeMs: Date.now() - start,
      };
    },
  },
];
