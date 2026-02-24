/**
 * Vault & Checkpoint (5) + Vault Primitives (4) entries.
 */

import type { ToolEntry } from "./types.js";

import { vaultSync, vaultSyncSchema } from "../../tools/vault-sync.js";
import { queryVault, queryVaultSchema } from "../../tools/query-vault.js";
import { exportGraph, exportGraphSchema } from "../../tools/export-graph.js";
import { checkpoint, checkpointSchema } from "../../tools/checkpoint.js";
import { wake, wakeSchema } from "../../tools/wake.js";
import {
  vaultExport, vaultExportSchema,
  vaultImport, vaultImportSchema,
  vaultListFiles, vaultListFilesSchema,
  vaultReconcile, vaultReconcileSchema,
} from "../../tools/vault-primitives.js";

export const entries: readonly ToolEntry[] = [
  // ── Vault & Checkpoint ────────────────────────────
  {
    tool: {
      name: "memory_vault_sync",
      description: "Sync Convex facts with Obsidian vault files (export/import/both).",
      inputSchema: { type: "object", properties: { direction: { type: "string", enum: ["export", "import", "both"] }, force: { type: "boolean" }, dryRun: { type: "boolean" }, scopeId: { type: "string" } } },
    },
    zodSchema: vaultSyncSchema,
    handler: (args) => vaultSync(args),
  },
  {
    tool: {
      name: "memory_query_vault",
      description: "Query markdown vault files directly for local-first retrieval.",
      inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
    },
    zodSchema: queryVaultSchema,
    handler: (args) => queryVault(args),
  },
  {
    tool: {
      name: "memory_export_graph",
      description: "Export Obsidian graph JSON from wiki-links in vault notes.",
      inputSchema: { type: "object", properties: { includeContent: { type: "boolean" } } },
    },
    zodSchema: exportGraphSchema,
    handler: (args) => exportGraph(args),
  },
  {
    tool: {
      name: "memory_checkpoint",
      description: "Create a durable checkpoint snapshot for session wake/resume.",
      inputSchema: { type: "object", properties: { name: { type: "string" }, scopeId: { type: "string" }, summary: { type: "string" } } },
    },
    zodSchema: checkpointSchema,
    handler: (args, agentId) => checkpoint(args, agentId),
  },
  {
    tool: {
      name: "memory_wake",
      description: "Restore context from a previously stored checkpoint.",
      inputSchema: { type: "object", properties: { checkpointId: { type: "string" } }, required: ["checkpointId"] },
    },
    zodSchema: wakeSchema,
    handler: (args) => wake(args),
  },

  // ── Vault Primitives (decomposed from vault_sync) ──
  {
    tool: {
      name: "memory_vault_export",
      description: "Primitive: export unmirrored facts to vault markdown files.",
      inputSchema: {
        type: "object",
        properties: {
          scopeId: { type: "string", description: "Scope to export (omit for all)" },
          force: { type: "boolean", description: "Force large batch (up to 1000)" },
          dryRun: { type: "boolean", description: "Preview only" },
        },
      },
    },
    zodSchema: vaultExportSchema,
    handler: (args) => vaultExport(args),
  },
  {
    tool: {
      name: "memory_vault_import",
      description: "Primitive: import vault markdown files into Convex facts.",
      inputSchema: {
        type: "object",
        properties: {
          dryRun: { type: "boolean", description: "Preview only" },
          maxFiles: { type: "number", description: "Max files to process (default: 200)" },
        },
      },
    },
    zodSchema: vaultImportSchema,
    handler: (args) => vaultImport(args),
  },
  {
    tool: {
      name: "memory_vault_list_files",
      description: "Primitive: list all markdown files in vault.",
      inputSchema: {
        type: "object",
        properties: {
          maxFiles: { type: "number", description: "Max files to list (default: 50)" },
        },
      },
    },
    zodSchema: vaultListFilesSchema,
    handler: (args) => vaultListFiles(args),
  },
  {
    tool: {
      name: "memory_vault_reconcile",
      description: "Primitive: reconcile a single vault file edit with Convex (conflict detection + merge).",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Absolute path to vault markdown file" },
        },
        required: ["filePath"],
      },
    },
    zodSchema: vaultReconcileSchema,
    handler: (args) => vaultReconcile(args),
  },
];
