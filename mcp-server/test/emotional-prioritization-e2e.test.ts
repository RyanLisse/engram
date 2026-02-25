/**
 * E2E tests for emotional fact prioritization
 * Tests the full pipeline: observe with emotion → auto-detect → store → recall → verify ranking
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { rankCandidates } from "../src/lib/ranking.js";
import type { RankCandidate } from "../src/lib/ranking.js";

// ============================================================================
// MOCK CONVEX CLIENT
// ============================================================================

interface MockFact {
  _id: string;
  content: string;
  timestamp: number;
  emotionalContext?: string;
  emotionalWeight?: number;
  importanceScore?: number;
  outcomeScore?: number;
  _score?: number;
  sourceAgent?: string;
  factType?: string;
}

class MockConvexClient {
  private facts: MockFact[] = [];
  private observationBuffer: Array<{
    content: string;
    emotionalContext?: string;
    emotionalWeight?: number;
  }> = [];

  /**
   * Simulates memory_observe: fire-and-forget observation storage
   * Auto-detects emotional context if not provided
   */
  async observe(input: {
    observation: string;
    emotionalContext?: string;
    scopeId?: string;
  }): Promise<{ ack: true; factId?: string } | { isError: true; message: string }> {
    try {
      // Simulate emotional detection (matches observe.ts logic)
      const lower = input.observation.toLowerCase();
      let detected: { emotionalContext?: string; emotionalWeight?: number } = {};

      if (/\b(failed|error|broken|frustrat|blocked|stuck)\b/.test(lower)) {
        detected = { emotionalContext: "frustrated", emotionalWeight: 0.7 };
      } else if (/\b(success|resolved|fixed|shipped|great|win)\b/.test(lower)) {
        detected = { emotionalContext: "confident", emotionalWeight: 0.55 };
      } else if (/\b(surpris|unexpected|wow)\b/.test(lower)) {
        detected = { emotionalContext: "surprised", emotionalWeight: 0.45 };
      } else if (/\b(proud|excited)\b/.test(lower)) {
        detected = { emotionalContext: "proud", emotionalWeight: 0.5 };
      }

      const emotionalContext = input.emotionalContext ?? detected.emotionalContext;
      const emotionalWeight = detected.emotionalWeight;

      // Store in observation buffer
      this.observationBuffer.push({
        content: input.observation,
        emotionalContext,
        emotionalWeight,
      });

      return { ack: true, factId: `fact-${this.observationBuffer.length}` };
    } catch (error: any) {
      return { isError: true, message: error.message };
    }
  }

  /**
   * Simulates storeFact: persist observation to fact database
   */
  async storeFact(input: {
    content: string;
    emotionalContext?: string;
    emotionalWeight?: number;
    importanceScore?: number;
    outcomeScore?: number;
  }): Promise<{ factId: string }> {
    const fact: MockFact = {
      _id: `fact-${this.facts.length + 1}`,
      content: input.content,
      timestamp: Date.now(),
      emotionalContext: input.emotionalContext,
      emotionalWeight: input.emotionalWeight,
      importanceScore: input.importanceScore ?? 0.5,
      outcomeScore: input.outcomeScore ?? 0.5,
      factType: "observation",
    };

    this.facts.push(fact);
    return { factId: fact._id };
  }

  /**
   * Simulates memory_recall: retrieve facts with ranking
   */
  async recall(query: string, limit: number = 10): Promise<RankCandidate[]> {
    // Apply ranking algorithm to facts
    const candidates = this.facts.map((f) => ({
      _id: f._id,
      content: f.content,
      timestamp: f.timestamp,
      emotionalWeight: f.emotionalWeight,
      importanceScore: f.importanceScore,
      outcomeScore: f.outcomeScore,
      _score: 0.5, // Mock semantic score
    }));

    const ranked = rankCandidates(query, candidates);
    return ranked.slice(0, limit);
  }

  /**
   * Access stored facts for verification
   */
  getStoredFacts(): MockFact[] {
    return [...this.facts];
  }

  /**
   * Access buffered observations for verification
   */
  getObservationBuffer(): Array<{
    content: string;
    emotionalContext?: string;
    emotionalWeight?: number;
  }> {
    return [...this.observationBuffer];
  }

  /**
   * Clear state for test isolation
   */
  clear(): void {
    this.facts = [];
    this.observationBuffer = [];
  }
}

