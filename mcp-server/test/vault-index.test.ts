import { describe, it, expect } from "vitest";
import {
  generateHierarchicalVaultIndex,
  VAULT_INDEX_CACHE_KEY,
  VAULT_INDEX_DIRTY_KEY,
} from "../../convex/lib/vaultIndex";

describe("Vault Index Generation", () => {
  describe("generateHierarchicalVaultIndex", () => {
    it("should generate index with header", () => {
      const input = {
        scopes: [],
        factsByScope: {},
        entities: [],
      };
      const result = generateHierarchicalVaultIndex(input);
      expect(result).toContain("# Vault Index");
    });

    it("should handle empty scopes gracefully", () => {
      const input = {
        scopes: [],
        factsByScope: {},
        entities: [],
      };
      const result = generateHierarchicalVaultIndex(input);
      expect(result).toBeTruthy();
      expect(result.startsWith("# Vault Index")).toBe(true);
    });

    it("should handle single empty scope", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Private" }],
        factsByScope: { scope1: [] },
        entities: [],
      };
      const result = generateHierarchicalVaultIndex(input);
      expect(result).toContain("## Scope: Private");
      expect(result).toContain("(no indexed facts)");
    });

    it("should sort scopes alphabetically", () => {
      const input = {
        scopes: [
          { _id: "scope-z", name: "Zebra" },
          { _id: "scope-a", name: "Alpha" },
          { _id: "scope-m", name: "Mango" },
        ],
        factsByScope: {
          "scope-z": [],
          "scope-a": [],
          "scope-m": [],
        },
        entities: [],
      };
      const result = generateHierarchicalVaultIndex(input);
      const alphaIndex = result.indexOf("## Scope: Alpha");
      const mangoIndex = result.indexOf("## Scope: Mango");
      const zebraIndex = result.indexOf("## Scope: Zebra");
      expect(alphaIndex).toBeLessThan(mangoIndex);
      expect(mangoIndex).toBeLessThan(zebraIndex);
    });

    it("should group facts by entity type in defined order", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "About tool X",
              scopeId: "scope1",
              entityIds: ["tool1"],
              timestamp: 1000,
            },
            {
              _id: "fact2",
              content: "About person Y",
              scopeId: "scope1",
              entityIds: ["person1"],
              timestamp: 2000,
            },
            {
              _id: "fact3",
              content: "About project Z",
              scopeId: "scope1",
              entityIds: ["project1"],
              timestamp: 3000,
            },
          ],
        },
        entities: [
          { entityId: "tool1", name: "Tool", type: "tool" },
          { entityId: "person1", name: "Person", type: "person" },
          { entityId: "project1", name: "Project", type: "project" },
        ],
      };
      const result = generateHierarchicalVaultIndex(input);
      const personIndex = result.indexOf("### People");
      const projectIndex = result.indexOf("### Projects");
      const toolIndex = result.indexOf("### Tools");
      // Should be: person, project, tool (by TYPE_ORDER)
      expect(personIndex).toBeLessThan(projectIndex);
      expect(projectIndex).toBeLessThan(toolIndex);
    });

    it("should sort entities alphabetically within type", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "About Zebra",
              scopeId: "scope1",
              entityIds: ["zebra"],
              timestamp: 1000,
            },
            {
              _id: "fact2",
              content: "About Alpha",
              scopeId: "scope1",
              entityIds: ["alpha"],
              timestamp: 2000,
            },
            {
              _id: "fact3",
              content: "About Mango",
              scopeId: "scope1",
              entityIds: ["mango"],
              timestamp: 3000,
            },
          ],
        },
        entities: [
          { entityId: "zebra", name: "Zebra", type: "project" },
          { entityId: "alpha", name: "Alpha", type: "project" },
          { entityId: "mango", name: "Mango", type: "project" },
        ],
      };
      const result = generateHierarchicalVaultIndex(input);
      const alphaIndex = result.indexOf("- Alpha");
      const mangoIndex = result.indexOf("- Mango");
      const zebraIndex = result.indexOf("- Zebra");
      expect(alphaIndex).toBeLessThan(mangoIndex);
      expect(mangoIndex).toBeLessThan(zebraIndex);
    });

    it("should truncate fact content to maxFactChars", () => {
      const longContent = "a".repeat(200);
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: longContent,
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 1000,
            },
          ],
        },
        entities: [{ entityId: "entity1", name: "Entity", type: "concept" }],
        maxFactChars: 50,
      };
      const result = generateHierarchicalVaultIndex(input);
      expect(result).not.toContain(longContent);
      expect(result).toContain("...");
    });

    it("should use default maxFactChars of 80", () => {
      const content = "x".repeat(150);
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: content,
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 1000,
            },
          ],
        },
        entities: [{ entityId: "entity1", name: "Entity", type: "concept" }],
      };
      const result = generateHierarchicalVaultIndex(input);
      const lines = result.split("\n");
      const factLine = lines.find((line) => line.includes("  - "));
      expect(factLine).toBeTruthy();
      // Should be truncated
      expect(factLine!.length).toBeLessThan(content.length + 10);
    });

    it("should limit facts per entity to maxFactsPerEntity", () => {
      const facts = Array.from({ length: 20 }, (_, i) => ({
        _id: `fact${i}`,
        content: `Fact ${i}`,
        scopeId: "scope1",
        entityIds: ["entity1"],
        timestamp: i * 1000,
        importanceScore: Math.random(),
      }));
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: { scope1: facts },
        entities: [{ entityId: "entity1", name: "Entity", type: "concept" }],
        maxFactsPerEntity: 5,
      };
      const result = generateHierarchicalVaultIndex(input);
      const factLines = result.split("\n").filter((line) => line.includes("  - "));
      expect(factLines.length).toBeLessThanOrEqual(5);
    });

    it("should use default maxFactsPerEntity of 5", () => {
      const facts = Array.from({ length: 10 }, (_, i) => ({
        _id: `fact${i}`,
        content: `Fact ${i}`,
        scopeId: "scope1",
        entityIds: ["entity1"],
        timestamp: i * 1000,
      }));
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: { scope1: facts },
        entities: [{ entityId: "entity1", name: "Entity", type: "concept" }],
      };
      const result = generateHierarchicalVaultIndex(input);
      const factLines = result.split("\n").filter((line) => line.includes("  - "));
      expect(factLines.length).toBeLessThanOrEqual(5);
    });

    it("should sort facts by importance score then timestamp", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "Low importance, recent",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 3000,
              importanceScore: 0.2,
            },
            {
              _id: "fact2",
              content: "High importance, old",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 1000,
              importanceScore: 0.9,
            },
            {
              _id: "fact3",
              content: "Medium importance, new",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 4000,
              importanceScore: 0.5,
            },
          ],
        },
        entities: [{ entityId: "entity1", name: "Entity", type: "concept" }],
        maxFactsPerEntity: 3,
      };
      const result = generateHierarchicalVaultIndex(input);
      const lines = result.split("\n");
      const factLines = lines.filter((line) => line.includes("  - "));
      // Should be ordered by importance: high (0.9), medium (0.5), low (0.2)
      expect(factLines[0]).toContain("High importance");
      expect(factLines[1]).toContain("Medium importance");
      expect(factLines[2]).toContain("Low importance");
    });

    it("should filter out inactive facts", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "Active fact",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 1000,
              lifecycleState: "active",
            },
            {
              _id: "fact2",
              content: "Archived fact",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 2000,
              lifecycleState: "archived",
            },
            {
              _id: "fact3",
              content: "Default state (should be active)",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 3000,
            },
          ],
        },
        entities: [{ entityId: "entity1", name: "Entity", type: "concept" }],
      };
      const result = generateHierarchicalVaultIndex(input);
      expect(result).toContain("Active fact");
      expect(result).not.toContain("Archived fact");
      expect(result).toContain("Default state");
    });

    it("should handle entity with no facts", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [],
        },
        entities: [{ entityId: "entity1", name: "Entity", type: "concept" }],
      };
      const result = generateHierarchicalVaultIndex(input);
      expect(result).toContain("(no indexed facts)");
      expect(result).not.toContain("- Entity");
    });

    it("should handle unknown entity types gracefully", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "About unknown type",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 1000,
            },
          ],
        },
        entities: [{ entityId: "entity1", name: "Entity", type: "unknown_type" }],
      };
      const result = generateHierarchicalVaultIndex(input);
      expect(result).toContain("### Unknown_types");
      expect(result).toContain("Entity");
    });

    it("should handle missing entity metadata (use fallback)", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "Fact text",
              scopeId: "scope1",
              entityIds: ["unknown_entity"],
              timestamp: 1000,
            },
          ],
        },
        entities: [], // No entity metadata
      };
      const result = generateHierarchicalVaultIndex(input);
      expect(result).toContain("unknown_entity");
      expect(result).toContain("Fact text");
    });

    it("should handle multiple facts per entity", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "Fact 1",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 1000,
            },
            {
              _id: "fact2",
              content: "Fact 2",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 2000,
            },
            {
              _id: "fact3",
              content: "Fact 3",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 3000,
            },
          ],
        },
        entities: [{ entityId: "entity1", name: "Entity", type: "concept" }],
        maxFactsPerEntity: 3,
      };
      const result = generateHierarchicalVaultIndex(input);
      expect(result).toContain("Fact 1");
      expect(result).toContain("Fact 2");
      expect(result).toContain("Fact 3");
    });

    it("should handle facts with multiple entity IDs", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "Shared fact",
              scopeId: "scope1",
              entityIds: ["entity1", "entity2"],
              timestamp: 1000,
            },
          ],
        },
        entities: [
          { entityId: "entity1", name: "Entity1", type: "person" },
          { entityId: "entity2", name: "Entity2", type: "project" },
        ],
      };
      const result = generateHierarchicalVaultIndex(input);
      expect(result).toContain("Entity1");
      expect(result).toContain("Entity2");
      expect(result).toContain("Shared fact");
    });

    it("should handle duplicate entity IDs in fact (deduplication)", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "Fact with duplicates",
              scopeId: "scope1",
              entityIds: ["entity1", "entity1", "entity1"],
              timestamp: 1000,
            },
          ],
        },
        entities: [{ entityId: "entity1", name: "Entity", type: "concept" }],
      };
      const result = generateHierarchicalVaultIndex(input);
      const factLines = result.split("\n").filter((line) => line.includes("Fact with duplicates"));
      expect(factLines.length).toBe(1); // Should appear only once
    });

    it("should handle empty content strings", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 1000,
            },
          ],
        },
        entities: [{ entityId: "entity1", name: "Entity", type: "concept" }],
      };
      const result = generateHierarchicalVaultIndex(input);
      // Empty content should still produce a fact line with indentation
      expect(result).toContain("  -");
      expect(result).toContain("- Entity");
    });

    it("should handle whitespace-only content", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "   \n\t  ",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 1000,
            },
          ],
        },
        entities: [{ entityId: "entity1", name: "Entity", type: "concept" }],
      };
      const result = generateHierarchicalVaultIndex(input);
      expect(result).toContain("- Entity");
    });

    it("should end with single newline", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "Fact",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 1000,
            },
          ],
        },
        entities: [{ entityId: "entity1", name: "Entity", type: "concept" }],
      };
      const result = generateHierarchicalVaultIndex(input);
      expect(result.endsWith("\n")).toBe(true);
      expect(result.endsWith("\n\n")).toBe(false);
    });

    it("should handle very large datasets", () => {
      const facts = Array.from({ length: 1000 }, (_, i) => ({
        _id: `fact${i}`,
        content: `Fact ${i}`,
        scopeId: "scope1",
        entityIds: [`entity${i % 100}`],
        timestamp: i * 1000,
        importanceScore: Math.random(),
      }));
      const entities = Array.from({ length: 100 }, (_, i) => ({
        entityId: `entity${i}`,
        name: `Entity ${i}`,
        type: i % 5 === 0 ? "person" : i % 5 === 1 ? "project" : "concept",
      }));
      const input = {
        scopes: [{ _id: "scope1", name: "Large" }],
        factsByScope: { scope1: facts },
        entities,
        maxFactsPerEntity: 5,
      };
      const result = generateHierarchicalVaultIndex(input);
      expect(result).toContain("## Scope: Large");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle multiple scopes with separate facts", () => {
      const input = {
        scopes: [
          { _id: "scope1", name: "Private" },
          { _id: "scope2", name: "Shared" },
        ],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "Private fact",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 1000,
            },
          ],
          scope2: [
            {
              _id: "fact2",
              content: "Shared fact",
              scopeId: "scope2",
              entityIds: ["entity2"],
              timestamp: 2000,
            },
          ],
        },
        entities: [
          { entityId: "entity1", name: "Entity1", type: "person" },
          { entityId: "entity2", name: "Entity2", type: "project" },
        ],
      };
      const result = generateHierarchicalVaultIndex(input);
      expect(result).toContain("## Scope: Private");
      expect(result).toContain("## Scope: Shared");
      expect(result).toContain("Private fact");
      expect(result).toContain("Shared fact");
    });
  });

  describe("Index Structure and Parsing", () => {
    it("should have hierarchical markdown structure", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "Fact",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 1000,
            },
          ],
        },
        entities: [{ entityId: "entity1", name: "Entity", type: "concept" }],
      };
      const result = generateHierarchicalVaultIndex(input);
      const lines = result.split("\n");

      const headerLine = lines.find((l) => l === "# Vault Index");
      const scopeLine = lines.find((l) => l.startsWith("## Scope:"));
      const typeLine = lines.find((l) => l.startsWith("###"));

      expect(headerLine).toBeTruthy();
      expect(scopeLine).toBeTruthy();
      expect(typeLine).toBeTruthy();
    });

    it("should extract scope sections", () => {
      const input = {
        scopes: [
          { _id: "scope1", name: "Alpha" },
          { _id: "scope2", name: "Beta" },
        ],
        factsByScope: {
          scope1: [],
          scope2: [],
        },
        entities: [],
      };
      const result = generateHierarchicalVaultIndex(input);
      const scopeHeaders = result.match(/## Scope: \w+/g) || [];
      expect(scopeHeaders.length).toBe(2);
    });

    it("should be parseable as markdown", () => {
      const input = {
        scopes: [{ _id: "scope1", name: "Test" }],
        factsByScope: {
          scope1: [
            {
              _id: "fact1",
              content: "Test fact",
              scopeId: "scope1",
              entityIds: ["entity1"],
              timestamp: 1000,
            },
          ],
        },
        entities: [{ entityId: "entity1", name: "Entity", type: "concept" }],
      };
      const result = generateHierarchicalVaultIndex(input);

      // Should be valid markdown
      expect(result).toMatch(/^# /m);
      expect(result).toMatch(/^## /m);
      expect(result).toMatch(/^### /m);
      expect(result).toMatch(/^- /m);
    });
  });

  describe("Cache Constants", () => {
    it("should define vault index cache key", () => {
      expect(VAULT_INDEX_CACHE_KEY).toBe("vault_index");
    });

    it("should define vault index dirty flag key", () => {
      expect(VAULT_INDEX_DIRTY_KEY).toBe("vault_index_dirty_since");
    });
  });
});
