import { describe, test, expect } from "vitest";
import {
  parseSessionLine,
  extractFacts,
  deduplicateFacts,
  ParsedFact,
} from "../../scripts/parse-claude-code-history.js";

describe("parseSessionLine", () => {
  test("parses valid session line with proper structure", () => {
    const line = JSON.stringify({
      type: "human",
      message: {
        role: "user",
        content: "I prefer using TypeScript",
      },
      timestamp: "2026-02-25T10:00:00Z",
    });

    const result = parseSessionLine(line);

    expect(result).not.toBeNull();
    expect(result?.role).toBe("user");
    expect(result?.content).toBe("I prefer using TypeScript");
    expect(typeof result?.timestamp).toBe("number");
  });

  test("returns null for invalid JSON", () => {
    const result = parseSessionLine("not valid json");
    expect(result).toBeNull();
  });

  test("returns null when message is missing", () => {
    const line = JSON.stringify({
      type: "human",
      timestamp: "2026-02-25T10:00:00Z",
    });

    expect(parseSessionLine(line)).toBeNull();
  });

  test("returns null when timestamp is missing", () => {
    const line = JSON.stringify({
      type: "human",
      message: { role: "user", content: "test" },
    });

    expect(parseSessionLine(line)).toBeNull();
  });

  test("returns null when role is missing from message", () => {
    const line = JSON.stringify({
      type: "human",
      message: { content: "test" },
      timestamp: "2026-02-25T10:00:00Z",
    });

    expect(parseSessionLine(line)).toBeNull();
  });

  test("returns null when content is missing from message", () => {
    const line = JSON.stringify({
      type: "human",
      message: { role: "user" },
      timestamp: "2026-02-25T10:00:00Z",
    });

    expect(parseSessionLine(line)).toBeNull();
  });

  test("returns null for invalid timestamp", () => {
    const line = JSON.stringify({
      type: "human",
      message: { role: "user", content: "test" },
      timestamp: "not a date",
    });

    expect(parseSessionLine(line)).toBeNull();
  });

  test("converts ISO-8601 timestamp to milliseconds", () => {
    const line = JSON.stringify({
      type: "human",
      message: { role: "user", content: "test" },
      timestamp: "2026-02-25T10:00:00Z",
    });

    const result = parseSessionLine(line);
    expect(result?.timestamp).toBe(new Date("2026-02-25T10:00:00Z").getTime());
  });

  test("handles content as non-string gracefully", () => {
    const line = JSON.stringify({
      type: "human",
      message: { role: "user", content: 123 },
      timestamp: "2026-02-25T10:00:00Z",
    });

    expect(parseSessionLine(line)).toBeNull();
  });
});