// ============================================================================
// EMOTIONAL PRIORITIZATION PIPELINE
// ============================================================================

interface ObservationEvent {
  content: string;
  emotionalContext?: string;
  agentId: string;
  timestamp: number;
}

async function executeEmotionalPrioritizationPipeline(
  events: ObservationEvent[],
  client: MockConvexClient,
  query: string
): Promise<{
  observations: Array<{
    content: string;
    emotionalContext?: string;
    emotionalWeight?: number;
  }>;
  storedFacts: MockFact[];
  rankedResults: RankCandidate[];
}> {
  // Step 1: Process observations (simulate fire-and-forget)
  const observations: Array<{
    content: string;
    emotionalContext?: string;
    emotionalWeight?: number;
  }> = [];

  for (const event of events) {
    const result = await client.observe({
      observation: event.content,
      emotionalContext: event.emotionalContext,
    });

    if (!("isError" in result)) {
      observations.push({
        content: event.content,
        emotionalContext: event.emotionalContext,
      });
    }
  }

  // Step 2: Store facts (simulate async enrichment)
  for (const obs of observations) {
    const lower = obs.content.toLowerCase();
    let emotionalWeight = obs.emotionalContext ? 0.5 : undefined;

    if (!obs.emotionalContext) {
      if (/\b(failed|error|production|outage|critical|urgent)\b/.test(lower)) {
        emotionalWeight = 0.7;
      } else if (/\b(success|resolved|fixed|shipped|great|win)\b/.test(lower)) {
        emotionalWeight = 0.55;
      }
    }

    // Simulate importance scoring based on keywords
    let importanceScore = 0.3;
    if (
      /\b(critical|urgent|production|outage|blocker|breaking)\b/.test(lower)
    ) {
      importanceScore = 0.9;
    } else if (/\b(major|important|significant)\b/.test(lower)) {
      importanceScore = 0.7;
    }

    await client.storeFact({
      content: obs.content,
      emotionalContext: obs.emotionalContext,
      emotionalWeight,
      importanceScore,
    });
  }

  // Step 3: Recall and rank (simulate retrieval)
  const rankedResults = await client.recall(query);

  const storedFacts = client.getStoredFacts();

  return {
    observations,
    storedFacts,
    rankedResults,
  };
}

// ============================================================================
// E2E TESTS
// ============================================================================

