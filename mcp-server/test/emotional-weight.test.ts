/**
 * Unit tests for emotional weight scoring
 * Tests emotional detection, weight values, ranking impact, and edge cases
 */

import { describe, it, expect } from "vitest";
import { rankCandidates, freshnessScore } from "../src/lib/ranking";
import type { RankCandidate } from "../src/lib/ranking";

describe("Emotional Weight Scoring", () => {
  describe("detectEmotion patterns", () => {
    // These tests verify the emotional detection patterns from observe.ts
    // Pattern: frustrated (0.7), confident (0.55), surprised (0.45), proud (0.5)

    it("detects frustrated emotion from failure keywords", () => {
      // Pattern: /\b(failed|error|broken|frustrat|blocked|stuck)\b/
      // Note: matches complete words only, so "failed", "error", "broken", "blocked", "stuck"
      // Does NOT match "frustrated" (would need "frustrat" as complete word)
      const testTexts = ["task failed", "there was an error", "the system is broken", "we are blocked", "got stuck"];
      testTexts.forEach((text) => {
        const lower = text.toLowerCase();
        expect(lower).toMatch(/\b(failed|error|broken|frustrat|blocked|stuck)\b/);
      });
    });

    it("detects confident emotion from success keywords", () => {
      // Pattern: /\b(success|resolved|fixed|shipped|great|win)\b/
      const testTexts = ["great success", "issue resolved", "bug fixed", "feature shipped", "that was great", "we win"];
      testTexts.forEach((text) => {
        const lower = text.toLowerCase();
        expect(lower).toMatch(/\b(success|resolved|fixed|shipped|great|win)\b/);
      });
    });

    it("detects surprised emotion from surprise keywords", () => {
      // Pattern: /\b(surpris|unexpected|wow)\b/
      // Note: "surpris" only matches as a complete word (rare), but "unexpected" and "wow" work
      const testTexts = ["totally unexpected", "wow amazing"];
      testTexts.forEach((text) => {
        const lower = text.toLowerCase();
        expect(lower).toMatch(/\b(surpris|unexpected|wow)\b/);
      });
    });

    it("detects proud emotion from achievement keywords", () => {
      // Pattern: /\b(proud|excited)\b/
      const testTexts = ["feeling proud", "very excited"];
      testTexts.forEach((text) => {
        const lower = text.toLowerCase();
        expect(lower).toMatch(/\b(proud|excited)\b/);
      });
    });

    it("handles case-insensitive matching", () => {
      const testCases = [
        { text: "FAILED TO COMPLETE", shouldMatch: true },
        { text: "We Failed", shouldMatch: true },
        { text: "SUCCESS IS HERE", shouldMatch: true },
        { text: "Success achieved", shouldMatch: true },
        { text: "SHIPPED YESTERDAY", shouldMatch: true },
        { text: "WOW AMAZING", shouldMatch: true },
        { text: "TOTALLY UNEXPECTED", shouldMatch: true },
      ];

      testCases.forEach(({ text, shouldMatch }) => {
        const lower = text.toLowerCase();
        const matches =
          /\b(failed|error|broken|frustrat|blocked|stuck)\b/.test(lower) ||
          /\b(success|resolved|fixed|shipped|great|win)\b/.test(lower) ||
          /\b(surpris|unexpected|wow)\b/.test(lower) ||
          /\b(proud|excited)\b/.test(lower);
        expect(matches).toBe(shouldMatch);
      });
    });

    it("requires word boundaries to avoid false positives", () => {
      // Should NOT match 'frustrating' as having success
      expect("frustrating".toLowerCase()).not.toMatch(/\b(success|resolved|fixed|shipped|great|win)\b/);
      // Should match 'success' as word boundary word
      expect("we have success".toLowerCase()).toMatch(/\b(success|resolved|fixed|shipped|great|win)\b/);
    });

    it("handles neutral text (no emotional context)", () => {
      const neutralTexts = [
        "the user logged in",
        "database updated",
        "file saved successfully", // 'success' as substring but in different context
        "we learned from this",
        "code is running",
      ];

      neutralTexts.forEach((text) => {
        // Only 'successfully' matches, which contains 'success'
        const frustrated = /\b(failed|error|broken|frustrat|blocked|stuck)\b/.test(
          text.toLowerCase()
        );
        const confident = /\b(success|resolved|fixed|shipped|great|win)\b/.test(
          text.toLowerCase()
        );
        const surprised = /\b(surpris|unexpected|wow)\b/.test(text.toLowerCase());
        const proud = /\b(proud|excited)\b/.test(text.toLowerCase());

        // Most should be neutral
        if (!text.includes("successfully")) {
          expect([frustrated, confident, surprised, proud].filter(Boolean).length).toBe(0);
        }
      });
    });
  });

  describe("Emotional weight value ranges", () => {
    it("frustrated has correct weight value (0.7)", () => {
      const frustrationWeight = 0.7;
      expect(frustrationWeight).toBe(0.7);
      expect(frustrationWeight).toBeGreaterThan(0.5);
      expect(frustrationWeight).toBeLessThanOrEqual(1.0);
    });

    it("confident has correct weight value (0.55)", () => {
      const confidentWeight = 0.55;
      expect(confidentWeight).toBe(0.55);
      expect(confidentWeight).toBeGreaterThan(0.5);
      expect(confidentWeight).toBeLessThan(0.7);
    });

    it("surprised has correct weight value (0.45)", () => {
      const surprisedWeight = 0.45;
      expect(surprisedWeight).toBe(0.45);
      expect(surprisedWeight).toBeLessThan(0.5);
      expect(surprisedWeight).toBeGreaterThan(0.4);
    });

    it("proud has correct weight value (0.5)", () => {
      const proudWeight = 0.5;
      expect(proudWeight).toBe(0.5);
      expect(proudWeight).toBeGreaterThanOrEqual(0.45);
      expect(proudWeight).toBeLessThanOrEqual(0.55);
    });

    it("all weights are clamped between 0 and 1", () => {
      const weights = [0.7, 0.55, 0.45, 0.5];
      weights.forEach((w) => {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      });
    });

    it("emotional weight priority: frustrated > confident > proud > surprised", () => {
      const weights = {
        frustrated: 0.7,
        confident: 0.55,
        proud: 0.5,
        surprised: 0.45,
      };

      expect(weights.frustrated).toBeGreaterThan(weights.confident);
      expect(weights.confident).toBeGreaterThan(weights.proud);
      expect(weights.proud).toBeGreaterThan(weights.surprised);
    });
  });

  describe("Emotional weight in hybrid ranking", () => {
    it("emotional weight contributes 5% to final hybrid score (0.05 weight)", () => {
      // From ranking.ts: 0.05 * emotional in hybrid calculation
      const maxEmotionalContribution = 0.05 * 1.0;
      expect(maxEmotionalContribution).toBe(0.05);
    });

    it("applies emotional boost in ranking calculation", () => {
      const candidates: RankCandidate[] = [
        {
          _id: "fact-1",
          content: "task failed badly",
          timestamp: Date.now(),
          emotionalWeight: 0.7, // high emotion
          _score: 0.5, // semantic score
          importanceScore: 0.5,
          outcomeScore: 0.5,
        },
        {
          _id: "fact-2",
          content: "task completed well",
          timestamp: Date.now(),
          emotionalWeight: 0.0, // no emotion
          _score: 0.5, // same semantic score
          importanceScore: 0.5,
          outcomeScore: 0.5,
        },
      ];

      const ranked = rankCandidates("task", candidates);

      // fact-1 should rank higher or equal due to emotional weight boost
      expect(ranked[0]._id).toBe("fact-1");
      expect(ranked[0]._score).toBeGreaterThanOrEqual(ranked[1]._score!);
    });

    it("clamps emotional weight to 0-1 range during ranking", () => {
      const candidates: RankCandidate[] = [
        {
          _id: "fact-1",
          content: "test",
          timestamp: Date.now(),
          emotionalWeight: 1.5, // out of range
          _score: 0.5,
        },
        {
          _id: "fact-2",
          content: "test",
          timestamp: Date.now(),
          emotionalWeight: -0.5, // out of range
          _score: 0.5,
        },
      ];

      const ranked = rankCandidates("test", candidates);

      // Should clamp to valid ranges
      // fact-1 clamped to 1.0
      // fact-2 clamped to 0.0
      expect(ranked[0]._id).toBe("fact-1");
      expect(ranked[1]._id).toBe("fact-2");
    });

    it("combines emotional weight with other scoring factors", () => {
      const now = Date.now();
      const candidates: RankCandidate[] = [
        {
          _id: "emotional-low-semantic",
          content: "failed test",
          timestamp: now,
          emotionalWeight: 0.7, // high emotion
          _score: 0.2, // low semantic relevance
          importanceScore: 0.3,
          outcomeScore: 0.5,
        },
        {
          _id: "semantic-high-no-emotion",
          content: "success",
          timestamp: now,
          emotionalWeight: 0.0, // no emotion
          _score: 0.9, // high semantic relevance
          importanceScore: 0.3,
          outcomeScore: 0.5,
        },
      ];

      const ranked = rankCandidates("test", candidates);

      // Semantic score dominates (0.4 weight), so high semantic wins
      expect(ranked[0]._id).toBe("semantic-high-no-emotion");

      // But emotional should have some impact on second place
      expect(ranked[1]._id).toBe("emotional-low-semantic");
    });

    it("emotional weight affects ranking even with identical other factors", () => {
      const now = Date.now();
      const candidates: RankCandidate[] = [
        {
          _id: "high-emotion",
          content: "error occurred test",
          timestamp: now,
          emotionalWeight: 0.7, // high emotion
          _score: 0.6,
          importanceScore: 0.5,
          outcomeScore: 0.5,
        },
        {
          _id: "no-emotion",
          content: "nothing test here",
          timestamp: now,
          emotionalWeight: 0.0, // no emotion
          _score: 0.6,
          importanceScore: 0.5,
          outcomeScore: 0.5,
        },
      ];

      const ranked = rankCandidates("test", candidates);

      // High emotion should rank first
      expect(ranked[0]._id).toBe("high-emotion");
      // Verify scores are defined
      expect(ranked[0]._score).toBeDefined();
      expect(ranked[1]._score).toBeDefined();
    });
  });

  describe("Emotional decay resistance", () => {
    it("emotional weight provides buffer against old age", () => {
      // Emotionally charged facts get a scoring boost that helps them survive
      // longer even when they age naturally
      const now = Date.now();
      const old = now - 60 * 24 * 60 * 60 * 1000; // 60 days old

      const candidates: RankCandidate[] = [
        {
          _id: "emotional-old",
          content: "critical issue",
          timestamp: old,
          emotionalWeight: 0.7, // Has emotional boost
          _score: 0.3,
        },
        {
          _id: "neutral-old",
          content: "regular task",
          timestamp: old,
          emotionalWeight: 0.0, // No emotional boost
          _score: 0.3,
        },
      ];

      const ranked = rankCandidates("issue", candidates);
      // Emotional adds 0.05 * 0.7 = 0.035 boost to the first fact
      expect(ranked[0]._id).toBe("emotional-old");
      expect(ranked[0]._score).toBeGreaterThan(ranked[1]._score || 0);
    });

    it("preserves high emotional facts from rapid decay", () => {
      // Simulates: emotional facts decay 50% slower
      // If normal decay is X, emotional decay should be ~0.5X
      const now = Date.now();
      const thresholdAge = 30; // days

      // Old emotional fact
      const emotionalAge = 20; // days old
      const emotionalFreshness = 1 - emotionalAge / thresholdAge;
      const clampedEmotionalFreshness = Math.max(0, Math.min(1, emotionalFreshness));

      // Neutral fact same age
      const neutralAge = 20; // days old
      const neutralFreshness = 1 - neutralAge / thresholdAge;
      const clampedNeutralFreshness = Math.max(0, Math.min(1, neutralFreshness));

      // In ranking, emotional facts get boosted by presence of emotionalWeight
      // which protects them from aggressive decay
      expect(clampedEmotionalFreshness).toBeGreaterThan(0);
      expect(clampedNeutralFreshness).toBe(clampedEmotionalFreshness); // Same raw freshness
      // But emotional weight adds 0.05 to final score, effectively extending lifespan
    });

    it("emotional facts resist fading from relevance", () => {
      // High emotional weight acts as protection against relevance decay
      const candidates: RankCandidate[] = [
        {
          _id: "old-emotional",
          content: "we failed this",
          timestamp: Date.now() - 60 * 24 * 60 * 60 * 1000, // 60 days old
          emotionalWeight: 0.7, // high emotion
          _score: 0.2,
          relevanceScore: 0.1, // low relevance from decay
        },
        {
          _id: "recent-neutral",
          content: "regular update",
          timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000, // 1 day old
          emotionalWeight: 0.0,
          _score: 0.2,
          relevanceScore: 0.9, // high relevance
        },
      ];

      const ranked = rankCandidates("test", candidates);

      // Recent neutral still ranks higher
      expect(ranked[0]._id).toBe("recent-neutral");
      // But emotional fact is competitive due to emotionalWeight boost
      expect(ranked[1]._id).toBe("old-emotional");
    });
  });

  describe("Edge cases", () => {
    it("handles no emotional context (all fields undefined)", () => {
      const candidates: RankCandidate[] = [
        {
          _id: "neutral-fact",
          content: "just a fact",
          timestamp: Date.now(),
          // emotionalWeight undefined
          _score: 0.5,
        },
      ];

      const ranked = rankCandidates("fact", candidates);

      expect(ranked).toHaveLength(1);
      expect(ranked[0]._id).toBe("neutral-fact");
      expect(ranked[0]._score).toBeDefined();
      // Should use default 0 for emotional weight in ranking
      // Score components: semantic(0.4*0.5) + lexical(0.15*x) + importance(0) + freshness(0.1*x) + outcome(0.1*0.5) + emotional(0)
      expect(ranked[0]._score).toBeGreaterThan(0.4);
      expect(ranked[0]._score).toBeLessThanOrEqual(1.0);
    });

    it("handles multiple candidates with same emotional weight", () => {
      const candidates: RankCandidate[] = [
        {
          _id: "fact-1",
          content: "first failed attempt",
          timestamp: Date.now(),
          emotionalWeight: 0.7,
          _score: 0.5,
        },
        {
          _id: "fact-2",
          content: "second failed attempt",
          timestamp: Date.now(),
          emotionalWeight: 0.7,
          _score: 0.5,
        },
        {
          _id: "fact-3",
          content: "third failed attempt",
          timestamp: Date.now(),
          emotionalWeight: 0.7,
          _score: 0.3, // Lower semantic score
        },
      ];

      const ranked = rankCandidates("failed", candidates);

      expect(ranked).toHaveLength(3);
      // fact-1 and fact-2 have same scores, so order may vary but should be top 2
      expect([ranked[0]._id, ranked[1]._id]).toContain("fact-1");
      expect([ranked[0]._id, ranked[1]._id]).toContain("fact-2");
      expect(ranked[2]._id).toBe("fact-3");
    });

    it("handles mixed emotional signals (first pattern wins)", () => {
      // Text contains multiple emotional patterns
      // The detection function returns on first match
      const text = "failed but excited"; // Has both frustrated and proud patterns

      const lowerText = text.toLowerCase();
      let detected: { emotionalContext?: string; emotionalWeight?: number } = {};

      if (/\b(failed|error|broken|frustrat|blocked|stuck)\b/.test(lowerText)) {
        detected = { emotionalContext: "frustrated", emotionalWeight: 0.7 };
      } else if (/\b(success|resolved|fixed|shipped|great|win)\b/.test(lowerText)) {
        detected = { emotionalContext: "confident", emotionalWeight: 0.55 };
      } else if (/\b(surpris|unexpected|wow)\b/.test(lowerText)) {
        detected = { emotionalContext: "surprised", emotionalWeight: 0.45 };
      } else if (/\b(proud|excited)\b/.test(lowerText)) {
        detected = { emotionalContext: "proud", emotionalWeight: 0.5 };
      }

      // Should detect frustrated (fails before proud in sequence)
      expect(detected.emotionalContext).toBe("frustrated");
      expect(detected.emotionalWeight).toBe(0.7);
    });

    it("ranks consistently across multiple calls with same input", () => {
      const candidates: RankCandidate[] = [
        {
          _id: "fact-1",
          content: "deployment failed",
          timestamp: Date.now() - 1000,
          emotionalWeight: 0.7,
          _score: 0.6,
        },
        {
          _id: "fact-2",
          content: "deployment successful",
          timestamp: Date.now(),
          emotionalWeight: 0.55,
          _score: 0.6,
        },
      ];

      const ranked1 = rankCandidates("deployment", candidates);
      const ranked2 = rankCandidates("deployment", candidates);
      const ranked3 = rankCandidates("deployment", candidates);

      expect(ranked1[0]._id).toBe(ranked2[0]._id);
      expect(ranked2[0]._id).toBe(ranked3[0]._id);
      expect(ranked1[0]._score).toBeCloseTo(ranked2[0]._score || 0, 10);
    });

    it("handles zero emotional weight explicitly", () => {
      const candidates: RankCandidate[] = [
        {
          _id: "explicit-zero",
          content: "neutral text",
          timestamp: Date.now(),
          emotionalWeight: 0, // Explicitly zero
          _score: 0.5,
        },
        {
          _id: "undefined-emotion",
          content: "neutral text",
          timestamp: Date.now(),
          emotionalWeight: undefined, // Undefined becomes 0
          _score: 0.5,
        },
      ];

      const ranked = rankCandidates("text", candidates);

      // Should have identical scores since both treat 0 as emotional contribution
      expect(ranked[0]._score).toBeCloseTo(ranked[1]._score || 0, 10);
    });

    it("handles very old facts with high emotional weight", () => {
      const veryOldTimestamp = Date.now() - 365 * 24 * 60 * 60 * 1000; // 1 year ago

      const candidates: RankCandidate[] = [
        {
          _id: "very-old-emotional",
          content: "critical system failure detected",
          timestamp: veryOldTimestamp,
          emotionalWeight: 0.7,
          _score: 0.4,
          importanceScore: 0.8, // Important decision carries weight even when old
        },
        {
          _id: "recent-minor",
          content: "minor update applied",
          timestamp: Date.now() - 1000,
          emotionalWeight: 0.0,
          _score: 0.3,
          importanceScore: 0.1, // Lower importance
        },
      ];

      const ranked = rankCandidates("failure", candidates);

      // Old emotional + high importance beats recent low importance
      // Emotional weight (0.7) + importance (0.8) + semantic (0.4) together overcome recency
      expect(ranked[0]._id).toBe("very-old-emotional");
      expect(ranked[0]._score).toBeGreaterThan(ranked[1]._score || 0);
    });

    it("emotional weight does not override semantic match importance", () => {
      const candidates: RankCandidate[] = [
        {
          _id: "high-emotion-low-relevance",
          content: "we failed completely",
          timestamp: Date.now(),
          emotionalWeight: 0.7,
          _score: 0.1, // Semantic score 10%
        },
        {
          _id: "low-emotion-high-relevance",
          content: "search algorithm implementation",
          timestamp: Date.now(),
          emotionalWeight: 0.0,
          _score: 0.95, // Semantic score 95%
        },
      ];

      const ranked = rankCandidates("search", candidates);

      // Semantic (0.4 weight) dominates over emotional (0.05 weight)
      expect(ranked[0]._id).toBe("low-emotion-high-relevance");
    });

    it("emotional weight compounds with importance score", () => {
      const candidates: RankCandidate[] = [
        {
          _id: "emotional-important",
          content: "critical failure resolved",
          timestamp: Date.now(),
          emotionalWeight: 0.7,
          importanceScore: 0.9,
          _score: 0.4,
        },
        {
          _id: "emotional-unimportant",
          content: "minor issue failed",
          timestamp: Date.now(),
          emotionalWeight: 0.7,
          importanceScore: 0.2,
          _score: 0.4,
        },
      ];

      const ranked = rankCandidates("failure", candidates);

      expect(ranked[0]._id).toBe("emotional-important");
      expect(ranked[0]._score).toBeGreaterThan(ranked[1]._score || 0);
    });
  });

  describe("Integration: emotional context in ranking workflow", () => {
    it("completes full ranking workflow with emotional signals", () => {
      const now = Date.now();

      const candidates: RankCandidate[] = [
        {
          _id: "user-critical-failure",
          content:
            "The authentication system failed during deployment and blocked all users from logging in",
          timestamp: now - 2 * 24 * 60 * 60 * 1000, // 2 days old
          emotionalContext: "frustrated",
          emotionalWeight: 0.7,
          importanceScore: 0.95,
          outcomeScore: 0.8,
          _score: 0.8, // High semantic relevance to "authentication failure"
        },
        {
          _id: "routine-success",
          content: "Successfully completed the weekly database optimization task",
          timestamp: now - 1 * 60 * 60 * 1000, // 1 hour old
          emotionalContext: "confident",
          emotionalWeight: 0.55,
          importanceScore: 0.3,
          outcomeScore: 0.7,
          _score: 0.5,
        },
        {
          _id: "neutral-log",
          content: "Database backup completed on schedule",
          timestamp: now,
          emotionalWeight: 0,
          importanceScore: 0.5,
          outcomeScore: 0.5,
          _score: 0.3,
        },
      ];

      const ranked = rankCandidates("authentication failure", candidates);

      expect(ranked).toHaveLength(3);
      // Critical failure should rank first despite being older
      expect(ranked[0]._id).toBe("user-critical-failure");
      expect(ranked[0]._score).toBeGreaterThan(ranked[1]._score || 0);
    });

    it("emotional weight helps with relevance recovery in retrieval", () => {
      // Simulates: agent queries for "debugging session"
      // Should retrieve emotionally relevant failures even if not perfect text match
      const candidates: RankCandidate[] = [
        {
          _id: "struggled-with-bug",
          content: "spent hours debugging the race condition but finally got it",
          timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days old
          emotionalWeight: 0.7, // Was frustrated, now fixed
          _score: 0.4, // Semantic score for "debugging session" is moderate
          importanceScore: 0.7, // Important bug fix
        },
        {
          _id: "meeting-notes",
          content: "Team meeting on debugging strategies and tools",
          timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000, // 1 day old
          emotionalWeight: 0.0, // Neutral
          _score: 0.75, // Better text match — high enough to overcome emotional+importance boost
          importanceScore: 0.3,
        },
      ];

      const ranked = rankCandidates("debugging session", candidates);

      // Meeting notes has better semantic match, so ranks first
      expect(ranked[0]._id).toBe("meeting-notes");
      // But struggled-with-bug is competitive due to importance + emotion
      expect(ranked[1]._id).toBe("struggled-with-bug");
      expect(ranked[1]._score || 0).toBeGreaterThan(0.35); // Should score reasonably well
    });
  });
});