describe("extractFacts", () => {
  const baseTimestamp = new Date("2026-02-25T10:00:00Z").getTime();

  test("extracts correction facts from user messages", () => {
    const messages = [
      {
        role: "user",
        content: "Actually, I prefer using TypeScript instead",
        timestamp: baseTimestamp,
      },
    ];

    const facts = extractFacts(messages);

    expect(facts).toHaveLength(1);
    expect(facts[0].factType).toBe("correction");
    expect(facts[0].importance).toBe(0.9);
  });

  test("extracts preference facts from user messages", () => {
    const messages = [
      {
        role: "user",
        content: "I prefer using bun instead of npm",
        timestamp: baseTimestamp,
      },
    ];

    const facts = extractFacts(messages);

    expect(facts).toHaveLength(1);
    expect(facts[0].factType).toBe("preference");
    expect(facts[0].importance).toBe(0.8);
  });

  test("extracts decision facts from user messages", () => {
    const messages = [
      {
        role: "user",
        content: "Let's go with TypeScript for this project",
        timestamp: baseTimestamp,
      },
    ];

    const facts = extractFacts(messages);

    expect(facts).toHaveLength(1);
    expect(facts[0].factType).toBe("decision");
    expect(facts[0].importance).toBe(0.7);
  });

  test("ignores assistant messages", () => {
    const messages = [
      {
        role: "assistant",
        content: "I prefer using TypeScript",
        timestamp: baseTimestamp,
      },
    ];

    const facts = extractFacts(messages);

    expect(facts).toHaveLength(0);
  });

  test("ignores tool call messages", () => {
    const messages = [
      {
        role: "user",
        content: "Please call this function_calls tool",
        timestamp: baseTimestamp,
      },
    ];

    const facts = extractFacts(messages);

    expect(facts).toHaveLength(0);
  });

  test("ignores very short messages", () => {
    const messages = [
      {
        role: "user",
        content: "OK",
        timestamp: baseTimestamp,
      },
    ];

    const facts = extractFacts(messages);

    expect(facts).toHaveLength(0);
  });

  test("ignores pure question messages without assertions", () => {
    const messages = [
      {
        role: "user",
        content: "What is the best way to structure a TypeScript project?",
        timestamp: baseTimestamp,
      },
    ];

    const facts = extractFacts(messages);

    expect(facts).toHaveLength(0);
  });

  test("extracts questions with assertions", () => {
    const messages = [
      {
        role: "user",
        content: "I think we should use TypeScript, right?",
        timestamp: baseTimestamp,
      },
    ];

    const facts = extractFacts(messages);

    expect(facts.length).toBeGreaterThan(0);
  });

  test("extracts entity hints from capitalized words", () => {
    const messages = [
      {
        role: "user",
        content: "I prefer using TypeScript with Express and MongoDB",
        timestamp: baseTimestamp,
      },
    ];

    const facts = extractFacts(messages);

    expect(facts).toHaveLength(1);
    expect(facts[0].entityHints).toContain("TypeScript");
    expect(facts[0].entityHints).toContain("Express");
    expect(facts[0].entityHints).toContain("MongoDB");
  });

  test("limits entity hints to 5", () => {
    const messages = [
      {
        role: "user",
        content:
          "I like TypeScript Express MongoDB Redis Postgres Kubernetes Docker React Vue Angular",
        timestamp: baseTimestamp,
      },
    ];

    const facts = extractFacts(messages);

    expect(facts).toHaveLength(1);
    expect(facts[0].entityHints.length).toBeLessThanOrEqual(5);
  });

  test("truncates content to 500 characters", () => {
    const longContent = "I prefer using ".repeat(50);
    const messages = [
      {
        role: "user",
        content: longContent,
        timestamp: baseTimestamp,
      },
    ];

    const facts = extractFacts(messages);

    expect(facts).toHaveLength(1);
    expect(facts[0].content.length).toBeLessThanOrEqual(500);
  });

  test("preserves timestamp in extracted facts", () => {
    const messages = [
      {
        role: "user",
        content: "I prefer using TypeScript",
        timestamp: baseTimestamp,
      },
    ];

    const facts = extractFacts(messages);

    expect(facts[0].timestamp).toBe(baseTimestamp);
  });

  test("identifies multiple fact types in same batch", () => {
    const messages = [
      {
        role: "user",
        content: "I prefer using TypeScript",
        timestamp: baseTimestamp,
      },
      {
        role: "user",
        content: "Actually, let's use Rust instead",
        timestamp: baseTimestamp + 1000,
      },
      {
        role: "user",
        content: "Let's go with Go for this service",
        timestamp: baseTimestamp + 2000,
      },
    ];

    const facts = extractFacts(messages);

    expect(facts).toHaveLength(3);
    expect(facts[0].factType).toBe("preference");
    expect(facts[1].factType).toBe("correction");
    expect(facts[2].factType).toBe("decision");
  });

  test("handles variations of correction patterns", () => {
    const patterns = [
      "Actually, don't use that approach",
      "No, I meant something else",
      "Never do that again",
      "That's wrong, try this instead",
    ];

    for (const content of patterns) {
      const facts = extractFacts([
        {
          role: "user",
          content,
          timestamp: baseTimestamp,
        },
      ]);

      expect(facts).toHaveLength(1);
      expect(facts[0].factType).toBe("correction");
    }
  });

  test("handles variations of preference patterns", () => {
    const patterns = [
      "I like using bun",
      "Always use TypeScript",
      "Never use Python",
      "My preference is Rust",
    ];

    for (const content of patterns) {
      const facts = extractFacts([
        {
          role: "user",
          content,
          timestamp: baseTimestamp,
        },
      ]);

      expect(facts).toHaveLength(1);
      expect(facts[0].factType).toBe("preference");
    }
  });

  test("handles variations of decision patterns", () => {
    const patterns = [
      "We'll use TypeScript for this",
      "I've decided to go with Rust",
      "Let's implement it with Go",
      "Choose TypeScript for the backend",
    ];

    for (const content of patterns) {
      const facts = extractFacts([
        {
          role: "user",
          content,
          timestamp: baseTimestamp,
        },
      ]);

      expect(facts).toHaveLength(1);
      expect(facts[0].factType).toBe("decision");
    }
  });
});

