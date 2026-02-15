import { ConvexHttpClient } from "convex/browser";
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

export class LanceSyncDaemon {
  private config: SyncConfig;
  private state: SyncState;
  private convex: ConvexHttpClient;
  private intervalId?: ReturnType<typeof setInterval>;
  private db: any; // LanceDB connection (lazy init)
  private table: any; // LanceDB table handle (lazy init)

  constructor(config: Partial<SyncConfig> & { convexUrl: string; agentId: string }) {
    this.config = {
      syncIntervalMs: 30000,
      dbPath: "./engram-lance",
      ...config,
    };
    this.state = {
      lastSyncTimestamp: 0,
      factsSynced: 0,
      status: "idle",
    };
    this.convex = new ConvexHttpClient(this.config.convexUrl);
  }

  async start(): Promise<void> {
    console.error(`[lance-sync] Starting sync daemon (interval: ${this.config.syncIntervalMs}ms)`);
    await this.initDb();
    await this.sync();
    this.intervalId = setInterval(() => this.sync(), this.config.syncIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    console.error("[lance-sync] Sync daemon stopped");
  }

  private async initDb(): Promise<void> {
    try {
      // Dynamic import for LanceDB (optional dependency)
      // @ts-ignore - LanceDB is an optional dependency
      const lancedb = await import("@lancedb/lancedb");
      this.db = await lancedb.connect(this.config.dbPath);

      // Check if table exists, create if not
      const tables = await this.db.tableNames();
      if (tables.includes("facts")) {
        this.table = await this.db.openTable("facts");
      }
      // Table will be created on first sync with data

      console.error("[lance-sync] LanceDB initialized at", this.config.dbPath);
    } catch (err) {
      console.error("[lance-sync] LanceDB not available, sync disabled:", err);
      this.state.status = "error";
      this.state.errorMessage = "LanceDB not installed";
    }
  }

  private async sync(): Promise<void> {
    if (this.state.status === "error" && this.state.errorMessage === "LanceDB not installed") return;

    this.state.status = "syncing";
    try {
      // Get agent's permitted scopes
      const scopes = await this.convex.query(PATHS.scopes.getPermitted as any, {
        agentId: this.config.agentId,
      });

      let totalSynced = 0;

      for (const scope of scopes) {
        // Get facts since last sync
        const facts = await this.convex.query(PATHS.sync.getFactsSince as any, {
          scopeId: scope._id,
          since: this.state.lastSyncTimestamp,
          limit: 100,
        });

        if (facts.length > 0 && this.db) {
          // Filter facts that have embeddings
          const factsWithEmbeddings = facts.filter((f: any) => f.embedding && f.embedding.length > 0);

          if (factsWithEmbeddings.length > 0) {
            const records = factsWithEmbeddings.map((f: any) => ({
              id: f._id,
              content: f.content,
              vector: f.embedding,
              factType: f.factType,
              scopeId: f.scopeId,
              importanceScore: f.importanceScore,
              timestamp: f.timestamp,
              createdBy: f.createdBy,
            }));

            if (!this.table) {
              this.table = await this.db.createTable("facts", records);
            } else {
              // mergeInsert for upserts
              await this.table.mergeInsert("id")
                .whenMatchedUpdateAll()
                .whenNotMatchedInsertAll()
                .execute(records);
            }
            totalSynced += factsWithEmbeddings.length;
          }
        }
      }

      this.state.lastSyncTimestamp = Date.now();
      this.state.factsSynced += totalSynced;
      this.state.status = "idle";

      // Update sync log in Convex
      await this.convex.mutation(PATHS.sync.updateSyncLog as any, {
        nodeId: `lance-${this.config.agentId}`,
        factsSynced: totalSynced,
        status: "ok",
      });

      if (totalSynced > 0) {
        console.error(`[lance-sync] Synced ${totalSynced} facts`);
      }
    } catch (err) {
      this.state.status = "error";
      this.state.errorMessage = String(err);
      console.error("[lance-sync] Sync error:", err);
    }
  }

  // Local vector search fallback
  async search(embedding: number[], limit: number = 10, scopeId?: string): Promise<any[]> {
    if (!this.table) return [];

    let query = this.table.search(embedding).limit(limit);
    if (scopeId) {
      query = query.where(`scopeId = '${scopeId}'`);
    }
    return await query.toArray();
  }

  getState(): SyncState {
    return { ...this.state };
  }
}
