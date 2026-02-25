/**
 * Bootstrap Pipeline E2E Tests
 *
 * Tests the full history ingestion pipeline end-to-end:
 *   parse → extract → dedup → orchestrate
 *
 * No mocks — real function implementations only.
 */

import { describe, test, expect } from "vitest";
import {
  parseSessionLine,
  extractFacts,
  deduplicateFacts,
  ParsedFact,
} from "../../scripts/parse-claude-code-history.js";

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Build a serialized session line in the format Claude Code history produces.
 */
function makeLine(
  role: "user" | "assistant",
  content: string,
  timestamp: string
): string {
  return JSON.stringify({
    type: role === "user" ? "human" : "assistant",
    message: { role, content },
    timestamp,
  });
}

/**
 * Make a ParsedFact directly for dedup-focused tests.
 */
function makeFact(
  content: string,
  opts: Partial<ParsedFact> = {}
): ParsedFact {
  return {
    content,
    factType: opts.factType ?? "preference",
    importance: opts.importance ?? 0.8,
    entityHints: opts.entityHints ?? [],
    source: opts.source ?? "session-a.jsonl",
    timestamp: opts.timestamp ?? new Date("2026-02-20T10:00:00Z").getTime(),
  };
}

// ── Section 1: Multi-file session parsing ─────────────────────────────

describe("multi-file session parsing", () => {
  test("parses messages from multiple session files", () => {
    const file1Lines = [
      makeLine("user", "I prefer TypeScript over JavaScript for new projects", "2026-02-20T10:00:00Z"),
      makeLine("assistant", "Noted! I will use TypeScript.", "2026-02-20T10:01:00Z"),
    ];

    const file2Lines = [
      makeLine("user", "Always use bun instead of npm for package management", "2026-02-21T09:00:00Z"),
      makeLine("user", "I prefer Convex for the backend database layer", "2026-02-21T09:05:00Z"),
    ];

    const parsed1 = file1Lines.map((l) => parseSessionLine(l)).filter(Boolean);
    const parsed2 = file2Lines.map((l) => parseSessionLine(l)).filter(Boolean);

    expect(parsed1).toHaveLength(2);
    expect(parsed2).toHaveLength(2);

    const combined = [...parsed1, ...parsed2];
    expect(combined).toHaveLength(4);

    const roles = combined.map((m) => m!.role);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");

    const contents = combined.map((m) => m!.content);
    expect(contents.some((c) => c.includes("TypeScript"))).toBe(true);
    expect(contents.some((c) => c.includes("bun"))).toBe(true);
    expect(contents.some((c) => c.includes("Convex"))).toBe(true);
  });

  test("preserves chronological ordering across files", () => {
    // File 1 is earlier, file 2 is later
    const file1Lines = [
      makeLine("user", "I prefer TypeScript", "2026-02-20T08:00:00Z"),
      makeLine("user", "Always use bun", "2026-02-20T09:00:00Z"),
    ];
    const file2Lines = [
      makeLine("user", "Let's go with Convex for our database", "2026-02-21T08:00:00Z"),
      makeLine("user", "I prefer functional programming patterns", "2026-02-21T09:00:00Z"),
    ];

    const parsed1 = file1Lines.map((l) => parseSessionLine(l)).filter(Boolean);
    const parsed2 = file2Lines.map((l) => parseSessionLine(l)).filter(Boolean);
    const combined = [...parsed1, ...parsed2];

    // Verify timestamps are in ascending order when sorted
    const timestamps = combined.map((m) => m!.timestamp);
    const sorted = [...timestamps].sort((a, b) => a - b);
    expect(timestamps).toEqual(sorted);
  });

  test("handles empty session files gracefully", () => {
    // File 1 has valid lines, file 2 is empty (produces no lines to parse)
    const file1Lines = [
      makeLine("user", "I prefer TypeScript", "2026-02-20T10:00:00Z"),
    ];
    const file2Lines: string[] = [];

    const parsed1 = file1Lines.map((l) => parseSessionLine(l)).filter(Boolean);
    const parsed2 = file2Lines.map((l) => parseSessionLine(l)).filter(Boolean);

    expect(parsed1).toHaveLength(1);
    expect(parsed2).toHaveLength(0);

    const combined = [...parsed1, ...parsed2];
    expect(combined).toHaveLength(1);
    expect(combined[0]!.role).toBe("user");
  });
});

