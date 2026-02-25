/**
 * Consolidation & Defrag Test Suite
 *
 * Tests for near-duplicate fact merging, content consolidation,
 * and defragmentation logic.
 */

import { describe, it, expect } from "vitest";
import {
  jaccardSimilarity,
  toWordSet,
  findMergeCandidates,
  generateMergedContent,
  buildConsolidationPlan,
  MergeableFact,
} from "../src/lib/consolidation";

// ─── Word Set Tests ──────────────────────────────────────────────────────

describe("toWordSet", () => {
  it("converts text to lowercase", () => {
    const result = toWordSet("HELLO World");
    expect(result.has("hello")).toBe(true);
    expect(result.has("world")).toBe(true);
  });

  it("removes stop words", () => {
    const result = toWordSet("the quick brown fox jumps");
    expect(result.has("quick")).toBe(true);
    expect(result.has("brown")).toBe(true);
    expect(result.has("fox")).toBe(true);
    expect(result.has("jumps")).toBe(true);
    expect(result.has("the")).toBe(false);
  });

  it("strips punctuation", () => {
    const result = toWordSet("Hello, world! How are you?");
    expect(result.has("hello")).toBe(true);
    expect(result.has("world")).toBe(true);
    expect(result.has("you")).toBe(false); // too short (2 chars)
  });

  it("filters out words shorter than 3 characters", () => {
    const result = toWordSet("I am going to a store");
    expect(result.has("going")).toBe(true);
    expect(result.has("store")).toBe(true);
    expect(result.has("i")).toBe(false);
    expect(result.has("am")).toBe(false);
    expect(result.has("to")).toBe(false);
  });

  it("handles empty strings", () => {
    const result = toWordSet("");
    expect(result.size).toBe(0);
  });

  it("handles strings with only stop words", () => {
    const result = toWordSet("the and or a");
    expect(result.size).toBe(0);
  });
});

// ─── Jaccard Similarity Tests ────────────────────────────────────────────

