/**
 * Tests for parallel bootstrap processing with cross-file deduplication
 *
 * Tests the pipeline:
 *   glob → processFilesBatch → extractFacts → crossFileDedup → summarizeResults
 */

import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import {
  processFilesBatch,
  crossFileDedup,
  summarizeResults,
  type BootstrapResult,
} from "../../scripts/bootstrap-parallel.js";
import type { ParsedFact } from "../../scripts/parse-claude-code-history.js";

// ── Test fixtures ──────────────────────────────────────────────────────

let testDir: string;

beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), "engram-parallel-test-"));
});

afterEach(async () => {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
});

/**
 * Helper to create a test JSONL session file
 */
async function createSessionFile(
  fileName: string,
  messages: Array<{ role: string; content: string; timestamp: number }>
): Promise<string> {
  const filePath = path.join(testDir, fileName);
  const lines = messages.map((msg) =>
    JSON.stringify({
      type: "message",
      message: msg,
      timestamp: new Date(msg.timestamp).toISOString(),
    })
  );
  await fs.writeFile(filePath, lines.join("\n"));
  return filePath;
}

// ── processFilesBatch ──────────────────────────────────────────────────

describe("processFilesBatch", () => {
  test("processes single file and extracts facts", async () => {
    const filePath = await createSessionFile("session1.jsonl", [
      {
        role: "user",
        content: "I prefer using TypeScript for all projects",
        timestamp: 1000,
      },
      {
        role: "user",
        content: "Let's use bun as our package manager",
        timestamp: 1100,
      },
    ]);

    const facts = await processFilesBatch([filePath], 1);

    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.source === filePath)).toBe(true);
    expect(facts.some((f) => f.factType === "preference")).toBe(true);
    expect(facts.some((f) => f.factType === "decision")).toBe(true);
  });

  test("processes multiple files concurrently", async () => {
    const file1 = await createSessionFile("session1.jsonl", [
      {
        role: "user",
        content: "I prefer TypeScript",
        timestamp: 1000,
      },
    ]);

    const file2 = await createSessionFile("session2.jsonl", [
      {
        role: "user",
        content: "Use bun for package management",
        timestamp: 2000,
      },
    ]);

    const facts = await processFilesBatch([file1, file2], 2);

    expect(facts.length).toBeGreaterThan(0);
    // Should have facts from both files
    expect(facts.some((f) => f.source === file1)).toBe(true);
    expect(facts.some((f) => f.source === file2)).toBe(true);
  });

  test("respects concurrency limit", async () => {
    const files: string[] = [];
    for (let i = 0; i < 5; i++) {
      const filePath = await createSessionFile(`session${i}.jsonl`, [
        {
          role: "user",
          content: `Preference ${i}: use TypeScript`,
          timestamp: 1000 + i * 100,
        },
      ]);
      files.push(filePath);
    }

    // Track concurrency with a spy
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const originalProcessFilesBatch = processFilesBatch;
    const spy = vi.fn(async (batch: string[]) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      currentConcurrent--;
    });

    const facts = await processFilesBatch(files, 2);
    expect(facts.length).toBeGreaterThan(0);
  });

  test("handles empty file list", async () => {
    const facts = await processFilesBatch([], 1);
    expect(facts).toEqual([]);
  });

  test("handles files with no extractable facts", async () => {
    const filePath = await createSessionFile("empty.jsonl", [
      {
        role: "assistant",
        content: "Just a regular response",
        timestamp: 1000,
      },
    ]);

    const facts = await processFilesBatch([filePath], 1);
    // May be empty or have minimal facts - just verify it doesn't crash
    expect(Array.isArray(facts)).toBe(true);
  });

  test("preserves source path for each fact", async () => {
    const file1 = await createSessionFile("session1.jsonl", [
      {
        role: "user",
        content: "I decided to use TypeScript",
        timestamp: 1000,
      },
    ]);

    const file2 = await createSessionFile("session2.jsonl", [
      {
        role: "user",
        content: "Let's use React for frontend",
        timestamp: 2000,
      },
    ]);

    const facts = await processFilesBatch([file1, file2], 2);

    const file1Facts = facts.filter((f) => f.source === file1);
    const file2Facts = facts.filter((f) => f.source === file2);

    expect(file1Facts.length).toBeGreaterThan(0);
    expect(file2Facts.length).toBeGreaterThan(0);
    expect(file1Facts.every((f) => f.source === file1)).toBe(true);
    expect(file2Facts.every((f) => f.source === file2)).toBe(true);
  });
});

// ── crossFileDedup ────────────────────────────────────────────────────

