import path from "node:path";
import yaml from "js-yaml";
import slugify from "slugify";

export interface VaultFact {
  _id?: string;
  content: string;
  factualSummary?: string;
  timestamp: number;
  updatedAt?: number;
  source: string;
  entityIds: string[];
  /** Resolved entity names for wiki-link rendering. Falls back to entityIds when absent. */
  entityNames?: string[];
  relevanceScore: number;
  accessedCount: number;
  importanceScore: number;
  createdBy: string;
  conversationId?: string;
  scopeId: string;
  tags: string[];
  factType: string;
  lifecycleState: string;
  vaultPath?: string;
}

export interface ParsedVaultDocument {
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * Render entities for frontmatter. When entityNames are available, format as
 * Obsidian wiki-links `[[Name]]`. Otherwise fall back to raw entity IDs.
 */
function renderEntities(fact: VaultFact): string[] {
  if (fact.entityNames && fact.entityNames.length > 0) {
    return fact.entityNames.map((name) => `[[${name}]]`);
  }
  return fact.entityIds;
}

export function generateFrontmatter(fact: VaultFact): string {
  const data: Record<string, unknown> = {
    id: fact._id,
    source: fact.source,
    factType: fact.factType,
    createdBy: fact.createdBy,
    scopeId: fact.scopeId,
    timestamp: new Date(fact.timestamp).toISOString(),
    ...(fact.updatedAt !== undefined
      ? { updatedAt: new Date(fact.updatedAt).toISOString() }
      : {}),
    tags: fact.tags,
    entities: renderEntities(fact),
    importanceScore: Number(fact.importanceScore),
    relevanceScore: Number(fact.relevanceScore),
    lifecycleState: fact.lifecycleState,
  };

  // Obsidian alias search: use factualSummary as alias when available
  if (fact.factualSummary) {
    data.aliases = [fact.factualSummary];
  }

  // Obsidian cssclasses for per-factType styling
  data.cssclasses = ["engram-fact", `engram-${fact.factType}`];

  return yaml.dump(data, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}

export function generateMarkdownBody(fact: VaultFact): string {
  const lines: string[] = [fact.content.trim()];
  if (fact.factualSummary) {
    lines.push("", "## Summary", "", fact.factualSummary.trim());
  }
  return `${lines.join("\n").trim()}\n`;
}

export function parseFrontmatter(fileContent: string): ParsedVaultDocument {
  const match = fileContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: fileContent.trim() };
  }

  const frontmatterValue = yaml.load(match[1]);
  const frontmatter =
    frontmatterValue && typeof frontmatterValue === "object"
      ? (frontmatterValue as Record<string, unknown>)
      : {};

  return {
    frontmatter,
    body: match[2].trim(),
  };
}

/**
 * Parse a vault timestamp value back to unix milliseconds.
 * Handles both ISO 8601 strings (new format) and raw numbers (legacy format).
 */
export function parseVaultTimestamp(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? undefined : ms;
  }
  return undefined;
}

/**
 * Parse vault entity references back to entity name/ID strings.
 * Handles wiki-link format `[[Name]]` (new) and plain ID strings (legacy).
 */
export function parseVaultEntities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry: unknown) => {
    if (typeof entry !== "string") return String(entry);
    const wikiMatch = entry.match(/^\[\[([^\]]+)\]\]$/);
    return wikiMatch ? wikiMatch[1] : entry;
  });
}

export function generateFilename(fact: Pick<VaultFact, "timestamp" | "factType" | "content">): string {
  const datePrefix = new Date(fact.timestamp).toISOString().slice(0, 10);
  const base = slugify(fact.content.slice(0, 80), {
    lower: true,
    strict: true,
    trim: true,
  });
  return `${datePrefix}-${fact.factType}-${base || "note"}.md`;
}

export function computeFolderPath(
  fact: Pick<VaultFact, "factType" | "scopeId">,
  vaultRoot: string
): string {
  const byType: Record<string, string> = {
    decision: "decisions",
    observation: "observations",
    insight: "insights",
    plan: "plans",
    error: "errors",
    session_summary: "sessions",
  };
  const folder = byType[fact.factType] ?? "notes";
  return path.join(vaultRoot, fact.scopeId, folder);
}

export function extractWikiLinks(content: string): string[] {
  const links = new Set<string>();
  const regex = /\[\[([^[\]|]+)(?:\|[^[\]]+)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    links.add(match[1].trim());
  }
  return [...links];
}

export function renderVaultDocument(fact: VaultFact): string {
  const frontmatter = generateFrontmatter(fact);
  const body = generateMarkdownBody(fact);
  return `---\n${frontmatter}---\n\n${body}`;
}