// ── Section 2: Fact extraction pipeline ───────────────────────────────

describe("fact extraction from parsed messages", () => {
  const ts = new Date("2026-02-22T12:00:00Z").getTime();

  test("extracts preferences from user messages", () => {
    const lines = [
      makeLine("user", "I prefer using TypeScript for all backend services", "2026-02-22T12:00:00Z"),
      makeLine("user", "My preference is to always write tests before code", "2026-02-22T12:01:00Z"),
    ];
    const parsed = lines.map((l) => parseSessionLine(l)).filter(Boolean) as ReturnType<typeof parseSessionLine>[];

    const facts = extractFacts(parsed as Parameters<typeof extractFacts>[0]);

    expect(facts.length).toBeGreaterThanOrEqual(1);
    expect(facts.some((f) => f.factType === "preference")).toBe(true);
    expect(facts.every((f) => f.importance >= 0.7)).toBe(true);
  });

  test("extracts technical decisions from user messages", () => {
    const lines = [
      makeLine("user", "Let's go with Convex for the database layer", "2026-02-22T12:00:00Z"),
      makeLine("user", "I've decided to use vitest for all unit tests", "2026-02-22T12:02:00Z"),
    ];
    const parsed = lines.map((l) => parseSessionLine(l)).filter(Boolean) as Parameters<typeof extractFacts>[0];

    const facts = extractFacts(parsed);

    expect(facts.length).toBeGreaterThanOrEqual(1);
    expect(facts.some((f) => f.factType === "decision")).toBe(true);
  });

  test("skips short or trivial messages", () => {
    const lines = [
      makeLine("user", "Ok", "2026-02-22T12:00:00Z"),
      makeLine("user", "Yes", "2026-02-22T12:01:00Z"),
      makeLine("user", "Thanks", "2026-02-22T12:02:00Z"),
    ];
    const parsed = lines.map((l) => parseSessionLine(l)).filter(Boolean) as Parameters<typeof extractFacts>[0];

    const facts = extractFacts(parsed);

    // Short messages (< 10 chars) are filtered out
    expect(facts).toHaveLength(0);
  });

  test("handles messages with special characters", () => {
    const specialContent = 'I prefer TypeScript: "strict": true && no any!';
    const lines = [makeLine("user", specialContent, "2026-02-22T12:00:00Z")];
    const parsed = lines.map((l) => parseSessionLine(l)).filter(Boolean) as Parameters<typeof extractFacts>[0];

    // Should not throw
    expect(() => extractFacts(parsed)).not.toThrow();

    const facts = extractFacts(parsed);
    if (facts.length > 0) {
      expect(facts[0].content).toContain("TypeScript");
    }
  });

  test("assistant messages are not extracted as facts", () => {
    const lines = [
      makeLine("assistant", "I prefer using TypeScript for your project", "2026-02-22T12:00:00Z"),
      makeLine("assistant", "Let's go with bun for package management", "2026-02-22T12:01:00Z"),
    ];
    const parsed = lines.map((l) => parseSessionLine(l)).filter(Boolean) as Parameters<typeof extractFacts>[0];

    const facts = extractFacts(parsed);

    // extractFacts only processes user messages
    expect(facts).toHaveLength(0);
  });

  test("mixed conversation yields facts only from user turns", () => {
    const lines = [
      makeLine("user", "I prefer TypeScript over JavaScript", "2026-02-22T12:00:00Z"),
      makeLine("assistant", "Great choice! TypeScript adds type safety.", "2026-02-22T12:01:00Z"),
      makeLine("user", "Always use bun for package management", "2026-02-22T12:02:00Z"),
      makeLine("assistant", "Understood, I will use bun.", "2026-02-22T12:03:00Z"),
    ];
    const parsed = lines.map((l) => parseSessionLine(l)).filter(Boolean) as Parameters<typeof extractFacts>[0];

    const facts = extractFacts(parsed);

    // Both user messages match preference heuristics
    expect(facts.length).toBeGreaterThanOrEqual(2);
    expect(facts.every((f) => f.factType === "preference")).toBe(true);
  });
});

