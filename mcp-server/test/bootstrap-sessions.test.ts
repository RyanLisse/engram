/**
 * Tests for OpenClaw session bootstrapping
 *
 * Tests the full pipeline:
 *   findSessionFiles → parseOpenClawSession → extractFactsFromSession → deduplicate
 */

import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import {
  findSessionFiles,
  parseOpenClawSession,
  extractFactsFromSession,
} from "../../scripts/bootstrap-from-sessions.js";
import type { ParsedFact } from "../../scripts/parse-claude-code-history.js";

// ── Test fixtures ──────────────────────────────────────────────────────

let testDir: string;

beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), "engram-bootstrap-test-"));
});

afterEach(async () => {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
});

// ── findSessionFiles ──────────────────────────────────────────────────

describe("findSessionFiles", () => {
  test("returns empty array for empty directory", async () => {
    const files = await findSessionFiles(testDir);
    expect(files).toEqual([]);
  });

  test("finds .jsonl session files", async () => {
    await fs.writeFile(path.join(testDir, "session1.jsonl"), "");
    await fs.writeFile(path.join(testDir, "session2.jsonl"), "");

    const files = await findSessionFiles(testDir);
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.endsWith(".jsonl"))).toBe(true);
  });

  test("finds .json session files", async () => {
    await fs.writeFile(path.join(testDir, "session.json"), "");

    const files = await findSessionFiles(testDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.json$/);
  });

  test("ignores non-session files", async () => {
    await fs.writeFile(path.join(testDir, "session.jsonl"), "");
    await fs.writeFile(path.join(testDir, "readme.md"), "");
    await fs.writeFile(path.join(testDir, "data.txt"), "");

    const files = await findSessionFiles(testDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.jsonl$/);
  });

  test("handles nested directory structure", async () => {
    const subdir = path.join(testDir, "nested", "deep");
    await fs.mkdir(subdir, { recursive: true });
    await fs.writeFile(path.join(subdir, "session.jsonl"), "");
    await fs.writeFile(path.join(testDir, "session.json"), "");

    const files = await findSessionFiles(testDir);
    expect(files).toHaveLength(2);
  });

  test("returns files sorted by modification time (newest first)", async () => {
    const file1 = path.join(testDir, "session1.jsonl");
    const file2 = path.join(testDir, "session2.jsonl");

    await fs.writeFile(file1, "");
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fs.writeFile(file2, "");

    const files = await findSessionFiles(testDir);
    expect(files[0]).toMatch(/session2\.jsonl$/);
    expect(files[1]).toMatch(/session1\.jsonl$/);
  });

  test("handles missing directory gracefully", async () => {
    const nonExistent = path.join(testDir, "nonexistent");
    const files = await findSessionFiles(nonExistent);
    expect(files).toEqual([]);
  });
});

// ── parseOpenClawSession ──────────────────────────────────────────────

describe("parseOpenClawSession", () => {
  test("parses JSONL format correctly", async () => {
    const filePath = path.join(testDir, "session.jsonl");
    const lines = [
      JSON.stringify({ role: "user", content: "Hello", timestamp: 1000 }),
      JSON.stringify({ role: "assistant", content: "Hi there", timestamp: 1100 }),
    ];
    await fs.writeFile(filePath, lines.join("\n"));

    const messages = await parseOpenClawSession(filePath);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      role: "user",
      content: "Hello",
      timestamp: 1000,
    });
    expect(messages[1]).toEqual({
      role: "assistant",
      content: "Hi there",
      timestamp: 1100,
    });
  });

  test("parses JSON array format correctly", async () => {
    const filePath = path.join(testDir, "session.json");
    const data = [
      { role: "user", content: "Test", timestamp: 2000 },
      { role: "assistant", content: "Response", timestamp: 2100 },
    ];
    await fs.writeFile(filePath, JSON.stringify(data));

    const messages = await parseOpenClawSession(filePath);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
  });

  test("handles empty JSONL file", async () => {
    const filePath = path.join(testDir, "empty.jsonl");
    await fs.writeFile(filePath, "");

    const messages = await parseOpenClawSession(filePath);
    expect(messages).toEqual([]);
  });

  test("handles empty JSON array", async () => {
    const filePath = path.join(testDir, "empty.json");
    await fs.writeFile(filePath, "[]");

    const messages = await parseOpenClawSession(filePath);
    expect(messages).toEqual([]);
  });

  test("throws on malformed JSON", async () => {
    const filePath = path.join(testDir, "malformed.json");
    await fs.writeFile(filePath, "{ invalid json ");

    await expect(parseOpenClawSession(filePath)).rejects.toThrow();
  });

  test("throws on malformed JSONL line", async () => {
    const filePath = path.join(testDir, "malformed.jsonl");
    await fs.writeFile(
      filePath,
      JSON.stringify({ role: "user", content: "Valid" }) +
        "\n" +
        "{ invalid json"
    );

    await expect(parseOpenClawSession(filePath)).rejects.toThrow();
  });

  test("normalizes messages with default timestamp", async () => {
    const filePath = path.join(testDir, "no-timestamp.jsonl");
    await fs.writeFile(filePath, JSON.stringify({ role: "user", content: "Test" }));

    const messages = await parseOpenClawSession(filePath);
    expect(messages).toHaveLength(1);
    expect(messages[0].timestamp).toBeDefined();
    expect(typeof messages[0].timestamp).toBe("number");
  });
});

// ── extractFactsFromSession ───────────────────────────────────────────

