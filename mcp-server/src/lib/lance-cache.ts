import { LanceSyncDaemon, type LanceSearchResult } from "./lance-sync.js";

/**
 * In-process singleton cache layer for LanceDB.
 * Gated by ENGRAM_LANCE_PATH env var. When set, provides local vector search
 * as a fast fallback/supplement to Convex vector search.
 */

const LANCE_PATH = process.env.ENGRAM_LANCE_PATH;
let _instance: LanceSyncDaemon | null = null;
let _initPromise: Promise<void> | null = null;

export function isLanceCacheEnabled(): boolean {
  return !!LANCE_PATH;
}

export async function getLanceCache(): Promise<LanceSyncDaemon | null> {
  if (!LANCE_PATH) return null;
  if (_instance) return _instance;
  if (_initPromise) {
    await _initPromise;
    return _instance;
  }

  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    console.error("[lance-cache] CONVEX_URL not set, cache disabled");
    return null;
  }

  _initPromise = (async () => {
    try {
      const daemon = new LanceSyncDaemon({
        convexUrl,
        agentId: process.env.ENGRAM_AGENT_ID || "default",
        dbPath: LANCE_PATH,
      });
      await daemon.start();
      _instance = daemon; // Only assign after fully started
    } catch (err) {
      console.error("[lance-cache] Failed to initialize:", err);
      _instance = null;
      _initPromise = null; // Allow retry on transient failures
    }
  })();
  await _initPromise;
  return _instance;
}

/**
 * Get cache freshness for a scope (0.0 = stale, 1.0 = just synced).
 * Based on time since last successful sync.
 */
export function getCacheFreshness(lastSyncTimestamp: number): number {
  const ageMs = Date.now() - lastSyncTimestamp;
  const FRESH_MS = 60_000; // < 1 min = fully fresh
  const STALE_MS = 600_000; // > 10 min = fully stale
  if (ageMs <= FRESH_MS) return 1.0;
  if (ageMs >= STALE_MS) return 0.0;
  return 1.0 - (ageMs - FRESH_MS) / (STALE_MS - FRESH_MS);
}

export interface LocalCacheResult {
  _id: string;
  content: string;
  _score: number;
  _source: "local-cache";
  factType: string;
  scopeId: string;
  importanceScore: number;
  relevanceScore: number;
  lifecycleState: string;
  timestamp: number;
  createdBy: string;
  entityIds: string[];
  tags: string[];
}

/**
 * Search the local LanceDB cache. Returns results tagged with source.
 * Returns empty array if cache unavailable or unhealthy.
 */
export async function searchLocalCache(
  embedding: number[],
  limit: number,
  scopeId?: string,
): Promise<LocalCacheResult[]> {
  const cache = await getLanceCache();
  if (!cache) return [];

  try {
    const results: LanceSearchResult[] = await cache.search(embedding, limit, scopeId);
    return results.map((r) => ({
      ...r,
      _id: r.id,
      _score: r._distance ? 1 / (1 + r._distance) : 0, // Convert L2 distance to similarity score
      _source: "local-cache" as const,
      entityIds: typeof r.entityIds === "string" ? JSON.parse(r.entityIds) : (r.entityIds ?? []),
      tags: typeof r.tags === "string" ? JSON.parse(r.tags) : (r.tags ?? []),
    }));
  } catch (err) {
    console.error("[lance-cache] Search failed:", err);
    return [];
  }
}
