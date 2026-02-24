/**
 * Tests for tri-pathway recall: semantic + symbolic + topological (graph) retrieval
 * with Reciprocal Rank Fusion (RRF) merging.
 */
import { describe, expect, test } from "vitest";
import { reciprocalRankFusion, extractEntityIds } from "../src/lib/rrf.js";

describe("reciprocalRankFusion", () => {
  test("merges results from multiple pathways with correct scoring", () => {
    const semantic = [
      { _id: "a", content: "alpha" },
      { _id: "b", content: "beta" },
      { _id: "c", content: "gamma" },
    ];
    const symbolic = [
      { _id: "b", content: "beta" },
      { _id: "d", content: "delta" },
    ];
    const graph = [
      { _id: "c", content: "gamma" },
      { _id: "e", content: "epsilon" },
    ];

    const merged = reciprocalRankFusion([semantic, symbolic, graph], 60);

    // b and c appear in 2 lists each, so they should rank higher
    const ids = merged.map((r) => r._id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toContain("c");
    expect(ids).toContain("d");
    expect(ids).toContain("e");
    expect(merged.length).toBe(5);

    // b appears at rank 0 in symbolic (1/(60+1)) and rank 1 in semantic (1/(60+2))
    // c appears at rank 2 in semantic (1/(60+3)) and rank 0 in graph (1/(60+1))
    const bScore = merged.find((r) => r._id === "b")!.rrf_score;
    const aScore = merged.find((r) => r._id === "a")!.rrf_score;
    expect(bScore).toBeGreaterThan(aScore); // b in 2 lists > a in 1 list
  });

  test("handles empty result sets gracefully", () => {
    const merged = reciprocalRankFusion([[], [], [{ _id: "x", content: "only" }]]);
    expect(merged.length).toBe(1);
    expect(merged[0]._id).toBe("x");
    expect(merged[0].rrf_score).toBeGreaterThan(0);
  });

  test("handles single result set (no fusion needed)", () => {
    const single = [
      { _id: "a", content: "alpha" },
      { _id: "b", content: "beta" },
    ];
    const merged = reciprocalRankFusion([single]);
    expect(merged.length).toBe(2);
    expect(merged[0]._id).toBe("a"); // rank 0 has higher RRF score
    expect(merged[0].rrf_score).toBeGreaterThan(merged[1].rrf_score);
  });

  test("preserves all properties from the first occurrence of a fact", () => {
    const set1 = [{ _id: "a", content: "alpha", importanceScore: 0.9, tags: ["important"] }];
    const set2 = [{ _id: "a", content: "alpha-different", importanceScore: 0.1 }];
    const merged = reciprocalRankFusion([set1, set2]);
    expect(merged.length).toBe(1);
    // First occurrence wins for properties
    expect(merged[0].content).toBe("alpha");
    expect(merged[0].importanceScore).toBe(0.9);
  });

  test("uses default k=60 when not specified", () => {
    const results = [{ _id: "a", content: "test" }];
    const merged = reciprocalRankFusion([results]);
    // rank 0, k=60: score = 1/(60+0+1) = 1/61
    expect(merged[0].rrf_score).toBeCloseTo(1 / 61, 10);
  });

  test("sorts by descending RRF score", () => {
    // Create a scenario where later items in one list appear earlier in another
    const set1 = [
      { _id: "a", content: "a" },
      { _id: "b", content: "b" },
      { _id: "c", content: "c" },
    ];
    const set2 = [
      { _id: "c", content: "c" },
      { _id: "b", content: "b" },
      { _id: "a", content: "a" },
    ];

    const merged = reciprocalRankFusion([set1, set2]);
    // All 3 appear in both lists. Scores:
    // a: 1/61 + 1/63 = (63+61)/(61*63)
    // b: 1/62 + 1/62 = 2/62
    // c: 1/63 + 1/61 = same as a
    // b should have highest score (both at rank 1: 2/62 vs a's 1/61+1/63)
    for (let i = 0; i < merged.length - 1; i++) {
      expect(merged[i].rrf_score).toBeGreaterThanOrEqual(merged[i + 1].rrf_score);
    }
  });
});

describe("extractEntityIds", () => {
  test("extracts unique entity IDs from facts", () => {
    const facts = [
      { _id: "1", entityIds: ["ent-a", "ent-b"] },
      { _id: "2", entityIds: ["ent-b", "ent-c"] },
      { _id: "3" }, // no entityIds
    ];
    const ids = extractEntityIds(facts);
    expect(ids).toEqual(["ent-a", "ent-b", "ent-c"]);
  });

  test("returns empty array when no entities found", () => {
    const facts = [{ _id: "1" }, { _id: "2", entityIds: [] }];
    const ids = extractEntityIds(facts);
    expect(ids).toEqual([]);
  });
});
