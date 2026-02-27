import chokidar from "chokidar";
import { getUnmirroredFacts, updateVaultPath } from "../lib/convex-client.js";
import { writeFactToVault } from "../lib/vault-writer.js";
import { reconcileFileEdit } from "../lib/vault-reconciler.js";
import { ensureGitRepo, autoCommitChanges } from "../lib/vault-git.js";
import { QmdManager } from "../lib/qmd-manager.js";
import { eventBus } from "../lib/event-bus.js";
import { generateDailyNotes } from "../lib/daily-notes.js";

export interface VaultSyncOptions {
  vaultRoot: string;
  intervalMs?: number;
  maxPerRun?: number;
}

export class VaultSyncDaemon {
  private readonly vaultRoot: string;
  private readonly intervalMs: number;
  private readonly maxPerRun: number;
  private timer: NodeJS.Timeout | null = null;
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private stopped = false;
  private gitReady = false;

  constructor(options: VaultSyncOptions) {
    this.vaultRoot = options.vaultRoot;
    this.intervalMs = options.intervalMs ?? 5_000;
    this.maxPerRun = options.maxPerRun ?? 100;
  }

  start() {
    if (this.timer) return;
    this.stopped = false;
    ensureGitRepo(this.vaultRoot)
      .then(() => { this.gitReady = true; })
      .catch((e) => { console.warn("[vault-sync] git init failed, will retry on next sync:", e?.message); });
    this.timer = setInterval(() => {
      this.syncOnce().catch((error) => {
        console.error("[vault-sync] sync failed", error);
      });
    }, this.intervalMs);
    this.startWatcher();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.watcher) await this.watcher.close();
    this.watcher = null;
  }

  async syncOnce(): Promise<{ exported: number }> {
    const facts = await getUnmirroredFacts({ limit: this.maxPerRun });
    let exported = 0;
    for (const fact of facts) {
      const { relativePath } = await writeFactToVault(this.vaultRoot, fact);
      await updateVaultPath({
        factId: fact._id,
        vaultPath: relativePath,
      });
      exported += 1;
    }

    if (exported > 0) {
      const byScope = new Map<string, any[]>();
      for (const fact of facts as any[]) {
        const list = byScope.get(fact.scopeId) ?? [];
        list.push(fact);
        byScope.set(fact.scopeId, list);
      }

      for (const [scope, scopeFacts] of byScope.entries()) {
        await generateDailyNotes({
          vaultDir: this.vaultRoot,
          scope,
          facts: scopeFacts.map((fact: any) => ({
            id: String(fact._id),
            content: fact.content,
            factType: fact.factType,
            importanceScore: fact.importanceScore,
            agentId: fact.createdBy,
            createdAt: fact.timestamp,
            fileName: fact.vaultPath,
          })),
        });
      }
    }

    if (exported > 0 && !this.gitReady) {
      // Retry git init lazily — may have failed at startup
      await ensureGitRepo(this.vaultRoot)
        .then(() => { this.gitReady = true; })
        .catch(() => {});
    }
    if (exported > 0 && this.gitReady) {
      await autoCommitChanges(
        this.vaultRoot,
        `engram sync: ${exported} facts exported`
      ).catch(() => {});
    }

    // QMD reindex — keep local search index current after export
    if (exported > 0) {
      await this.qmdReindex();
    }

    return { exported };
  }

  private startWatcher() {
    if (this.watcher) return;
    this.watcher = chokidar.watch(`${this.vaultRoot}/**/*.md`, {
      ignoreInitial: true,
      ignored: (p) => p.includes("/.") || p.endsWith(".conflict.md"),
    });
    this.watcher.on("change", (filePath: string) => this.reconcileFile(filePath));
    this.watcher.on("add", (filePath: string) => this.reconcileFile(filePath));
  }

  /**
   * Trigger QMD reindex after vault export.
   * No-op when QMD is disabled or not installed.
   * Embedding generation is fire-and-forget (slow, never blocks sync).
   */
  private async qmdReindex() {
    const qmd = QmdManager.getInstance();
    if (!qmd.isEnabled()) return;

    const installed = await qmd.isInstalled();
    if (!installed) return;

    // Ensure collection exists (idempotent)
    await qmd.ensureCollection(this.vaultRoot);

    // Reindex — fast (~100ms incremental)
    const reindexResult = await qmd.reindex();
    if (reindexResult.ok) {
      eventBus.publish({
        type: "qmd_reindex_completed",
        agentId: "system",
        payload: {
          filesIndexed: reindexResult.value.filesIndexed,
          durationMs: reindexResult.value.durationMs,
        },
        timestamp: Date.now(),
      });
    }

    // Embedding refresh — fire-and-forget (5-30s, never blocks sync)
    qmd.ensureEmbeddings().catch((err) => {
      console.warn("[vault-sync] QMD embedding refresh failed:", err?.message);
    });
  }

  private async reconcileFile(filePath: string) {
    if (this.stopped) return;
    try {
      await reconcileFileEdit(filePath);
    } catch (error) {
      console.error("[vault-sync] reconcile failed", filePath, error);
    }
  }
}