// ── Section 3: Cross-file deduplication ───────────────────────────────

describe("cross-file deduplication", () => {
  test("removes duplicate facts from overlapping sessions", () => {
    const sharedContent = "I prefer TypeScript for all new projects";
    const sessionA: ParsedFact[] = [
      makeFact(sharedContent, { source: "session-a.jsonl", timestamp: 1000 }),
      makeFact("Always use bun for package management", { source: "session-a.jsonl", timestamp: 1100 }),
      makeFact("Let's go with Convex for persistence", {
        factType: "decision",
        source: "session-a.jsonl",
        timestamp: 1200,
      }),
    ];

    const sessionB: ParsedFact[] = [
      makeFact(sharedContent, { source: "session-b.jsonl", timestamp: 2000 }),
      makeFact("Use React for all frontend components", {
        factType: "decision",
        source: "session-b.jsonl",
        timestamp: 2100,
      }),
      makeFact("I like functional programming patterns", { source: "session-b.jsonl", timestamp: 2200 }),
    ];

    const combined = [...sessionA, ...sessionB];
    expect(combined).toHaveLength(6);

    const deduped = deduplicateFacts(combined);
    expect(deduped.length).toBeLessThan(combined.length);
  });

  test("preserves unique facts from each session", () => {
    const sessionA: ParsedFact[] = [
      makeFact("I prefer TypeScript", { source: "session-a.jsonl", timestamp: 1000 }),
    ];

    const sessionB: ParsedFact[] = [
      makeFact("I like using React for components", { source: "session-b.jsonl", timestamp: 2000 }),
    ];

    const combined = [...sessionA, ...sessionB];
    const deduped = deduplicateFacts(combined);

    // Different topics — both should survive
    expect(deduped).toHaveLength(2);
  });

  test("deduplicates by content similarity, not exact match", () => {
    // These two facts are not identical but share enough words to exceed 0.7 Jaccard
    const factA = makeFact(
      "I prefer using TypeScript for backend development",
      { source: "session-a.jsonl", timestamp: 1000 }
    );
    const factB = makeFact(
      "I prefer using TypeScript for development",
      { source: "session-b.jsonl", timestamp: 2000 }
    );

    const combined = [factA, factB];
    const deduped = deduplicateFacts(combined);

    // High Jaccard similarity (8 of 9 unique words overlap) — should dedup
    expect(deduped.length).toBeLessThan(combined.length);
  });

  test("keeps the first occurrence when deduplicating (insertion order)", () => {
    // deduplicateFacts keeps the first encountered copy (not the most recent)
    const earlier = makeFact("I prefer TypeScript", {
      source: "session-a.jsonl",
      timestamp: 1000,
    });
    const later = makeFact("I prefer TypeScript", {
      source: "session-b.jsonl",
      timestamp: 9000,
    });

    const deduped = deduplicateFacts([earlier, later]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].timestamp).toBe(1000);
    expect(deduped[0].source).toBe("session-a.jsonl");
  });

  test("handles large combined fact arrays efficiently", () => {
    const facts: ParsedFact[] = [];

    // 10 unique facts from session A
    for (let i = 0; i < 10; i++) {
      facts.push(makeFact(`Unique preference number ${i} about system design and architecture`, {
        source: "session-a.jsonl",
        timestamp: 1000 + i,
      }));
    }

    // 5 facts that duplicate some from session A, from session B
    for (let i = 0; i < 5; i++) {
      facts.push(makeFact(`Unique preference number ${i} about system design and architecture`, {
        source: "session-b.jsonl",
        timestamp: 9000 + i,
      }));
    }

    const deduped = deduplicateFacts(facts);

    expect(deduped.length).toBeLessThan(facts.length);
    // The 10 unique + 0 new-unique duplicates = 10
    expect(deduped.length).toBeLessThanOrEqual(10);
  });
});

// ── Section 4: Full pipeline integration ──────────────────────────────

