import { describe, test, expect } from "vitest";
import { reciprocalRankFusion, extractEntityIds } from "../src/lib/rrf.js";

// ── RRF tests — NO mocking, real algorithm ──────────────────────────

describe("Reciprocal Rank Fusion", () => {
  // ── Core ranking behavior ──────────────────────────────────────

  test("ranks items found in both systems highest", () => {
    const semantic = [
      { _id: "a", content: "semantic a", _score: 0.9 },
      { _id: "b", content: "semantic b", _score: 0.7 },
      { _id: "c", content: "semantic c", _score: 0.5 },
    ];
    const symbolic = [
      { _id: "b", content: "symbolic b", _score: 0.8 },
      { _id: "d", content: "symbolic d", _score: 0.6 },
      { _id: "a", content: "symbolic a", _score: 0.4 },
    ];

    const fused = reciprocalRankFusion([semantic, symbolic]);

    // "a" and "b" appear in both — should have highest scores
    const topTwo = fused.slice(0, 2).map((r) => r._id);
    expect(topTwo).toContain("a");
    expect(topTwo).toContain("b");

    // "b" should rank highest: rank 1 in semantic + rank 0 in symbolic
    // "a" should be second: rank 0 in semantic + rank 2 in symbolic
    // Both beat "c" and "d" which appear in only one list
    expect(fused[0].rrf_score).toBeGreaterThan(fused[2].rrf_score);
  });

  test("k=60 produces expected rankings for known inputs", () => {
    const k = 60;
    const list1 = [
      { _id: "x", content: "x" },
      { _id: "y", content: "y" },
    ];
    const list2 = [
      { _id: "y", content: "y" },
      { _id: "z", content: "z" },
    ];

    const fused = reciprocalRankFusion([list1, list2], k);

    // "y" appears in both lists:
    //   list1 rank 1: 1/(60+1+1) = 1/62
    //   list2 rank 0: 1/(60+0+1) = 1/61
    //   total = 1/62 + 1/61
    const expectedY = 1 / 62 + 1 / 61;

    // "x" appears only in list1 rank 0:
    //   1/(60+0+1) = 1/61
    const expectedX = 1 / 61;

    // "z" appears only in list2 rank 1:
    //   1/(60+1+1) = 1/62
    const expectedZ = 1 / 62;

    expect(fused[0]._id).toBe("y");
    expect(fused[0].rrf_score).toBeCloseTo(expectedY, 10);

    expect(fused[1]._id).toBe("x");
    expect(fused[1].rrf_score).toBeCloseTo(expectedX, 10);

    expect(fused[2]._id).toBe("z");
    expect(fused[2].rrf_score).toBeCloseTo(expectedZ, 10);
  });

  // ── Edge cases ──────────────────────────────────────────────────

  test("handles empty first result set", () => {
    const results = reciprocalRankFusion([
      [],
      [{ _id: "a", content: "a" }],
    ]);

    expect(results.length).toBe(1);
    expect(results[0]._id).toBe("a");
    expect(results[0].rrf_score).toBeCloseTo(1 / 61, 10);
  });

  test("handles empty second result set", () => {
    const results = reciprocalRankFusion([
      [{ _id: "a", content: "a" }],
      [],
    ]);

    expect(results.length).toBe(1);
    expect(results[0]._id).toBe("a");
  });

  test("handles both empty", () => {
    const results = reciprocalRankFusion([[], []]);
    expect(results).toEqual([]);
  });

  test("handles single result set", () => {
    const results = reciprocalRankFusion([
      [
        { _id: "a", content: "a" },
        { _id: "b", content: "b" },
      ],
    ]);

    expect(results.length).toBe(2);
    expect(results[0]._id).toBe("a");
    expect(results[1]._id).toBe("b");
  });

  test("handles three result sets (tri-pathway)", () => {
    const semantic = [{ _id: "a", content: "a" }, { _id: "b", content: "b" }];
    const symbolic = [{ _id: "b", content: "b" }, { _id: "c", content: "c" }];
    const topological = [{ _id: "c", content: "c" }, { _id: "a", content: "a" }];

    const results = reciprocalRankFusion([semantic, symbolic, topological]);

    // All three items appear in exactly 2 of 3 lists
    expect(results.length).toBe(3);
    // All should have rrf_score > 0
    for (const r of results) {
      expect(r.rrf_score).toBeGreaterThan(0);
    }
  });

  test("preserves original fields on merged results", () => {
    const results = reciprocalRankFusion([
      [{ _id: "a", content: "hello", extra: 42 }],
    ]);

    expect(results[0].content).toBe("hello");
    expect((results[0] as any).extra).toBe(42);
    expect(results[0].rrf_score).toBeDefined();
  });

  // ── Custom k values ─────────────────────────────────────────────

  test("smaller k value increases score differentiation", () => {
    const list1 = [
      { _id: "a", content: "a" },
      { _id: "b", content: "b" },
    ];

    const resultK1 = reciprocalRankFusion([list1], 1);
    const resultK60 = reciprocalRankFusion([list1], 60);

    // With k=1, scores are 1/2 and 1/3 (spread = 0.167)
    // With k=60, scores are 1/61 and 1/62 (spread = 0.000266)
    const spreadK1 = resultK1[0].rrf_score - resultK1[1].rrf_score;
    const spreadK60 = resultK60[0].rrf_score - resultK60[1].rrf_score;

    expect(spreadK1).toBeGreaterThan(spreadK60);
  });
});

// ── extractEntityIds ─────────────────────────────────────────────────

describe("extractEntityIds", () => {
  test("extracts unique entity IDs from facts", () => {
    const facts = [
      { _id: "a", entityIds: ["e1", "e2"] },
      { _id: "b", entityIds: ["e2", "e3"] },
      { _id: "c", entityIds: ["e1"] },
    ];

    const ids = extractEntityIds(facts);
    expect(ids.sort()).toEqual(["e1", "e2", "e3"]);
  });

  test("handles facts without entityIds", () => {
    const facts = [
      { _id: "a" },
      { _id: "b", entityIds: ["e1"] },
    ];

    const ids = extractEntityIds(facts);
    expect(ids).toEqual(["e1"]);
  });

  test("handles empty facts array", () => {
    const ids = extractEntityIds([]);
    expect(ids).toEqual([]);
  });

  test("handles all facts without entityIds", () => {
    const facts = [{ _id: "a" }, { _id: "b" }];
    const ids = extractEntityIds(facts);
    expect(ids).toEqual([]);
  });
});
