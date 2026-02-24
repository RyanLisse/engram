import { describe, test, expect, vi, beforeEach } from "vitest";
import { getCacheFreshness, searchLocalCache } from "../src/lib/lance-cache.js";

describe("getCacheFreshness", () => {
  test("returns 1.0 for just-synced (< 1 min ago)", () => {
    const score = getCacheFreshness(Date.now() - 30_000); // 30s ago
    expect(score).toBe(1.0);
  });

  test("returns 0.0 for stale (> 10 min ago)", () => {
    const score = getCacheFreshness(Date.now() - 15 * 60 * 1000); // 15 min ago
    expect(score).toBe(0.0);
  });

  test("returns ~0.5 for 5.5 minutes ago", () => {
    // 5.5 minutes = 330_000 ms
    // Linear interpolation: 1 - (330000 - 60000) / (600000 - 60000) = 1 - 270000/540000 = 0.5
    const score = getCacheFreshness(Date.now() - 330_000);
    expect(score).toBeCloseTo(0.5, 1);
  });

  test("linear interpolation between fresh and stale thresholds", () => {
    // 3 minutes = 180_000 ms
    // 1 - (180000 - 60000) / (600000 - 60000) = 1 - 120000/540000 ≈ 0.778
    const score = getCacheFreshness(Date.now() - 180_000);
    expect(score).toBeCloseTo(0.778, 2);
    // Verify monotonically decreasing
    const earlier = getCacheFreshness(Date.now() - 120_000);
    const later = getCacheFreshness(Date.now() - 400_000);
    expect(earlier).toBeGreaterThan(score);
    expect(score).toBeGreaterThan(later);
  });
});

describe("searchLocalCache", () => {
  test("returns empty array when cache is not enabled (stub)", async () => {
    const results = await searchLocalCache([0.1, 0.2, 0.3], 10);
    expect(results).toEqual([]);
  });

  test("returns empty array with scope filter (stub)", async () => {
    const results = await searchLocalCache([0.1, 0.2], 5, "scope-123");
    expect(results).toEqual([]);
  });
});