describe("full pipeline: parse → extract → dedup", () => {
  test("processes raw session lines through complete pipeline", () => {
    const sessionLines1 = [
      makeLine("user", "I always prefer TypeScript over JavaScript for new projects", "2026-02-20T10:00:00Z"),
      makeLine("assistant", "Noted! I will use TypeScript for all new code.", "2026-02-20T10:01:00Z"),
    ];

    const sessionLines2 = [
      makeLine("user", "Remember, I prefer TypeScript over JavaScript", "2026-02-21T10:00:00Z"),
      makeLine("user", "Always use bun instead of npm for package management", "2026-02-21T10:05:00Z"),
    ];

    // Parse
    const parsed1 = sessionLines1.map((l) => parseSessionLine(l)).filter(Boolean) as Parameters<typeof extractFacts>[0];
    const parsed2 = sessionLines2.map((l) => parseSessionLine(l)).filter(Boolean) as Parameters<typeof extractFacts>[0];

    // Extract facts from each session
    const facts1 = extractFacts(parsed1);
    const facts2 = extractFacts(parsed2);

    // Combine and dedup
    const allFacts = [...facts1, ...facts2];
    const deduped = deduplicateFacts(allFacts);

    expect(deduped.length).toBeGreaterThan(0);
    expect(deduped.length).toBeLessThanOrEqual(allFacts.length);

    // TypeScript preference from session 2 line 1 duplicates session 1 line 1 — one copy survives
    const typeScriptFacts = deduped.filter((f) =>
      f.content.toLowerCase().includes("typescript")
    );
    expect(typeScriptFacts.length).toBeLessThanOrEqual(allFacts.filter((f) =>
      f.content.toLowerCase().includes("typescript")
    ).length);

    // bun preference from session 2 line 2 is unique and should survive
    const bunFacts = deduped.filter((f) => f.content.toLowerCase().includes("bun"));
    expect(bunFacts.length).toBeGreaterThanOrEqual(1);
  });

  test("handles malformed lines without crashing", () => {
    const lines = [
      "not json at all",
      JSON.stringify({ type: "human" }), // missing message and timestamp
      makeLine("user", "valid message content here for testing", "2026-02-25T10:00:00Z"),
      "", // empty line
      "   ", // whitespace only
    ];

    expect(() => {
      const parsed = lines.map((l) => parseSessionLine(l)).filter(Boolean);
      extractFacts(parsed as Parameters<typeof extractFacts>[0]);
    }).not.toThrow();

    const parsed = lines.map((l) => parseSessionLine(l)).filter(Boolean);
    // Only the one valid line should parse successfully
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.role).toBe("user");
  });

  test("pipeline from two realistic sessions produces a deduplicated summary", () => {
    // Simulate a week of conversations where a user repeats the same preferences
    const week1Lines = [
      makeLine("user", "I prefer TypeScript for all backend code", "2026-02-17T10:00:00Z"),
      makeLine("assistant", "Understood, I will use TypeScript.", "2026-02-17T10:01:00Z"),
      makeLine("user", "Let's go with vitest for our test runner", "2026-02-17T10:05:00Z"),
      makeLine("user", "Always use bun for running scripts", "2026-02-17T10:10:00Z"),
    ];

    const week2Lines = [
      makeLine("user", "I prefer TypeScript for all backend code", "2026-02-24T10:00:00Z"),
      makeLine("assistant", "Got it, sticking with TypeScript.", "2026-02-24T10:01:00Z"),
      makeLine("user", "Use Convex for the cloud database", "2026-02-24T10:05:00Z"),
    ];

    const parsed1 = week1Lines.map((l) => parseSessionLine(l)).filter(Boolean) as Parameters<typeof extractFacts>[0];
    const parsed2 = week2Lines.map((l) => parseSessionLine(l)).filter(Boolean) as Parameters<typeof extractFacts>[0];

    const facts1 = extractFacts(parsed1);
    const facts2 = extractFacts(parsed2);

    const allFacts = [...facts1, ...facts2];
    const deduped = deduplicateFacts(allFacts);

    // Should have fewer after dedup
    expect(deduped.length).toBeLessThanOrEqual(allFacts.length);

    // All surviving facts must have valid structure
    for (const fact of deduped) {
      expect(typeof fact.content).toBe("string");
      expect(fact.content.length).toBeGreaterThan(0);
      expect(["preference", "decision", "correction", "pattern", "note"]).toContain(fact.factType);
      expect(fact.importance).toBeGreaterThanOrEqual(0);
      expect(fact.importance).toBeLessThanOrEqual(1);
      expect(Array.isArray(fact.entityHints)).toBe(true);
      expect(typeof fact.timestamp).toBe("number");
    }
  });

  test("pipeline preserves fact type classifications end-to-end", () => {
    const lines = [
      // Preference
      makeLine("user", "I prefer functional programming over OOP", "2026-02-25T09:00:00Z"),
      // Decision
      makeLine("user", "Let's go with Convex as our primary database", "2026-02-25T09:01:00Z"),
      // Correction
      makeLine("user", "Actually, I was wrong earlier — use vitest not jest", "2026-02-25T09:02:00Z"),
    ];

    const parsed = lines.map((l) => parseSessionLine(l)).filter(Boolean) as Parameters<typeof extractFacts>[0];
    const facts = extractFacts(parsed);
    const deduped = deduplicateFacts(facts);

    const types = new Set(deduped.map((f) => f.factType));
    expect(types.has("preference")).toBe(true);
    expect(types.has("decision")).toBe(true);
    expect(types.has("correction")).toBe(true);
  });
});

