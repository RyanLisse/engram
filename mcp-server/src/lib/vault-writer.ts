import fs from "node:fs/promises";
import path from "node:path";
import { computeFolderPath, generateFilename, parseFrontmatter, renderVaultDocument, VaultFact } from "./vault-format.js";

export interface VaultWriteResult {
  absolutePath: string;
  relativePath: string;
}

export async function writeFactToVault(vaultRoot: string, fact: VaultFact): Promise<VaultWriteResult> {
  const folder = computeFolderPath(fact, vaultRoot);
  await fs.mkdir(folder, { recursive: true });

  const filename = fact.vaultPath ? path.basename(fact.vaultPath) : generateFilename(fact);
  const absolutePath = path.join(folder, filename);
  const relativePath = path.relative(vaultRoot, absolutePath);

  const tmpPath = `${absolutePath}.tmp`;
  const markdown = renderVaultDocument(fact);
  await fs.writeFile(tmpPath, markdown, "utf8");
  await fs.rename(tmpPath, absolutePath);

  return { absolutePath, relativePath };
}

export async function readVaultFile(filePath: string): Promise<{
  frontmatter: Record<string, unknown>;
  body: string;
}> {
  const raw = await fs.readFile(filePath, "utf8");
  return parseFrontmatter(raw);
}

export async function listVaultMarkdownFiles(vaultRoot: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  }

  try {
    await walk(vaultRoot);
  } catch {
    return [];
  }
  return results;
}
