import { describe, expect, test } from "bun:test";
import { extractWikiLinks, parseFrontmatter, renderVaultDocument } from "../src/lib/vault-format.js";

describe("vault-format", () => {
  test("renders frontmatter and content", () => {
    const doc = renderVaultDocument({
      _id: "fact-1",
      content: "Hello [[World]]",
      timestamp: 1,
      source: "direct",
      entityIds: ["World"],
      relevanceScore: 1,
      accessedCount: 0,
      importanceScore: 0.8,
      createdBy: "indy",
      scopeId: "private-indy",
      tags: ["demo"],
      factType: "observation",
      lifecycleState: "active",
    });

    const parsed = parseFrontmatter(doc);
    expect(parsed.frontmatter.factType).toBe("observation");
    expect(parsed.body).toContain("Hello [[World]]");
  });

  test("extracts wiki links with aliases", () => {
    const links = extractWikiLinks("Link [[Alpha]] and [[Beta|B]]");
    expect(links).toEqual(["Alpha", "Beta"]);
  });
});