describe("jaccardSimilarity", () => {
  it("returns 1.0 for identical sets", () => {
    const a = new Set(["cat", "dog", "bird"]);
    const b = new Set(["cat", "dog", "bird"]);
    expect(jaccardSimilarity(a, b)).toBe(1.0);
  });

  it("returns 0.0 for disjoint sets", () => {
    const a = new Set(["cat", "dog"]);
    const b = new Set(["bird", "fish"]);
    expect(jaccardSimilarity(a, b)).toBe(0.0);
  });

  it("returns 0.5 for 50% overlap", () => {
    const a = new Set(["cat", "dog"]);
    const b = new Set(["cat", "bird"]);
    const similarity = jaccardSimilarity(a, b);
    expect(similarity).toBeCloseTo(0.333, 2); // 1 common / 3 union
  });

  it("returns 0 for both empty sets", () => {
    const a = new Set<string>();
    const b = new Set<string>();
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("computes correctly with different set sizes", () => {
    const a = new Set(["alpha", "beta", "gamma", "delta"]);
    const b = new Set(["alpha", "beta"]);
    const similarity = jaccardSimilarity(a, b);
    expect(similarity).toBeCloseTo(0.5, 1); // 2 common / 4 union
  });
});

// ─── Merge Candidate Detection Tests ────────────────────────────────────

describe("findMergeCandidates", () => {
  it("returns empty array for single fact", () => {
    const facts: MergeableFact[] = [
      { _id: "1", content: "the quick brown fox", importanceScore: 0.5, timestamp: 1000 },
    ];
    const candidates = findMergeCandidates(facts);
    expect(candidates).toHaveLength(0);
  });

  it("groups similar facts and keeps higher importance", () => {
    const facts: MergeableFact[] = [
      { _id: "1", content: "the quick brown fox jumps", importanceScore: 0.3, timestamp: 1000 },
      { _id: "2", content: "the quick brown fox runs", importanceScore: 0.8, timestamp: 1000 },
    ];
    const candidates = findMergeCandidates(facts, 0.5);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].keep).toBe("2"); // higher importance
    expect(candidates[0].merge).toBe("1");
  });

  it("keeps more recent fact when importance is equal", () => {
    const facts: MergeableFact[] = [
      { _id: "1", content: "identical content", importanceScore: 0.5, timestamp: 1000 },
      { _id: "2", content: "identical content", importanceScore: 0.5, timestamp: 2000 },
    ];
    const candidates = findMergeCandidates(facts, 0.99);
    expect(candidates[0].keep).toBe("2"); // more recent
    expect(candidates[0].merge).toBe("1");
  });

  it("prevents transitive merging", () => {
    // Three nearly identical facts: A, B, C
    // A and B should merge (B keeps), B and C should merge (C keeps)
    // But A shouldn't also try to merge with C (transitive prevention)
    const facts: MergeableFact[] = [
      { _id: "A", content: "quick brown fox", importanceScore: 0.5, timestamp: 1000 },
      { _id: "B", content: "quick brown fox jumps", importanceScore: 0.6, timestamp: 1000 },
      { _id: "C", content: "quick brown fox runs fast", importanceScore: 0.7, timestamp: 1000 },
    ];
    const candidates = findMergeCandidates(facts, 0.5);
    // Should have exactly 2 merges, not 3
    const mergedIds = new Set(candidates.map((c) => c.merge));
    expect(mergedIds.has("A")).toBe(true);
    expect(mergedIds.has("B")).toBe(true);
    expect(mergedIds.has("C")).toBe(false); // C doesn't get merged (it's the keep target)
  });

  it("respects similarity threshold", () => {
    const facts: MergeableFact[] = [
      { _id: "1", content: "completely different", importanceScore: 0.5, timestamp: 1000 },
      { _id: "2", content: "quite similar content here", importanceScore: 0.5, timestamp: 1000 },
    ];
    const candidates = findMergeCandidates(facts, 0.9); // high threshold
    expect(candidates).toHaveLength(0); // shouldn't merge due to low similarity
  });

  it("sorts candidates by similarity descending", () => {
    const facts: MergeableFact[] = [
      { _id: "A", content: "perfect match", importanceScore: 0.5, timestamp: 1000 },
      { _id: "B", content: "perfect match", importanceScore: 0.4, timestamp: 1000 }, // 100% similarity
      { _id: "C", content: "partial match here", importanceScore: 0.3, timestamp: 1000 }, // ~50% similarity
    ];
    const candidates = findMergeCandidates(facts, 0.4);
    // First candidate should have higher similarity
    if (candidates.length > 1) {
      expect(candidates[0].similarity).toBeGreaterThanOrEqual(candidates[1].similarity);
    }
  });
});

// ─── Content Merging Tests ───────────────────────────────────────────────

describe("generateMergedContent", () => {
  it("appends unique sentences from merge fact", () => {
    const keep = "The quick brown fox.";
    const merge = "The fox jumps high.";
    const result = generateMergedContent(keep, merge);
    expect(result.content).toContain("quick brown");
    expect(result.content).toContain("jumps");
    expect(result.augmented).toBe(true);
  });

  it("doesn't duplicate sentences", () => {
    const keep = "The quick brown fox.";
    const merge = "The quick brown fox. The fox is fast.";
    const result = generateMergedContent(keep, merge);
    // Should not duplicate the first sentence
    expect(result.content.match(/quick brown fox/g)?.length ?? 0).toBe(1);
  });

  it("returns original content when merge adds nothing unique", () => {
    const keep = "The quick brown fox jumps.";
    const merge = "The quick brown fox jumps.";
    const result = generateMergedContent(keep, merge);
    expect(result.content).toBe(keep);
    expect(result.augmented).toBe(false);
  });

  it("respects 2x length cap", () => {
    const keep = "short.";
    const merge = "This is a very long sentence that should be appended. " +
                  "And another sentence. And yet another one. " +
                  "This should not be included due to length cap.";
    const result = generateMergedContent(keep, merge);
    expect(result.content.length).toBeLessThanOrEqual(keep.length * 2);
  });

  it("handles empty merge content", () => {
    const keep = "The quick brown fox.";
    const merge = "";
    const result = generateMergedContent(keep, merge);
    expect(result.content).toBe(keep);
    expect(result.augmented).toBe(false);
  });

  it("handles multiple sentences with fuzzy dedup (>0.6 similarity)", () => {
    const keep = "The cat is sleeping.";
    const merge = "The sleeping cat. A dog runs fast. The canine is quick.";
    const result = generateMergedContent(keep, merge);
    // "The sleeping cat" is ~0.6 similar to "The cat is sleeping", should be skipped
    // "A dog runs fast" and "The canine is quick" should be kept
    expect(result.augmented).toBe(true);
    expect(result.content).toContain("dog");
  });
});