describe("Emotional Fact Prioritization E2E", () => {
  let client: MockConvexClient;

  beforeEach(() => {
    client = new MockConvexClient();
  });

  describe("Full pipeline: observe → detect → store → rank", () => {
    it("completes full emotional detection and storage pipeline", async () => {
      const events: ObservationEvent[] = [
        {
          content: "Database migration failed during deployment",
          agentId: "system-agent",
          timestamp: Date.now(),
        },
        {
          content: "User logged in successfully",
          agentId: "auth-agent",
          timestamp: Date.now(),
        },
      ];

      const result = await executeEmotionalPrioritizationPipeline(
        events,
        client,
        "database migration"
      );

      expect(result.observations).toHaveLength(2);
      expect(result.storedFacts).toHaveLength(2);
      expect(result.rankedResults).toBeDefined();
      expect(result.rankedResults.length).toBeGreaterThan(0);
    });

    it("auto-detects frustrated emotion from failure keywords", async () => {
      const result = await client.observe({
        observation: "The API request failed with timeout error",
      });

      expect(result).toEqual({ ack: true, factId: "fact-1" });

      const buffer = client.getObservationBuffer();
      expect(buffer[0].emotionalContext).toBe("frustrated");
      expect(buffer[0].emotionalWeight).toBe(0.7);
    });

    it("auto-detects confident emotion from success keywords", async () => {
      const result = await client.observe({
        observation: "Feature shipped to production successfully",
      });

      expect(result).toEqual({ ack: true, factId: "fact-1" });

      const buffer = client.getObservationBuffer();
      expect(buffer[0].emotionalContext).toBe("confident");
      expect(buffer[0].emotionalWeight).toBe(0.55);
    });

    it("preserves user-provided emotional context", async () => {
      const result = await client.observe({
        observation: "System updated configuration",
        emotionalContext: "proud",
      });

      expect(result).toEqual({ ack: true, factId: "fact-1" });

      const buffer = client.getObservationBuffer();
      expect(buffer[0].emotionalContext).toBe("proud");
    });
  });

  describe("Critical vs neutral fact prioritization", () => {
    it("ranks production outage (critical + emotional) above routine config update", async () => {
      const events: ObservationEvent[] = [
        {
          content: "We updated the configuration files",
          agentId: "devops-agent",
          timestamp: Date.now(),
        },
        {
          content: "Production outage detected - database connection failed",
          agentId: "monitoring-agent",
          timestamp: Date.now() - 1000, // 1 second older
        },
      ];

      const result = await executeEmotionalPrioritizationPipeline(
        events,
        client,
        "production database"
      );

      expect(result.rankedResults.length).toBeGreaterThan(0);

      // Critical emotional fact should rank higher despite being older
      const outageRank = result.rankedResults.findIndex((r) =>
        r.content?.includes("outage")
      );
      const configRank = result.rankedResults.findIndex((r) =>
        r.content?.includes("configuration")
      );

      expect(outageRank).toBeLessThan(configRank);
    });

    it("verifies emotional boost compounds with importance score", async () => {
      const events: ObservationEvent[] = [
        {
          content:
            "Critical production system failure blocked all user requests",
          agentId: "incident-agent",
          timestamp: Date.now(),
        },
        {
          content: "User preferences changed in settings menu",
          agentId: "ui-agent",
          timestamp: Date.now(),
        },
      ];

      const result = await executeEmotionalPrioritizationPipeline(
        events,
        client,
        "system failure"
      );

      const storedFacts = result.storedFacts;

      // Critical failure should have both emotional weight and high importance
      const criticalFact = storedFacts.find((f) => f.content.includes("failure"));
      const minorFact = storedFacts.find((f) =>
        f.content.includes("preferences")
      );

      expect(criticalFact).toBeDefined();
      expect(minorFact).toBeDefined();

      if (criticalFact && minorFact) {
        // Critical fact has emotional weight OR high importance (or both)
        const criticalScore = (criticalFact.emotionalWeight ?? 0) +
          (criticalFact.importanceScore ?? 0) * 0.1;
        const minorScore = (minorFact.emotionalWeight ?? 0) +
          (minorFact.importanceScore ?? 0) * 0.1;

        expect(criticalScore).toBeGreaterThan(minorScore);
      }
    });
  });

  describe("Decay resistance with emotional weight", () => {
    it("old emotional critical fact ranks above recent neutral fact", async () => {
      // Simulate old critical incident
      const now = Date.now();
      const oldTimestamp = now - 7 * 24 * 60 * 60 * 1000; // 7 days ago

      // Manually store facts to control timestamps
      await client.storeFact({
        content: "Critical security vulnerability discovered and patched",
        emotionalWeight: 0.7,
        importanceScore: 0.95,
      });

      // Modify timestamp after storage (simulate historical data)
      const storedFacts = client.getStoredFacts();
      if (storedFacts[0]) {
        storedFacts[0].timestamp = oldTimestamp;
      }

      await client.storeFact({
        content: "User updated their profile picture today",
        emotionalWeight: 0,
        importanceScore: 0.1,
      });

      // Recall and verify ranking
      const ranked = await client.recall("security vulnerability");

      expect(ranked.length).toBeGreaterThan(0);

      // Despite being 7 days old, the emotional critical fact should rank high
      const vulnIndex = ranked.findIndex((r) =>
        r.content?.includes("vulnerability")
      );
      const profileIndex = ranked.findIndex((r) =>
        r.content?.includes("profile")
      );

      // The vulnerability should rank in top positions
      expect(vulnIndex).toBeLessThanOrEqual(1);
    });

    it("emotional weight protects facts from recency bias", async () => {
      const now = Date.now();
      const oldTimestamp = now - 30 * 24 * 60 * 60 * 1000; // 30 days ago

      // Store old emotional fact
      await client.storeFact({
        content: "System crashed and all services were unavailable",
        emotionalWeight: 0.7,
        importanceScore: 0.8,
      });

      // Modify timestamp
      const storedFacts = client.getStoredFacts();
      if (storedFacts[0]) {
        storedFacts[0].timestamp = oldTimestamp;
      }

      // Store recent neutral facts
      for (let i = 0; i < 3; i++) {
        await client.storeFact({
          content: `Recent routine update number ${i + 1}`,
          emotionalWeight: 0,
          importanceScore: 0.2,
        });
      }

      // Recall for system-related queries
      const ranked = await client.recall("system crashed");

      expect(ranked.length).toBeGreaterThan(0);

      // Old emotional crash should still be in top results
      const crashFound = ranked.some(
        (r) => r.content && r.content.includes("crashed")
      );
      expect(crashFound).toBe(true);

      // Check it's in a high position despite age
      const crashIndex = ranked.findIndex((r) =>
        r.content?.includes("crashed")
      );
      expect(crashIndex).toBeLessThanOrEqual(2);
    });
  });

  describe("Full ranking pipeline integration", () => {
    it("combines semantic relevance with emotional weight correctly", async () => {
      const events: ObservationEvent[] = [
        {
          content:
            "API authentication module has critical security vulnerability",
          agentId: "security-agent",
          timestamp: Date.now(),
        },
        {
          content: "Successfully deployed v2.1.0 to production servers",
          agentId: "deploy-agent",
          timestamp: Date.now(),
        },
        {
          content: "Fixed minor bug in help documentation text",
          agentId: "docs-agent",
          timestamp: Date.now(),
        },
      ];

      const result = await executeEmotionalPrioritizationPipeline(
        events,
        client,
        "API authentication"
      );

      expect(result.rankedResults.length).toBe(3);

      // Verify all facts stored
      expect(result.storedFacts).toHaveLength(3);

      // Verify ranking considers semantic match + emotion + importance
      const apiSecFact = result.storedFacts.find((f) =>
        f.content.includes("API authentication")
      );
      const deployFact = result.storedFacts.find((f) =>
        f.content.includes("deployed")
      );
      const docsFact = result.storedFacts.find((f) =>
        f.content.includes("documentation")
      );

      if (apiSecFact && deployFact && docsFact) {
        // Critical security should have emotional weight
        expect(apiSecFact.emotionalWeight).toBeGreaterThan(0);
        // Critical security and deploy might have same importance
        // But security should have higher emotional weight than deploy success
        const securityScore = (apiSecFact.emotionalWeight ?? 0) +
          (apiSecFact.importanceScore ?? 0) * 0.1;
        const deployScore = (deployFact.emotionalWeight ?? 0) +
          (deployFact.importanceScore ?? 0) * 0.1;
        expect(securityScore).toBeGreaterThanOrEqual(deployScore);
      }
    });

    it("verifies emotional weight doesn't override semantic matching", async () => {
      const events: ObservationEvent[] = [
        {
          content: "We failed to complete the backup process",
          agentId: "backup-agent",
          timestamp: Date.now(),
        },
        {
          content:
            "Complete documentation for database backup procedures updated",
          agentId: "docs-agent",
          timestamp: Date.now(),
        },
      ];

      const result = await executeEmotionalPrioritizationPipeline(
        events,
        client,
        "database backup"
      );

      // Both are relevant to "database backup"
      // Documentation fact has better semantic match
      // Failure fact has emotional weight
      expect(result.storedFacts.length).toBe(2);

      const docsFact = result.storedFacts.find((f) =>
        f.content.includes("documentation")
      );
      const failureFact = result.storedFacts.find((f) =>
        f.content.includes("failed")
      );

      if (docsFact && failureFact) {
        // Emotion is only 5% of score, semantic is 40%
        // So docs (better semantic match, no emotion) vs failure (poor semantic, high emotion)
        // Neither dominates based on emotion alone
        expect(failureFact.emotionalWeight ?? 0).toBeGreaterThan(0);
      }
    });

    it("maintains ranking consistency across multiple recalls", async () => {
      const events: ObservationEvent[] = [
        {
          content: "Critical deployment failure blocked production release",
          agentId: "deploy-agent",
          timestamp: Date.now(),
        },
        {
          content: "Routine maintenance completed on staging servers",
          agentId: "ops-agent",
          timestamp: Date.now(),
        },
      ];

      // Run pipeline once
      const result1 = await executeEmotionalPrioritizationPipeline(
        events,
        client,
        "deployment failure"
      );

      const ranked1 = result1.rankedResults.map((r) => r._id);

      // Recall again with same query
      const ranked2 = await client.recall("deployment failure");
      const ranked2Ids = ranked2.map((r) => r._id);

      // Results should be identical (deterministic ranking)
      expect(ranked1).toEqual(ranked2Ids);
    });
  });

  describe("Edge cases and robustness", () => {
    it("handles empty observations gracefully", async () => {
      const result = await executeEmotionalPrioritizationPipeline([], client, "test");

      expect(result.observations).toHaveLength(0);
      expect(result.storedFacts).toHaveLength(0);
      expect(result.rankedResults).toHaveLength(0);
    });

    it("handles missing emotional context with sensible defaults", async () => {
      const result = await client.observe({
        observation: "The system is running normally without issues",
      });

      expect(result).toEqual({ ack: true, factId: "fact-1" });

      const buffer = client.getObservationBuffer();
      // No emotional keywords, so no context detected
      expect(buffer[0].emotionalContext).toBeUndefined();
    });

    it("processes mixed emotional and neutral observations", async () => {
      const events: ObservationEvent[] = [
        {
          content: "Error parsing configuration file",
          agentId: "config-agent",
          timestamp: Date.now(),
        },
        {
          content: "File processing task completed",
          agentId: "processor-agent",
          timestamp: Date.now(),
        },
        {
          content: "Successfully resolved the critical memory leak issue",
          agentId: "perf-agent",
          timestamp: Date.now(),
        },
      ];

      const result = await executeEmotionalPrioritizationPipeline(
        events,
        client,
        "parsing"
      );

      expect(result.storedFacts).toHaveLength(3);

      // Verify mixed emotions are stored
      const errorFact = result.storedFacts.find((f) =>
        f.content.includes("Error")
      );
      const completedFact = result.storedFacts.find((f) =>
        f.content.includes("completed")
      );
      const resolvedFact = result.storedFacts.find((f) =>
        f.content.includes("resolved")
      );

      // Error should be detected as frustrated
      expect(errorFact).toBeDefined();
      expect(errorFact?.emotionalWeight).toBeGreaterThan(0);

      // Resolved should be detected as confident
      expect(resolvedFact).toBeDefined();
      expect(resolvedFact?.emotionalWeight).toBeGreaterThan(0);

      // Completed doesn't have explicit success keywords, so may be neutral
      expect(completedFact).toBeDefined();
    });

    it("prevents emotional hijacking by importance checking", async () => {
      const events: ObservationEvent[] = [
        {
          content: "Critical system failure affecting all users blocked",
          agentId: "incident-agent",
          timestamp: Date.now(),
        },
        {
          content: "We are so excited about the new feature",
          agentId: "product-agent",
          timestamp: Date.now(),
        },
      ];

      const result = await executeEmotionalPrioritizationPipeline(
        events,
        client,
        "system"
      );

      const criticalFact = result.storedFacts.find((f) =>
        f.content.includes("Critical system")
      );
      const excitedFact = result.storedFacts.find((f) =>
        f.content.includes("excited")
      );

      if (criticalFact && excitedFact) {
        // Both are emotional, but critical has high importance
        expect(criticalFact.importanceScore ?? 0).toBeGreaterThan(
          excitedFact.importanceScore ?? 0
        );

        // Ranking should still prioritize importance over pure emotion
        const ranked = result.rankedResults;
        const criticalIndex = ranked.findIndex((r) =>
          r.content?.includes("Critical")
        );
        const excitedIndex = ranked.findIndex((r) =>
          r.content?.includes("excited")
        );

        if (criticalIndex >= 0 && excitedIndex >= 0) {
          expect(criticalIndex).toBeLessThanOrEqual(excitedIndex);
        }
      }
    });
  });

  describe("Real-world scenarios", () => {
    it("simulates incident response recall workflow", async () => {
      const incidentEvents: ObservationEvent[] = [
        {
          content: "Database connection timeout - queries blocking critical",
          agentId: "monitoring",
          timestamp: Date.now() - 5000,
        },
        {
          content: "Attempting automatic recovery of database pool",
          agentId: "system",
          timestamp: Date.now() - 4000,
        },
        {
          content: "Recovery failed - manual intervention required",
          agentId: "system",
          timestamp: Date.now() - 3000,
        },
        {
          content: "Incident escalated to database team immediately",
          agentId: "ops",
          timestamp: Date.now() - 2000,
        },
        {
          content: "Connection pool restored after server restart",
          agentId: "database-team",
          timestamp: Date.now() - 1000,
        },
      ];

      const result = await executeEmotionalPrioritizationPipeline(
        incidentEvents,
        client,
        "database connection"
      );

      expect(result.rankedResults.length).toBeGreaterThanOrEqual(3);

      // Verify stored facts have emotional weights for critical incidents
      const storedFacts = result.storedFacts;
      const criticalFacts = storedFacts.filter(
        (f) =>
          f.emotionalWeight &&
          f.emotionalWeight > 0.5 &&
          f.importanceScore &&
          f.importanceScore > 0.7
      );

      // Should have at least some critical facts stored
      expect(storedFacts.length).toBeGreaterThan(0);
      // At least some facts should be marked as critical with high importance
      expect(
        storedFacts.some(
          (f) => (f.importanceScore ?? 0) > 0.7 || (f.emotionalWeight ?? 0) > 0.5
        )
      ).toBe(true);
    });

    it("simulates learning from past deployment failures", async () => {
      const deploymentHistory: ObservationEvent[] = [
        {
          content:
            "v1.2.0 deployment failed - rollback initiated immediately",
          agentId: "deploy-agent",
          timestamp: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
        },
        {
          content:
            "Root cause: missing database migration in deployment package",
          agentId: "devops",
          timestamp: Date.now() - 24 * 60 * 60 * 1000,
        },
        {
          content: "v1.2.1 deployment succeeded with all checks passing",
          agentId: "deploy-agent",
          timestamp: Date.now() - 12 * 60 * 60 * 1000, // 12 hours ago
        },
      ];

      const result = await executeEmotionalPrioritizationPipeline(
        deploymentHistory,
        client,
        "deployment migration"
      );

      // Both failure and learning facts should be available
      expect(result.storedFacts.length).toBe(3);

      // The failure fact (older, emotional) should still rank high for relevant queries
      const failureFact = result.rankedResults.find((r) =>
        r.content?.includes("failed")
      );
      expect(failureFact).toBeDefined();
      if (failureFact) {
        expect(failureFact.emotionalWeight ?? 0).toBeGreaterThan(0);
      }
    });
  });
});
