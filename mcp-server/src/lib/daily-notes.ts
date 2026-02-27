import fs from "node:fs/promises";
import path from "node:path";
import { generateFilename } from "./vault-format.js";

export interface DailyNoteOptions {
  vaultDir: string;
  scope: string;
  facts: Array<{
    id: string;
    content: string;
    factType: string;
    importanceScore?: number;
    agentId?: string;
    createdAt: number; // unix ms
    fileName?: string; // vault filename
  }>;
}

function toUtcDate(createdAt: number): string {
  return new Date(createdAt).toISOString().slice(0, 10);
}

function formatFactTypeLabel(factType: string): string {
  return factType
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeLinkTarget(fact: DailyNoteOptions["facts"][number]): string {
  const fileName =
    fact.fileName ??
    generateFilename({
      timestamp: fact.createdAt,
      factType: fact.factType,
      content: fact.content,
    });
  return path.basename(fileName, ".md");
}

function renderFrontmatter(
  date: string,
  scope: string,
  facts: DailyNoteOptions["facts"]
): string[] {
  const agents = [...new Set(facts.map((fact) => fact.agentId).filter(Boolean) as string[])].sort();
  const types = [...new Set(facts.map((fact) => fact.factType).filter(Boolean))].sort();

  return [
    "---",
    `date: ${date}`,
    `scope: ${scope}`,
    `facts_count: ${facts.length}`,
    `agents: [${agents.join(", ")}]`,
    `types: [${types.join(", ")}]`,
    "---",
  ];
}

function renderDailyNote(date: string, scope: string, facts: DailyNoteOptions["facts"]): string {
  const lines: string[] = [];
  lines.push(...renderFrontmatter(date, scope, facts), "", `# ${date}`);

  const byType = new Map<string, DailyNoteOptions["facts"]>();
  for (const fact of facts) {
    const list = byType.get(fact.factType) ?? [];
    list.push(fact);
    byType.set(fact.factType, list);
  }

  const orderedTypes = [...byType.keys()].sort((a, b) => a.localeCompare(b));
  for (const factType of orderedTypes) {
    const factList = (byType.get(factType) ?? []).sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.id.localeCompare(b.id);
    });

    lines.push("", `## ${formatFactTypeLabel(factType)} (${factList.length})`);
    for (const fact of factList) {
      const importance = (fact.importanceScore ?? 0).toFixed(1);
      const agentId = fact.agentId ?? "unknown";
      const linkTarget = normalizeLinkTarget(fact);
      lines.push(`- [[${linkTarget}]] — importance: ${importance}, by: ${agentId}`);
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export async function generateDailyNotes(options: DailyNoteOptions): Promise<string[]> {
  if (options.facts.length === 0) return [];

  const grouped = new Map<string, DailyNoteOptions["facts"]>();
  for (const fact of options.facts) {
    const date = toUtcDate(fact.createdAt);
    const list = grouped.get(date) ?? [];
    list.push(fact);
    grouped.set(date, list);
  }

  const dailyDir = path.join(options.vaultDir, options.scope, "daily");
  await fs.mkdir(dailyDir, { recursive: true });

  const written: string[] = [];
  const dates = [...grouped.keys()].sort();
  for (const date of dates) {
    const facts = grouped.get(date) ?? [];
    const content = renderDailyNote(date, options.scope, facts);
    const filePath = path.join(dailyDir, `${date}.md`);

    let existing: string | null = null;
    try {
      existing = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    if (existing !== content) {
      await fs.writeFile(filePath, content, "utf8");
    }
    written.push(filePath);
  }

  return written;
}
