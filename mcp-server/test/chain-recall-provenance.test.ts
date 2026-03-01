import { beforeEach, describe, expect, test, vi } from "vitest";

const {
  mockResolveScopes,
  mockGetEntitiesPrimitive,
  mockSearchByQA,
  mockSearchFactsMulti,
  mockGetFact,
} = vi.hoisted(() => ({
  mockResolveScopes: vi.fn(),
  mockGetEntitiesPrimitive: vi.fn(),
  mockSearchByQA: vi.fn(),
  mockSearchFactsMulti: vi.fn(),
  mockGetFact: vi.fn(),
}));

vi.mock("../src/tools/context-primitives.js", () => ({
  resolveScopes: mockResolveScopes,
}));

vi.mock("../src/tools/primitive-retrieval.js", () => ({
  getEntitiesPrimitive: mockGetEntitiesPrimitive,
}));

vi.mock("../src/lib/convex-client.js", () => ({
  searchByQA: mockSearchByQA,
  searchFactsMulti: mockSearchFactsMulti,
  getFact: mockGetFact,
}));

import { chainRecall } from "../src/tools/chain-recall.js";

describe("chainRecall provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveScopes.mockResolvedValue({
      scopeIds: ["scope-1"],
      resolved: [{ id: "scope-1", name: "private-agent-1" }],
    });
    mockSearchFactsMulti.mockResolvedValue([]);
  });

  test("annotates hop-1 QA matches with QA provenance", async () => {
    mockSearchByQA.mockResolvedValue([
      {
        _id: "fact-seed",
        scopeId: "scope-1",
        lifecycleState: "active",
        qaQuestion: "What was decided about TypeScript?",
        qaConfidence: 0.82,
        entityIds: ["entity-typescript"],
      },
    ]);
    mockGetEntitiesPrimitive.mockResolvedValue([]);

    const result = await chainRecall({ query: "TypeScript", scopeId: "scope-1" }, "agent-1");

    expect("chain" in result).toBe(true);
    if ("chain" in result) {
      expect(result.chain[0]._chainProvenance.via).toBe("qa");
      expect(result.chain[0]._chainProvenance.qaQuestion).toContain("TypeScript");
    }
  });

  test("annotates temporal hop expansion with source fact and relation", async () => {
    mockSearchByQA.mockResolvedValue([
      {
        _id: "fact-seed",
        scopeId: "scope-1",
        lifecycleState: "active",
        qaQuestion: "What was decided about TypeScript?",
        entityIds: ["entity-typescript"],
      },
    ]);
    mockGetEntitiesPrimitive.mockResolvedValue([
      { backlinks: ["fact-related"] },
    ]);
    mockGetFact.mockImplementation(async (id: string) => {
      if (id === "fact-related") {
        return {
          _id: "fact-related",
          scopeId: "scope-1",
          lifecycleState: "active",
          entityIds: ["entity-typescript"],
          temporalLinks: [
            {
              targetFactId: "fact-linked",
              relation: "led_to",
              confidence: 0.91,
            },
          ],
          importanceScore: 0.9,
        };
      }
      if (id === "fact-linked") {
        return {
          _id: "fact-linked",
          scopeId: "scope-1",
          lifecycleState: "active",
          entityIds: [],
        };
      }
      return null;
    });

    const result = await chainRecall({ query: "TypeScript", scopeId: "scope-1" }, "agent-1");

    expect("chain" in result).toBe(true);
    if ("chain" in result) {
      const linked = result.chain.find((fact: any) => fact._id === "fact-linked");
      expect(linked._chainProvenance.via).toBe("temporal-link");
      expect(linked._chainProvenance.sourceFactId).toBe("fact-related");
      expect(linked._chainProvenance.relation).toBe("led_to");
    }
  });
});
