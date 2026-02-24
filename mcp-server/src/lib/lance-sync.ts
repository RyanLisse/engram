import { ConvexHttpClient } from "convex/browser";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PATHS } from "./convex-paths.js";

// LanceDB sync daemon - pulls facts from Convex, stores locally
// Uses @lancedb/lancedb async API with mergeInsert for upserts

interface SyncConfig {
  convexUrl: string;
  agentId: string;
  syncIntervalMs: number; // default 30000 (30s)
  dbPath: string; // default "./engram-lance"
}

interface SyncState {
  lastSyncTimestamp: number;
  factsSynced: number;
  status: "idle" | "syncing" | "error";
  errorMessage?: string;
}

interface CursorData {
  lastSyncTimestamp: number;
  nodeId: string;
}

export interface LanceSearchResult {
  id: string;
  content: string;
  factType: string;
  scopeId: string;
  importanceScore: number;
  relevanceScore: number;
  lifecycleState: string;
  timestamp: number;
  createdBy: string;
  entityIds: string;
  tags: string;
  _distance?: number;
}

// Backoff constants
const BACKOFF_BASE_MS = 30_000; // 30s base interval
const BACKOFF_MAX_MS = 5 * 60_000; // max 5 minutes
const BACKOFF_IDLE_THRESHOLD = 3; // consecutive empty syncs before backing off

export class LanceSyncDaemon {
  private config: SyncConfig;
  private state: SyncState;
  private convex: ConvexHttpClient;
  private intervalId?: ReturnType<typeof setTimeout>;
  private db: unknown; // LanceDB connection (lazy init)
  private table: unknown; // LanceDB table handle (lazy init)
  private consecutiveEmptySyncs = 0;
  private currentIntervalMs: number;

  constructor(config: Partial<SyncConfig> & { convexUrl: string; agentId: string }) {
    this.config = {
      syncIntervalMs: BACKOFF_BASE_MS,
      dbPath: "./engram-lance",
      ...config,
    };
    this.currentIntervalMs = this.config.syncIntervalMs;
    this.state = {
      lastSyncTimestamp: 0,
      factsSynced: 0,
      status: "idle",
    };
    this.convex = new ConvexHttpClient(this.config.convexUrl);
  }

  async start(): Promise<void> {
    console.error(`[lance-sync] Starting sync daemon (base interval: ${this.config.syncIntervalMs}ms)`);
    this.restoreCursor();
    await this.initDb();
    await this.syncAndSchedule();
  }

  private get cursorPath(): string {
    return join(this.config.dbPath, ".lance-cursor.json");
  }

  private restoreCursor(): void {
    try {
      const raw = readFileSync(this.cursorPath, "utf-8");
      const cursor: CursorData = JSON.parse(raw);
      if (cursor.lastSyncTimestamp > 0) {
        this.state.lastSyncTimestamp = cursor.lastSyncTimestamp;
        console.error(`[lance-sync] Restored cursor: lastSync=${new Date(cursor.lastSyncTimestamp).toISOString()}`);
      }
    } catch {
      // No cursor file or invalid — start from 0
    }
  }

  private persistCursor(): void {
    try {
      mkdirSync(this.config.dbPath, { recursive: true });
      const cursor: CursorData = {
        lastSyncTimestamp: this.state.lastSyncTimestamp,
        nodeId: `lance-${this.config.agentId}`,
      };
      writeFileSync(this.cursorPath, JSON.stringify(cursor, null, 2));
    } catch (err) {
      console.error("[lance-sync] Failed to persist cursor:", err);
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = undefined;
    }
    console.error("[lance-sync] Sync daemon stopped");
  }

  /**
   * Run a sync then schedule the next one with backoff.
   * Backs off up to 5 min when consecutive empty syncs reach threshold.
   * Resets to base interval as soon as new facts are found.
   */
  private async syncAndSchedule(): Promise<void> {
    const synced = await this.syncOnce();

    if (synced > 0) {
      // Facts found — reset to base interval
      this.consecutiveEmptySyncs = 0;
      this.currentIntervalMs = this.config.syncIntervalMs;
    } else {
      // No new facts — apply backoff
      this.consecutiveEmptySyncs++;
      if (this.consecutiveEmptySyncs >= BACKOFF_IDLE_THRESHOLD) {
        this.currentIntervalMs = Math.min(
          this.currentIntervalMs * 2,
          BACKOFF_MAX_MS
        );
        console.error(
          `[lance-sync] Idle backoff: ${this.consecutiveEmptySyncs} empty syncs → next in ${Math.round(this.currentIntervalMs / 1000)}s`
        );
      }
    }

    this.intervalId = setTimeout(() => this.syncAndSchedule(), this.currentIntervalMs);
  }

  private async initDb(): Promise<void> {
    try {
      // Dynamic import for LanceDB (optional dependency)
      // @ts-ignore - LanceDB is an optional dependency
      const lancedb = await import("@lancedb/lancedb");
      this.db = await lancedb.connect(this.config.dbPath);

      // Check if table exists, create if not
      const dbHandle = this.db as { tableNames: () => Promise<string[]>; openTable: (name: string) => Promise<unknown> };
      const tables = await dbHandle.tableNames();
      if (tables.includes("facts")) {
        this.table = await dbHandle.openTable("facts");
      }
      // Table will be created on first sync with data

      console.error("[lance-sync] LanceDB initialized at", this.config.dbPath);
    } catch (err) {
      console.error("[lance-sync] LanceDB not available, sync disabled:", err);
      this.state.status = "error";
      this.state.errorMessage = "LanceDB not installed";
    }
  }