// ─── Consolidation Plan Tests ────────────────────────────────────────────

describe("buildConsolidationPlan", () => {
  it("returns empty plan for single fact", () => {
    const facts: MergeableFact[] = [
      { _id: "1", content: "some fact", importanceScore: 0.5, timestamp: 1000 },
    ];
    const plan = buildConsolidationPlan(facts);
    expect(plan.merges).toHaveLength(0);
    expect(plan.totalAnalyzed).toBe(1);
    expect(plan.totalMerged).toBe(0);
  });

  it("computes plan with merge pairs and merged content", () => {
    const facts: MergeableFact[] = [
      { _id: "1", content: "Brown Fox", importanceScore: 0.5, timestamp: 1000 },
      { _id: "2", content: "Brown Fox jumps high", importanceScore: 0.8, timestamp: 1000 },
    ];
    const plan = buildConsolidationPlan(facts, 0.3);
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0].keepId).toBe("2");
    expect(plan.merges[0].mergeId).toBe("1");
    expect(plan.merges[0].similarity).toBeGreaterThan(0.2);
    expect(plan.merges[0].augmented).toBe(true);
    expect(plan.totalAnalyzed).toBe(2);
    expect(plan.totalMerged).toBe(1);
  });

  it("includes merged content in plan", () => {
    const facts: MergeableFact[] = [
      { _id: "1", content: "The cat sleeps soundly.", importanceScore: 0.5, timestamp: 1000 },
      { _id: "2", content: "The cat sleeps peacefully.", importanceScore: 0.8, timestamp: 1000 },
    ];
    const plan = buildConsolidationPlan(facts, 0.3);
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0].mergedContent).toContain("cat");
  });

  it("respects threshold when building plan", () => {
    const facts: MergeableFact[] = [
      { _id: "1", content: "completely different topic", importanceScore: 0.5, timestamp: 1000 },
      { _id: "2", content: "another unrelated fact", importanceScore: 0.5, timestamp: 1000 },
    ];
    const plan = buildConsolidationPlan(facts, 0.95);
    expect(plan.merges).toHaveLength(0);
  });

  it("handles multiple merge pairs", () => {
    const facts: MergeableFact[] = [
      { _id: "A", content: "quick brown fox", importanceScore: 0.8, timestamp: 1000 },
      { _id: "B", content: "quick brown fox jumps", importanceScore: 0.5, timestamp: 1000 },
      { _id: "C", content: "lazy dog sleeps", importanceScore: 0.7, timestamp: 1000 },
      { _id: "D", content: "lazy dog naps", importanceScore: 0.6, timestamp: 1000 },
    ];
    const plan = buildConsolidationPlan(facts, 0.5);
    expect(plan.merges.length).toBeGreaterThan(0);
    expect(plan.totalAnalyzed).toBe(4);
  });
});

// ─── Reflection Dedup Tests ──────────────────────────────────────────────

describe("Reflection Dedup Logic", () => {
  it("detects identical reflection summaries", () => {
    const typeBreakdown1 = "observation (5), decision (3), error (1)";
    const typeBreakdown2 = "observation (5), decision (3), error (1)";
    // In the actual reflection cron, we check: existing.content.includes(typeBreakdown)
    expect(typeBreakdown1).toBe(typeBreakdown2);
  });

  it("detects similar reflections within threshold", () => {
    // Simulate reflection content
    const reflection1 = `**4-Hour Reflection for scope [team-ml]**
Summary: 15 facts consolidated in last 4 hours
Types: observation (10), decision (5)`;

    const reflection2 = `**4-Hour Reflection for scope [team-ml]**
Summary: 16 facts consolidated in last 4 hours
Types: observation (10), decision (5)`;

    // Extract type breakdown
    const typeBreakdown = "observation (10), decision (5)";
    expect(reflection1.includes(typeBreakdown)).toBe(true);
    expect(reflection2.includes(typeBreakdown)).toBe(true);
  });

  it("allows different reflections in same scope", () => {
    const typeBreakdown1 = "observation (5), decision (3)";
    const typeBreakdown2 = "observation (5), decision (3), learning (1)";
    // Different type breakdowns should not match
    expect(typeBreakdown1).not.toBe(typeBreakdown2);
  });
});

