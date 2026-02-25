import { strict as assert } from "node:assert";
import { generateHierarchicalVaultIndex } from "../convex/lib/vaultIndex";

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

assert.match(index, /^# Vault Index/m);
assert.match(index, /## Scope: private-ryan/);
assert.match(index, /### People/);
assert.match(index, /- Ryan/);
assert.match(index, /  - Ryan prefers Bun for TypeScript tooling and bui\.{3}/);
assert.match(index, /### Tools/);
assert.match(index, /## Scope: team-ml/);
assert.ok(index.indexOf("## Scope: private-ryan") < index.indexOf("## Scope: team-ml"));

console.log("vault-index: PASS");
