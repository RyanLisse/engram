import { describe, test, expect } from "vitest";
import { freshnessScore, rankCandidates } from "../src/lib/ranking.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("freshnessScore", () => {
  test("without relevanceScore: same as before (linear 30-day decay)", () => {
    const now = Date.now();
    // Brand new fact — full freshness
    expect(freshnessScore(now)).toBeCloseTo(1.0, 2);
    // 15-day-old fact — half freshness
    expect(freshnessScore(now - 15 * DAY_MS)).toBeCloseTo(0.5, 1);
    // 30+ day old fact — zero freshness
    expect(freshnessScore(now - 60 * DAY_MS)).toBe(0);
  });

  test("with relevanceScore 1.0: boosts old facts", () => {
    const now = Date.now();
    const oldTimestamp = now - 25 * DAY_MS; // 25 days old
    const withoutRelevance = freshnessScore(oldTimestamp);
    const withRelevance = freshnessScore(oldTimestamp, 1.0);
    // timeFreshness ≈ 1 - 25/30 ≈ 0.167
    // blended = 0.6 * 0.167 + 0.4 * 1.0 = 0.5
    expect(withRelevance).toBeGreaterThan(withoutRelevance);
    expect(withRelevance).toBeCloseTo(0.5, 1);
  });

  test("with relevanceScore 0.01: does not help old facts much", () => {
    const now = Date.now();
    const oldTimestamp = now - 25 * DAY_MS;
    const withoutRelevance = freshnessScore(oldTimestamp);
    const withLowRelevance = freshnessScore(oldTimestamp, 0.01);
    // timeFreshness ≈ 0.167
    // blended = 0.6 * 0.167 + 0.4 * 0.01 ≈ 0.104
    // Without relevance: 0.167
    // With low relevance: 0.104 — actually lower due to 0.6 weight on time
    expect(withLowRelevance).toBeLessThan(withoutRelevance);
  });

  test("15-day-old fact with relevanceScore 0.9 scores higher than without", () => {
    const now = Date.now();
    const midTimestamp = now - 15 * DAY_MS;
    const withoutRelevance = freshnessScore(midTimestamp);
    const withRelevance = freshnessScore(midTimestamp, 0.9);
    // timeFreshness = 0.5
    // blended = 0.6 * 0.5 + 0.4 * 0.9 = 0.3 + 0.36 = 0.66
    expect(withRelevance).toBeGreaterThan(withoutRelevance);
    expect(withRelevance).toBeCloseTo(0.66, 1);
  });
});

describe("rankCandidates with relevanceScore", () => {
  test("candidates with high relevanceScore rank higher when age is equal", () => {
    const now = Date.now();
    const oldTimestamp = now - 20 * DAY_MS;
    const ranked = rankCandidates("query", [
      { _id: "no-relevance", content: "query data", timestamp: oldTimestamp, _score: 0.8, importanceScore: 0.5 },
      { _id: "with-relevance", content: "query data", timestamp: oldTimestamp, _score: 0.8, importanceScore: 0.5, relevanceScore: 0.95 },
    ]);
    expect(ranked[0]._id).toBe("with-relevance");
  });
});
