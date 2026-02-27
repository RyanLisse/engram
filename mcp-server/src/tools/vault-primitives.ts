/**
 * Vault primitives — decomposed from memory_vault_sync
 *
 * memory_vault_export       — export facts to vault markdown
 * memory_vault_import       — import vault markdown to facts
 * memory_vault_list_files   — list vault markdown files
 * memory_vault_reconcile    — reconcile a single file edit
 */

import path from "node:path";
import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { VaultSyncDaemon } from "../daemons/vault-sync.js";
import { listVaultMarkdownFiles } from "../lib/vault-writer.js";
import { reconcileFileEdit } from "../lib/vault-reconciler.js";

const DEFAULT_VAULT_ROOT = process.env.VAULT_ROOT || path.resolve(process.cwd(), "..", "vault");

// ── memory_vault_export ─────────────────────────────

export const vaultExportSchema = z.object({
  scopeId: z.string().optional().describe("Scope to export (omit for all)"),
  force: z.boolean().optional().prefault(false).describe("Force large batch export"),
  dryRun: z.boolean().optional().prefault(false).describe("Preview only, no writes"),
});

export async function vaultExport(input: z.infer<typeof vaultExportSchema>) {
  const daemon = new VaultSyncDaemon({
    vaultRoot: DEFAULT_VAULT_ROOT,
    maxPerRun: input.force ? 1000 : 200,
  });

  if (input.dryRun) {
    const facts = await convex.getUnmirroredFacts({
      scopeId: input.scopeId,
      limit: 200,
    });
    return {
      vaultRoot: DEFAULT_VAULT_ROOT,
      dryRun: true,
      exportableCount: Array.isArray(facts) ? facts.length : 0,
    };
  }

  // syncOnce() handles QMD reindex internally when exported > 0
  const result = await daemon.syncOnce();
  return {
    vaultRoot: DEFAULT_VAULT_ROOT,
    dryRun: false,
    ...result,
  };
}

// ── memory_vault_import ─────────────────────────────

export const vaultImportSchema = z.object({
  dryRun: z.boolean().optional().prefault(false).describe("Preview only, no writes"),
  maxFiles: z.number().optional().prefault(200).describe("Maximum files to process"),
});

export async function vaultImport(input: z.infer<typeof vaultImportSchema>) {
  const files = await listVaultMarkdownFiles(DEFAULT_VAULT_ROOT);

  if (input.dryRun) {
    return {
      vaultRoot: DEFAULT_VAULT_ROOT,
      dryRun: true,
      importableCount: files.length,
      files: files.slice(0, 20).map((f) => path.relative(DEFAULT_VAULT_ROOT, f)),
    };
  }

  let imported = 0;
  let errors = 0;
  const processed = Math.min(files.length, input.maxFiles);

  for (const filePath of files.slice(0, input.maxFiles)) {
    try {
      const reconcile = await reconcileFileEdit(filePath);
      if (reconcile?.reconciled || reconcile?.applied) imported += 1;
    } catch {
      errors += 1;
    }
  }

  return {
    vaultRoot: DEFAULT_VAULT_ROOT,
    dryRun: false,
    processed,
    imported,
    errors,
  };
}

// ── memory_vault_list_files ─────────────────────────

export const vaultListFilesSchema = z.object({
  maxFiles: z.number().optional().prefault(50).describe("Maximum files to list"),
});

export async function vaultListFiles(input: z.infer<typeof vaultListFilesSchema>) {
  const files = await listVaultMarkdownFiles(DEFAULT_VAULT_ROOT);
  return {
    vaultRoot: DEFAULT_VAULT_ROOT,
    totalFiles: files.length,
    files: files.slice(0, input.maxFiles).map((f) => path.relative(DEFAULT_VAULT_ROOT, f)),
  };
}

// ── memory_vault_reconcile ──────────────────────────

export const vaultReconcileSchema = z.object({
  filePath: z.string().describe("Absolute path to vault markdown file to reconcile"),
});

export async function vaultReconcile(input: z.infer<typeof vaultReconcileSchema>) {
  try {
    const result = await reconcileFileEdit(input.filePath);
    return {
      filePath: input.filePath,
      ...result,
    };
  } catch (error: any) {
    return {
      isError: true,
      filePath: input.filePath,
      message: error.message || "Reconcile failed",
    };
  }
}