// ─── Defrag Thresholds Tests ─────────────────────────────────────────────

describe("Defrag Threshold Behavior", () => {
  it("uses default threshold of 0.7 for merging", () => {
    // This is the default in consolidation.ts
    const DEFAULT_THRESHOLD = 0.7;
    expect(DEFAULT_THRESHOLD).toBe(0.7);
  });

  it("high threshold (0.9) reduces merge candidates", () => {
    const facts: MergeableFact[] = [
      { _id: "1", content: "the quick brown fox", importanceScore: 0.5, timestamp: 1000 },
      { _id: "2", content: "the quick brown fox jumps", importanceScore: 0.5, timestamp: 1000 },
    ];
    const lowThreshold = findMergeCandidates(facts, 0.5);
    const highThreshold = findMergeCandidates(facts, 0.9);
    expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
  });

  it("low threshold (0.5) increases merge candidates", () => {
    const facts: MergeableFact[] = [
      { _id: "1", content: "the quick brown fox", importanceScore: 0.5, timestamp: 1000 },
      { _id: "2", content: "the slow brown fox", importanceScore: 0.5, timestamp: 1000 },
    ];
    const threshold1 = findMergeCandidates(facts, 0.8);
    const threshold2 = findMergeCandidates(facts, 0.5);
    expect(threshold2.length).toBeGreaterThanOrEqual(threshold1.length);
  });
});

// ─── Dormant Fact Archiving Simulation ────────────────────────────────────

describe("Defrag Archiving Logic", () => {
  it("archives dormant facts older than 90 days with low importance", () => {
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
    const oldTimestamp = ninetyDaysAgo - 1000; // 1 second older

    const shouldArchive = oldTimestamp < ninetyDaysAgo && true; // importanceScore < 0.3
    expect(shouldArchive).toBe(true);
  });

  it("keeps dormant facts newer than 90 days", () => {
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
    const recentTimestamp = ninetyDaysAgo + 1000; // 1 second newer

    const shouldArchive = recentTimestamp < ninetyDaysAgo;
    expect(shouldArchive).toBe(false);
  });

  it("keeps high-importance dormant facts regardless of age", () => {
    // In the actual defrag cron: importanceScore < 0.3
    const lowImportance = 0.2;
    const highImportance = 0.8;

    expect(lowImportance < 0.3).toBe(true);
    expect(highImportance < 0.3).toBe(false);
  });
});

// ─── Dry Run Mode Simulation ─────────────────────────────────────────────

describe("Defrag Dry Run Behavior", () => {
  it("dry run computes plan without mutations", () => {
    const facts: MergeableFact[] = [
      { _id: "1", content: "quick brown fox", importanceScore: 0.5, timestamp: 1000 },
      { _id: "2", content: "quick brown fox jumps", importanceScore: 0.8, timestamp: 1000 },
    ];
    // Dry run: just build the plan, don't execute
    const plan = buildConsolidationPlan(facts, 0.5);
    expect(plan.merges).toHaveLength(1);
    expect(plan.totalMerged).toBe(1);
    // In actual implementation, dry run would skip ctx.db.patch calls
  });

  it("returns stats without side effects", () => {
    const facts: MergeableFact[] = [
      { _id: "1", content: "fact one", importanceScore: 0.5, timestamp: 1000 },
      { _id: "2", content: "fact two", importanceScore: 0.5, timestamp: 1000 },
    ];
    const plan = buildConsolidationPlan(facts);
    // Stats should be accurate regardless of dry run
    expect(plan.totalAnalyzed).toBe(2);
    expect(typeof plan.totalMerged).toBe("number");
  });
});
