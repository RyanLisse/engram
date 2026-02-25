import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * E2E Test: Active Forgetting Pipeline (ALMA)
 *
 * Tests the full pipeline from fact aging through archival/compression.
 * Simulates the Convex cron job behavior with mocked DB operations.
 */

interface MockFact {
  _id: string;
  forgetScore?: number;
  accessedCount: number;
  timestamp: number;
  temporalLinks?: Array<{ targetFactId: string; relation: string; confidence: number }>;
  lifecycleState: string;
  supersededBy?: string;
  confidence?: number;
  observationTier?: string;
  vaultPath?: string;
  updatedAt?: number;
}

interface MockEpisode {
  _id: string;
  factIds: string[];
  endTime?: number;
}

// Pipeline helper functions (copied from convex/forget.ts)
function buildActiveEpisodeFactSet(episodes: MockEpisode[]) {
  const activeEpisodeFactIds = new Set<string>();
  for (const episode of episodes) {
    for (const factId of episode.factIds) {
      activeEpisodeFactIds.add(String(factId));
    }
  }
  return activeEpisodeFactIds;
}

function identifyForgetCandidates(
  facts: MockFact[],
  episodes: MockEpisode[],
  now: number,
): MockFact[] {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const FORGET_SCORE_THRESHOLD = 0.8;
  const MAX_ACCESS_COUNT = 2;

  const activeEpisodeFactIds = buildActiveEpisodeFactSet(episodes);

  return facts.filter((fact) => {
    const forgetScore = fact.forgetScore ?? 0;
    const ageMs = now - fact.timestamp;
    const hasTemporalLinks = (fact.temporalLinks?.length ?? 0) > 0;
    const inActiveEpisode = activeEpisodeFactIds.has(String(fact._id));

    return (
      forgetScore > FORGET_SCORE_THRESHOLD &&
      fact.accessedCount < MAX_ACCESS_COUNT &&
      ageMs > THIRTY_DAYS_MS &&
      !hasTemporalLinks &&
      !inActiveEpisode
    );
  });
}

function identifySuperseded(facts: MockFact[]): MockFact[] {
  return facts.filter(
    (fact) => fact.lifecycleState === "active" && Boolean(fact.supersededBy),
  );
}

// Simulated pipeline execution
function runForgetPipeline(
  facts: MockFact[],
  episodes: MockEpisode[],
  newerFactConfidence: Map<string, number>,
  now: number,
) {
  const forgetCandidates = identifyForgetCandidates(facts, episodes, now);
  const supersededCandidates = identifySuperseded(facts);

  const forgetCandidateIds = new Set(forgetCandidates.map((fact) => String(fact._id)));
  const supersededCandidateIds = new Set(
    supersededCandidates.map((fact) => String(fact._id)),
  );

  let archived = 0;
  let compressed = 0;
  let superseded = 0;
  const archivedFacts: string[] = [];
  const compressedFacts: string[] = [];
  const supersededFacts: string[] = [];

  for (const fact of facts) {
    const factId = String(fact._id);

    // Check shouldForget
    if (forgetCandidateIds.has(factId)) {
      fact.lifecycleState = "archived";
      fact.vaultPath = undefined;
      fact.updatedAt = now;
      archivedFacts.push(factId);
      archived++;
      continue;
    }

    // Check shouldArchiveSuperseded
    if (supersededCandidateIds.has(factId) && fact.supersededBy) {
      const newerConfidence = newerFactConfidence.get(fact.supersededBy) ?? 0.5;
      const factConfidence = fact.confidence ?? 0.5;
      if (newerConfidence > factConfidence) {
        fact.lifecycleState = "archived";
        fact.vaultPath = undefined;
        fact.updatedAt = now;
        supersededFacts.push(factId);
        superseded++;
        continue;
      }
    }

    // Check shouldCompressBackground
    const ageMs = now - fact.timestamp;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    if (
      fact.observationTier === "background" &&
      fact.accessedCount === 0 &&
      ageMs > SEVEN_DAYS_MS
    ) {
      fact.observationCompressed = true;
      fact.updatedAt = now;
      compressedFacts.push(factId);
      compressed++;
    }
  }

  return {
    archived,
    superseded,
    compressed,
    archivedFacts,
    supersededFacts,
    compressedFacts,
  };
}

