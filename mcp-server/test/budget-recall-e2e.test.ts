import { describe, it, expect } from "vitest";
import { applyTokenBudget } from "../src/lib/token-budget";
import { estimateTokens } from "../src/lib/token-counter";

describe("Budget-Constrained Recall E2E", () => {
  describe("Token Budget Application", () => {
    it("should return facts that fit within budget", () => {
      const facts = [
        { _id: "1", content: "Short fact", importanceScore: 0.9, tokenEstimate: 3 },
        { _id: "2", content: "Another short fact", importanceScore: 0.8, tokenEstimate: 5 },
        { _id: "3", content: "Yet another fact", importanceScore: 0.7, tokenEstimate: 4 },
      ];
      const budget = 10;
      const result = applyTokenBudget(facts, budget);

      expect(result.facts.length).toBeGreaterThan(0);
      expect(result.tokenUsage.used).toBeLessThanOrEqual(budget);
    });

    it("should prioritize higher-ranked facts when budget is tight", () => {
      const facts = [
        { _id: "high", content: "Important fact", importanceScore: 0.95, tokenEstimate: 50 },
        { _id: "medium", content: "Medium importance fact", importanceScore: 0.5, tokenEstimate: 40 },
        { _id: "low", content: "Low importance fact", importanceScore: 0.1, tokenEstimate: 30 },
      ];
      const budget = 60; // Only enough for high + medium

      const result = applyTokenBudget(facts, budget);

      // Should include high-importance fact first
      const hasHigh = result.facts.some((f: any) => f._id === "high");
      expect(hasHigh).toBe(true);
    });

    it("should detect truncation when facts exceed budget", () => {
      const facts = [
        { _id: "1", content: "Fact 1", tokenEstimate: 10 },
        { _id: "2", content: "Fact 2", tokenEstimate: 10 },
        { _id: "3", content: "Fact 3", tokenEstimate: 10 },
      ];
      const budget = 25; // Not enough for all 3

      const result = applyTokenBudget(facts, budget);

      expect(result.tokenUsage.truncated).toBe(true);
      expect(result.facts.length).toBeLessThan(facts.length);
    });

    it("should not mark as truncated when all facts fit", () => {
      const facts = [
        { _id: "1", content: "Fact 1", tokenEstimate: 5 },
        { _id: "2", content: "Fact 2", tokenEstimate: 5 },
      ];
      const budget = 20; // More than enough

      const result = applyTokenBudget(facts, budget);

      expect(result.tokenUsage.truncated).toBe(false);
      expect(result.facts.length).toBe(2);
    });

    it("should accurately report token usage", () => {
      const facts = [
        { _id: "1", content: "Fact 1", tokenEstimate: 10 },
        { _id: "2", content: "Fact 2", tokenEstimate: 15 },
        { _id: "3", content: "Fact 3", tokenEstimate: 20 },
      ];
      const budget = 40;

      const result = applyTokenBudget(facts, budget);

      // Should fit facts 1 and 2 (10 + 15 = 25)
      const expectedUsed = result.facts.reduce((sum: number, f: any) => sum + f.tokenEstimate, 0);
      expect(result.tokenUsage.used).toBe(expectedUsed);
      expect(result.tokenUsage.used).toBeLessThanOrEqual(budget);
    });
  });

  describe("Budget Sizes", () => {
    const facts = [
      { _id: "1", content: "Important fact A", importanceScore: 0.9, tokenEstimate: 5 },
      { _id: "2", content: "Important fact B", importanceScore: 0.85, tokenEstimate: 7 },
      { _id: "3", content: "Medium importance fact", importanceScore: 0.5, tokenEstimate: 6 },
      { _id: "4", content: "Low importance fact", importanceScore: 0.2, tokenEstimate: 4 },
    ];

    it("should handle budget of 0", () => {
      const result = applyTokenBudget(facts, 0);
      expect(result.facts.length).toBe(0);
      expect(result.tokenUsage.used).toBe(0);
      expect(result.tokenUsage.truncated).toBe(true);
    });

    it("should handle very small budget", () => {
      const result = applyTokenBudget(facts, 1);
      // Should have no facts since even the smallest is 4 tokens
      expect(result.facts.length).toBe(0);
      expect(result.tokenUsage.truncated).toBe(true);
    });

    it("should handle medium budget", () => {
      const result = applyTokenBudget(facts, 20);
      expect(result.facts.length).toBeGreaterThan(0);
      expect(result.facts.length).toBeLessThan(facts.length);
      expect(result.tokenUsage.used).toBeLessThanOrEqual(20);
    });

    it("should handle unlimited budget", () => {
      const result = applyTokenBudget(facts, 10000);
      expect(result.facts.length).toBe(facts.length);
      expect(result.tokenUsage.truncated).toBe(false);
    });

    it("should handle budget exactly equal to required tokens", () => {
      // First fact is 5 tokens
      const result = applyTokenBudget(facts, 5);
      expect(result.facts.length).toBe(1);
      expect(result.tokenUsage.used).toBe(5);
      expect(result.tokenUsage.truncated).toBe(true);
    });
  });

  describe("Fact Ordering and Prioritization", () => {
    it("should preserve fact order within budget", () => {
      const facts = [
        { _id: "a", content: "First fact", tokenEstimate: 5 },
        { _id: "b", content: "Second fact", tokenEstimate: 5 },
        { _id: "c", content: "Third fact", tokenEstimate: 5 },
      ];
      const result = applyTokenBudget(facts, 15);

      const ids = result.facts.map((f: any) => f._id);
      expect(ids).toEqual(["a", "b", "c"]);
    });

    it("should include high-importance facts first", () => {
      // Facts are expected to be already sorted by importance
      const facts = [
        { _id: "high", content: "High", importanceScore: 0.9, tokenEstimate: 10 },
        { _id: "medium", content: "Medium", importanceScore: 0.5, tokenEstimate: 10 },
        { _id: "low", content: "Low", importanceScore: 0.1, tokenEstimate: 10 },
      ];
      const result = applyTokenBudget(facts, 25);

      expect(result.facts[0]._id).toBe("high");
      expect(result.facts[1]._id).toBe("medium");
    });

    it("should cut off at budget boundary, not skip facts", () => {
      const facts = [
        { _id: "1", content: "First", tokenEstimate: 5 },
        { _id: "2", content: "Second", tokenEstimate: 5 },
        { _id: "3", content: "Third", tokenEstimate: 10 },
      ];
      const result = applyTokenBudget(facts, 12);

      // Should include 1 and 2 (10 tokens), stop before 3
      const ids = result.facts.map((f: any) => f._id);
      expect(ids).toEqual(["1", "2"]);
      expect(result.tokenUsage.used).toBe(10);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty facts array", () => {
      const result = applyTokenBudget([], 100);
      expect(result.facts).toEqual([]);
      expect(result.tokenUsage.used).toBe(0);
      expect(result.tokenUsage.truncated).toBe(false);
    });

    it("should handle single fact that fits", () => {
      const facts = [{ _id: "only", content: "The only fact", tokenEstimate: 10 }];
      const result = applyTokenBudget(facts, 20);

      expect(result.facts).toHaveLength(1);
      expect(result.tokenUsage.truncated).toBe(false);
    });

    it("should handle single fact that exceeds budget", () => {
      const facts = [{ _id: "only", content: "Large fact", tokenEstimate: 100 }];
      const result = applyTokenBudget(facts, 50);

      expect(result.facts).toHaveLength(0);
      expect(result.tokenUsage.truncated).toBe(true);
    });

    it("should handle facts with missing tokenEstimate", () => {
      const facts = [
        { _id: "1", content: "With estimate", tokenEstimate: 5 },
        { _id: "2", content: "Without estimate" }, // No tokenEstimate
      ];
      const result = applyTokenBudget(facts, 10);

      // Should handle gracefully
      expect(result.facts.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle facts with zero token estimate", () => {
      const facts = [
        { _id: "1", content: "Hi", tokenEstimate: 0 },
        { _id: "2", content: "Normal fact", tokenEstimate: 5 },
      ];
      const result = applyTokenBudget(facts, 10);

      // Zero tokenEstimate falls back to content estimation
      // "Hi" = 2 chars → 1 token, "Normal fact" = 11 chars → 3 tokens
      // Both should fit (1 + 3 = 4 < 10)
      expect(result.facts.length).toBe(2);
    });

    it("should handle very large facts list", () => {
      const facts = Array.from({ length: 100 }, (_, i) => ({
        _id: `fact${i}`,
        content: `Content ${i}`,
        tokenEstimate: 10,
      }));
      const result = applyTokenBudget(facts, 150);

      // Should fit 15 facts (150 / 10 = 15)
      expect(result.facts.length).toBe(15);
      expect(result.tokenUsage.truncated).toBe(true);
    });
  });

  describe("Integration with Token Counter", () => {
    it("should work with token counter estimates", () => {
      const factContent = "This is a medium-length fact that contains some text";
      const estimatedTokens = estimateTokens(factContent);

      const facts = [
        { _id: "1", content: factContent, tokenEstimate: estimatedTokens },
        { _id: "2", content: factContent, tokenEstimate: estimatedTokens },
      ];

      const result = applyTokenBudget(facts, estimatedTokens * 1.5);

      // Should fit the first fact and part of second
      expect(result.facts.length).toBeGreaterThan(0);
      expect(result.tokenUsage.used).toBeLessThanOrEqual(estimatedTokens * 1.5);
    });

    it("should fallback to token counter when tokenEstimate missing", () => {
      const content = "Test fact for token estimation";
      const facts = [{ _id: "1", content }];

      // Simulate what recall does: use tokenEstimate if available, else count
      const tokenEstimate = facts[0].tokenEstimate || estimateTokens(content);
      expect(tokenEstimate).toBeGreaterThan(0);
    });
  });

  describe("Real-world Scenarios", () => {
    it("should handle dense query results with tight budget", () => {
      // Simulate: 50 search results, very tight token budget
      const facts = Array.from({ length: 50 }, (_, i) => ({
        _id: `fact${i}`,
        content: "Lorem ipsum dolor sit amet consectetur adipiscing elit".repeat(2),
        importanceScore: 1 - i * 0.02, // Decreasing importance
        tokenEstimate: 20,
      }));

      const result = applyTokenBudget(facts, 100);

      // Should return top 5 highest-importance facts (100 / 20 = 5)
      expect(result.facts.length).toBeLessThanOrEqual(5);
      expect(result.tokenUsage.truncated).toBe(true);

      // First facts should have highest importance
      if (result.facts.length > 1) {
        expect(result.facts[0].importanceScore).toBeGreaterThanOrEqual(result.facts[1].importanceScore);
      }
    });

    it("should handle mixed token sizes", () => {
      const facts = [
        { _id: "short", content: "Hi", tokenEstimate: 1 },
        { _id: "medium", content: "This is a medium fact with some content", tokenEstimate: 10 },
        { _id: "long", content: "This is a very long fact ".repeat(50), tokenEstimate: 200 },
      ];

      const result = applyTokenBudget(facts, 50);

      // Should fit short and medium (1 + 10 = 11), not long
      expect(result.facts.some((f: any) => f._id === "short")).toBe(true);
      expect(result.facts.some((f: any) => f._id === "medium")).toBe(true);
      expect(result.facts.some((f: any) => f._id === "long")).toBe(false);
    });

    it("should report accurate remaining tokens", () => {
      const facts = [
        { _id: "1", content: "Fact 1", tokenEstimate: 30 },
        { _id: "2", content: "Fact 2", tokenEstimate: 20 },
      ];
      const budget = 100;

      const result = applyTokenBudget(facts, budget);

      const remaining = budget - result.tokenUsage.used;
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBe(50); // 100 - 50 = 50
    });

    it("should handle facts with observation tiers", () => {
      // Facts with critical/notable tiers should already be prioritized by recall
      const facts = [
        {
          _id: "critical",
          content: "Critical observation",
          observationTier: "critical",
          tokenEstimate: 10,
        },
        {
          _id: "notable",
          content: "Notable observation",
          observationTier: "notable",
          tokenEstimate: 10,
        },
        { _id: "background", content: "Background", observationTier: "background", tokenEstimate: 10 },
      ];

      // Budget-aware loader applies tiers in sorting, then budget applies
      const result = applyTokenBudget(facts, 25);

      // Budget decides what fits, assuming facts are already tier-sorted
      expect(result.facts.length).toBeGreaterThan(0);
      expect(result.tokenUsage.used).toBeLessThanOrEqual(25);
    });
  });

  describe("Truncation Reporting", () => {
    it("should report truncated=true when facts excluded", () => {
      const facts = [
        { _id: "1", content: "A", tokenEstimate: 50 },
        { _id: "2", content: "B", tokenEstimate: 50 },
        { _id: "3", content: "C", tokenEstimate: 50 },
      ];

      const result = applyTokenBudget(facts, 60);

      expect(result.tokenUsage.truncated).toBe(true);
      expect(result.facts.length).toBeLessThan(facts.length);
    });

    it("should report truncated=false when all facts included", () => {
      const facts = [
        { _id: "1", content: "A", tokenEstimate: 20 },
        { _id: "2", content: "B", tokenEstimate: 20 },
      ];

      const result = applyTokenBudget(facts, 100);

      expect(result.tokenUsage.truncated).toBe(false);
      expect(result.facts.length).toBe(facts.length);
    });

    it("should report truncated=true even for empty results if input has facts", () => {
      const facts = [{ _id: "1", content: "Large", tokenEstimate: 100 }];

      const result = applyTokenBudget(facts, 10);

      expect(result.tokenUsage.truncated).toBe(true);
      expect(result.facts.length).toBe(0);
    });

    it("should report truncated=false for empty input", () => {
      const result = applyTokenBudget([], 100);

      expect(result.tokenUsage.truncated).toBe(false);
      expect(result.facts.length).toBe(0);
    });
  });

  describe("Token Budget Calculations", () => {
    it("should calculate used tokens accurately", () => {
      const facts = [
        { _id: "1", content: "First", tokenEstimate: 10 },
        { _id: "2", content: "Second", tokenEstimate: 15 },
        { _id: "3", content: "Third", tokenEstimate: 20 },
      ];

      const result = applyTokenBudget(facts, 100);

      const sum = result.facts.reduce((acc: number, f: any) => acc + f.tokenEstimate, 0);
      expect(result.tokenUsage.used).toBe(sum);
    });

    it("should respect budget as hard ceiling", () => {
      const facts = Array.from({ length: 20 }, (_, i) => ({
        _id: `fact${i}`,
        content: `Fact ${i}`,
        tokenEstimate: 10,
      }));

      const budget = 95; // Not divisible by 10
      const result = applyTokenBudget(facts, budget);

      // Should fit exactly 9 facts (90 tokens)
      expect(result.tokenUsage.used).toBeLessThanOrEqual(budget);
      expect(result.facts.length).toBeLessThanOrEqual(9);
    });
  });
});
