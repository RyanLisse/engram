import { describe, test, expect } from "vitest";
import { generateHierarchicalVaultIndex } from "../convex/lib/vaultIndex";

describe("generateHierarchicalVaultIndex", () => {
  const index = generateHierarchicalVaultIndex({
    scopes: [
      { _id: "scope-2", name: "team-ml" },
      { _id: "scope-1", name: "private-ryan" },
    ],
    factsByScope: {
      "scope-1": [
        {
          _id: "fact-1",
          content: "Ryan prefers Bun for TypeScript tooling and build speed.",
          scopeId: "scope-1",
          entityIds: ["entity-ryan", "entity-bun"],
          timestamp: Date.UTC(2026, 1, 24),
          importanceScore: 0.9,
          lifecycleState: "active",
        },
        {
          _id: "fact-2",
          content: "Engram stores memories in Convex and uses scoped retrieval.",
          scopeId: "scope-1",
          entityIds: ["entity-engram"],
          timestamp: Date.UTC(2026, 1, 23),
          importanceScore: 0.8,
          lifecycleState: "active",
        },
      ],
      "scope-2": [
        {
          _id: "fact-3",
          content: "Alice works on project Atlas and tracks experiments weekly.",
          scopeId: "scope-2",
          entityIds: ["entity-alice", "entity-atlas"],
          timestamp: Date.UTC(2026, 1, 22),
          importanceScore: 0.7,
          lifecycleState: "active",
        },
      ],
    },
    entities: [
      { entityId: "entity-ryan", name: "Ryan", type: "person" },
      { entityId: "entity-bun", name: "Bun", type: "tool" },
      { entityId: "entity-engram", name: "Engram", type: "project" },
      { entityId: "entity-alice", name: "Alice", type: "person" },
      { entityId: "entity-atlas", name: "Atlas", type: "project" },
    ],
    maxFactsPerEntity: 2,
    maxFactChars: 50,
  });

  test("has vault index header", () => {
    expect(index).toMatch(/^# Vault Index/m);
  });

  test("contains scope sections", () => {
    expect(index).toMatch(/## Scope: private-ryan/);
    expect(index).toMatch(/## Scope: team-ml/);
  });

  test("has entity type headings", () => {
    expect(index).toMatch(/### People/);
    expect(index).toMatch(/### Tools/);
  });

  test("lists entities under correct headings", () => {
    expect(index).toMatch(/- Ryan/);
  });

  test("truncates fact content with ellipsis", () => {
    expect(index).toMatch(/  - Ryan prefers Bun for TypeScript tooling and bui\.{3}/);
  });

  test("orders private scopes before team scopes", () => {
    expect(index.indexOf("## Scope: private-ryan")).toBeLessThan(
      index.indexOf("## Scope: team-ml"),
    );
  });
});
