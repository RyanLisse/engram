/**
 * Profile Learning Tests
 *
 * Tests the per-agent coefficient profile learning system:
 * - Axis weight computation from fact coefficients
 * - Normalize behavior (sum-to-1, uniform fallback)
 * - Exponential moving average blending (0.7 old + 0.3 new)
 * - Profile convergence over multiple feedback rounds
 * - Per-agent isolation
 * - Edge cases: first feedback, conflicting feedback, empty inputs
 * - Integration: recordFeedback → profile learning flow
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

// ── Mock setup ────────────────────────────────────────────

const {
  mockRecordRecallUsage,
  mockRecordSignal,
  mockGetScopeByName,
  mockLearnAgentProfile,
  mockGetFact,
  mockBoostRelevance,
  makeConvexMock,
} = vi.hoisted(() => {
  const mocks = {
    mockRecordRecallUsage: vi.fn(),
    mockRecordSignal: vi.fn(),
    mockGetScopeByName: vi.fn(),
    mockLearnAgentProfile: vi.fn(),
    mockGetFact: vi.fn(),
    mockBoostRelevance: vi.fn(),
  };
  return {
    ...mocks,
    makeConvexMock: () => ({
      recordRecallUsage: mocks.mockRecordRecallUsage,
      recordSignal: mocks.mockRecordSignal,
      getScopeByName: mocks.mockGetScopeByName,
      learnAgentProfile: mocks.mockLearnAgentProfile,
      getFact: mocks.mockGetFact,
      boostRelevance: mocks.mockBoostRelevance,
      query: vi.fn(),
      mutate: vi.fn(),
    }),
  };
});

// Mock all paths through which convex-client barrel re-exports may resolve
vi.mock("../src/lib/convex-client.js", () => makeConvexMock());
vi.mock("../src/lib/convex-client/index.js", () => makeConvexMock());
vi.mock("../src/lib/convex-client/agents-scopes.js", () => makeConvexMock());
vi.mock("../src/lib/convex-client/signals-config.js", () => makeConvexMock());
vi.mock("../src/lib/convex-client/facts.js", () => makeConvexMock());

import { recordFeedback } from "../src/tools/record-feedback.js";

// ── Pure math replicas (from convex/functions/agentProfiles.ts) ────
// These replicate the exact algorithms used in the Convex mutation so we can
// test the math without needing a live Convex environment.

function normalize(weights: number[]): number[] {
  const sum = weights.reduce((acc, v) => acc + v, 0);
  if (sum <= 1e-12) {
    if (weights.length === 0) return [];
    const uniform = 1 / weights.length;
    return weights.map(() => uniform);
  }
  return weights.map((w) => w / sum);
}

function blend(oldWeights: number[], newWeights: number[]): number[] {
  return normalize(
    newWeights.map((w, i) => {
      const oldW = oldWeights[i] ?? 0;
      return 0.7 * oldW + 0.3 * w;
    }),
  );
}

function computeAxisWeights(coefficientRows: number[][], k: number): number[] {
  const axisWeights = new Array(k).fill(0);
  for (let axis = 0; axis < k; axis++) {
    let total = 0;
    for (const coeffs of coefficientRows) {
      total += Math.abs(coeffs[axis] ?? 0);
    }
    axisWeights[axis] = total / coefficientRows.length;
  }
  return axisWeights;
}

// ── Pure math tests ───────────────────────────────────────

describe("normalize (axis weight normalization)", () => {
  test("normalizes positive weights to sum to 1", () => {
    const result = normalize([2, 3, 5]);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
    expect(result[0]).toBeCloseTo(0.2);
    expect(result[1]).toBeCloseTo(0.3);
    expect(result[2]).toBeCloseTo(0.5);
  });

  test("returns uniform distribution for zero weights", () => {
    const result = normalize([0, 0, 0]);
    expect(result).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  test("returns empty array for empty input", () => {
    expect(normalize([])).toEqual([]);
  });

  test("handles single-element input", () => {
    const result = normalize([42]);
    expect(result).toEqual([1]);
  });

  test("preserves relative proportions", () => {
    const result = normalize([10, 20, 30, 40]);
    expect(result[0]).toBeCloseTo(0.1);
    expect(result[3]).toBeCloseTo(0.4);
  });
});

describe("axis weight computation from fact coefficients", () => {
  test("computes mean absolute coefficients per axis", () => {
    const coefficientRows = [
      [0.8, -0.2, 0.5],  // fact 1 coefficients
      [0.6, 0.4, -0.1],  // fact 2 coefficients
    ];

    const axisWeights = computeAxisWeights(coefficientRows, 3);

    // axis 0: (|0.8| + |0.6|) / 2 = 0.7
    expect(axisWeights[0]).toBeCloseTo(0.7);
    // axis 1: (|-0.2| + |0.4|) / 2 = 0.3
    expect(axisWeights[1]).toBeCloseTo(0.3);
    // axis 2: (|0.5| + |-0.1|) / 2 = 0.3
    expect(axisWeights[2]).toBeCloseTo(0.3);

    const normalized = normalize(axisWeights);
    const sum = normalized.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
    // Axis 0 should dominate
    expect(normalized[0]).toBeGreaterThan(normalized[1]);
  });

  test("single fact produces normalized absolute coefficients", () => {
    const axisWeights = computeAxisWeights([[1.0, 0.0, 0.5]], 3);
    const normalized = normalize(axisWeights);
    // [1.0, 0.0, 0.5] → normalized [1/1.5, 0, 0.5/1.5] = [0.667, 0, 0.333]
    expect(normalized[0]).toBeCloseTo(2 / 3);
    expect(normalized[1]).toBeCloseTo(0);
    expect(normalized[2]).toBeCloseTo(1 / 3);
  });

  test("negative coefficients contribute via absolute value", () => {
    // All negative coefficients should be treated same as positive
    const positiveWeights = computeAxisWeights([[0.5, 0.3, 0.2]], 3);
    const negativeWeights = computeAxisWeights([[-0.5, -0.3, -0.2]], 3);
    expect(positiveWeights).toEqual(negativeWeights);
  });
});

describe("exponential moving average blending", () => {
  test("first round: 0.7 old + 0.3 new, then normalize", () => {
    const oldWeights = normalize([1, 0, 0]); // [1, 0, 0]
    const newWeights = normalize([0, 1, 0]); // [0, 1, 0]

    const blended = blend(oldWeights, newWeights);
    // raw: [0.7*1 + 0.3*0, 0.7*0 + 0.3*1, 0.7*0 + 0.3*0] = [0.7, 0.3, 0]
    // normalized: [0.7, 0.3, 0]
    expect(blended[0]).toBeCloseTo(0.7);
    expect(blended[1]).toBeCloseTo(0.3);
    expect(blended[2]).toBeCloseTo(0.0);
  });

  test("equal old and new produces equal blend", () => {
    const weights = normalize([0.5, 0.3, 0.2]);
    const blended = blend(weights, weights);
    // 0.7w + 0.3w = w, so result should equal input after normalize
    expect(blended[0]).toBeCloseTo(weights[0]);
    expect(blended[1]).toBeCloseTo(weights[1]);
    expect(blended[2]).toBeCloseTo(weights[2]);
  });

  test("repeated blending converges toward new signal", () => {
    let profile = normalize([1, 0, 0]); // starts favoring axis 0
    const signal = normalize([0, 1, 0]); // consistent signal on axis 1

    // Run 20 rounds of blending
    for (let round = 0; round < 20; round++) {
      profile = blend(profile, signal);
    }

    // After many rounds, axis 1 should dominate
    expect(profile[1]).toBeGreaterThan(0.95);
    expect(profile[0]).toBeLessThan(0.05);
  });

  test("convergence rate: after 5 rounds, new signal is dominant", () => {
    let profile = normalize([1, 0, 0]);
    const signal = normalize([0, 1, 0]);

    for (let round = 0; round < 5; round++) {
      profile = blend(profile, signal);
    }

    // After 5 rounds: 0.7^5 ≈ 0.168 remaining of original
    expect(profile[1]).toBeGreaterThan(profile[0]);
  });

  test("conflicting feedback oscillates but eventually settles", () => {
    let profile = normalize([1, 0, 0]);
    const signalA = normalize([0, 1, 0]);
    const signalB = normalize([1, 0, 0]);

    // Alternate between two signals
    for (let round = 0; round < 20; round++) {
      profile = blend(profile, round % 2 === 0 ? signalA : signalB);
    }

    // With alternating signals, neither axis fully dominates
    expect(profile[0]).toBeGreaterThan(0.1);
    expect(profile[1]).toBeGreaterThan(0.1);
  });

  test("exact convergence value matches mathematical expectation", () => {
    // After N rounds of constant signal, old weight = 0.7^N
    let profile = normalize([1, 0]);
    const signal = normalize([0, 1]);

    // After 1 round
    profile = blend(profile, signal);
    expect(profile[0]).toBeCloseTo(0.7); // 0.7^1

    // After 2 rounds
    profile = blend(profile, signal);
    expect(profile[0]).toBeCloseTo(0.49 / (0.49 + 0.51)); // 0.7^2 normalized
  });
});

// ── Per-agent isolation tests ─────────────────────────────

describe("per-agent profile isolation", () => {
  test("different agents get independent profiles", () => {
    // Agent A: uses axis 0 facts
    const agentAWeights = normalize(computeAxisWeights([[1.0, 0.0, 0.0]], 3));
    // Agent B: uses axis 2 facts
    const agentBWeights = normalize(computeAxisWeights([[0.0, 0.0, 1.0]], 3));

    expect(agentAWeights[0]).toBeCloseTo(1.0);
    expect(agentAWeights[2]).toBeCloseTo(0.0);
    expect(agentBWeights[0]).toBeCloseTo(0.0);
    expect(agentBWeights[2]).toBeCloseTo(1.0);

    // Blending agent A's profile with agent B's signal shouldn't affect B
    const agentABlended = blend(agentAWeights, agentBWeights);
    expect(agentABlended[2]).toBeGreaterThan(0);
    expect(agentBWeights[2]).toBeCloseTo(1.0); // B unchanged
  });

  test("parallel learning: two agents converge to different profiles", () => {
    // Agent A consistently uses semantic direction 0
    let profileA = normalize([1 / 3, 1 / 3, 1 / 3]); // uniform start
    const signalA = normalize(computeAxisWeights([[1.0, 0.1, 0.1]], 3));

    // Agent B consistently uses semantic direction 2
    let profileB = normalize([1 / 3, 1 / 3, 1 / 3]); // uniform start
    const signalB = normalize(computeAxisWeights([[0.1, 0.1, 1.0]], 3));

    for (let round = 0; round < 10; round++) {
      profileA = blend(profileA, signalA);
      profileB = blend(profileB, signalB);
    }

    // Each agent should have converged to their own preference
    expect(profileA[0]).toBeGreaterThan(profileA[2]);
    expect(profileB[2]).toBeGreaterThan(profileB[0]);
  });
});

// ── Integration tests (mocked convex) ────────────────────

describe("recordFeedback → profile learning integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordRecallUsage.mockResolvedValue({});
    mockRecordSignal.mockResolvedValue({});
    mockGetFact.mockResolvedValue({ factType: "observation" });
    mockBoostRelevance.mockResolvedValue({});
  });

  test("feedback records usefulness signals for used and unused facts", async () => {
    mockGetScopeByName.mockResolvedValue({ _id: "j_scope_1" });
    mockLearnAgentProfile.mockResolvedValue({ learned: true, learnedFrom: 1 });

    const result = await recordFeedback(
      {
        recallId: "recall-1",
        usedFactIds: ["fact-x"],
        unusedFactIds: ["fact-y"],
      },
      "agent-alpha",
    );

    expect(result).toEqual({ ack: true });

    // Positive signal for used fact
    expect(mockRecordSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        factId: "fact-x",
        signalType: "usefulness",
        value: 1,
      }),
    );

    // Negative signal for unused fact
    expect(mockRecordSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        factId: "fact-y",
        signalType: "usefulness",
        value: 0,
      }),
    );
  });

  test("profile learning is best-effort and never blocks feedback", async () => {
    mockGetScopeByName.mockRejectedValue(new Error("Convex timeout"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await recordFeedback(
      {
        recallId: "recall-2",
        usedFactIds: ["fact-a"],
      },
      "agent-beta",
    );

    // Profile failure should not prevent overall success
    expect(result).toEqual({ ack: true });
    errorSpy.mockRestore();
  });

  test("empty usedFactIds still succeeds", async () => {
    const result = await recordFeedback(
      {
        recallId: "recall-3",
        usedFactIds: [],
      },
      "agent-gamma",
    );

    expect(result).toEqual({ ack: true });
    // No usefulness signals should be recorded for empty list
    expect(mockRecordSignal).not.toHaveBeenCalled();
  });

  test("feedback records recall usage first", async () => {
    await recordFeedback(
      {
        recallId: "recall-4",
        usedFactIds: ["fact-a"],
        unusedFactIds: ["fact-b"],
      },
      "agent-delta",
    );

    expect(mockRecordRecallUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        recallId: "recall-4",
        usedFactIds: ["fact-a"],
        unusedFactIds: ["fact-b"],
      }),
    );
  });
});

// ── Edge cases ────────────────────────────────────────────

describe("edge cases", () => {
  test("first feedback for new agent creates profile from scratch", () => {
    // When no existing profile, weights = normalize(mean_abs_coefficients)
    const axisWeights = computeAxisWeights([[0.3, 0.7]], 2);
    const normalized = normalize(axisWeights);

    // No blending — first profile is just the normalized signal
    expect(normalized[0]).toBeCloseTo(0.3);
    expect(normalized[1]).toBeCloseTo(0.7);
  });

  test("all-zero coefficients produce uniform weights", () => {
    const axisWeights = computeAxisWeights([[0, 0, 0]], 3);
    const normalized = normalize(axisWeights);
    expect(normalized).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  test("blending with all-zero new signal preserves old profile shape", () => {
    const oldProfile = normalize([0.8, 0.1, 0.1]);
    const zeroSignal = normalize([0, 0, 0]); // → [1/3, 1/3, 1/3]

    const blended = blend(oldProfile, zeroSignal);

    // Old profile should still dominate (70% weight)
    expect(blended[0]).toBeGreaterThan(blended[1]);
    expect(blended[0]).toBeGreaterThan(blended[2]);
  });

  test("very large coefficient values still normalize correctly", () => {
    const axisWeights = computeAxisWeights([[1e6, 1e-6, 500]], 3);
    const normalized = normalize(axisWeights);
    const sum = normalized.reduce((a, b) => a + b, 0);

    expect(sum).toBeCloseTo(1.0);
    expect(normalized[0]).toBeGreaterThan(0.99);
  });

  test("mismatched coefficient length pads with zero", () => {
    const shortCoeffs = [0.5, 0.3]; // only 2 coefficients for k=4
    const k = 4;

    const axisWeights = new Array(k).fill(0);
    for (let axis = 0; axis < k; axis++) {
      axisWeights[axis] = Math.abs(shortCoeffs[axis] ?? 0);
    }
    const normalized = normalize(axisWeights);

    expect(normalized[2]).toBeCloseTo(0);
    expect(normalized[3]).toBeCloseTo(0);
    expect(normalized[0]).toBeGreaterThan(0);
    expect(normalized[1]).toBeGreaterThan(0);
  });

  test("many facts average out to stable weights", () => {
    // 100 facts with random-ish coefficients should produce stable weights
    const coefficientRows: number[][] = [];
    for (let i = 0; i < 100; i++) {
      // Systematic pattern: axis 0 always dominant
      coefficientRows.push([0.8 + (i % 10) * 0.01, 0.2, 0.1]);
    }

    const axisWeights = computeAxisWeights(coefficientRows, 3);
    const normalized = normalize(axisWeights);

    // Axis 0 should be clearly dominant
    expect(normalized[0]).toBeGreaterThan(0.6);
    expect(normalized[0]).toBeGreaterThan(normalized[1]);
    expect(normalized[0]).toBeGreaterThan(normalized[2]);
  });
});
