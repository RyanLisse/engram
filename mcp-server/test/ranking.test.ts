import { describe, expect, test } from "vitest";
import { rankCandidates } from "../src/lib/ranking.js";

describe("ranking", () => {
  test("prioritizes higher semantic and importance", () => {
    const ranked = rankCandidates("query", [
      { _id: "a", content: "a", timestamp: Date.now(), _score: 0.9, importanceScore: 0.7 },
      { _id: "b", content: "b", timestamp: Date.now(), _score: 0.4, importanceScore: 0.2 },
    ] as any);
    expect(ranked[0]._id).toBe("a");
  });

  test("includes freshness and outcome in ordering", () => {
    const now = Date.now();
    const ranked = rankCandidates("incident", [
      { _id: "old", content: "incident old", timestamp: now - 60 * 24 * 60 * 60 * 1000, _score: 0.7, outcomeScore: 0.3 },
      { _id: "new", content: "incident new", timestamp: now, _score: 0.7, outcomeScore: 0.8 },
    ] as any);
    expect(ranked[0]._id).toBe("new");
  });

  test("applies emotional weight boost", () => {
    const now = Date.now();
    const ranked = rankCandidates("incident", [
      { _id: "neutral", content: "incident details", timestamp: now, _score: 0.8, emotionalWeight: 0.0 },
      { _id: "emotional", content: "incident details", timestamp: now, _score: 0.8, emotionalWeight: 1.0 },
    ] as any);
    expect(ranked[0]._id).toBe("emotional");
  });
});
