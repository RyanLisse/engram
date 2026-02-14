"use node";

import path from "node:path";
import fs from "node:fs/promises";
import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import yaml from "js-yaml";

function parseFile(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw.trim() };
  const frontmatter = (yaml.load(match[1]) as Record<string, unknown>) ?? {};
  return { frontmatter, body: match[2].trim() };
}

export const reconcileFromVault = action({
  args: { filePath: v.string() },
  handler: async (ctx, { filePath }) => {
    const raw = await fs.readFile(filePath, "utf8");
    const { frontmatter, body } = parseFile(raw);

    const scopeId = String(frontmatter.scopeId ?? "");
    if (!scopeId) {
      return { applied: false, reason: "missing_scope_id" };
    }

    const factIdRaw = frontmatter.id;
    const factId = typeof factIdRaw === "string" && factIdRaw.length > 0 ? factIdRaw : undefined;

    const result = await ctx.runMutation(api.functions.facts.applyVaultEdit, {
      factId: factId as any,
      content: body,
      scopeId: scopeId as any,
      createdBy: String(frontmatter.createdBy ?? "vault-sync"),
      tags: Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : undefined,
      entityIds: Array.isArray(frontmatter.entityIds)
        ? (frontmatter.entityIds as string[])
        : undefined,
      vaultPath: path.normalize(filePath),
      updatedAt: Date.now(),
    });

    return {
      applied: true,
      ...result,
    };
  },
});
