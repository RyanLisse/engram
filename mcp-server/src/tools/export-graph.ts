import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { exportVaultGraph } from "../lib/graph-exporter.js";
import { listVaultMarkdownFiles } from "../lib/vault-writer.js";

const DEFAULT_VAULT_ROOT = process.env.VAULT_ROOT || path.resolve(process.cwd(), "..", "vault");

export const exportGraphSchema = z.object({
  includeContent: z.boolean().optional().default(true),
});

export type ExportGraphInput = z.infer<typeof exportGraphSchema>;

export async function exportGraph(input: ExportGraphInput) {
  const files = await listVaultMarkdownFiles(DEFAULT_VAULT_ROOT);
  const fileData = await Promise.all(
    files.map(async (absolutePath) => ({
      relativePath: path.relative(DEFAULT_VAULT_ROOT, absolutePath),
      content: input.includeContent ? await fs.readFile(absolutePath, "utf8") : "",
    }))
  );

  return await exportVaultGraph(DEFAULT_VAULT_ROOT, fileData);
}