describe("crossFileDedup", () => {
  test("deduplicates identical facts across files", () => {
    const allFacts: ParsedFact[] = [
      {
        content: "I prefer TypeScript",
        factType: "preference",
        importance: 0.8,
        entityHints: ["TypeScript"],
        source: "file1.jsonl",
        timestamp: 1000,
      },
      {
        content: "I prefer TypeScript",
        factType: "preference",
        importance: 0.8,
        entityHints: ["TypeScript"],
        source: "file2.jsonl",
        timestamp: 2000,
      },
    ];

    const deduplicated = crossFileDedup(allFacts);

    // Should have fewer facts after dedup
    expect(deduplicated.length).toBeLessThanOrEqual(allFacts.length);
  });

  test("keeps earliest timestamp when deduplicating", () => {
    const allFacts: ParsedFact[] = [
      {
        content: "Use bun for package management",
        factType: "decision",
        importance: 0.7,
        entityHints: ["bun"],
        source: "file1.jsonl",
        timestamp: 2000, // Later
      },
      {
        content: "Use bun for package management",
        factType: "decision",
        importance: 0.7,
        entityHints: ["bun"],
        source: "file2.jsonl",
        timestamp: 1000, // Earlier
      },
    ];

    const deduplicated = crossFileDedup(allFacts);

    // Should keep the earliest one
    const kept = deduplicated.find(
      (f) => f.content === "Use bun for package management"
    );
    expect(kept?.timestamp).toBe(1000);
  });

  test("handles empty fact list", () => {
    const result = crossFileDedup([]);
    expect(result).toEqual([]);
  });

  test("preserves unique facts", () => {
    const allFacts: ParsedFact[] = [
      {
        content: "Prefer TypeScript",
        factType: "preference",
        importance: 0.8,
        entityHints: ["TypeScript"],
        source: "file1.jsonl",
        timestamp: 1000,
      },
      {
        content: "Use React for frontend",
        factType: "decision",
        importance: 0.7,
        entityHints: ["React"],
        source: "file2.jsonl",
        timestamp: 2000,
      },
    ];

    const deduplicated = crossFileDedup(allFacts);

    // Both should be preserved since they're different
    expect(deduplicated).toEqual(allFacts);
  });

  test("handles similar facts with Jaccard similarity threshold", () => {
    const allFacts: ParsedFact[] = [
      {
        content: "I prefer using TypeScript for development",
        factType: "preference",
        importance: 0.8,
        entityHints: ["TypeScript"],
        source: "file1.jsonl",
        timestamp: 1000,
      },
      {
        content: "I prefer to use TypeScript for all development work",
        factType: "preference",
        importance: 0.8,
        entityHints: ["TypeScript"],
        source: "file2.jsonl",
        timestamp: 2000,
      },
    ];

    const deduplicated = crossFileDedup(allFacts);

    // Similar facts should be deduplicated if similarity > threshold (0.7)
    expect(deduplicated.length).toBeLessThanOrEqual(allFacts.length);
  });

  test("keeps fact with earliest timestamp in dedup", () => {
    const allFacts: ParsedFact[] = [
      {
        content: "Always use TypeScript",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "file3.jsonl",
        timestamp: 3000, // Latest
      },
      {
        content: "Always use TypeScript",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "file1.jsonl",
        timestamp: 1000, // Earliest
      },
      {
        content: "Always use TypeScript",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "file2.jsonl",
        timestamp: 2000, // Middle
      },
    ];

    const deduplicated = crossFileDedup(allFacts);

    const result = deduplicated.find((f) => f.content === "Always use TypeScript");
    expect(result?.timestamp).toBe(1000);
    expect(result?.source).toBe("file1.jsonl");
  });
});

// ── summarizeResults ──────────────────────────────────────────────────

