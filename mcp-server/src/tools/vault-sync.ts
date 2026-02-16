import path from "node:path";
import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { VaultSyncDaemon } from "../daemons/vault-sync.js";
import { listVaultMarkdownFiles } from "../lib/vault-writer.js";
import { reconcileFileEdit } from "../lib/vault-reconciler.js";

const DEFAULT_VAULT_ROOT = process.env.VAULT_ROOT || path.resolve(process.cwd(), "..", "vault");

export const vaultSyncSchema = z.object({
  direction: z.enum(["export", "import", "both"]).prefault("both"),
  force: z.boolean().optional().prefault(false),
  dryRun: z.boolean().optional().prefault(false),
  scopeId: z.string().optional(),
});

export type VaultSyncInput = z.infer<typeof vaultSyncSchema>;

export async function vaultSync(input: VaultSyncInput): Promise<any> {
  const daemon = new VaultSyncDaemon({ vaultRoot: DEFAULT_VAULT_ROOT, maxPerRun: input.force ? 1000 : 200 });
  const result: Record<string, unknown> = {
    vaultRoot: DEFAULT_VAULT_ROOT,
    direction: input.direction,
    dryRun: input.dryRun,
  };

  if (input.direction === "export" || input.direction === "both") {
    if (input.dryRun) {
      const facts = await convex.getUnmirroredFacts({ scopeId: input.scopeId, limit: 200 });
      result.exportPreviewCount = Array.isArray(facts) ? facts.length : 0;
    } else {
      result.export = await daemon.syncOnce();
    }
  }

  if (input.direction === "import" || input.direction === "both") {
    const files = await listVaultMarkdownFiles(DEFAULT_VAULT_ROOT);
    if (input.dryRun) {
      result.importPreviewCount = files.length;
    } else {
      let imported = 0;
      for (const filePath of files) {
        const reconcile = await reconcileFileEdit(filePath);
        if (reconcile?.applied) imported += 1;
      }
      result.import = { imported };
    }
  }

  return result;
}
