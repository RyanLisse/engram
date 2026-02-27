import { describe, expect, test } from "vitest";
import {
  extractWikiLinks,
  generateFrontmatter,
  parseFrontmatter,
  parseVaultTimestamp,
  parseVaultEntities,
  renderVaultDocument,
  VaultFact,
} from "../src/lib/vault-format.js";

const baseFact: VaultFact = {
  _id: "fact-1",
  content: "Hello [[World]]",
  timestamp: 1709078400000, // 2024-02-28T00:00:00.000Z
  source: "direct",
  entityIds: ["ent_abc", "ent_def"],
  relevanceScore: 0.7,
  accessedCount: 0,
  importanceScore: 0.8,
  createdBy: "indy",
  scopeId: "private-indy",
  tags: ["demo"],
  factType: "observation",
  lifecycleState: "active",
};

describe("vault-format", () => {
  test("renders frontmatter and content", () => {
    const doc = renderVaultDocument(baseFact);
    const parsed = parseFrontmatter(doc);
    expect(parsed.frontmatter.factType).toBe("observation");
    expect(parsed.body).toContain("Hello [[World]]");
  });

  test("extracts wiki links with aliases", () => {
    const links = extractWikiLinks("Link [[Alpha]] and [[Beta|B]]");
    expect(links).toEqual(["Alpha", "Beta"]);
  });

  // ── Dataview-compatible frontmatter tests ──

  describe("ISO 8601 timestamps", () => {
    test("timestamp is rendered as ISO 8601 string", () => {
      const doc = renderVaultDocument(baseFact);
      const parsed = parseFrontmatter(doc);
      expect(parsed.frontmatter.timestamp).toBe("2024-02-28T00:00:00.000Z");
    });

    test("updatedAt is rendered as ISO 8601 string when present", () => {
      const fact = { ...baseFact, updatedAt: 1709164800000 }; // 2024-02-29T00:00:00.000Z
      const doc = renderVaultDocument(fact);
      const parsed = parseFrontmatter(doc);
      expect(parsed.frontmatter.updatedAt).toBe("2024-02-29T00:00:00.000Z");
    });

    test("updatedAt is omitted when undefined", () => {
      const doc = renderVaultDocument(baseFact);
      const parsed = parseFrontmatter(doc);
      expect(parsed.frontmatter.updatedAt).toBeUndefined();
    });
  });

  describe("entity wiki-links in frontmatter", () => {
    test("entities rendered as wiki-links when entityNames provided", () => {
      const fact: VaultFact = {
        ...baseFact,
        entityIds: ["ent_abc", "ent_def"],
        entityNames: ["QMD", "Obsidian"],
      };
      const doc = renderVaultDocument(fact);
      const parsed = parseFrontmatter(doc);
      expect(parsed.frontmatter.entities).toEqual(["[[QMD]]", "[[Obsidian]]"]);
    });

    test("falls back to entityIds when entityNames not provided", () => {
      const doc = renderVaultDocument(baseFact);
      const parsed = parseFrontmatter(doc);
      // Should still have entities field with IDs as fallback
      expect(parsed.frontmatter.entities).toEqual(["ent_abc", "ent_def"]);
    });

    test("empty entities produces empty array", () => {
      const fact = { ...baseFact, entityIds: [], entityNames: [] };
      const doc = renderVaultDocument(fact);
      const parsed = parseFrontmatter(doc);
      expect(parsed.frontmatter.entities).toEqual([]);
    });
  });

  describe("numeric score fields", () => {
    test("importanceScore is always a number", () => {
      const doc = renderVaultDocument(baseFact);
      const parsed = parseFrontmatter(doc);
      expect(typeof parsed.frontmatter.importanceScore).toBe("number");
      expect(parsed.frontmatter.importanceScore).toBe(0.8);
    });

    test("relevanceScore is always a number", () => {
      const doc = renderVaultDocument(baseFact);
      const parsed = parseFrontmatter(doc);
      expect(typeof parsed.frontmatter.relevanceScore).toBe("number");
      expect(parsed.frontmatter.relevanceScore).toBe(0.7);
    });
  });

  describe("aliases field", () => {
    test("aliases contains factualSummary when available", () => {
      const fact = { ...baseFact, factualSummary: "World greeting pattern" };
      const doc = renderVaultDocument(fact);
      const parsed = parseFrontmatter(doc);
      expect(parsed.frontmatter.aliases).toEqual(["World greeting pattern"]);
    });

    test("aliases omitted when no factualSummary", () => {
      const doc = renderVaultDocument(baseFact);
      const parsed = parseFrontmatter(doc);
      expect(parsed.frontmatter.aliases).toBeUndefined();
    });
  });

  describe("cssclasses field", () => {
    test("cssclasses includes engram-fact and engram-{factType}", () => {
      const doc = renderVaultDocument(baseFact);
      const parsed = parseFrontmatter(doc);
      expect(parsed.frontmatter.cssclasses).toEqual([
        "engram-fact",
        "engram-observation",
      ]);
    });

    test("cssclasses reflects different factTypes", () => {
      const fact = { ...baseFact, factType: "decision" };
      const doc = renderVaultDocument(fact);
      const parsed = parseFrontmatter(doc);
      expect(parsed.frontmatter.cssclasses).toEqual([
        "engram-fact",
        "engram-decision",
      ]);
    });
  });

  describe("preserves all existing fields", () => {
    test("all original fields present in frontmatter", () => {
      const doc = renderVaultDocument(baseFact);
      const parsed = parseFrontmatter(doc);
      expect(parsed.frontmatter.id).toBe("fact-1");
      expect(parsed.frontmatter.source).toBe("direct");
      expect(parsed.frontmatter.factType).toBe("observation");
      expect(parsed.frontmatter.createdBy).toBe("indy");
      expect(parsed.frontmatter.scopeId).toBe("private-indy");
      expect(parsed.frontmatter.tags).toEqual(["demo"]);
      expect(parsed.frontmatter.lifecycleState).toBe("active");
    });
  });

  describe("deterministic output", () => {
    test("same fact produces identical output", () => {
      const doc1 = renderVaultDocument(baseFact);
      const doc2 = renderVaultDocument(baseFact);
      expect(doc1).toBe(doc2);
    });
  });
});

describe("parseVaultTimestamp", () => {
  test("parses ISO 8601 string to unix ms", () => {
    expect(parseVaultTimestamp("2024-02-28T00:00:00.000Z")).toBe(1709078400000);
  });

  test("passes through unix ms number unchanged", () => {
    expect(parseVaultTimestamp(1709078400000)).toBe(1709078400000);
  });

  test("returns undefined for missing value", () => {
    expect(parseVaultTimestamp(undefined)).toBeUndefined();
  });
});

describe("parseVaultEntities", () => {
  test("extracts names from wiki-link strings", () => {
    expect(parseVaultEntities(["[[QMD]]", "[[Obsidian]]"])).toEqual([
      "QMD",
      "Obsidian",
    ]);
  });

  test("passes through plain strings (old format IDs)", () => {
    expect(parseVaultEntities(["ent_abc", "ent_def"])).toEqual([
      "ent_abc",
      "ent_def",
    ]);
  });

  test("handles mixed formats", () => {
    expect(parseVaultEntities(["[[QMD]]", "ent_def"])).toEqual([
      "QMD",
      "ent_def",
    ]);
  });

  test("returns empty array for undefined", () => {
    expect(parseVaultEntities(undefined)).toEqual([]);
  });
});
