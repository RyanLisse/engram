import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { listVaultMarkdownFiles } from "../lib/vault-writer.js";

const DEFAULT_VAULT_ROOT = process.env.VAULT_ROOT || path.resolve(process.cwd(), "..", "vault");

export const queryVaultSchema = z.object({
  query: z.string(),
  limit: z.number().optional().prefault(20),
});

export type QueryVaultInput = z.infer<typeof queryVaultSchema>;

export async function queryVault(input: QueryVaultInput): Promise<{
  results: Array<{ path: string; snippet: string }>;
  indexFile?: string;
}> {
  const files = await listVaultMarkdownFiles(DEFAULT_VAULT_ROOT);
  const lowered = input.query.toLowerCase();
  const results: Array<{ path: string; snippet: string }> = [];

  for (const file of files) {
    if (results.length >= input.limit) break;
    const content = await fs.readFile(file, "utf8");
    if (!content.toLowerCase().includes(lowered)) continue;
    const snippet = content.replace(/\s+/g, " ").slice(0, 180);
    results.push({
      path: path.relative(DEFAULT_VAULT_ROOT, file),
      snippet,
    });
  }

  return {
    results,
    indexFile: ".index/vault-index.md",
  };
}
