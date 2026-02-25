import { beforeEach, describe, expect, test, vi } from "vitest";

const { mockResolveScopes, mockGetEntitiesPrimitive, mockTextSearch, mockGetFact, mockGetConfig, mockGetRecentlyEnrichedFactIds } =
  vi.hoisted(() => ({
    mockResolveScopes: vi.fn(),
    mockGetEntitiesPrimitive: vi.fn(),
    mockTextSearch: vi.fn(),
    mockGetFact: vi.fn(),
    mockGetConfig: vi.fn(),
    mockGetRecentlyEnrichedFactIds: vi.fn(),
  }));

vi.mock("../src/tools/context-primitives.js", () => ({
  resolveScopes: mockResolveScopes,
}));

vi.mock("../src/tools/primitive-retrieval.js", () => ({
  getEntitiesPrimitive: mockGetEntitiesPrimitive,
  textSearch: mockTextSearch,
}));

vi.mock("../src/lib/convex-client.js", () => ({
  getFact: mockGetFact,
  getConfig: mockGetConfig,
  getRecentlyEnrichedFactIds: mockGetRecentlyEnrichedFactIds,
}));

import { hierarchicalRecall } from "../src/tools/hierarchical-recall.js";

describe("hierarchicalRecall", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockResolveScopes.mockResolvedValue({
      scopeIds: ["scope_1"],
      resolved: [{ id: "scope_1", name: "private-agent-1" }],
    });
    mockGetConfig.mockResolvedValue(null);
    mockGetEntitiesPrimitive.mockResolvedValue([]);
    mockTextSearch.mockResolvedValue([]);
    mockGetFact.mockResolvedValue(null);
    mockGetRecentlyEnrichedFactIds.mockResolvedValue(new Set());
  });

  test("uses cached vault index anchors as first traversal layer", async () => {
    const now = Date.now();
    mockGetConfig.mockResolvedValue({
      key: "vault_index",
      value: `# Vault Index

## Scope: private-agent-1
### Companies
- Acme Corp
  - Acme outage timeline and remediation plan
`,
    });

    mockGetEntitiesPrimitive.mockImplementation(async ({ query }) => {
      if (query === "Acme Corp") {
        return [
          {
            _id: "entity_1",
            entityId: "company:acme",
            name: "Acme Corp",
            importanceScore: 0.9,
            backlinks: ["fact_1"],
            relationships: [],
          },
        ];
      }
      return [];
    });

    mockGetFact.mockResolvedValue({
      _id: "fact_1",
      scopeId: "scope_1",
      content: "Incident summary",
      importanceScore: 0.8,
      timestamp: now,
      lifecycleState: "active",
      temporalLinks: [],
    });

    const result = await hierarchicalRecall({ query: "acme outage", limit: 5 }, "agent-1");

    expect("facts" in result).toBe(true);
    if ("facts" in result) {
      expect(result.facts).toHaveLength(1);
    }
    expect(mockGetEntitiesPrimitive).toHaveBeenCalledWith(
      expect.objectContaining({ query: "Acme Corp", limit: 2 }),
    );
    expect("traversalStats" in result && result.traversalStats.mode).toBe("index-anchored");
    expect("traversalStats" in result && result.traversalStats.indexAnchorsUsed).toBe(1);
    expect("traversalStats" in result && result.traversalStats.indexCacheHit).toBe(true);
  });

  test("returns fallback text mode when no entities are found", async () => {
    mockTextSearch.mockResolvedValue([
      {
        _id: "fact_fallback",
        scopeId: "scope_1",
        content: "fallback result",
      },
    ]);

    const result = await hierarchicalRecall({ query: "no matching entities" }, "agent-1");

    expect(mockTextSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: "no matching entities", scopeIds: ["scope_1"] }),
    );
    expect("facts" in result).toBe(true);
    if ("facts" in result) {
      expect(result.facts).toHaveLength(1);
    }
    expect("traversalStats" in result && result.traversalStats.mode).toBe("fallback-text");
    expect("traversalStats" in result && result.traversalStats.indexCacheHit).toBe(false);
  });
});