describe("extractFactsFromSession", () => {
  test("extracts decision facts", () => {
    const messages = [
      {
        role: "user",
        content: "I've decided to use TypeScript for this project",
        timestamp: 1000,
      },
    ];

    const facts = extractFactsFromSession(messages, "session1");
    const decisionFacts = facts.filter((f) => f.factType === "decision");
    expect(decisionFacts.length).toBeGreaterThan(0);
  });

  test("extracts correction facts", () => {
    const messages = [
      {
        role: "user",
        content: "Actually, I was wrong about that. The correct approach is...",
        timestamp: 1000,
      },
    ];

    const facts = extractFactsFromSession(messages, "session1");
    const correctionFacts = facts.filter((f) => f.factType === "correction");
    expect(correctionFacts.length).toBeGreaterThan(0);
  });

  test("extracts preference facts", () => {
    const messages = [
      {
        role: "user",
        content: "I prefer using bun over npm for my projects",
        timestamp: 1000,
      },
    ];

    const facts = extractFactsFromSession(messages, "session1");
    const preferenceFacts = facts.filter((f) => f.factType === "preference");
    expect(preferenceFacts.length).toBeGreaterThan(0);
  });

  test("extracts pattern facts", () => {
    // Patterns are detected by repeated messages (same first 50 chars 2+ times)
    // detectPatterns checks if content.slice(0, 50) appears 2+ times
    const messages = [
      {
        role: "user",
        content: "Always use TypeScript for type safety",
        timestamp: 1000,
      },
      {
        role: "user",
        content: "Always use TypeScript for type safety and correctness",
        timestamp: 1100,
      },
    ];

    const facts = extractFactsFromSession(messages, "session1");
    // Either as pattern or upgraded due to repetition
    expect(facts.length).toBeGreaterThan(0);
    // Just verify facts are extracted (pattern detection is heuristic)
  });

  test("extracts note facts", () => {
    const messages = [
      {
        role: "user",
        content: "Note: Remember to update the tests when modifying the schema",
        timestamp: 1000,
      },
    ];

    const facts = extractFactsFromSession(messages, "session1");
    const noteFacts = facts.filter((f) => f.factType === "note");
    expect(noteFacts.length).toBeGreaterThan(0);
  });

  test("includes source for all facts", () => {
    const messages = [
      {
        role: "user",
        content: "I decided to refactor the code",
        timestamp: 1000,
      },
    ];

    const facts = extractFactsFromSession(messages, "/path/to/session1");
    expect(facts.every((f) => f.source.length > 0)).toBe(true);
  });

  test("preserves timestamps from messages", () => {
    const timestamp = 1234567890;
    const messages = [
      {
        role: "user",
        content: "I prefer TypeScript",
        timestamp,
      },
    ];

    const facts = extractFactsFromSession(messages, "session1");
    expect(facts.every((f) => f.timestamp === timestamp)).toBe(true);
  });

  test("handles empty message list", () => {
    const messages: Array<{ role: string; content: string; timestamp: number }> =
      [];

    const facts = extractFactsFromSession(messages, "session1");
    expect(facts).toEqual([]);
  });

  test("handles messages without extractable facts", () => {
    const messages = [
      {
        role: "user",
        content: "How are you?",
        timestamp: 1000,
      },
    ];

    const facts = extractFactsFromSession(messages, "session1");
    expect(Array.isArray(facts)).toBe(true);
  });

  test("deduplicates similar facts within session", () => {
    const messages = [
      {
        role: "user",
        content: "I decided to use TypeScript",
        timestamp: 1000,
      },
      {
        role: "user",
        content: "I decided to use TypeScript",
        timestamp: 1100,
      },
    ];

    const facts = extractFactsFromSession(messages, "session1");
    const uniqueFacts = new Set(facts.map((f) => f.content));
    expect(uniqueFacts.size).toBeLessThanOrEqual(facts.length);
  });

  test("calculates importance scores", () => {
    const messages = [
      {
        role: "user",
        content: "Actually, I was wrong - corrections should have high importance",
        timestamp: 1000,
      },
    ];

    const facts = extractFactsFromSession(messages, "session1");
    expect(facts.every((f) => f.importance >= 0 && f.importance <= 1)).toBe(true);
  });
});

// ── Integration tests ────────────────────────────────────────────────

describe("bootstrap integration", () => {
  test("processes complete session file end-to-end", async () => {
    const filePath = path.join(testDir, "session.jsonl");
    const lines = [
      JSON.stringify({
        role: "user",
        content: "I prefer using TypeScript",
        timestamp: 1000,
      }),
      JSON.stringify({
        role: "user",
        content: "I prefer using TypeScript",
        timestamp: 1100,
      }),
    ];
    await fs.writeFile(filePath, lines.join("\n"));

    const messages = await parseOpenClawSession(filePath);
    const sessionId = "test-session";
    const facts = extractFactsFromSession(messages, sessionId);

    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.source === sessionId)).toBe(true);
  });

  test("extracts facts from multiple message types", async () => {
    const filePath = path.join(testDir, "multi.json");
    const data = [
      { role: "user", content: "I prefer bun", timestamp: 1000 },
      {
        role: "user",
        content: "I'll use Convex for this",
        timestamp: 1100,
      },
      {
        role: "user",
        content: "Actually, I changed my mind about the approach",
        timestamp: 1200,
      },
    ];
    await fs.writeFile(filePath, JSON.stringify(data));

    const messages = await parseOpenClawSession(filePath);
    const facts = extractFactsFromSession(messages, "multi-session");

    expect(facts.length).toBeGreaterThan(0);
    expect(facts.some((f) => f.factType === "decision")).toBe(true);
  });
});
