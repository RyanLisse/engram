import fs from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter, parseVaultTimestamp, parseVaultEntities } from "./vault-format.js";
import { applyVaultEdit, getFact } from "./convex-client.js";

const HUMAN_FIELDS = new Set(["content", "tags", "entityIds"]);

export async function reconcileFileEdit(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);

  const factId = typeof frontmatter.id === "string" ? frontmatter.id : undefined;
  const scopeId = typeof frontmatter.scopeId === "string" ? frontmatter.scopeId : undefined;
  if (!scopeId) {
    return { reconciled: false, reason: "missing_scope_id" };
  }

  let dbFact: any = null;
  if (factId) {
    dbFact = await getFact(factId);
  }

  // Handle both new format (entities as wiki-links) and legacy (entityIds as plain strings)
  const entities = frontmatter.entities ?? frontmatter.entityIds;
  const resolvedEntityIds = Array.isArray(entities)
    ? parseVaultEntities(entities)
    : undefined;

  const patch = mergeHumanEdits(dbFact, {
    content: body,
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : undefined,
    entityIds: resolvedEntityIds,
  });

  if (dbFact && detectConflicts(dbFact, patch)) {
    const conflictPath = await writeConflictFile(filePath, dbFact.content, body);
    return { reconciled: false, conflict: true, conflictPath };
  }

  const result = await applyVaultEdit({
    factId,
    content: patch.content ?? body,
    scopeId,
    createdBy: typeof frontmatter.createdBy === "string" ? frontmatter.createdBy : "vault-sync",
    tags: patch.tags,
    entityIds: patch.entityIds,
    vaultPath: filePath,
    // Parse ISO 8601 or unix ms timestamps from frontmatter; fall back to now
    updatedAt: parseVaultTimestamp(frontmatter.updatedAt) ?? Date.now(),
  });

  return { reconciled: true, ...result };
}

export function detectConflicts(dbFact: any, fileFact: any): boolean {
  if (!dbFact?.updatedAt) return false;
  if (!fileFact?.updatedAt) return false;
  return fileFact.updatedAt < dbFact.updatedAt;
}

export function mergeHumanEdits(dbFact: any, fileFact: any) {
  if (!dbFact) return fileFact;
  const merged: Record<string, unknown> = {};
  for (const key of HUMAN_FIELDS) {
    if (fileFact[key] !== undefined) merged[key] = fileFact[key];
  }
  return merged;
}

export async function writeConflictFile(filePath: string, dbContent: string, fileContent: string) {
  const conflictPath = filePath.replace(/\.md$/, ".conflict.md");
  const body = [
    "# Conflict Detected",
    "",
    "## Database Version",
    "",
    dbContent,
    "",
    "## File Version",
    "",
    fileContent,
    "",
    "Resolve manually then re-run sync.",
  ].join("\n");
  await fs.writeFile(conflictPath, body, "utf8");
  return path.normalize(conflictPath);
}
