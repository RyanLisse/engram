import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  estimateTokensForFacts,
  thresholdCheck,
} from "../src/lib/token-counter";
import { estimateFactTokens, applyTokenBudget } from "../src/lib/token-budget";

describe("Token Estimation", () => {
  describe("estimateTokens", () => {
    it("should return 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });

    it("should estimate tokens for plain text using chars/4 heuristic", () => {
      // "hello" = 5 chars, ceil(5/4) = 2 tokens
      expect(estimateTokens("hello")).toBe(2);

      // "hello world" = 11 chars, ceil(11/4) = 3 tokens
      expect(estimateTokens("hello world")).toBe(3);

      // exactly 4 chars should be 1 token
      expect(estimateTokens("test")).toBe(1);

      // 8 chars should be 2 tokens
      expect(estimateTokens("testtest")).toBe(2);
    });

    it("should handle code blocks with denser token ratio (chars/3)", () => {
      // Code blocks have denser tokens: chars/3 vs plain text chars/4
      const codeOnly = "```javascript\ncode\n```"; // ~22 chars: ceil(22/3) = 8 tokens
      const plainOnly = "0123456789abcdefghijklmno"; // 25 chars: ceil(25/4) = 7 tokens
      const codeTokens = estimateTokens(codeOnly);
      const plainTokens = estimateTokens(plainOnly);
      // Code blocks should be denser - same content length has higher token cost
      expect(codeTokens).toBeGreaterThan(plainTokens);
    });

    it("should count multiple code blocks", () => {
      const text = "text\n```\ncode1\n```\nmore\n```\ncode2\n```";
      const result = estimateTokens(text);
      expect(result).toBeGreaterThan(0);
    });

    it("should handle code blocks with various languages", () => {
      const jsCode = "```javascript\nconst x = 42;\n```";
      const pythonCode = "```python\nx = 42\n```";
      const plainCode = "```\nx = 42\n```";

      const jsTokens = estimateTokens(jsCode);
      const pythonTokens = estimateTokens(pythonCode);
      const plainTokens = estimateTokens(plainCode);

      expect(jsTokens).toBeGreaterThan(0);
      expect(pythonTokens).toBeGreaterThan(0);
      expect(plainTokens).toBeGreaterThan(0);
    });

    it("should handle special characters", () => {
      const special = "!@#$%^&*()_+-=[]{}|;:',.<>?";
      expect(estimateTokens(special)).toBeGreaterThan(0);
    });

    it("should handle unicode characters", () => {
      expect(estimateTokens("hello world")).toBeGreaterThan(0);
      expect(estimateTokens("こんにちは")).toBeGreaterThan(0);
      expect(estimateTokens("🚀🎉✨")).toBeGreaterThan(0);
      expect(estimateTokens("Café")).toBeGreaterThan(0);

      // Unicode chars: emojis may be represented as surrogate pairs (2 chars in JS)
      const emoji = "🚀"; // potentially 2 chars in JS string length
      const plain = "ab"; // 2 chars
      const emojiTokens = estimateTokens(emoji);
      const plainTokens = estimateTokens(plain);
      // Both should estimate similarly based on char length
      expect(emojiTokens).toBeGreaterThan(0);
      expect(plainTokens).toBeGreaterThan(0);
    });

    it("should handle markdown formatting", () => {
      const markdown = `# Heading

This is **bold** and *italic* text.

- List item 1
- List item 2

> Blockquote here`;
      expect(estimateTokens(markdown)).toBeGreaterThan(0);
    });

    it("should handle mixed content (text + code)", () => {
      const mixed = `Here is some text.

\`\`\`javascript
const greeting = "Hello, World!";
console.log(greeting);
\`\`\`

And more text after.`;

      const result = estimateTokens(mixed);
      expect(result).toBeGreaterThan(0);
    });

    it("should handle very long text", () => {
      const longText = "a".repeat(10000);
      const tokens = estimateTokens(longText);
      // 10000 chars / 4 = 2500 tokens
      expect(tokens).toBeCloseTo(2500, 0);
    });

    it("should handle text with newlines and whitespace", () => {
      const text = "line1\nline2\nline3\n\n\nline4";
      expect(estimateTokens(text)).toBeGreaterThan(0);
    });

    it("should handle nested or incomplete code blocks gracefully", () => {
      // Incomplete code block (no closing ```)
      const incomplete = "```javascript\nconst x = 5;";
      expect(estimateTokens(incomplete)).toBeGreaterThan(0);

      // Only opening
      const opening = "```";
      expect(estimateTokens(opening)).toBeGreaterThan(0);
    });

    it("should remove code blocks from plain text calculation", () => {
      const withCode = "Text before\n```\ncode\n```\nText after";
      // Should have separate tokens for code (chars/3) and text (chars/4)
      expect(estimateTokens(withCode)).toBeGreaterThan(0);

      const withoutCode = "Text beforeText after";
      expect(estimateTokens(withoutCode)).toBeGreaterThan(0);
    });
  });

  describe("estimateTokensForFacts", () => {
    it("should return 0 for empty facts array", () => {
      expect(estimateTokensForFacts([])).toBe(0);
    });

    it("should sum tokens for multiple facts", () => {
      const facts = [
        { content: "fact one" },
        { content: "fact two" },
        { content: "fact three" },
      ];
      const total = estimateTokensForFacts(facts);
      const individual = facts.reduce(
        (sum, f) => sum + estimateTokens(f.content ?? ""),
        0
      );
      expect(total).toBe(individual);
    });

    it("should handle facts with missing content", () => {
      const facts = [
        { content: "first" },
        { content: undefined },
        { content: "third" },
        {}, // no content field
      ];
      expect(estimateTokensForFacts(facts)).toBeGreaterThan(0);
    });

    it("should handle facts with code blocks", () => {
      const facts = [
        { content: "Text with code\n```\ncode\n```" },
        { content: "Just text" },
      ];
      expect(estimateTokensForFacts(facts)).toBeGreaterThan(0);
    });
  });

  describe("thresholdCheck", () => {
    it("should return exceeded=false when under threshold", () => {
      const result = thresholdCheck(50, 100);
      expect(result.exceeded).toBe(false);
      expect(result.percentage).toBe(50);
      expect(result.bufferReady).toBe(true); // 50% >= 20% buffer threshold
    });

    it("should return exceeded=true at exactly threshold", () => {
      const result = thresholdCheck(100, 100);
      expect(result.exceeded).toBe(true);
      expect(result.percentage).toBe(100);
    });

    it("should return exceeded=true when over threshold", () => {
      const result = thresholdCheck(150, 100);
      expect(result.exceeded).toBe(true);
      expect(result.percentage).toBe(150);
    });

    it("should detect buffer readiness at 20% threshold", () => {
      const result = thresholdCheck(20, 100);
      expect(result.bufferReady).toBe(true);
      expect(result.exceeded).toBe(false);
      expect(result.percentage).toBe(20);
    });

    it("should return bufferReady=false below 20%", () => {
      const result = thresholdCheck(19, 100);
      expect(result.bufferReady).toBe(false);
    });

    it("should handle zero threshold", () => {
      const result = thresholdCheck(10, 0);
      expect(result.percentage).toBe(0); // percentage = 0 when threshold = 0
      expect(result.exceeded).toBe(true); // 10 >= 0 is true
      expect(result.bufferReady).toBe(false); // 0 >= 0.2 is false
    });

    it("should round percentage correctly", () => {
      const result = thresholdCheck(33, 100);
      expect(result.percentage).toBe(33);

      const result2 = thresholdCheck(334, 1000);
      expect(result2.percentage).toBe(33); // Math.round(33.4) = 33

      const result3 = thresholdCheck(335, 1000);
      expect(result3.percentage).toBe(34); // Math.round(33.5) = 34
    });
  });

  describe("estimateFactTokens", () => {
    it("should use stored tokenEstimate when available", () => {
      const fact = {
        content: "This is 100 characters long" + "a".repeat(72),
        tokenEstimate: 50,
      };
      expect(estimateFactTokens(fact)).toBe(50);
    });

    it("should fall back to estimateTokens when tokenEstimate is missing", () => {
      const fact = { content: "hello world" };
      expect(estimateFactTokens(fact)).toBe(estimateTokens("hello world"));
    });

    it("should fall back when tokenEstimate is 0", () => {
      const fact = {
        content: "hello world",
        tokenEstimate: 0, // 0 is falsy
      };
      expect(estimateFactTokens(fact)).toBe(estimateTokens("hello world"));
    });

    it("should handle missing content field", () => {
      const fact = { tokenEstimate: 10 };
      expect(estimateFactTokens(fact)).toBe(10);

      const fact2 = { tokenEstimate: undefined };
      expect(estimateFactTokens(fact2)).toBe(0);

      const fact3 = {};
      expect(estimateFactTokens(fact3)).toBe(0);
    });

    it("should prefer tokenEstimate over calculating from content", () => {
      // Even if content is long, use stored estimate
      const longContent = "a".repeat(10000);
      const fact = {
        content: longContent,
        tokenEstimate: 100,
      };
      expect(estimateFactTokens(fact)).toBe(100);
    });
  });

  describe("applyTokenBudget", () => {
    it("should return empty array and 0 used for empty facts", () => {
      const result = applyTokenBudget([], 1000);
      expect(result.facts).toEqual([]);
      expect(result.tokenUsage.used).toBe(0);
      expect(result.tokenUsage.budget).toBe(1000);
      expect(result.tokenUsage.truncated).toBe(false);
    });

    it("should include all facts when within budget", () => {
      const facts = [
        { id: 1, content: "fact one" },
        { id: 2, content: "fact two" },
        { id: 3, content: "fact three" },
      ];
      const result = applyTokenBudget(facts, 10000);
      expect(result.facts.length).toBe(3);
      expect(result.tokenUsage.truncated).toBe(false);
    });

    it("should stop adding facts when next would exceed budget", () => {
      const facts = [
        { id: 1, content: "a" }, // ~1 token
        { id: 2, content: "bb" }, // ~1 token
        { id: 3, content: "ccc" }, // ~1 token
      ];
      const result = applyTokenBudget(facts, 2); // budget of 2 tokens
      expect(result.facts.length).toBeLessThanOrEqual(2);
      expect(result.tokenUsage.truncated).toBe(true);
      expect(result.tokenUsage.used).toBeLessThanOrEqual(2);
    });

    it("should accumulate tokens correctly", () => {
      const facts = [
        { id: 1, content: "test" }, // 1 token
        { id: 2, content: "test" }, // 1 token
        { id: 3, content: "test" }, // 1 token
      ];
      const result = applyTokenBudget(facts, 100);
      const sumTokens = facts.reduce(
        (sum, f) => sum + estimateFactTokens(f),
        0
      );
      expect(result.tokenUsage.used).toBe(sumTokens);
    });

    it("should respect stored tokenEstimate in facts", () => {
      const facts = [
        { id: 1, content: "ignored", tokenEstimate: 100 },
        { id: 2, content: "also ignored", tokenEstimate: 100 },
      ];
      const result = applyTokenBudget(facts, 150); // budget 150
      expect(result.facts.length).toBe(1); // only 1st fact fits (100 tokens)
      expect(result.tokenUsage.used).toBe(100);
      expect(result.tokenUsage.truncated).toBe(true);
    });

    it("should handle facts with mixed token estimates and fallback", () => {
      const facts = [
        { id: 1, content: "a".repeat(100), tokenEstimate: 25 }, // use 25
        { id: 2, content: "b".repeat(100) }, // fallback to estimated
      ];
      const result = applyTokenBudget(facts, 500);
      expect(result.facts.length).toBeGreaterThan(0);
      expect(result.tokenUsage.used).toBeGreaterThan(0);
    });

    it("should preserve order of facts (respects relevance ranking)", () => {
      const facts = [
        { id: 1, rank: 1, content: "first" },
        { id: 2, rank: 2, content: "second" },
        { id: 3, rank: 3, content: "third" },
      ];
      const result = applyTokenBudget(facts, 1000);
      expect(result.facts[0].id).toBe(1);
      expect(result.facts[1].id).toBe(2);
      expect(result.facts[2].id).toBe(3);
    });

    it("should mark as truncated only when some facts are excluded", () => {
      const factsSmall = [
        { id: 1, content: "x" },
        { id: 2, content: "y" },
      ];
      const result1 = applyTokenBudget(factsSmall, 1000);
      expect(result1.tokenUsage.truncated).toBe(false);

      const factsLarge = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        content: "a".repeat(100),
      }));
      const result2 = applyTokenBudget(factsLarge, 100);
      expect(result2.tokenUsage.truncated).toBe(true);
    });

    it("should handle single fact exactly at budget", () => {
      const facts = [{ id: 1, content: "test", tokenEstimate: 50 }];
      const result = applyTokenBudget(facts, 50);
      expect(result.facts.length).toBe(1);
      expect(result.tokenUsage.used).toBe(50);
      expect(result.tokenUsage.truncated).toBe(false);
    });

    it("should exclude single fact exceeding budget", () => {
      const facts = [{ id: 1, content: "test", tokenEstimate: 100 }];
      const result = applyTokenBudget(facts, 50);
      expect(result.facts.length).toBe(0);
      expect(result.tokenUsage.used).toBe(0);
      expect(result.tokenUsage.truncated).toBe(true);
    });

    it("should handle large budgets", () => {
      const facts = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        content: "fact " + i,
      }));
      const result = applyTokenBudget(facts, 1000000);
      expect(result.facts.length).toBe(100);
      expect(result.tokenUsage.truncated).toBe(false);
    });
  });

  describe("Edge Cases and Integration", () => {
    it("should handle very long single fact", () => {
      const longFact = { content: "x".repeat(100000) };
      const result = applyTokenBudget([longFact], 10000);
      expect(result.facts.length).toBe(0); // exceeds budget
      expect(result.tokenUsage.truncated).toBe(true);
    });

    it("should process mixed unicode and code", () => {
      const fact = {
        content: `Hello 世界
\`\`\`python
def hello():
    print("こんにちは")
\`\`\`
More text with émojis 🎉`,
      };
      const tokens = estimateTokens(fact.content);
      expect(tokens).toBeGreaterThan(0);
      expect(estimateFactTokens(fact)).toBe(tokens);
    });

    it("should preserve fact metadata through budget application", () => {
      const facts = [
        { id: 1, content: "a", priority: "high", tags: ["tag1"] },
        { id: 2, content: "b", priority: "low", tags: ["tag2", "tag3"] },
      ];
      const result = applyTokenBudget(facts, 1000);
      expect(result.facts[0].priority).toBe("high");
      expect(result.facts[0].tags).toEqual(["tag1"]);
    });

    it("should handle facts with null/undefined content gracefully", () => {
      const facts = [
        { id: 1, content: null },
        { id: 2, content: undefined },
        { id: 3, content: "valid" },
      ];
      const result = applyTokenBudget(facts, 1000);
      expect(result.facts.length).toBe(3);
      expect(result.tokenUsage.used).toBeGreaterThan(0);
    });
  });
});