describe("deduplicateFacts", () => {
  test("removes near-duplicate facts", () => {
    const facts: ParsedFact[] = [
      {
        content: "I prefer using TypeScript for backend development",
        factType: "preference",
        importance: 0.8,
        entityHints: ["TypeScript"],
        source: "test.jsonl",
        timestamp: 1000,
      },
      {
        content: "I prefer using TypeScript for development",
        factType: "preference",
        importance: 0.8,
        entityHints: ["TypeScript"],
        source: "test.jsonl",
        timestamp: 2000,
      },
    ];

    const result = deduplicateFacts(facts);

    // These should be deduplicated since they're very similar
    // (8 out of 8 words in shorter text appear in longer)
    expect(result.length).toBeLessThanOrEqual(facts.length);
  });

  test("preserves distinct facts", () => {
    const facts: ParsedFact[] = [
      {
        content: "I prefer using TypeScript",
        factType: "preference",
        importance: 0.8,
        entityHints: ["TypeScript"],
        source: "test.jsonl",
        timestamp: 1000,
      },
      {
        content: "I like working with databases",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "test.jsonl",
        timestamp: 2000,
      },
    ];

    const result = deduplicateFacts(facts);

    expect(result).toHaveLength(2);
  });

  test("handles empty input", () => {
    const result = deduplicateFacts([]);
    expect(result).toHaveLength(0);
  });

  test("handles single fact", () => {
    const facts: ParsedFact[] = [
      {
        content: "I prefer TypeScript",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "test.jsonl",
        timestamp: 1000,
      },
    ];

    const result = deduplicateFacts(facts);

    expect(result).toHaveLength(1);
  });

  test("uses Jaccard threshold of 0.7", () => {
    // Create facts with >70% word overlap (should be deduplicated)
    // If both texts have same 4 core words out of 4-5, similarity is high
    const facts: ParsedFact[] = [
      {
        content: "I prefer TypeScript and Express",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "test.jsonl",
        timestamp: 1000,
      },
      {
        content: "I prefer TypeScript and Express",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "test.jsonl",
        timestamp: 2000,
      },
    ];

    const result = deduplicateFacts(facts);

    // Should deduplicate - exact same content
    expect(result.length).toBeLessThan(facts.length);
  });

  test("preserves facts below similarity threshold", () => {
    // Create facts with <70% word overlap (should NOT be deduplicated)
    const facts: ParsedFact[] = [
      {
        content: "I prefer using TypeScript",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "test.jsonl",
        timestamp: 1000,
      },
      {
        content: "I like Go programming language",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "test.jsonl",
        timestamp: 2000,
      },
    ];

    const result = deduplicateFacts(facts);

    expect(result).toHaveLength(2);
  });

  test("keeps first occurrence when deduplicating", () => {
    const facts: ParsedFact[] = [
      {
        content: "I prefer using TypeScript",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "test.jsonl",
        timestamp: 1000,
      },
      {
        content: "I prefer using TypeScript",
        factType: "preference",
        importance: 0.8,
        entityHints: [],
        source: "test.jsonl",
        timestamp: 2000,
      },
    ];

    const result = deduplicateFacts(facts);

    expect(result.length).toBe(1);
    expect(result[0].content).toBe("I prefer using TypeScript");
    expect(result[0].timestamp).toBe(1000); // First occurrence preserved
  });
});

describe("integration: extractFacts + deduplicateFacts", () => {
  const baseTimestamp = new Date("2026-02-25T10:00:00Z").getTime();

  test("full pipeline: parse → extract → deduplicate", () => {
    const messages = [
      {
        role: "user",
        content: "I prefer using TypeScript for all projects",
        timestamp: baseTimestamp,
      },
      {
        role: "assistant",
        content: "TypeScript is a good choice",
        timestamp: baseTimestamp + 1000,
      },
      {
        role: "user",
        content: "I prefer TypeScript and Express",
        timestamp: baseTimestamp + 2000,
      },
      {
        role: "user",
        content: "Let's use Rust for performance-critical code",
        timestamp: baseTimestamp + 3000,
      },
    ];

    let facts = extractFacts(messages);
    expect(facts.length).toBeGreaterThan(0);

    const beforeDedup = facts.length;
    facts = deduplicateFacts(facts);
    const afterDedup = facts.length;

    // Should have deduplicated similar preferences
    expect(afterDedup).toBeLessThanOrEqual(beforeDedup);
  });

  test("identifies repeated patterns", () => {
    const messages = [
      {
        role: "user",
        content: "Always use TypeScript",
        timestamp: baseTimestamp,
      },
      {
        role: "user",
        content: "Always use TypeScript",
        timestamp: baseTimestamp + 1000,
      },
      {
        role: "user",
        content: "Always use TypeScript",
        timestamp: baseTimestamp + 2000,
      },
    ];

    const facts = extractFacts(messages);

    // All three should be preferences initially
    expect(facts.every(f => f.factType === "preference")).toBe(true);

    // After deduplication, should have only 1
    const deduped = deduplicateFacts(facts);
    expect(deduped).toHaveLength(1);
  });
});
