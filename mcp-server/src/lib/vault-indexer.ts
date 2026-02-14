import fs from "node:fs/promises";
import path from "node:path";

interface IndexableFact {
  _id: string;
  factType: string;
  content: string;
  importanceScore: number;
  tags: string[];
  entityIds: string[];
  vaultPath?: string;
  timestamp: number;
}

function lineForFact(fact: IndexableFact): string {
  const title = fact.content.replace(/\s+/g, " ").slice(0, 80);
  const pathPart = fact.vaultPath ? ` (${fact.vaultPath})` : "";
  return `- [${fact.factType}] ${title}${pathPart}`;
}

export async function regenerateVaultIndices(vaultRoot: string, facts: IndexableFact[]) {
  const indexDir = path.join(vaultRoot, ".index");
  await fs.mkdir(indexDir, { recursive: true });

  const byPriorityGroups = new Map<string, IndexableFact[]>();
  const byEntityGroups = new Map<string, IndexableFact[]>();

  for (const fact of facts) {
    const priority = fact.importanceScore >= 0.8 ? "P0" : fact.importanceScore >= 0.6 ? "P1" : "P2";
    const existing = byPriorityGroups.get(priority) ?? [];
    existing.push(fact);
    byPriorityGroups.set(priority, existing);

    for (const entity of fact.entityIds) {
      const entityFacts = byEntityGroups.get(entity) ?? [];
      entityFacts.push(fact);
      byEntityGroups.set(entity, entityFacts);
    }
  }

  const master = [
    "# Vault Index",
    "",
    "## Recent",
    ...facts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 200)
      .map(lineForFact),
  ].join("\n");

  const byPriority = [
    "# Index By Priority",
    "",
    ...["P0", "P1", "P2"].flatMap((priority) => {
      const rows = byPriorityGroups.get(priority) ?? [];
      return [`## ${priority}`, ...rows.map(lineForFact), ""];
    }),
  ].join("\n");

  const byEntity = [
    "# Index By Entity",
    "",
    ...[...byEntityGroups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([entity, entityFacts]) => [`## ${entity}`, ...entityFacts.map(lineForFact), ""]),
  ].join("\n");

  await fs.writeFile(path.join(indexDir, "vault-index.md"), master, "utf8");
  await fs.writeFile(path.join(indexDir, "by-priority.md"), byPriority, "utf8");
  await fs.writeFile(path.join(indexDir, "by-entity.md"), byEntity, "utf8");

  return { factsIndexed: facts.length };
}