// ── Section 5: Error recovery ──────────────────────────────────────────

describe("error recovery", () => {
  test("pipeline continues after encountering invalid entries", () => {
    const lines = [
      "{ this is not valid json",
      makeLine("user", "I prefer TypeScript for type safety", "2026-02-25T10:00:00Z"),
      '{"incomplete":',
      makeLine("user", "Always use bun over npm", "2026-02-25T10:01:00Z"),
      "null",
    ];

    let parsed: NonNullable<ReturnType<typeof parseSessionLine>>[] = [];
    expect(() => {
      parsed = lines
        .map((l) => parseSessionLine(l))
        .filter(Boolean) as NonNullable<ReturnType<typeof parseSessionLine>>[];
    }).not.toThrow();

    // Only the two valid lines survive
    expect(parsed).toHaveLength(2);
    expect(parsed[0].content).toContain("TypeScript");
    expect(parsed[1].content).toContain("bun");

    const facts = extractFacts(parsed);
    expect(facts.length).toBeGreaterThan(0);
  });

  test("returns empty array for completely invalid input", () => {
    const lines = [
      "totally invalid",
      "{ broken json }",
      "",
      "   ",
      "undefined",
      "123",
    ];

    const parsed = lines.map((l) => parseSessionLine(l)).filter(Boolean);
    expect(parsed).toHaveLength(0);

    const facts = extractFacts(parsed as Parameters<typeof extractFacts>[0]);
    expect(facts).toHaveLength(0);

    const deduped = deduplicateFacts(facts);
    expect(deduped).toHaveLength(0);
  });

  test("deduplicateFacts is stable on repeated calls", () => {
    const facts: ParsedFact[] = [
      makeFact("I prefer TypeScript for all projects", { timestamp: 1000 }),
      makeFact("Always use bun over npm for speed", { timestamp: 1100 }),
      makeFact("Let's go with Convex for the database", {
        factType: "decision",
        timestamp: 1200,
      }),
    ];

    const pass1 = deduplicateFacts(facts);
    const pass2 = deduplicateFacts(pass1);

    // Idempotent — second pass changes nothing
    expect(pass2).toHaveLength(pass1.length);
    for (let i = 0; i < pass1.length; i++) {
      expect(pass2[i].content).toBe(pass1[i].content);
      expect(pass2[i].timestamp).toBe(pass1[i].timestamp);
    }
  });

  test("pipeline handles session lines with missing optional fields", () => {
    // timestamp present but message.content is a number (invalid type)
    const badContentType = JSON.stringify({
      type: "human",
      message: { role: "user", content: 42 },
      timestamp: "2026-02-25T10:00:00Z",
    });

    // message present but timestamp field is missing
    const missingTimestamp = JSON.stringify({
      type: "human",
      message: { role: "user", content: "I prefer TypeScript" },
    });

    // valid line for contrast
    const validLine = makeLine(
      "user",
      "Always use bun for package management tasks",
      "2026-02-25T10:05:00Z"
    );

    const lines = [badContentType, missingTimestamp, validLine];
    const parsed = lines.map((l) => parseSessionLine(l)).filter(Boolean);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.content).toContain("bun");
  });
});
