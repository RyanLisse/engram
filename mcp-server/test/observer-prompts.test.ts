import { describe, test, expect } from "vitest";
import {
  classifyAssertion,
  extractStateChanges,
  computeObservationFingerprint,
  detectDegenerateRepetition,
} from "../src/lib/observer-prompts.js";

// ---------------------------------------------------------------------------
// classifyAssertion
// ---------------------------------------------------------------------------
describe("classifyAssertion", () => {
  test("detects questions ending with ?", () => {
    expect(classifyAssertion("What is the status?")).toBe("question");
  });

  test("detects questions starting with interrogative words", () => {
    expect(classifyAssertion("How does the pipeline work")).toBe("question");
    expect(classifyAssertion("Why was this changed")).toBe("question");
    expect(classifyAssertion("Is the build green")).toBe("question");
    expect(classifyAssertion("Could we use a different approach")).toBe("question");
  });

  test("detects assertions with decision verbs", () => {
    expect(classifyAssertion("We decided to use PostgreSQL")).toBe("assertion");
    expect(classifyAssertion("The team deployed the fix to production")).toBe("assertion");
    expect(classifyAssertion("Config was updated to use v2 API")).toBe("assertion");
    expect(classifyAssertion("Bug resolved by reverting the migration")).toBe("assertion");
  });

  test("returns neutral for ordinary statements", () => {
    expect(classifyAssertion("The server is running on port 3000")).toBe("neutral");
    expect(classifyAssertion("Three agents are active")).toBe("neutral");
    expect(classifyAssertion("Memory usage is at 42%")).toBe("neutral");
  });

  test("handles whitespace-padded input", () => {
    expect(classifyAssertion("  What happened?  ")).toBe("question");
    expect(classifyAssertion("  We confirmed the fix  ")).toBe("assertion");
  });
});

// ---------------------------------------------------------------------------
// extractStateChanges
// ---------------------------------------------------------------------------
describe("extractStateChanges", () => {
  test("extracts 'changed from X to Y' pattern", () => {
    const changes = extractStateChanges("Status changed from pending to active.");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ subject: "Status", from: "pending", to: "active" });
  });

  test("extracts 'switched X from Y to Z' pattern", () => {
    const changes = extractStateChanges("switched backend from REST to GraphQL.");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ subject: "backend", from: "REST", to: "GraphQL" });
  });

  test("extracts 'updated X from Y to Z' pattern", () => {
    const changes = extractStateChanges("updated Node version from 18 to 20.");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ subject: "Node version", from: "18", to: "20" });
  });

  test("returns empty array when no state changes", () => {
    expect(extractStateChanges("Everything is fine")).toEqual([]);
    expect(extractStateChanges("The server restarted")).toEqual([]);
  });

  test("extracts multiple state changes from one string", () => {
    const content =
      "Status changed from pending to active. Priority changed from low to high.";
    const changes = extractStateChanges(content);
    expect(changes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// computeObservationFingerprint
// ---------------------------------------------------------------------------
describe("computeObservationFingerprint", () => {
  test("returns deterministic 8-char hex string", () => {
    const obs = [{ content: "hello world" }];
    const a = computeObservationFingerprint(obs);
    const b = computeObservationFingerprint(obs);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  test("different content produces different hash", () => {
    const a = computeObservationFingerprint([{ content: "alpha" }]);
    const b = computeObservationFingerprint([{ content: "beta" }]);
    expect(a).not.toBe(b);
  });

  test("order of observations does not matter (sorted internally)", () => {
    const a = computeObservationFingerprint([
      { content: "first" },
      { content: "second" },
    ]);
    const b = computeObservationFingerprint([
      { content: "second" },
      { content: "first" },
    ]);
    expect(a).toBe(b);
  });

  test("includes observationTier in fingerprint", () => {
    const withTier = computeObservationFingerprint([
      { content: "hello", observationTier: "critical" },
    ]);
    const withoutTier = computeObservationFingerprint([{ content: "hello" }]);
    expect(withTier).not.toBe(withoutTier);
  });
});

// ---------------------------------------------------------------------------
// detectDegenerateRepetition
// ---------------------------------------------------------------------------
describe("detectDegenerateRepetition", () => {
  test("empty observations returns degenerate: false with totalWindows: 0", () => {
    const result = detectDegenerateRepetition([]);
    expect(result).toEqual({
      degenerate: false,
      overlapRatio: 0,
      matchedWindows: 0,
      totalWindows: 0,
    });
  });

  test("short content (< windowSize) returns gracefully", () => {
    const result = detectDegenerateRepetition(
      [{ content: "short text" }],
      undefined,
      200,
    );
    expect(result.degenerate).toBe(false);
    expect(result.totalWindows).toBe(0);
  });

  test("highly repetitive content is detected as degenerate", () => {
    // Repeat the same 250-char block many times so sliding windows match
    const block = "A".repeat(250);
    const observations = Array.from({ length: 10 }, () => ({ content: block }));

    const result = detectDegenerateRepetition(observations, undefined, 200, 0.4);
    expect(result.degenerate).toBe(true);
    expect(result.overlapRatio).toBeGreaterThan(0.4);
    expect(result.matchedWindows).toBeGreaterThan(0);
  });

  test("normal diverse content is not degenerate", () => {
    // Generate sufficiently long unique content per observation
    const observations = Array.from({ length: 10 }, (_, i) => ({
      content: `Observation ${i}: ${crypto.randomUUID()} - ${crypto.randomUUID()} - ${crypto.randomUUID()} - unique payload number ${i * 1000 + Math.random()} with extra data ${crypto.randomUUID()}`,
    }));

    const result = detectDegenerateRepetition(observations, undefined, 50, 0.4);
    expect(result.degenerate).toBe(false);
    expect(result.overlapRatio).toBeLessThanOrEqual(0.4);
  });

  test("with previousSummary uses it as reference", () => {
    const repeatedBlock = "The server is running normally and all systems are operational. ".repeat(20);
    const observations = [{ content: repeatedBlock }];

    // previousSummary contains the same text — should be degenerate
    const result = detectDegenerateRepetition(
      observations,
      repeatedBlock,
      50,
      0.4,
    );
    expect(result.degenerate).toBe(true);
    expect(result.matchedWindows).toBe(result.totalWindows);
  });

  test("with previousSummary and different content is not degenerate", () => {
    const summary = "X".repeat(300);
    const observations = [{ content: "Y".repeat(300) }];

    const result = detectDegenerateRepetition(observations, summary, 50, 0.4);
    expect(result.degenerate).toBe(false);
    expect(result.matchedWindows).toBe(0);
  });

  test("custom threshold works", () => {
    // Create content where about half the windows match
    const shared = "Z".repeat(200);
    const unique = "Q".repeat(200);
    const observations = [{ content: shared + unique }];

    // With threshold 0.9, this won't be degenerate
    const result = detectDegenerateRepetition(observations, shared, 50, 0.9);
    expect(result.degenerate).toBe(false);

    // With threshold 0.0, even small overlap triggers degenerate
    const result2 = detectDegenerateRepetition(observations, shared + unique, 50, 0.0);
    expect(result2.degenerate).toBe(true);
  });

  test("custom windowSize works", () => {
    const block = "R".repeat(500);
    const observations = Array.from({ length: 4 }, () => ({ content: block }));

    // Large window size
    const result = detectDegenerateRepetition(observations, undefined, 400, 0.4);
    expect(result.degenerate).toBe(true);

    // Small window size
    const result2 = detectDegenerateRepetition(observations, undefined, 10, 0.4);
    expect(result2.degenerate).toBe(true);
  });
});
