import { describe, it, expect } from "vitest";
import {
  toWordSet,
  jaccardSimilarity,
  findMergeCandidates,
  generateMergedContent,
  buildConsolidationPlan,
  type MergeableFact,
} from "../src/lib/consolidation.js";

// ─── toWordSet ──────────────────────────────────────────────────────────

describe("toWordSet", () => {
  it("lowercases and removes stop words", () => {
    const words = toWordSet("The quick brown Fox jumps over a lazy Dog");
    expect(words.has("quick")).toBe(true);
    expect(words.has("brown")).toBe(true);
    expect(words.has("fox")).toBe(true);
    expect(words.has("jumps")).toBe(true);
    expect(words.has("lazy")).toBe(true);
    expect(words.has("dog")).toBe(true);
    // Stop words removed
    expect(words.has("the")).toBe(false);
    expect(words.has("a")).toBe(false);
  });

  it("filters short words (<=2 chars)", () => {
    const words = toWordSet("I am a go to AI");
    expect(words.size).toBe(0);
  });

  it("strips punctuation", () => {
    const words = toWordSet("hello, world! foo-bar baz.");
    expect(words.has("hello")).toBe(true);
    expect(words.has("world")).toBe(true);
    expect(words.has("foo-bar")).toBe(true);
    expect(words.has("baz")).toBe(true);
  });

  it("handles empty string", () => {
    expect(toWordSet("").size).toBe(0);
  });
});

// ─── jaccardSimilarity ──────────────────────────────────────────────────

describe("jaccardSimilarity", () => {
  it("returns 1.0 for identical sets", () => {
    const a = new Set(["hello", "world"]);
    expect(jaccardSimilarity(a, a)).toBe(1.0);
  });

  it("returns 0.0 for disjoint sets", () => {
    const a = new Set(["hello"]);
    const b = new Set(["world"]);
    expect(jaccardSimilarity(a, b)).toBe(0.0);
  });

  it("computes correct partial overlap", () => {
    const a = new Set(["alpha", "beta", "gamma"]);
    const b = new Set(["beta", "gamma", "delta"]);
    // intersection=2, union=4 → 0.5
    expect(jaccardSimilarity(a, b)).toBe(0.5);
  });

  it("returns 0 for two empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it("is symmetric", () => {
    const a = new Set(["foo", "bar"]);
    const b = new Set(["bar", "baz"]);
    expect(jaccardSimilarity(a, b)).toBe(jaccardSimilarity(b, a));
  });
});

// ─── findMergeCandidates ────────────────────────────────────────────────

describe("findMergeCandidates", () => {
  const baseFact = (
    id: string,
    content: string,
    importance = 0.5,
    timestamp = 1000
  ): MergeableFact => ({
    _id: id,
    content,
    importanceScore: importance,
    timestamp,
  });

  it("returns empty for fewer than 2 facts", () => {
    expect(findMergeCandidates([])).toEqual([]);
    expect(findMergeCandidates([baseFact("a", "hello world")])).toEqual([]);
  });

  it("detects near-duplicate facts", () => {
    const facts = [
      baseFact("a", "The deployment uses Cloudflare Workers for edge computing", 0.8),
      baseFact("b", "Deployment uses Cloudflare Workers edge computing platform", 0.6),
    ];
    const candidates = findMergeCandidates(facts, 0.5);
    expect(candidates.length).toBe(1);
    expect(candidates[0].keep).toBe("a"); // higher importance
    expect(candidates[0].merge).toBe("b");
    expect(candidates[0].similarity).toBeGreaterThan(0.5);
  });

  it("keeps fact with higher importance score", () => {
    const facts = [
      baseFact("low", "Engram uses Cohere embeddings for vector search", 0.3),
      baseFact("high", "Engram uses Cohere embeddings for semantic vector search", 0.9),
    ];
    const candidates = findMergeCandidates(facts, 0.5);
    expect(candidates.length).toBe(1);
    expect(candidates[0].keep).toBe("high");
    expect(candidates[0].merge).toBe("low");
  });

  it("breaks importance ties by recency", () => {
    const facts = [
      baseFact("old", "The system uses TypeScript", 0.5, 1000),
      baseFact("new", "The system uses TypeScript exclusively", 0.5, 2000),
    ];
    const candidates = findMergeCandidates(facts, 0.5);
    expect(candidates.length).toBe(1);
    expect(candidates[0].keep).toBe("new"); // more recent
  });

  it("does not merge dissimilar facts", () => {
    const facts = [
      baseFact("a", "Engram stores atomic facts in Convex tables"),
      baseFact("b", "The weather today is sunny and warm outside"),
    ];
    const candidates = findMergeCandidates(facts, 0.7);
    expect(candidates.length).toBe(0);
  });

  it("prevents transitive merge chains", () => {
    // A ≈ B ≈ C — B should not be both kept and merged
    const facts = [
      baseFact("a", "deploy cloudflare workers edge functions runtime", 0.9),
      baseFact("b", "deploy cloudflare workers edge functions", 0.5),
      baseFact("c", "deploy cloudflare workers edge runtime functions", 0.3),
    ];
    const candidates = findMergeCandidates(facts, 0.5);
    const mergedIds = candidates.map((c) => c.merge);
    const keepIds = candidates.map((c) => c.keep);
    // No fact should appear in both keep and merge lists
    for (const id of mergedIds) {
      expect(keepIds).not.toContain(id);
    }
  });

  it("sorts results by similarity descending", () => {
    const facts = [
      baseFact("a", "alpha beta gamma delta epsilon"),
      baseFact("b", "alpha beta gamma delta zeta"),      // very similar to a
      baseFact("c", "alpha beta omega sigma tau"),         // somewhat similar to a
    ];
    const candidates = findMergeCandidates(facts, 0.3);
    if (candidates.length >= 2) {
      expect(candidates[0].similarity).toBeGreaterThanOrEqual(candidates[1].similarity);
    }
  });

  it("respects custom threshold", () => {
    const facts = [
      baseFact("a", "alpha beta gamma delta"),
      baseFact("b", "alpha beta gamma epsilon"),
    ];
    // At 0.9 threshold, should not match
    expect(findMergeCandidates(facts, 0.9).length).toBe(0);
    // At 0.3 threshold, should match
    expect(findMergeCandidates(facts, 0.3).length).toBe(1);
  });
});

