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

export function generateFrontmatter(fact: VaultFact): string {
  const data = {
    id: fact._id,
    source: fact.source,
    factType: fact.factType,
    createdBy: fact.createdBy,
    scopeId: fact.scopeId,
    timestamp: fact.timestamp,
    updatedAt: fact.updatedAt,
    entityIds: fact.entityIds,
    tags: fact.tags,
    importanceScore: fact.importanceScore,
    relevanceScore: fact.relevanceScore,
    lifecycleState: fact.lifecycleState,
  };
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