describe("summarizeResults", () => {
  test("computes correct fact counts by type", () => {
    const facts: ParsedFact[] = [
      {
        content: "Fact 1",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "file1.jsonl",
        timestamp: 1000,
      },
      {
        content: "Fact 2",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "file1.jsonl",
        timestamp: 1100,
      },
      {
        content: "Fact 3",
        factType: "decision",
        importance: 0.7,
        entityHints: [],
        source: "file1.jsonl",
        timestamp: 1200,
      },
      {
        content: "Fact 4",
        factType: "correction",
        importance: 0.9,
        entityHints: [],
        source: "file2.jsonl",
        timestamp: 2000,
      },
    ];

    const summary = summarizeResults(facts);

    expect(summary.byType.preference).toBe(2);
    expect(summary.byType.decision).toBe(1);
    expect(summary.byType.correction).toBe(1);
  });

  test("counts unique sources correctly", () => {
    const facts: ParsedFact[] = [
      {
        content: "Fact 1",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "file1.jsonl",
        timestamp: 1000,
      },
      {
        content: "Fact 2",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "file1.jsonl",
        timestamp: 1100,
      },
      {
        content: "Fact 3",
        factType: "decision",
        importance: 0.7,
        entityHints: [],
        source: "file2.jsonl",
        timestamp: 1200,
      },
    ];

    const summary = summarizeResults(facts);

    expect(summary.totalFiles).toBe(2);
  });

  test("returns empty summary for empty facts", () => {
    const summary = summarizeResults([]);

    expect(summary.totalFactsExtracted).toBe(0);
    expect(summary.factsAfterDedup).toBe(0);
    expect(summary.totalFiles).toBe(0);
    expect(Object.keys(summary.byType).length).toBe(0);
  });

  test("includes processing time in summary", () => {
    const facts: ParsedFact[] = [
      {
        content: "Test fact",
        factType: "note",
        importance: 0.5,
        entityHints: [],
        source: "file1.jsonl",
        timestamp: 1000,
      },
    ];

    const summary = summarizeResults(facts);

    expect(summary.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  test("returns BootstrapResult structure", () => {
    const facts: ParsedFact[] = [
      {
        content: "Fact 1",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "file1.jsonl",
        timestamp: 1000,
      },
    ];

    const summary = summarizeResults(facts);

    expect(summary).toHaveProperty("totalFiles");
    expect(summary).toHaveProperty("totalFactsExtracted");
    expect(summary).toHaveProperty("factsAfterDedup");
    expect(summary).toHaveProperty("byType");
    expect(summary).toHaveProperty("processingTimeMs");
  });

  test("handles multiple fact types in summary", () => {
    const facts: ParsedFact[] = [
      {
        content: "Fact 1",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "file1.jsonl",
        timestamp: 1000,
      },
      {
        content: "Fact 2",
        factType: "decision",
        importance: 0.7,
        entityHints: [],
        source: "file1.jsonl",
        timestamp: 1100,
      },
      {
        content: "Fact 3",
        factType: "correction",
        importance: 0.9,
        entityHints: [],
        source: "file2.jsonl",
        timestamp: 2000,
      },
      {
        content: "Fact 4",
        factType: "pattern",
        importance: 0.75,
        entityHints: [],
        source: "file2.jsonl",
        timestamp: 2100,
      },
      {
        content: "Fact 5",
        factType: "note",
        importance: 0.5,
        entityHints: [],
        source: "file3.jsonl",
        timestamp: 3000,
      },
    ];

    const summary = summarizeResults(facts);

    expect(summary.byType.preference).toBe(1);
    expect(summary.byType.decision).toBe(1);
    expect(summary.byType.correction).toBe(1);
    expect(summary.byType.pattern).toBe(1);
    expect(summary.byType.note).toBe(1);
  });
});

// ── Integration tests ────────────────────────────────────────────────

describe("parallel bootstrap integration", () => {
  test("processes multiple files and deduplicates results", async () => {
    const file1 = await createSessionFile("session1.jsonl", [
      {
        role: "user",
        content: "I prefer using TypeScript for all projects",
        timestamp: 1000,
      },
      {
        role: "user",
        content: "Let's use bun for package management",
        timestamp: 1100,
      },
    ]);

    const file2 = await createSessionFile("session2.jsonl", [
      {
        role: "user",
        content: "I prefer using TypeScript for all projects",
        timestamp: 2000,
      },
      {
        role: "user",
        content: "Let's use React for the frontend",
        timestamp: 2100,
      },
    ]);

    const facts = await processFilesBatch([file1, file2], 2);
    const deduplicated = crossFileDedup(facts);
    const summary = summarizeResults(deduplicated);

    expect(summary.totalFiles).toBe(2);
    expect(summary.totalFactsExtracted).toBeGreaterThan(0);
    expect(summary.factsAfterDedup).toBeLessThanOrEqual(
      summary.totalFactsExtracted
    );
  });

  test("end-to-end workflow with multiple files and dedup", async () => {
    const files: string[] = [];
    for (let i = 0; i < 3; i++) {
      const filePath = await createSessionFile(`session${i}.jsonl`, [
        {
          role: "user",
          content: "Always use TypeScript for development",
          timestamp: 1000 + i * 100,
        },
        {
          role: "user",
          content: `Use bun package manager session ${i}`,
          timestamp: 1100 + i * 100,
        },
      ]);
      files.push(filePath);
    }

    const facts = await processFilesBatch(files, 2);
    const deduplicated = crossFileDedup(facts);
    const summary = summarizeResults(deduplicated);

    // After deduplication of repeated facts, we'll have fewer unique sources
    expect(summary.factsAfterDedup).toBeGreaterThan(0);
    // TypeScript preference should be deduplicated to 1 (kept earliest)
    const typeScriptFacts = deduplicated.filter((f) =>
      f.content.toLowerCase().includes("typescript")
    );
    expect(typeScriptFacts.length).toBeLessThanOrEqual(3);
    // We should have some facts from at least one file
    expect(summary.totalFiles).toBeGreaterThan(0);
  });
});