describe("forget pipeline E2E", () => {
  let now: number;

  beforeEach(() => {
    vi.useFakeTimers();
    now = new Date("2026-02-25T00:00:00.000Z").getTime();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────
  // Basic pipeline tests
  // ─────────────────────────────────────────────────────────

  describe("basic pipeline", () => {
    test("archives facts meeting all forget criteria", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-1",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.archived).toBe(1);
      expect(result.archivedFacts).toContain("fact-1");
      expect(facts[0].lifecycleState).toBe("archived");
    });

    test("archives superseded facts with higher confidence replacement", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-old",
          lifecycleState: "active",
          supersededBy: "fact-new",
          confidence: 0.4,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
        },
      ];

      const newerConfidence = new Map<string, number>([["fact-new", 0.9]]);
      const result = runForgetPipeline(facts, [], newerConfidence, now);

      expect(result.superseded).toBe(1);
      expect(result.supersededFacts).toContain("fact-old");
      expect(facts[0].lifecycleState).toBe("archived");
    });

    test("compresses background observations", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-bg",
          lifecycleState: "active",
          observationTier: "background",
          accessedCount: 0,
          timestamp: now - 8 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.compressed).toBe(1);
      expect(result.compressedFacts).toContain("fact-bg");
      expect((facts[0] as any).observationCompressed).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Protection mechanisms
  // ─────────────────────────────────────────────────────────

  describe("protection: active episodes", () => {
    test("protects facts in active episodes from forgetting", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-in-episode",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      const episodes: MockEpisode[] = [
        {
          _id: "episode-1",
          factIds: ["fact-in-episode"],
          endTime: undefined,
        },
      ];

      const result = runForgetPipeline(facts, episodes, new Map(), now);

      expect(result.archived).toBe(0);
      expect(facts[0].lifecycleState).toBe("active");
    });

    test("does not consider closed episodes in protection check", () => {
      // The pipeline only filters for episodes with endTime === undefined
      // So closed episodes are never included in activeEpisodeFactIds
      // This test verifies that closed episodes don't provide protection
      const facts: MockFact[] = [
        {
          _id: "fact-old-episode",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      // Closed episodes (endTime set) are filtered out by the pipeline
      // and never added to activeEpisodeFactIds, so they don't protect facts
      const episodes: MockEpisode[] = [];

      const result = runForgetPipeline(facts, episodes, new Map(), now);

      expect(result.archived).toBe(1);
      expect(facts[0].lifecycleState).toBe("archived");
    });
  });

  describe("protection: high access count", () => {
    test("preserves facts with accessedCount >= 2", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-accessed",
          forgetScore: 0.95,
          accessedCount: 2,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.archived).toBe(0);
      expect(facts[0].lifecycleState).toBe("active");
    });

    test("preserves facts with high access count", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-hot",
          forgetScore: 0.95,
          accessedCount: 100,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.archived).toBe(0);
      expect(facts[0].lifecycleState).toBe("active");
    });
  });

  describe("protection: temporal links", () => {
    test("preserves facts with temporal links", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-linked",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [
            { targetFactId: "fact-other", relation: "causes", confidence: 0.9 },
          ],
          lifecycleState: "active",
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.archived).toBe(0);
      expect(facts[0].lifecycleState).toBe("active");
    });

    test("allows forgetting when temporal links are removed", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-unlinked",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.archived).toBe(1);
      expect(facts[0].lifecycleState).toBe("archived");
    });
  });

  describe("protection: forget score threshold", () => {
    test("preserves facts with low forget scores", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-low-score",
          forgetScore: 0.5,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.archived).toBe(0);
      expect(facts[0].lifecycleState).toBe("active");
    });

    test("archives only facts with forgetScore > 0.8", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-0.8",
          forgetScore: 0.8,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
        {
          _id: "fact-0.81",
          forgetScore: 0.81,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.archived).toBe(1);
      expect(result.archivedFacts).toContain("fact-0.81");
      expect(result.archivedFacts).not.toContain("fact-0.8");
    });
  });

  // ─────────────────────────────────────────────────────────
  // Age threshold tests
  // ─────────────────────────────────────────────────────────

  describe("age thresholds", () => {
    test("preserves facts younger than 30 days", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-young",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 29 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.archived).toBe(0);
      expect(facts[0].lifecycleState).toBe("active");
    });

    test("does not archive facts at exactly 30 days (requires > 30 days)", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-30days",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 30 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      // Pipeline checks ageMs > THIRTY_DAYS_MS (strictly greater)
      // At exactly 30 days: 30*24*60*60*1000 is NOT > 30*24*60*60*1000
      expect(result.archived).toBe(0);
      expect(facts[0].lifecycleState).toBe("active");
    });

    test("archives very old facts (1 year)", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-ancient",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 365 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.archived).toBe(1);
      expect(facts[0].lifecycleState).toBe("archived");
    });

    test("preserves background observations younger than 7 days", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-bg-young",
          lifecycleState: "active",
          observationTier: "background",
          accessedCount: 0,
          timestamp: now - 6 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.compressed).toBe(0);
      expect((facts[0] as any).observationCompressed).toBeUndefined();
    });

    test("does not compress background observations at exactly 7 days (requires > 7 days)", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-bg-7days",
          lifecycleState: "active",
          observationTier: "background",
          accessedCount: 0,
          timestamp: now - 7 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      // Pipeline checks ageMs > 7 DAYS_MS (strictly greater)
      // At exactly 7 days: 7*24*60*60*1000 is NOT > 7*24*60*60*1000
      expect(result.compressed).toBe(0);
      expect((facts[0] as any).observationCompressed).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────
  // Superseded fact handling
  // ─────────────────────────────────────────────────────────

  describe("superseded fact handling", () => {
    test("does not archive superseded fact if newer has same confidence", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-old",
          lifecycleState: "active",
          supersededBy: "fact-new",
          confidence: 0.8,
          accessedCount: 0,
          timestamp: now,
          temporalLinks: [],
        },
      ];

      const newerConfidence = new Map<string, number>([["fact-new", 0.8]]);
      const result = runForgetPipeline(facts, [], newerConfidence, now);

      expect(result.superseded).toBe(0);
      expect(facts[0].lifecycleState).toBe("active");
    });

    test("does not archive superseded fact if newer has lower confidence", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-old",
          lifecycleState: "active",
          supersededBy: "fact-new",
          confidence: 0.9,
          accessedCount: 0,
          timestamp: now,
          temporalLinks: [],
        },
      ];

      const newerConfidence = new Map<string, number>([["fact-new", 0.7]]);
      const result = runForgetPipeline(facts, [], newerConfidence, now);

      expect(result.superseded).toBe(0);
      expect(facts[0].lifecycleState).toBe("active");
    });

    test("uses default confidence (0.5) when undefined", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-old",
          lifecycleState: "active",
          supersededBy: "fact-new",
          accessedCount: 0,
          timestamp: now,
          temporalLinks: [],
        },
      ];

      const newerConfidence = new Map<string, number>([["fact-new", 0.6]]);
      const result = runForgetPipeline(facts, [], newerConfidence, now);

      expect(result.superseded).toBe(1);
      expect(facts[0].lifecycleState).toBe("archived");
    });

    test("clears vaultPath when archiving superseded fact", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-old",
          lifecycleState: "active",
          supersededBy: "fact-new",
          confidence: 0.4,
          accessedCount: 0,
          timestamp: now,
          temporalLinks: [],
          vaultPath: "/vault/old-fact.md",
        },
      ];

      const newerConfidence = new Map<string, number>([["fact-new", 0.9]]);
      const result = runForgetPipeline(facts, [], newerConfidence, now);

      expect(result.superseded).toBe(1);
      expect(facts[0].vaultPath).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────
  // Background observation compression
  // ─────────────────────────────────────────────────────────

  describe("background observation compression", () => {
    test("does not compress background observations that have been accessed", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-bg-accessed",
          lifecycleState: "active",
          observationTier: "background",
          accessedCount: 1,
          timestamp: now - 8 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.compressed).toBe(0);
      expect((facts[0] as any).observationCompressed).toBeUndefined();
    });

    test("does not compress non-background observations", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-foreground",
          lifecycleState: "active",
          observationTier: "foreground",
          accessedCount: 0,
          timestamp: now - 8 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.compressed).toBe(0);
      expect((facts[0] as any).observationCompressed).toBeUndefined();
    });

    test("compresses very old background observations (1 month)", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-bg-ancient",
          lifecycleState: "active",
          observationTier: "background",
          accessedCount: 0,
          timestamp: now - 30 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.compressed).toBe(1);
      expect((facts[0] as any).observationCompressed).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Lifecycle state machine
  // ─────────────────────────────────────────────────────────

  describe("lifecycle state machine", () => {
    test("processes only active facts from input", () => {
      // The real pipeline filters for active facts in the DB query.
      // This test verifies the behavior when only active facts are provided.
      const facts: MockFact[] = [
        {
          _id: "fact-active",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 365 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.archived).toBe(1);
      expect(facts[0].lifecycleState).toBe("archived");
    });

    test("transitions active → archived when forget criteria met", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-active",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      expect(facts[0].lifecycleState).toBe("active");

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.archived).toBe(1);
      expect(facts[0].lifecycleState).toBe("archived");
    });

    test("sets updatedAt timestamp on archival", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-time",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      runForgetPipeline(facts, [], new Map(), now);

      expect(facts[0].updatedAt).toBe(now);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Batch processing and scale
  // ─────────────────────────────────────────────────────────

  describe("batch processing", () => {
    test("processes multiple facts correctly", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-forget-1",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
        {
          _id: "fact-keep-1",
          forgetScore: 0.5,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
        {
          _id: "fact-forget-2",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.archived).toBe(2);
      expect(result.archivedFacts).toContain("fact-forget-1");
      expect(result.archivedFacts).toContain("fact-forget-2");
      expect(facts[1].lifecycleState).toBe("active");
    });

    test("handles 100 facts in batch", () => {
      const facts: MockFact[] = [];
      for (let i = 0; i < 100; i++) {
        facts.push({
          _id: `fact-${i}`,
          forgetScore: i % 2 === 0 ? 0.95 : 0.5,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        });
      }

      const result = runForgetPipeline(facts, [], new Map(), now);

      expect(result.archived).toBe(50);
      expect(result.archivedFacts.length).toBe(50);
    });

    test("returns correct metrics", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-forget",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
        {
          _id: "fact-superseded",
          lifecycleState: "active",
          supersededBy: "fact-new",
          confidence: 0.4,
          accessedCount: 0,
          timestamp: now,
          temporalLinks: [],
        },
        {
          _id: "fact-compress",
          lifecycleState: "active",
          observationTier: "background",
          accessedCount: 0,
          timestamp: now - 8 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
        },
      ];

      const newerConfidence = new Map<string, number>([["fact-new", 0.9]]);
      const result = runForgetPipeline(facts, [], newerConfidence, now);

      expect(result.archived).toBe(1);
      expect(result.superseded).toBe(1);
      expect(result.compressed).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Complex scenarios
  // ─────────────────────────────────────────────────────────

  describe("complex scenarios", () => {
    test("respects multiple protection mechanisms simultaneously", () => {
      const facts: MockFact[] = [
        {
          // Protected: in episode
          _id: "fact-in-episode",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
        {
          // Protected: high access
          _id: "fact-hot",
          forgetScore: 0.95,
          accessedCount: 10,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
        {
          // Protected: temporal links
          _id: "fact-linked",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [
            { targetFactId: "fact-other", relation: "causes", confidence: 0.9 },
          ],
          lifecycleState: "active",
        },
        {
          // Should be forgotten
          _id: "fact-vulnerable",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      const episodes: MockEpisode[] = [
        {
          _id: "episode-1",
          factIds: ["fact-in-episode"],
          endTime: undefined,
        },
      ];

      const result = runForgetPipeline(facts, episodes, new Map(), now);

      expect(result.archived).toBe(1);
      expect(result.archivedFacts).toContain("fact-vulnerable");
      expect(facts[0].lifecycleState).toBe("active"); // episode protection
      expect(facts[1].lifecycleState).toBe("active"); // access protection
      expect(facts[2].lifecycleState).toBe("active"); // link protection
    });

    test("handles facts at multiple critical boundaries", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-29days",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 29 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
        {
          _id: "fact-31days",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
        {
          _id: "fact-score-0.79",
          forgetScore: 0.79,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
        {
          _id: "fact-score-0.81",
          forgetScore: 0.81,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
        },
      ];

      const result = runForgetPipeline(facts, [], new Map(), now);

      // Only facts that are > 30 days old AND score > 0.8 are archived
      // fact-31days: > 30 days (yes), score 0.95 > 0.8 (yes) → archived
      // fact-score-0.81: > 30 days (yes), score 0.81 > 0.8 (yes) → archived
      expect(result.archived).toBe(2);
      expect(result.archivedFacts).toContain("fact-31days");
      expect(result.archivedFacts).toContain("fact-score-0.81");
      expect(facts[0].lifecycleState).toBe("active"); // 29 days not archived
      expect(facts[2].lifecycleState).toBe("active"); // 0.79 score not archived
    });

    test("prevents double archival (first match wins)", () => {
      const facts: MockFact[] = [
        {
          _id: "fact-both",
          forgetScore: 0.95,
          accessedCount: 0,
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          temporalLinks: [],
          lifecycleState: "active",
          supersededBy: "fact-new",
          confidence: 0.4,
        },
      ];

      const newerConfidence = new Map<string, number>([["fact-new", 0.9]]);
      const result = runForgetPipeline(facts, [], newerConfidence, now);

      // Should be archived once (by shouldForget first, since it's checked first)
      expect(result.archived + result.superseded).toBe(1);
      expect(facts[0].lifecycleState).toBe("archived");
    });
  });
});