  /**
   * Run a single sync cycle. Returns the number of facts synced.
   * Handles partial failures per-scope so one bad scope doesn't block others.
   */
  async syncOnce(): Promise<number> {
    if (this.state.status === "error" && this.state.errorMessage === "LanceDB not installed") return 0;

    this.state.status = "syncing";
    let totalSynced = 0;
    const scopeErrors: string[] = [];

    try {
      // Get agent's permitted scopes
      const scopes = await this.convex.query(PATHS.scopes.getPermitted as any, {
        agentId: this.config.agentId,
      }) as Array<{ _id: string }>;

      for (const scope of scopes) {
        try {
          // Get facts since last sync
          const facts = await this.convex.query(PATHS.sync.getFactsSince as any, {
            scopeId: scope._id,
            since: this.state.lastSyncTimestamp,
            limit: 100,
          }) as Array<{ _id: string; content: string; embedding?: number[]; factType: string; scopeId: string; importanceScore: number; relevanceScore: number; lifecycleState: string; timestamp: number; createdBy: string; entityIds?: string[]; tags?: string[] }>;

          if (facts.length > 0 && this.db) {
            // Filter facts that have embeddings
            const factsWithEmbeddings = facts.filter((f) => f.embedding && f.embedding.length > 0);

            if (factsWithEmbeddings.length > 0) {
              const records = factsWithEmbeddings.map((f) => ({
                id: f._id,
                content: f.content,
                vector: f.embedding!,
                factType: f.factType,
                scopeId: f.scopeId,
                importanceScore: f.importanceScore,
                relevanceScore: f.relevanceScore,
                lifecycleState: f.lifecycleState,
                timestamp: f.timestamp,
                createdBy: f.createdBy,
                entityIds: JSON.stringify(f.entityIds ?? []),
                tags: JSON.stringify(f.tags ?? []),
              }));

              const db = this.db as { createTable: (name: string, records: unknown[]) => Promise<unknown> };
              const table = this.table as { mergeInsert: (key: string) => { whenMatchedUpdateAll: () => { whenNotMatchedInsertAll: () => { execute: (records: unknown[]) => Promise<void> } } } } | null;
              if (!table) {
                this.table = await db.createTable("facts", records);
              } else {
                // mergeInsert for upserts
                await table.mergeInsert("id")
                  .whenMatchedUpdateAll()
                  .whenNotMatchedInsertAll()
                  .execute(records);
              }
              totalSynced += factsWithEmbeddings.length;
            }
          }
        } catch (scopeErr) {
          // Partial failure — log and continue with other scopes
          scopeErrors.push(`scope ${scope._id}: ${String(scopeErr)}`);
          console.error(`[lance-sync] Error syncing scope ${scope._id}:`, scopeErr);
        }
      }

      this.state.factsSynced += totalSynced;
      this.state.status = scopeErrors.length > 0 ? "error" : "idle";
      if (scopeErrors.length > 0) {
        this.state.errorMessage = `Partial failure: ${scopeErrors.join("; ")}`;
      } else {
        this.state.errorMessage = undefined;
      }

      // Only advance cursor if at least some facts were synced or no errors occurred
      // Prevents permanently skipping facts after transient failures
      if (scopeErrors.length === 0 || totalSynced > 0) {
        this.state.lastSyncTimestamp = Date.now();
        this.persistCursor();
      }

      // Update sync log in Convex
      await this.convex.mutation(PATHS.sync.updateSyncLog as any, {
        nodeId: `lance-${this.config.agentId}`,
        factsSynced: totalSynced,
        status: scopeErrors.length > 0 ? "error" : "ok",
      });

      if (totalSynced > 0) {
        console.error(`[lance-sync] Synced ${totalSynced} facts`);
      }
    } catch (err) {
      this.state.status = "error";
      this.state.errorMessage = String(err);
      console.error("[lance-sync] Sync error:", err);
    }

    return totalSynced;
  }

  // Local vector search fallback
  async search(embedding: number[], limit = 10, scopeId?: string): Promise<LanceSearchResult[]> {
    if (!this.table) return [];

    // Lifecycle filter: exclude archived and pruned facts
    const lifecycleFilter = "lifecycleState != 'archived' AND lifecycleState != 'pruned'";

    // Cast to access LanceDB query API
    const tbl = this.table as { search: (vec: number[]) => { limit: (n: number) => { where: (filter: string) => { toArray: () => Promise<LanceSearchResult[]> } } } };
    if (scopeId) {
      // Sanitize: Convex IDs are alphanumeric with underscores only
      const sanitized = scopeId.replace(/[^a-zA-Z0-9_]/g, "");
      return await tbl.search(embedding).limit(limit)
        .where(`${lifecycleFilter} AND scopeId = '${sanitized}'`).toArray();
    }
    return await tbl.search(embedding).limit(limit)
      .where(lifecycleFilter).toArray();
  }

  getState(): SyncState {
    return { ...this.state };
  }
}