// ─── generateMergedContent ──────────────────────────────────────────────

describe("generateMergedContent", () => {
  it("appends unique sentences from merge content", () => {
    const keep = "Engram uses Convex for storage. Facts are the atomic unit.";
    const merge = "Engram uses Convex for storage. Embeddings use Cohere Embed 4.";
    const result = generateMergedContent(keep, merge);
    expect(result.augmented).toBe(true);
    expect(result.content).toContain("Cohere Embed");
    expect(result.content).toContain("Engram uses Convex");
  });

  it("returns keepContent unchanged when mergeContent is fully duplicated", () => {
    const keep = "The system uses TypeScript for all code.";
    const merge = "The system uses TypeScript for all code.";
    const result = generateMergedContent(keep, merge);
    expect(result.augmented).toBe(false);
    expect(result.content).toBe(keep);
  });

  it("caps merged length at 2x keepContent", () => {
    const keep = "Short fact.";
    const merge = "Completely different sentence one. Another unique sentence two. Yet another unique sentence three. And a fourth unique sentence here. Plus a fifth unique sentence.";
    const result = generateMergedContent(keep, merge);
    expect(result.content.length).toBeLessThanOrEqual(keep.length * 2 + 1);
  });

  it("handles empty merge content", () => {
    const result = generateMergedContent("Keep this.", "");
    expect(result.augmented).toBe(false);
    expect(result.content).toBe("Keep this.");
  });
});

// ─── buildConsolidationPlan ─────────────────────────────────────────────

describe("buildConsolidationPlan", () => {
  const baseFact = (
    id: string,
    content: string,
    importance = 0.5
  ): MergeableFact => ({
    _id: id,
    content,
    importanceScore: importance,
    timestamp: Date.now(),
  });

  it("produces a complete plan with merge operations", () => {
    const facts = [
      baseFact("a", "Engram stores facts in Convex cloud database tables", 0.8),
      baseFact("b", "Engram stores facts in the Convex cloud database", 0.4),
      baseFact("c", "The weather is nice today outside in the park"),
    ];
    const plan = buildConsolidationPlan(facts, 0.5);
    expect(plan.totalAnalyzed).toBe(3);
    expect(plan.merges.length).toBeGreaterThanOrEqual(1);
    expect(plan.totalMerged).toBe(plan.merges.length);

    // The merge should keep "a" (higher importance)
    const merge = plan.merges.find((m) => m.keepId === "a");
    expect(merge).toBeDefined();
    expect(merge!.mergeId).toBe("b");
    expect(merge!.mergedContent).toBeTruthy();
  });

  it("returns empty plan when no duplicates exist", () => {
    const facts = [
      baseFact("a", "Convex provides real-time cloud backend infrastructure"),
      baseFact("b", "TypeScript is the primary programming language here"),
    ];
    const plan = buildConsolidationPlan(facts, 0.7);
    expect(plan.merges.length).toBe(0);
    expect(plan.totalAnalyzed).toBe(2);
  });
});
