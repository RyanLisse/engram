import { existsSync } from "node:fs";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const TEMPLATES: Record<string, string> = {
  "new-decision.md": `---
factType: decision
source: direct
tags: []
importanceScore: 0.7
---
## Decision
{{content}}
## Context
{{why this decision was made}}
## Alternatives Considered
- {{alternative 1}}
- {{alternative 2}}
`,
  "new-observation.md": `---
factType: observation
source: direct
tags: []
importanceScore: 0.5
---
## Observation
{{what was observed}}
## Details
{{additional context and details}}
`,
  "new-insight.md": `---
factType: insight
source: direct
tags: []
importanceScore: 0.6
---
## Insight
{{the insight}}
## Evidence
{{what supports this insight}}
## Implications
{{what this means going forward}}
`,
  "new-note.md": `---
factType: note
source: direct
tags: []
importanceScore: 0.4
---
## Note
{{content}}
`,
};

export async function generateTemplates(vaultDir: string): Promise<string[]> {
  const templatesDir = join(vaultDir, "templates");

  if (!existsSync(templatesDir)) {
    await mkdir(templatesDir, { recursive: true });
  }

  const existingFiles = new Set<string>();
  for (const file of await readdir(templatesDir)) {
    existingFiles.add(file);
  }

  const createdFiles: string[] = [];

  for (const [name, content] of Object.entries(TEMPLATES)) {
    if (existingFiles.has(name)) {
      continue;
    }

    const filePath = join(templatesDir, name);
    if (existsSync(filePath)) {
      continue;
    }

    await writeFile(filePath, content, "utf8");
    createdFiles.push(filePath);
  }

  return createdFiles;
}
