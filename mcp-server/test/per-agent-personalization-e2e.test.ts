/**
 * E2E tests: Per-agent personalization
 *
 * Tests the full feedback → profile-learning → ranking-influence pipeline:
 *   recordFeedback (MCP tool)
 *     → recordRecallUsage, recordSignal (signal recording)
 *     → boostRelevance (decision/insight decay loop)
 *     → learnAgentProfile (profile weight update)
 *   Profile weights (axisWeights)
 *     → compactCosineSimilarity (weighted similarity per agent profile)
 *     → profile-influenced ranking
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

// ── Mock hoisting ────────────────────────────────────────────────────
const {
  mockRecordRecallUsage,
  mockRecordSignal,
  mockGetFact,
  mockBoostRelevance,
  mockGetScopeByName,
  mockLearnAgentProfile,
} = vi.hoisted(() => ({
  mockRecordRecallUsage: vi.fn(),
  mockRecordSignal: vi.fn(),
  mockGetFact: vi.fn(),
  mockBoostRelevance: vi.fn(),
  mockGetScopeByName: vi.fn(),
  mockLearnAgentProfile: vi.fn(),
}));

vi.mock("../src/lib/convex-client.js", () => ({
  recordRecallUsage: mockRecordRecallUsage,
  recordSignal: mockRecordSignal,
  getFact: mockGetFact,
  boostRelevance: mockBoostRelevance,
  getScopeByName: mockGetScopeByName,
  learnAgentProfile: mockLearnAgentProfile,
}));

import { recordFeedback } from "../src/tools/record-feedback.js";
import { compactCosineSimilarity } from "../src/lib/svd-consolidation.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeFact(id: string, factType: string) {
  return { _id: id, factType };
}

function makeScope(id: string, name: string) {
  return { _id: id, name };
}

// Simulates the profile learning math from learnAgentProfileHelper:
// computes mean abs coefficient per axis then normalizes.
function computeNormalizedWeights(coeffRows: number[][], k: number): number[] {
  const raw = Array(k).fill(0);
  for (let axis = 0; axis < k; axis++) {
    let total = 0;
    for (const row of coeffRows) {
      total += Math.abs(row[axis] ?? 0);
    }
    raw[axis] = total / coeffRows.length;
  }
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 1e-12) {
    return raw.map(() => 1 / k);
  }
  return raw.map((w) => w / sum);
}

// Simulates the 0.7/0.3 blend update and renormalization.
function blendAndNormalize(oldWeights: number[], newWeights: number[]): number[] {
  const blended = oldWeights.map((w, i) => 0.7 * w + 0.3 * (newWeights[i] ?? 0));
  const sum = blended.reduce((a, b) => a + b, 0);
  return sum <= 1e-12 ? blended : blended.map((w) => w / sum);
}

// ── Suite 1: Signal recording ─────────────────────────────────────────

describe("recordFeedback — signal recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordRecallUsage.mockResolvedValue(undefined);
    mockRecordSignal.mockResolvedValue(undefined);
    mockGetFact.mockResolvedValue(null);
    mockBoostRelevance.mockResolvedValue(undefined);
    mockGetScopeByName.mockResolvedValue(null);
    mockLearnAgentProfile.mockResolvedValue({ learned: false, reason: "No subspace" });
  });

  test("records positive usefulness signal (value=1) for every used fact", async () => {
    const result = await recordFeedback(
      { recallId: "recall-1", usedFactIds: ["fact-a", "fact-b", "fact-c"] },
      "agent-1",
    );

    expect(result).toEqual({ ack: true });

    const positiveCalls = mockRecordSignal.mock.calls.filter(
      ([args]) => args.signalType === "usefulness" && args.value === 1,
    );
    expect(positiveCalls).toHaveLength(3);
    const recordedFactIds = positiveCalls.map(([args]) => args.factId);
    expect(recordedFactIds).toContain("fact-a");
    expect(recordedFactIds).toContain("fact-b");
    expect(recordedFactIds).toContain("fact-c");
  });

  test("records negative usefulness signal (value=0) for every unused fact", async () => {
    const result = await recordFeedback(
      {
        recallId: "recall-2",
        usedFactIds: ["fact-used"],
        unusedFactIds: ["fact-x", "fact-y"],
      },
      "agent-1",
    );

    expect(result).toEqual({ ack: true });

    const negativeCalls = mockRecordSignal.mock.calls.filter(
      ([args]) => args.signalType === "usefulness" && args.value === 0,
    );
    expect(negativeCalls).toHaveLength(2);
    const ids = negativeCalls.map(([args]) => args.factId);
    expect(ids).toContain("fact-x");
    expect(ids).toContain("fact-y");
  });

  test("signal context encodes the recallId for traceability", async () => {
    await recordFeedback(
      { recallId: "recall-xyz", usedFactIds: ["fact-1"] },
      "agent-1",
    );

    const signalArgs = mockRecordSignal.mock.calls[0][0];
    expect(signalArgs.context).toBe("recall:recall-xyz");
  });

  test("no signals recorded when both usedFactIds and unusedFactIds are empty", async () => {
    await recordFeedback(
      { recallId: "recall-empty", usedFactIds: [] },
      "agent-1",
    );

    expect(mockRecordSignal).not.toHaveBeenCalled();
  });

  test("recordRecallUsage is always called with full args regardless of fact counts", async () => {
    await recordFeedback(
      {
        recallId: "recall-3",
        usedFactIds: ["fact-used"],
        unusedFactIds: ["fact-unused"],
      },
      "agent-2",
    );

    expect(mockRecordRecallUsage).toHaveBeenCalledWith({
      recallId: "recall-3",
      agentId: "agent-2",
      usedFactIds: ["fact-used"],
      unusedFactIds: ["fact-unused"],
    });
  });
});

// ── Suite 2: Profile learning integration ─────────────────────────────

describe("recordFeedback — profile learning integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordRecallUsage.mockResolvedValue(undefined);
    mockRecordSignal.mockResolvedValue(undefined);
    mockGetFact.mockResolvedValue(null);
    mockBoostRelevance.mockResolvedValue(undefined);
  });

  test("learnAgentProfile is called with the agent's private scope ID and usedFactIds", async () => {
    const scope = makeScope("scope_a1", "private-agent-A");
    mockGetScopeByName.mockResolvedValue(scope);
    mockLearnAgentProfile.mockResolvedValue({
      learned: true,
      axisWeights: [0.7, 0.2, 0.1],
      learnedFrom: 1,
    });

    await recordFeedback(
      { recallId: "recall-1", usedFactIds: ["fact-tech-1", "fact-tech-2"] },
      "agent-A",
    );

    expect(mockGetScopeByName).toHaveBeenCalledWith("private-agent-A");
    expect(mockLearnAgentProfile).toHaveBeenCalledWith({
      agentId: "agent-A",
      scopeId: "scope_a1",
      usedFactIds: ["fact-tech-1", "fact-tech-2"],
    });
  });

  test("agent isolation: agent B's feedback calls learnAgentProfile with agent B's scope only", async () => {
    const scopeA = makeScope("scope_a1", "private-agent-A");
    const scopeB = makeScope("scope_b1", "private-agent-B");

    // Agent A feedback
    mockGetScopeByName.mockResolvedValueOnce(scopeA);
    mockLearnAgentProfile.mockResolvedValueOnce({
      learned: true, axisWeights: [0.8, 0.1, 0.1], learnedFrom: 1,
    });
    await recordFeedback({ recallId: "recall-a", usedFactIds: ["fact-1"] }, "agent-A");

    // Agent B feedback
    mockGetScopeByName.mockResolvedValueOnce(scopeB);
    mockLearnAgentProfile.mockResolvedValueOnce({
      learned: true, axisWeights: [0.2, 0.6, 0.2], learnedFrom: 1,
    });
    await recordFeedback({ recallId: "recall-b", usedFactIds: ["fact-2"] }, "agent-B");

    const learnCalls = mockLearnAgentProfile.mock.calls;
    expect(learnCalls).toHaveLength(2);

    const callA = learnCalls[0][0];
    const callB = learnCalls[1][0];

    // Each agent only touches its own scope
    expect(callA.agentId).toBe("agent-A");
    expect(callA.scopeId).toBe("scope_a1");
    expect(callB.agentId).toBe("agent-B");
    expect(callB.scopeId).toBe("scope_b1");

    // Agent A's used facts are NOT passed to agent B's profile update
    expect(callB.usedFactIds).not.toContain("fact-1");
    expect(callA.usedFactIds).not.toContain("fact-2");
  });

  test("profile learning is skipped when the agent's scope is not found", async () => {
    mockGetScopeByName.mockResolvedValue(null);

    const result = await recordFeedback(
      { recallId: "recall-no-scope", usedFactIds: ["fact-1"] },
      "agent-unknown",
    );

    // Should still succeed — profile learning is best-effort
    expect(result).toEqual({ ack: true });
    expect(mockLearnAgentProfile).not.toHaveBeenCalled();
  });

  test("profile learning is skipped when usedFactIds is empty", async () => {
    const scope = makeScope("scope_x", "private-agent-X");
    mockGetScopeByName.mockResolvedValue(scope);

    await recordFeedback(
      { recallId: "recall-no-used", usedFactIds: [], unusedFactIds: ["fact-bad"] },
      "agent-X",
    );

    // The profile learning condition: `input.usedFactIds.length > 0`
    expect(mockLearnAgentProfile).not.toHaveBeenCalled();
  });

  test("profile learning failure does not fail the overall feedback recording", async () => {
    const scope = makeScope("scope_err", "private-agent-err");
    mockGetScopeByName.mockResolvedValue(scope);
    mockLearnAgentProfile.mockRejectedValue(new Error("DB timeout"));

    const result = await recordFeedback(
      { recallId: "recall-err", usedFactIds: ["fact-1"] },
      "agent-err",
    );

    // Best-effort: error is swallowed, feedback still acknowledged
    expect(result).toEqual({ ack: true });
  });
});

// ── Suite 3: Decay loop (decision/insight boost) ──────────────────────

describe("recordFeedback — decision/insight decay loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordRecallUsage.mockResolvedValue(undefined);
    mockRecordSignal.mockResolvedValue(undefined);
    mockBoostRelevance.mockResolvedValue(undefined);
    mockGetScopeByName.mockResolvedValue(null);
    mockLearnAgentProfile.mockResolvedValue({ learned: false });
  });

  test("used decision fact gets +0.05 boost", async () => {
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact-decision") return makeFact("fact-decision", "decision");
      return null;
    });

    await recordFeedback(
      { recallId: "r1", usedFactIds: ["fact-decision"] },
      "agent-1",
    );

    expect(mockBoostRelevance).toHaveBeenCalledWith({
      factId: "fact-decision",
      boost: 0.05,
    });
  });

  test("used insight fact gets +0.05 boost", async () => {
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact-insight") return makeFact("fact-insight", "insight");
      return null;
    });

    await recordFeedback(
      { recallId: "r2", usedFactIds: ["fact-insight"] },
      "agent-1",
    );

    expect(mockBoostRelevance).toHaveBeenCalledWith({
      factId: "fact-insight",
      boost: 0.05,
    });
  });

  test("unused decision fact gets -0.05 decay", async () => {
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact-unused-decision") return makeFact("fact-unused-decision", "decision");
      return null;
    });

    await recordFeedback(
      { recallId: "r3", usedFactIds: [], unusedFactIds: ["fact-unused-decision"] },
      "agent-1",
    );

    expect(mockBoostRelevance).toHaveBeenCalledWith({
      factId: "fact-unused-decision",
      boost: -0.05,
    });
  });

  test("regular observation fact is NOT boosted or decayed", async () => {
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact-obs") return makeFact("fact-obs", "observation");
      return null;
    });

    await recordFeedback(
      { recallId: "r4", usedFactIds: ["fact-obs"] },
      "agent-1",
    );

    expect(mockBoostRelevance).not.toHaveBeenCalled();
  });

  test("mixed feedback: used decision boosted, unused insight decayed, regular untouched", async () => {
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact-used-decision") return makeFact("fact-used-decision", "decision");
      if (id === "fact-unused-insight") return makeFact("fact-unused-insight", "insight");
      if (id === "fact-plain") return makeFact("fact-plain", "note");
      return null;
    });

    await recordFeedback(
      {
        recallId: "r5",
        usedFactIds: ["fact-used-decision", "fact-plain"],
        unusedFactIds: ["fact-unused-insight"],
      },
      "agent-1",
    );

    const boostCalls = mockBoostRelevance.mock.calls;
    // decision used → +0.05
    expect(boostCalls).toContainEqual([{ factId: "fact-used-decision", boost: 0.05 }]);
    // insight unused → -0.05
    expect(boostCalls).toContainEqual([{ factId: "fact-unused-insight", boost: -0.05 }]);
    // regular note → not boosted
    const plainCall = boostCalls.find(([a]) => a.factId === "fact-plain");
    expect(plainCall).toBeUndefined();
  });
});

// ── Suite 4: Profile math — weight convergence ────────────────────────

describe("profile weight convergence math", () => {
  // These tests exercise the learnAgentProfileHelper algorithm in pure JS
  // without the Convex stack, by re-implementing the math from agentProfiles.ts.

  test("first feedback produces axis weights proportional to used fact coefficients", () => {
    // Fact with strong axis-0 coefficient: [0.9, 0.05, 0.05]
    const technicalCoeffs = [[0.9, 0.05, 0.05]];
    const weights = computeNormalizedWeights(technicalCoeffs, 3);

    // Axis 0 should dominate
    expect(weights[0]).toBeGreaterThan(weights[1]);
    expect(weights[0]).toBeGreaterThan(weights[2]);
    // Normalized: sum = 1
    const sum = weights.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  test("default profile with uniform fact coefficients yields roughly equal weights", () => {
    // Uniformly distributed coefficients → equal axis weights
    const uniformCoeffs = [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5]];
    const weights = computeNormalizedWeights(uniformCoeffs, 3);

    // Each axis should be roughly 1/3
    expect(weights[0]).toBeCloseTo(1 / 3, 3);
    expect(weights[1]).toBeCloseTo(1 / 3, 3);
    expect(weights[2]).toBeCloseTo(1 / 3, 3);
  });

  test("repeated feedback on same axis converges profile toward that axis", () => {
    // Start from uniform profile (no preference), then repeatedly apply technical feedback.
    // The 0.7/0.3 EMA blend has a fixed point at the feedback target — after enough rounds,
    // the profile converges to computeNormalizedWeights(technicalCoeffs).
    const technicalCoeffs = [[0.9, 0.1, 0.0]];
    const targetWeights = computeNormalizedWeights(technicalCoeffs, 3);

    // Initial uniform profile: equal weight on all 3 axes
    let profile = [1 / 3, 1 / 3, 1 / 3];
    const initialAxis0 = profile[0]; // = 0.333

    // Apply 10 rounds of technical feedback blending
    for (let round = 0; round < 10; round++) {
      profile = blendAndNormalize(profile, targetWeights);
    }

    // After 10 rounds, axis-0 weight should be much larger than the initial uniform weight
    expect(profile[0]).toBeGreaterThan(initialAxis0);
    expect(profile[0]).toBeGreaterThan(profile[1]);
    expect(profile[0]).toBeGreaterThan(profile[2]);

    // Continue to convergence: profile approaches targetWeights
    for (let round = 0; round < 50; round++) {
      profile = blendAndNormalize(profile, targetWeights);
    }
    expect(profile[0]).toBeCloseTo(targetWeights[0], 1);
  });

  test("agent A and agent B have independent profiles that diverge under different feedback", () => {
    const technicalCoeffs = [[0.9, 0.1, 0.0]]; // agent A: technical axis
    const socialCoeffs = [[0.0, 0.1, 0.9]];     // agent B: social axis

    let profileA = computeNormalizedWeights(technicalCoeffs, 3);
    let profileB = computeNormalizedWeights(socialCoeffs, 3);

    // Each agent receives 3 rounds of their respective feedback
    for (let i = 0; i < 3; i++) {
      profileA = blendAndNormalize(profileA, computeNormalizedWeights(technicalCoeffs, 3));
      profileB = blendAndNormalize(profileB, computeNormalizedWeights(socialCoeffs, 3));
    }

    // Agent A prioritizes axis 0; agent B prioritizes axis 2
    expect(profileA[0]).toBeGreaterThan(profileA[2]);
    expect(profileB[2]).toBeGreaterThan(profileB[0]);

    // Profiles are meaningfully different
    const diff = Math.abs(profileA[0] - profileB[0]);
    expect(diff).toBeGreaterThan(0.3);
  });

  test("mixed positive/negative feedback balances axis weights between technical and social", () => {
    // Agent receives both technical (axis 0) and social (axis 2) facts as used.
    // Both facts contribute equally to their own dominant axis, so axis 0 ≈ axis 2,
    // while axis 1 (unused by both facts) gets much lower weight.
    const mixedCoeffs = [
      [0.8, 0.1, 0.1], // technical fact — dominant on axis 0
      [0.1, 0.1, 0.8], // social fact    — dominant on axis 2
    ];
    const weights = computeNormalizedWeights(mixedCoeffs, 3);

    // Axis 0 and axis 2 should be approximately equal (both contributed equally)
    expect(weights[0]).toBeCloseTo(weights[2], 1);

    // Axis 1 gets the least weight (neither fact uses it heavily)
    expect(weights[1]).toBeLessThan(weights[0]);
    expect(weights[1]).toBeLessThan(weights[2]);
  });
});

// ── Suite 5: Profile influence on ranking via compactCosineSimilarity ──

describe("profile influence on retrieval ranking", () => {
  // compactCosineSimilarity(a, b, weights) computes weighted cosine similarity.
  // Agent profile axisWeights serve as the 'componentVariances' argument,
  // directing similarity scoring toward the agent's learned semantic axes.

  test("technical agent profile (heavy axis-0) ranks technical fact above general fact", () => {
    const technicalProfile = [0.8, 0.1, 0.1]; // axis-0 dominant

    // Query projected into compact space: also axis-0 dominant (technical query)
    const queryCompact = [0.9, 0.1, 0.0];

    // Technical fact: strong axis-0 coefficient
    const technicalFact = [0.85, 0.1, 0.05];
    // General fact: balanced coefficients
    const generalFact = [0.3, 0.4, 0.3];

    const techScore = compactCosineSimilarity(queryCompact, technicalFact, technicalProfile);
    const genScore = compactCosineSimilarity(queryCompact, generalFact, technicalProfile);

    expect(techScore).toBeGreaterThan(genScore);
  });

  test("uniform profile (no preference) gives nearly equal scores for balanced facts", () => {
    const uniformProfile = [1 / 3, 1 / 3, 1 / 3];

    const queryCompact = [0.7, 0.5, 0.5];
    const factA = [0.8, 0.4, 0.4]; // slightly axis-0 leaning
    const factB = [0.4, 0.8, 0.4]; // slightly axis-1 leaning

    const scoreA = compactCosineSimilarity(queryCompact, factA, uniformProfile);
    const scoreB = compactCosineSimilarity(queryCompact, factB, uniformProfile);

    // With uniform weights, the difference is only from raw similarity, not profile preference
    // Both should be in a similar range (within 0.15 of each other)
    expect(Math.abs(scoreA - scoreB)).toBeLessThan(0.15);
  });

  test("agent A (technical profile) and agent B (social profile) rank same facts differently", () => {
    const profileA = [0.8, 0.1, 0.1]; // technical
    const profileB = [0.1, 0.1, 0.8]; // social

    const queryCompact = [0.5, 0.3, 0.5]; // neutral query

    const technicalFact = [0.9, 0.05, 0.05];
    const socialFact = [0.05, 0.05, 0.9];

    const techScoreForA = compactCosineSimilarity(queryCompact, technicalFact, profileA);
    const socialScoreForA = compactCosineSimilarity(queryCompact, socialFact, profileA);

    const techScoreForB = compactCosineSimilarity(queryCompact, technicalFact, profileB);
    const socialScoreForB = compactCosineSimilarity(queryCompact, socialFact, profileB);

    // Agent A (technical profile): technical fact ranks higher
    expect(techScoreForA).toBeGreaterThan(socialScoreForA);

    // Agent B (social profile): social fact ranks higher
    expect(socialScoreForB).toBeGreaterThan(techScoreForB);
  });

  test("profile personalization changes ranking outcome for ambiguous queries", () => {
    // An ambiguous query (axis 1 dominant) has two candidate facts:
    // one axis-0 (technical) and one axis-2 (social).
    // A fresh agent (uniform) ranks them by raw cosine similarity.
    // A technical agent (axis-0 profile) re-ranks, promoting the technical fact.
    const uniformProfile = [1 / 3, 1 / 3, 1 / 3];

    // Converged technical profile: axis-0 dominant
    const technicalCoeffs = [[0.9, 0.05, 0.05]];
    let technicalProfile = computeNormalizedWeights(technicalCoeffs, 3);
    for (let i = 0; i < 20; i++) {
      technicalProfile = blendAndNormalize(technicalProfile, computeNormalizedWeights(technicalCoeffs, 3));
    }

    // Ambiguous query: primarily axis-1 (cross-cutting)
    const ambiguousQuery = [0.2, 0.8, 0.2];

    // Fact A: technical (axis-0 dominant but has some axis-1)
    const technicalFact = [0.7, 0.4, 0.1];
    // Fact B: social (axis-2 dominant but has some axis-1)
    const socialFact = [0.1, 0.4, 0.7];

    // With uniform weights, both facts are nearly symmetric — ranked by axis-1 match
    const uniformTechScore = compactCosineSimilarity(ambiguousQuery, technicalFact, uniformProfile);
    const uniformSocialScore = compactCosineSimilarity(ambiguousQuery, socialFact, uniformProfile);

    // With the technical profile (axis-0 heavy), the technical fact gets a boost
    const personalizedTechScore = compactCosineSimilarity(ambiguousQuery, technicalFact, technicalProfile);
    const personalizedSocialScore = compactCosineSimilarity(ambiguousQuery, socialFact, technicalProfile);

    // Personalized agent ranks technical above social
    expect(personalizedTechScore).toBeGreaterThan(personalizedSocialScore);

    // Uniform agent: axis-1 overlap is nearly equal, gap is minimal
    const uniformGap = Math.abs(uniformTechScore - uniformSocialScore);
    const personalizedGap = Math.abs(personalizedTechScore - personalizedSocialScore);

    // Personalization produces a more decisive ranking gap
    expect(personalizedGap).toBeGreaterThan(uniformGap);
  });

  test("subsequent recall simulation: agent A gets technical facts prioritized after feedback", async () => {
    // Full simulation of the personalization loop for agent A:
    // 1. Agent A provides feedback on technical facts
    // 2. Profile is updated (mocked to return technical axis weights)
    // 3. On subsequent recall, technical facts score higher under the agent's profile

    vi.clearAllMocks();
    mockRecordRecallUsage.mockResolvedValue(undefined);
    mockRecordSignal.mockResolvedValue(undefined);
    mockGetFact.mockResolvedValue(null);
    mockBoostRelevance.mockResolvedValue(undefined);

    const agentAScope = makeScope("scope-A", "private-agent-A");
    mockGetScopeByName.mockResolvedValue(agentAScope);

    // Profile after feedback: axis-0 dominant (technical)
    const agentAProfile = [0.75, 0.15, 0.10];
    mockLearnAgentProfile.mockResolvedValue({
      learned: true,
      axisWeights: agentAProfile,
      learnedFrom: 3,
    });

    // Step 1: Agent A provides positive feedback on technical facts
    await recordFeedback(
      { recallId: "recall-tech", usedFactIds: ["fact-tech-1", "fact-tech-2"] },
      "agent-A",
    );

    // Verify profile was updated
    expect(mockLearnAgentProfile).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-A" }),
    );

    // Step 2: Subsequent recall — rank candidate facts using the learned profile
    const queryCompact = [0.8, 0.15, 0.05];

    const candidateFacts = [
      { id: "fact-technical", compact: [0.85, 0.10, 0.05] },
      { id: "fact-general", compact: [0.35, 0.35, 0.30] },
      { id: "fact-social", compact: [0.05, 0.15, 0.80] },
    ];

    const scored = candidateFacts
      .map((f) => ({
        id: f.id,
        score: compactCosineSimilarity(queryCompact, f.compact, agentAProfile),
      }))
      .sort((a, b) => b.score - a.score);

    // Technical fact ranks first for agent A
    expect(scored[0].id).toBe("fact-technical");
    // Social fact ranks last for agent A
    expect(scored[scored.length - 1].id).toBe("fact-social");
  });
});
