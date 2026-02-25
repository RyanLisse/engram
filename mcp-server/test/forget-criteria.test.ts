import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  shouldForget,
  shouldArchiveSuperseded,
  shouldCompressBackground,
  isInActiveEpisode,
  type FactForForgetEval,
} from "../src/lib/forget-criteria.js";

describe("forget criteria", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────
  // isInActiveEpisode tests
  // ─────────────────────────────────────────────────────────

  describe("isInActiveEpisode", () => {
    test("returns true when fact is in active episode set", () => {
      const episodeIds = new Set(["fact-1", "fact-2", "fact-3"]);
      expect(isInActiveEpisode("fact-2", episodeIds)).toBe(true);
    });

    test("returns false when fact is not in active episode set", () => {
      const episodeIds = new Set(["fact-1", "fact-2"]);
      expect(isInActiveEpisode("fact-99", episodeIds)).toBe(false);
    });

    test("returns false for empty episode set", () => {
      expect(isInActiveEpisode("fact-1", new Set())).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────
  // shouldForget criteria tests
  // ─────────────────────────────────────────────────────────

  describe("shouldForget", () => {
    test("returns true when all ALMA criteria match", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set<string>(), "fact-1");
      expect(result.shouldForget).toBe(true);
      expect(result.reason).toBe(
        "high forgetScore, low access, old, no links, no active episode"
      );
    });

    // ─ Lifecycle state tests ─────────────────────────────

    test("rejects non-active lifecycle states", () => {
      const baseFactData = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
      };

      const states = ["archived", "dormant", "merged", "pruned"];
      for (const state of states) {
        const fact: FactForForgetEval = {
          ...baseFactData,
          lifecycleState: state,
        };
        const result = shouldForget(fact, new Set(), "fact-1");
        expect(result.shouldForget).toBe(false);
        expect(result.reason).toBe("not active");
      }
    });

    // ─ forgetScore threshold tests ───────────────────────

    test("rejects fact with forgetScore at boundary (0.8)", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.8,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toContain("0.8");
    });

    test("accepts fact with forgetScore just above threshold (0.81)", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.81,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(true);
    });

    test("rejects fact with forgetScore below threshold (0.79)", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.79,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(false);
    });

    test("rejects fact with undefined forgetScore (defaults to 0)", () => {
      const fact: FactForForgetEval = {
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toContain("0");
    });

    // ─ accessedCount threshold tests ──────────────────────

    test("accepts fact with zero access count", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(true);
    });

    test("accepts fact with one access count", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 1,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(true);
    });

    test("rejects fact with access count at boundary (2)", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 2,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toContain("2");
    });

    test("rejects fact with high access count", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 100,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(false);
    });

    // ─ Age (timestamp) tests ────────────────────────────

    test("rejects fact younger than 30 days", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 29 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toContain("younger than 30 days");
    });

    test("accepts fact at exactly 30 days boundary (not strictly younger)", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(true);
    });

    test("accepts fact just over 30 days boundary", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(true);
    });

    test("accepts very old fact (1 year)", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 365 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(true);
    });

    // ─ Temporal links tests ──────────────────────────────

    test("rejects fact with single temporal link", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [{ targetFactId: "fact-2", relation: "causes", confidence: 0.9 }],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toBe("has temporal links");
    });

    test("rejects fact with multiple temporal links", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [
          { targetFactId: "fact-2", relation: "causes", confidence: 0.9 },
          { targetFactId: "fact-3", relation: "precedes", confidence: 0.8 },
        ],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(false);
    });

    test("accepts fact with empty temporalLinks array", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(true);
    });

    test("accepts fact with undefined temporalLinks", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(true);
    });

    // ─ Active episode membership tests ──────────────────

    test("rejects fact that is in an active episode", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const activeEpisodeIds = new Set(["fact-1", "fact-2"]);
      const result = shouldForget(fact, activeEpisodeIds, "fact-1");
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toBe("in active episode");
    });

    test("accepts fact not in any active episode", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const activeEpisodeIds = new Set(["fact-2", "fact-3"]);
      const result = shouldForget(fact, activeEpisodeIds, "fact-1");
      expect(result.shouldForget).toBe(true);
    });

    // ─ Criteria combination tests ───────────────────────

    test("fails on first failing criterion (score)", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.5,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toContain("forgetScore");
    });

    test("reports earliest failing criterion", () => {
      // Low score (fails first), but also high access count and temporal links
      const fact: FactForForgetEval = {
        forgetScore: 0.5,
        accessedCount: 5,
        timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000,
        temporalLinks: [{ targetFactId: "fact-2", relation: "causes", confidence: 0.9 }],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toContain("forgetScore");
    });
  });

  // ─────────────────────────────────────────────────────────
  // shouldArchiveSuperseded tests
  // ─────────────────────────────────────────────────────────

  describe("shouldArchiveSuperseded", () => {
    test("returns true when newer fact has higher confidence", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        supersededBy: "fact-new",
        confidence: 0.4,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
      };

      const result = shouldArchiveSuperseded(fact, 0.8);
      expect(result.shouldForget).toBe(true);
      expect(result.reason).toContain("superseded by fact with higher confidence");
    });

    test("returns false when newer fact has equal confidence", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        supersededBy: "fact-new",
        confidence: 0.8,
        accessedCount: 0,
        timestamp: Date.now(),
      };

      const result = shouldArchiveSuperseded(fact, 0.8);
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toContain("confidence not higher");
    });

    test("returns false when newer fact has lower confidence", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        supersededBy: "fact-new",
        confidence: 0.9,
        accessedCount: 0,
        timestamp: Date.now(),
      };

      const result = shouldArchiveSuperseded(fact, 0.8);
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toContain("confidence not higher");
    });

    test("uses default confidence (0.5) when not provided", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        supersededBy: "fact-new",
        accessedCount: 0,
        timestamp: Date.now(),
      };

      const result = shouldArchiveSuperseded(fact);
      expect(result.shouldForget).toBe(false);
    });

    test("uses fact's default confidence (0.5) when undefined", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        supersededBy: "fact-new",
        accessedCount: 0,
        timestamp: Date.now(),
      };

      const result = shouldArchiveSuperseded(fact, 0.6);
      expect(result.shouldForget).toBe(true);
    });

    test("rejects non-active facts", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "archived",
        supersededBy: "fact-new",
        confidence: 0.1,
        accessedCount: 0,
        timestamp: Date.now(),
      };

      const result = shouldArchiveSuperseded(fact, 0.9);
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toBe("not active");
    });

    test("rejects fact without supersededBy", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        confidence: 0.1,
        accessedCount: 0,
        timestamp: Date.now(),
      };

      const result = shouldArchiveSuperseded(fact, 0.9);
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toBe("not superseded");
    });

    test("handles boundary: new confidence just above old", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        supersededBy: "fact-new",
        confidence: 0.5,
        accessedCount: 0,
        timestamp: Date.now(),
      };

      const result = shouldArchiveSuperseded(fact, 0.500001);
      expect(result.shouldForget).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────
  // shouldCompressBackground tests
  // ─────────────────────────────────────────────────────────

  describe("shouldCompressBackground", () => {
    test("returns true for old untouched background observation", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        observationTier: "background",
        accessedCount: 0,
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000,
      };

      const result = shouldCompressBackground(fact);
      expect(result.shouldForget).toBe(true);
      expect(result.reason).toContain("background observation");
    });

    test("rejects non-background observation tiers", () => {
      const tiers = ["foreground", "critical", "user-facing"];
      for (const tier of tiers) {
        const fact: FactForForgetEval = {
          lifecycleState: "active",
          observationTier: tier,
          accessedCount: 0,
          timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000,
        };

        const result = shouldCompressBackground(fact);
        expect(result.shouldForget).toBe(false);
        expect(result.reason).toBe("not background tier");
      }
    });

    test("rejects background observation that has been accessed", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        observationTier: "background",
        accessedCount: 1,
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000,
      };

      const result = shouldCompressBackground(fact);
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toContain("accessed 1 times");
    });

    test("rejects background observation accessed multiple times", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        observationTier: "background",
        accessedCount: 5,
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000,
      };

      const result = shouldCompressBackground(fact);
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toContain("accessed 5 times");
    });

    test("rejects background observation younger than 7 days", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        observationTier: "background",
        accessedCount: 0,
        timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000,
      };

      const result = shouldCompressBackground(fact);
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toContain("younger than 7 days");
    });

    test("accepts background observation at exactly 7 days boundary (not strictly younger)", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        observationTier: "background",
        accessedCount: 0,
        timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
      };

      const result = shouldCompressBackground(fact);
      expect(result.shouldForget).toBe(true);
    });

    test("accepts background observation just over 7 days", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        observationTier: "background",
        accessedCount: 0,
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000,
      };

      const result = shouldCompressBackground(fact);
      expect(result.shouldForget).toBe(true);
    });

    test("accepts very old background observation (1 month)", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        observationTier: "background",
        accessedCount: 0,
        timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
      };

      const result = shouldCompressBackground(fact);
      expect(result.shouldForget).toBe(true);
    });

    test("rejects non-active background observations", () => {
      const states = ["archived", "dormant", "merged"];
      for (const state of states) {
        const fact: FactForForgetEval = {
          lifecycleState: state,
          observationTier: "background",
          accessedCount: 0,
          timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000,
        };

        const result = shouldCompressBackground(fact);
        expect(result.shouldForget).toBe(false);
        expect(result.reason).toBe("not active");
      }
    });

    test("applies all criteria - fails on tier before age", () => {
      const fact: FactForForgetEval = {
        lifecycleState: "active",
        observationTier: "foreground",
        accessedCount: 0,
        timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
      };

      const result = shouldCompressBackground(fact);
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toBe("not background tier");
    });
  });

  // ─────────────────────────────────────────────────────────
  // Integration and edge case tests
  // ─────────────────────────────────────────────────────────

  describe("integration", () => {
    test("brand new fact (1 minute old) is never forgotten", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toContain("younger than 30 days");
    });

    test("fact with very high forget score but accessed regularly is kept", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.99,
        accessedCount: 100,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(false);
    });

    test("fact with high score but in active episode is kept", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      const activeEpisodes = new Set(["fact-1"]);
      const result = shouldForget(fact, activeEpisodes, "fact-1");
      expect(result.shouldForget).toBe(false);
    });

    test("archived fact is never forgotten again", () => {
      const fact: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 365 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "archived",
      };

      const result = shouldForget(fact, new Set(), "fact-1");
      expect(result.shouldForget).toBe(false);
      expect(result.reason).toBe("not active");
    });

    test("handles all three criteria types in single test", () => {
      // Create a fact that qualifies for forgetting
      const forgetableCandidate: FactForForgetEval = {
        forgetScore: 0.95,
        accessedCount: 0,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        temporalLinks: [],
        lifecycleState: "active",
      };

      // Create a fact that qualifies for archiving
      const archivableCandidate: FactForForgetEval = {
        lifecycleState: "active",
        supersededBy: "fact-new",
        confidence: 0.3,
        accessedCount: 0,
        timestamp: Date.now(),
      };

      // Create a fact that qualifies for compression
      const compressableCandidate: FactForForgetEval = {
        lifecycleState: "active",
        observationTier: "background",
        accessedCount: 0,
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000,
      };

      expect(shouldForget(forgetableCandidate, new Set(), "f1").shouldForget).toBe(true);
      expect(shouldArchiveSuperseded(archivableCandidate, 0.8).shouldForget).toBe(true);
      expect(shouldCompressBackground(compressableCandidate).shouldForget).toBe(true);
    });
  });
});
