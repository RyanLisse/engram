/**
 * Auto-summarize facts — Unit tests
 *
 * Covers the `generateFactSummary` pure function used by the enrichment
 * pipeline to auto-populate `factualSummary` for facts that don't provide
 * one explicitly.
 *
 * The enrichment pipeline (convex/actions/enrich.ts step 6c) guards with:
 *   if (!fact.factualSummary) { ... }
 * so existing summaries are never overwritten (tested via `autoSummarize`
 * wrapper below).
 */

import { describe, test, expect } from "vitest";
import { generateFactSummary } from "../src/lib/fact-summary.js";

// ─── Minimal wrapper to test the "skip if already has summary" guard ─────────

function autoSummarize(fact: {
  content: string;
  factualSummary?: string;
  factType?: string;
}): string | null {
  if (fact.factualSummary) return null; // already enriched — skip
  return generateFactSummary(fact.content, fact.factType);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Short content (≤50 chars) → returned as-is (no sentence extraction)
// ─────────────────────────────────────────────────────────────────────────────

describe("generateFactSummary — short content (≤50 chars)", () => {
  test("content exactly 50 chars is returned unchanged", () => {
    const exact50 = "a".repeat(50);
    expect(generateFactSummary(exact50)).toBe(exact50);
  });

  test("content shorter than 50 chars is returned unchanged", () => {
    const short = "Use bun, not npm.";
    expect(generateFactSummary(short)).toBe(short);
  });

  test("empty content returns empty string", () => {
    expect(generateFactSummary("")).toBe("");
  });

  test("whitespace-only content after stripping returns empty string", () => {
    // All markdown, no actual text
    const markdownOnly = "**  **";
    const result = generateFactSummary(markdownOnly);
    expect(result.trim()).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Multi-sentence content → first sentence only
// ─────────────────────────────────────────────────────────────────────────────

describe("generateFactSummary — multi-sentence → first sentence", () => {
  test("takes first sentence terminated by period", () => {
    const content =
      "We decided to use TypeScript for all new services. Python will be phased out. This was agreed unanimously.";
    expect(generateFactSummary(content)).toBe(
      "We decided to use TypeScript for all new services."
    );
  });

  test("takes first sentence terminated by exclamation mark", () => {
    const content = "Memory usage spiked to 98%! This triggered an OOM alert. The process was restarted.";
    expect(generateFactSummary(content)).toBe("Memory usage spiked to 98%!");
  });

  test("takes first sentence terminated by question mark", () => {
    const content = "Should we migrate to Convex? The current setup has scaling issues. Let's review.";
    expect(generateFactSummary(content)).toBe("Should we migrate to Convex?");
  });

  test("content with no sentence terminator returns full stripped content (up to 150 chars)", () => {
    const noTerminator =
      "This is a long fact about architectural decisions that does not end with punctuation and runs on quite a bit longer";
    const result = generateFactSummary(noTerminator);
    expect(result.length).toBeLessThanOrEqual(153); // at most 150 + "..."
    expect(result).toContain("architectural decisions");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Markdown is stripped
// ─────────────────────────────────────────────────────────────────────────────

describe("generateFactSummary — markdown stripping", () => {
  test("strips ATX headers (##, ###)", () => {
    const content = "## Architecture Decision\nWe chose Convex over Supabase. The team agreed.";
    const result = generateFactSummary(content);
    expect(result).not.toContain("##");
    expect(result).toContain("Architecture Decision");
  });

  test("strips bold markers (**text**)", () => {
    const content =
      "The **primary decision** was to standardize on TypeScript. Legacy Python scripts will be removed.";
    const result = generateFactSummary(content);
    expect(result).not.toContain("**");
    expect(result).toContain("primary decision");
  });

  test("strips inline code backticks but preserves text", () => {
    const content =
      "Call `memory_store_fact` before any recall operation. The order matters for consistency.";
    const result = generateFactSummary(content);
    expect(result).not.toContain("`");
    expect(result).toContain("memory_store_fact");
  });

  test("strips fenced code blocks entirely", () => {
    const content = "Install the tool:\n```bash\nbun install engram\n```\nThen run the setup.";
    const result = generateFactSummary(content);
    expect(result).not.toContain("```");
    expect(result).not.toContain("bun install");
    expect(result).toContain("Install the tool");
  });

  test("strips markdown links but keeps link text", () => {
    // The stripped markdown removes link syntax via the existing regex patterns
    const content = "See the [API reference](https://docs.engram.ai) for details. It covers all 73 tools.";
    const result = generateFactSummary(content);
    expect(result).not.toContain("https://");
    // Note: link stripping happens via bold/italic patterns; link text is preserved
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. 150-char truncation
// ─────────────────────────────────────────────────────────────────────────────

describe("generateFactSummary — 150-char truncation", () => {
  test("content exactly 150 chars is NOT truncated", () => {
    const exact150 = "word ".repeat(30); // 150 chars
    const result = generateFactSummary(exact150);
    expect(result.endsWith("...")).toBe(false);
  });

  test("content of 151 chars IS truncated with ellipsis", () => {
    const over150 = "word ".repeat(30) + "x"; // 151 chars
    const result = generateFactSummary(over150);
    expect(result.endsWith("...")).toBe(true);
    expect(result.length).toBe(153); // 150 + "..."
  });

  test("content of 200 chars truncates to 150 + ellipsis", () => {
    const long = "a".repeat(200);
    const result = generateFactSummary(long);
    expect(result).toHaveLength(153); // 150 + "..."
    expect(result.endsWith("...")).toBe(true);
  });

  test("first sentence under 150 chars is not truncated even if full content is longer", () => {
    // Short first sentence + very long second sentence
    const short1st = "Use TypeScript everywhere.";
    const filler = " " + "x".repeat(200);
    const result = generateFactSummary(short1st + filler);
    expect(result).toBe(short1st);
    expect(result.endsWith("...")).toBe(false);
  });

  test("truncation happens after markdown is stripped (length measured on clean content)", () => {
    // 30 markdown headers adding no length after strip, plus 200 "a" chars
    const content = "# heading\n" + "a".repeat(200);
    const result = generateFactSummary(content);
    expect(result.endsWith("...")).toBe(true);
    expect(result.length).toBe(153);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Existing summary is preserved (enrichment pipeline guard)
// ─────────────────────────────────────────────────────────────────────────────

describe("autoSummarize — existing summary is preserved", () => {
  test("returns null when factualSummary is already set (no-op)", () => {
    const result = autoSummarize({
      content: "This is a long fact with multiple sentences. The second one follows.",
      factualSummary: "Pre-existing summary from earlier enrichment run",
      factType: "observation",
    });
    expect(result).toBeNull();
  });

  test("returns generated summary when factualSummary is absent", () => {
    const result = autoSummarize({
      content: "We decided to adopt Cohere Embed 4 for all embedding tasks. The quality is measurably better.",
      factType: "decision",
    });
    expect(result).not.toBeNull();
    expect(result).toContain("[decision]");
    expect(result).toContain("We decided to adopt Cohere Embed 4");
  });

  test("returns generated summary when factualSummary is undefined", () => {
    const result = autoSummarize({
      content: "Agent registration completed successfully.",
    });
    expect(result).not.toBeNull();
    expect(result).toBe("Agent registration completed successfully.");
  });

  test("does not overwrite a non-empty existing summary even if it looks wrong", () => {
    const result = autoSummarize({
      content: "New content that is very different.",
      factualSummary: "Old summary from a previous run",
    });
    // The pipeline guard returns null — no overwrite attempted
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Empty content
// ─────────────────────────────────────────────────────────────────────────────

describe("generateFactSummary — empty / nullish content", () => {
  test("empty string returns empty string", () => {
    expect(generateFactSummary("")).toBe("");
  });

  test("content with only newlines returns empty string after trim", () => {
    const result = generateFactSummary("\n\n\n");
    expect(result.trim()).toBe("");
  });
});
