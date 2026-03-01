import { describe, expect, test } from "vitest";
import { filterSummariesForReflection } from "../../convex/actions/reflector.js";

describe("filterSummariesForReflection", () => {
  const now = Date.UTC(2026, 2, 1, 12, 0, 0);

  test("filters out summaries older than the requested time window", () => {
    const summaries = [
      { content: "recent summary", timestamp: now - 2 * 60 * 60 * 1000 },
      { content: "stale summary", timestamp: now - 30 * 60 * 60 * 1000 },
    ];

    const result = filterSummariesForReflection(summaries, {
      now,
      timeWindowHours: 24,
    });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("recent summary");
  });

  test("filters by explicit entity ids when present", () => {
    const summaries = [
      { content: "auth changes", timestamp: now, entityIds: ["entity-auth"] },
      { content: "db changes", timestamp: now, entityIds: ["entity-db"] },
    ];

    const result = filterSummariesForReflection(summaries, {
      now,
      focusEntities: ["entity-db"],
    });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("db changes");
  });

  test("falls back to content matching when summaries do not have entity ids", () => {
    const summaries = [
      { content: "Auth pipeline now caches tokens", timestamp: now },
      { content: "Billing alerts were consolidated", timestamp: now },
    ];

    const result = filterSummariesForReflection(summaries, {
      now,
      focusEntities: ["entity-auth"],
    });

    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("Auth");
  });
});
