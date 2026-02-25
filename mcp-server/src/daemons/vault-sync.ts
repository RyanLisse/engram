import chokidar from "chokidar";
import { getUnmirroredFacts, updateVaultPath } from "../lib/convex-client.js";
import { writeFactToVault } from "../lib/vault-writer.js";
import { reconcileFileEdit } from "../lib/vault-reconciler.js";
import { ensureGitRepo, autoCommitChanges } from "../lib/vault-git.js";

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

  private async reconcileFile(filePath: string) {
    if (this.stopped) return;
    try {
      await reconcileFileEdit(filePath);
    } catch (error) {
      console.error("[vault-sync] reconcile failed", filePath, error);
    }
  }
}
