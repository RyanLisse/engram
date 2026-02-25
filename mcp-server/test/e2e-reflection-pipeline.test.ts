/**
 * E2E: Reflection Pipeline
 *
 * Tests the complete pipeline flow: Observe → Compress → Reflect
 * Mocked at the Convex boundary (convex-client.js).
 *
 * Pipeline:
 *   memory_om_status     → getObservationSession (check pending observation buffer)
 *   memory_observe_compress → runObserver (batch observations into summaries)
 *   memory_reflect       → runReflector (digest summaries into reflection facts)
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

// ── Mock hoisting ─────────────────────────────────────────────────────────────
const {
  mockGetScopeByName,
  mockGetAgentByAgentId,
  mockGetObservationSession,
  mockRunObserver,
  mockRunReflector,
} = vi.hoisted(() => ({
  mockGetScopeByName: vi.fn(),
  mockGetAgentByAgentId: vi.fn(),
  mockGetObservationSession: vi.fn(),
  mockRunObserver: vi.fn(),
  mockRunReflector: vi.fn(),
}));

vi.mock("../src/lib/convex-client.js", () => ({
  getScopeByName: mockGetScopeByName,
  getAgentByAgentId: mockGetAgentByAgentId,
  getObservationSession: mockGetObservationSession,
  runObserver: mockRunObserver,
  runReflector: mockRunReflector,
}));

import { omStatus, observeCompress, reflect } from "../src/tools/observation-memory.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SCOPE_ID = "jscope_e2e_reflect_001";
const AGENT_ID = "agent-e2e-reflect";
const SCOPE_NAME = `private-${AGENT_ID}`;

function makeScope() {
  return { _id: SCOPE_ID, name: SCOPE_NAME };
}

function makeObservationSession(overrides: Record<string, unknown> = {}) {
  return {
    pendingTokenEstimate: 800,
    summaryTokenEstimate: 200,
    observerThreshold: 1000,
    reflectorThreshold: 500,
    compressionLevel: 1,
    observerGeneration: 2,
    reflectorGeneration: 1,
    bufferReady: false,
    lastObserverRun: Date.now() - 2 * 60 * 60 * 1000,
    lastReflectorRun: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("E2E: Reflection Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScopeByName.mockResolvedValue(makeScope());
    // Default: no agent defaultScope — falls back to getScopeByName
    mockGetAgentByAgentId.mockResolvedValue(null);
  });

  // ── 1. Observe → Compress → Reflect cycle ────────────────────────────────

  describe("Observe → Compress → Reflect cycle", () => {
    test("full pipeline: status shows pending observations, compress batches them, reflect creates digest", async () => {
      // Step 1: om_status — observation buffer is filling up
      mockGetObservationSession.mockResolvedValue(
        makeObservationSession({ pendingTokenEstimate: 950, bufferReady: true })
      );

      const status = await omStatus({ scopeId: SCOPE_NAME }, AGENT_ID);

      expect(status).not.toHaveProperty("isError");
      expect((status as any).active).toBe(true);
      expect((status as any).pendingTokens).toBe(950);
      expect((status as any).pendingPercentage).toBe(95); // 950/1000 * 100

      // Step 2: observe_compress — observer batches pending into summaries
      mockRunObserver.mockResolvedValue({
        skipped: false,
        observedCount: 12,
        summaryTokens: 180,
        generation: 3,
      });

      const compressResult = await observeCompress({ scopeId: SCOPE_NAME }, AGENT_ID);

      expect(compressResult).not.toHaveProperty("isError");
      expect((compressResult as any).skipped).toBe(false);
      expect((compressResult as any).observedCount).toBe(12);
      // Observer was called with the resolved Convex scope ID
      expect(mockRunObserver).toHaveBeenCalledWith(SCOPE_ID, AGENT_ID, undefined);

      // Step 3: reflect — reflector processes summaries, creates digest fact
      mockRunReflector.mockResolvedValue({
        skipped: false,
        inputSummaries: 3,
        digestFactId: "jfact_digest_001",
        timeWindowHours: 168,
      });

      const reflectResult = await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);

      expect(reflectResult).not.toHaveProperty("isError");
      expect((reflectResult as any).skipped).toBe(false);
      expect((reflectResult as any).digestFactId).toBe("jfact_digest_001");
      expect(mockRunReflector).toHaveBeenCalledWith(
        SCOPE_ID,
        AGENT_ID,
        expect.objectContaining({ timeWindowHours: 168 })
      );
    });

    test("scope resolution is consistent across all three pipeline steps", async () => {
      mockGetObservationSession.mockResolvedValue(makeObservationSession());
      mockRunObserver.mockResolvedValue({ skipped: false, observedCount: 3 });
      mockRunReflector.mockResolvedValue({ skipped: false, inputSummaries: 1 });

      await omStatus({ scopeId: SCOPE_NAME }, AGENT_ID);
      await observeCompress({ scopeId: SCOPE_NAME }, AGENT_ID);
      await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);

      // All three steps resolved to the same SCOPE_ID
      expect(mockGetObservationSession).toHaveBeenCalledWith(SCOPE_ID, AGENT_ID);
      expect(mockRunObserver).toHaveBeenCalledWith(SCOPE_ID, AGENT_ID, undefined);
      expect(mockRunReflector).toHaveBeenCalledWith(SCOPE_ID, AGENT_ID, expect.any(Object));
    });

    test("compress + reflect on default scope (no scopeId arg) resolves via agent defaultScope", async () => {
      // Agent has a defaultScope set — no getScopeByName needed
      mockGetAgentByAgentId.mockResolvedValue({
        agentId: AGENT_ID,
        defaultScope: SCOPE_ID,
      });
      mockRunObserver.mockResolvedValue({ skipped: false, observedCount: 4 });
      mockRunReflector.mockResolvedValue({ skipped: false, inputSummaries: 1 });

      const compressResult = await observeCompress({}, AGENT_ID);
      const reflectResult = await reflect({}, AGENT_ID);

      expect(compressResult).not.toHaveProperty("isError");
      expect(reflectResult).not.toHaveProperty("isError");
      expect(mockRunObserver).toHaveBeenCalledWith(SCOPE_ID, AGENT_ID, undefined);
      expect(mockRunReflector).toHaveBeenCalledWith(SCOPE_ID, AGENT_ID, expect.any(Object));
    });

    test("compression level propagates from observeCompress to runObserver", async () => {
      mockRunObserver.mockResolvedValue({ skipped: false, observedCount: 5 });

      await observeCompress({ scopeId: SCOPE_NAME, compressionLevel: 2 }, AGENT_ID);

      expect(mockRunObserver).toHaveBeenCalledWith(SCOPE_ID, AGENT_ID, 2);
    });
  });

  // ── 2. Reflection creates facts ──────────────────────────────────────────

  describe("Reflection creates facts with correct metadata", () => {
    test("reflect returns digestFactId when reflector creates a fact", async () => {
      mockRunReflector.mockResolvedValue({
        skipped: false,
        inputSummaries: 5,
        digestFactId: "jfact_digest_abc",
        timeWindowHours: 168,
      });

      const result = await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);

      expect((result as any).digestFactId).toBe("jfact_digest_abc");
      expect((result as any).skipped).toBe(false);
    });

    test("reflector receives correct timeWindowHours as the create-fact parameter", async () => {
      mockRunReflector.mockResolvedValue({ skipped: false, inputSummaries: 4, digestFactId: "jfact_d" });

      await reflect({ scopeId: SCOPE_NAME, depth: "standard" }, AGENT_ID);

      expect(mockRunReflector).toHaveBeenCalledWith(
        SCOPE_ID, AGENT_ID,
        expect.objectContaining({ timeWindowHours: 168 })
      );
    });

    test("reflector result includes inputSummaries (reflects how many observations were digested)", async () => {
      mockRunReflector.mockResolvedValue({
        skipped: false,
        inputSummaries: 7,
        digestFactId: "jfact_e2e_001",
      });

      const result = await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);

      expect((result as any).inputSummaries).toBe(7);
    });

    test("skipped=false on first call (creates fact), skipped=true on second (dedup in same window)", async () => {
      mockRunReflector
        .mockResolvedValueOnce({ skipped: false, digestFactId: "jfact_new" })
        .mockResolvedValueOnce({ skipped: true, reason: "Already reflected recently" });

      const firstResult = await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);
      const secondResult = await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);

      expect((firstResult as any).skipped).toBe(false);
      expect((firstResult as any).digestFactId).toBeDefined();
      expect((secondResult as any).skipped).toBe(true);
    });
  });

  // ── 3. Depth parameter propagation ──────────────────────────────────────

  describe("Depth parameter propagation to timeWindowHours", () => {
    test("shallow depth → 6 hours timeWindow", async () => {
      mockRunReflector.mockResolvedValue({ skipped: false });

      await reflect({ scopeId: SCOPE_NAME, depth: "shallow" }, AGENT_ID);

      expect(mockRunReflector).toHaveBeenCalledWith(
        SCOPE_ID, AGENT_ID,
        expect.objectContaining({ timeWindowHours: 6 })
      );
    });

    test("standard depth → 168 hours (1 week) timeWindow", async () => {
      mockRunReflector.mockResolvedValue({ skipped: false });

      await reflect({ scopeId: SCOPE_NAME, depth: "standard" }, AGENT_ID);

      expect(mockRunReflector).toHaveBeenCalledWith(
        SCOPE_ID, AGENT_ID,
        expect.objectContaining({ timeWindowHours: 168 })
      );
    });

    test("deep depth → 720 hours (30 days) timeWindow", async () => {
      mockRunReflector.mockResolvedValue({ skipped: false });

      await reflect({ scopeId: SCOPE_NAME, depth: "deep" }, AGENT_ID);

      expect(mockRunReflector).toHaveBeenCalledWith(
        SCOPE_ID, AGENT_ID,
        expect.objectContaining({ timeWindowHours: 720 })
      );
    });

    test("shallow → deep produces strictly increasing timeWindowHours", async () => {
      const capturedWindows: number[] = [];
      mockRunReflector.mockImplementation(async (_scopeId, _agentId, opts) => {
        capturedWindows.push(opts.timeWindowHours);
        return { skipped: false };
      });

      await reflect({ scopeId: SCOPE_NAME, depth: "shallow" }, AGENT_ID);
      await reflect({ scopeId: SCOPE_NAME, depth: "standard" }, AGENT_ID);
      await reflect({ scopeId: SCOPE_NAME, depth: "deep" }, AGENT_ID);

      expect(capturedWindows).toEqual([6, 168, 720]);
      expect(capturedWindows[0]).toBeLessThan(capturedWindows[1]);
      expect(capturedWindows[1]).toBeLessThan(capturedWindows[2]);
    });

    test("default depth (no arg) uses standard 168 hours", async () => {
      mockRunReflector.mockResolvedValue({ skipped: false });

      await reflect({ scopeId: SCOPE_NAME }, AGENT_ID); // no depth param

      expect(mockRunReflector).toHaveBeenCalledWith(
        SCOPE_ID, AGENT_ID,
        expect.objectContaining({ timeWindowHours: 168 })
      );
    });

    test("custom timeWindow overrides depth preset", async () => {
      mockRunReflector.mockResolvedValue({ skipped: false });

      await reflect({
        scopeId: SCOPE_NAME,
        depth: "shallow", // would be 6h
        timeWindow: 48,   // explicit 2 days overrides shallow
      }, AGENT_ID);

      expect(mockRunReflector).toHaveBeenCalledWith(
        SCOPE_ID, AGENT_ID,
        expect.objectContaining({ timeWindowHours: 48 })
      );
    });
  });

  // ── 4. FocusEntities filter ──────────────────────────────────────────────

  describe("FocusEntities filter", () => {
    test("focusEntities propagates to runReflector", async () => {
      mockRunReflector.mockResolvedValue({ skipped: false });

      await reflect({
        scopeId: SCOPE_NAME,
        focusEntities: ["entity-auth", "entity-db"],
      }, AGENT_ID);

      expect(mockRunReflector).toHaveBeenCalledWith(
        SCOPE_ID, AGENT_ID,
        expect.objectContaining({ focusEntities: ["entity-auth", "entity-db"] })
      );
    });

    test("empty focusEntities (omitted) sends empty array — all entities included", async () => {
      mockRunReflector.mockResolvedValue({ skipped: false });

      await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);

      expect(mockRunReflector).toHaveBeenCalledWith(
        SCOPE_ID, AGENT_ID,
        expect.objectContaining({ focusEntities: [] })
      );
    });

    test("single focusEntity targets only that entity", async () => {
      mockRunReflector.mockResolvedValue({
        skipped: false,
        inputSummaries: 2,
        digestFactId: "jfact_focused_auth",
      });

      const result = await reflect({
        scopeId: SCOPE_NAME,
        focusEntities: ["entity-auth"],
      }, AGENT_ID);

      expect(mockRunReflector).toHaveBeenCalledWith(
        SCOPE_ID, AGENT_ID,
        expect.objectContaining({ focusEntities: ["entity-auth"] })
      );
      expect((result as any).digestFactId).toBe("jfact_focused_auth");
    });

    test("focusEntities combined with deep depth — both propagate correctly", async () => {
      mockRunReflector.mockResolvedValue({ skipped: false });

      await reflect({
        scopeId: SCOPE_NAME,
        depth: "deep",
        focusEntities: ["entity-perf", "entity-cache"],
      }, AGENT_ID);

      expect(mockRunReflector).toHaveBeenCalledWith(
        SCOPE_ID, AGENT_ID,
        expect.objectContaining({
          timeWindowHours: 720,
          focusEntities: ["entity-perf", "entity-cache"],
        })
      );
    });

    test("focusEntities filters change digest output without affecting timeWindow", async () => {
      const capturedCalls: any[] = [];
      mockRunReflector.mockImplementation(async (_sid, _aid, opts) => {
        capturedCalls.push({ ...opts });
        return { skipped: false, digestFactId: `jfact_${opts.focusEntities.length}` };
      });

      // Broad reflection (no filter)
      await reflect({ scopeId: SCOPE_NAME, depth: "standard" }, AGENT_ID);
      // Focused reflection (same depth)
      await reflect({ scopeId: SCOPE_NAME, depth: "standard", focusEntities: ["entity-x"] }, AGENT_ID);

      expect(capturedCalls[0].timeWindowHours).toBe(168);
      expect(capturedCalls[0].focusEntities).toEqual([]);
      expect(capturedCalls[1].timeWindowHours).toBe(168);
      expect(capturedCalls[1].focusEntities).toEqual(["entity-x"]);
    });
  });

  // ── 5. Dedup safety ──────────────────────────────────────────────────────

  describe("Dedup safety", () => {
    test("two reflect calls in same timeWindow: first creates, second skips", async () => {
      mockRunReflector
        .mockResolvedValueOnce({ skipped: false, digestFactId: "jfact_first" })
        .mockResolvedValueOnce({ skipped: true, reason: "Already reflected in timeWindow" });

      const first = await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);
      const second = await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);

      expect((first as any).skipped).toBe(false);
      expect((first as any).digestFactId).toBe("jfact_first");
      expect((second as any).skipped).toBe(true);
      expect((second as any).digestFactId).toBeUndefined();
      // Both calls still went to runReflector (dedup is handled inside the Convex action)
      expect(mockRunReflector).toHaveBeenCalledTimes(2);
    });

    test("skipped=true result has no digestFactId (no fact was created)", async () => {
      mockRunReflector.mockResolvedValue({ skipped: true, reason: "Recently reflected" });

      const result = await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);

      expect((result as any).skipped).toBe(true);
      expect((result as any).digestFactId).toBeUndefined();
    });

    test("different scopes do not interfere with each other's dedup", async () => {
      const scope2Id = "jscope_e2e_reflect_002";
      mockGetScopeByName
        .mockResolvedValueOnce(makeScope()) // scope 1
        .mockResolvedValueOnce({ _id: scope2Id, name: "private-agent-other" }); // scope 2

      mockRunReflector
        .mockResolvedValueOnce({ skipped: false, digestFactId: "jfact_scope1" })
        .mockResolvedValueOnce({ skipped: false, digestFactId: "jfact_scope2" });

      const r1 = await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);
      const r2 = await reflect({ scopeId: "private-agent-other" }, "agent-other");

      // Both succeed — separate scopes
      expect((r1 as any).digestFactId).toBe("jfact_scope1");
      expect((r2 as any).digestFactId).toBe("jfact_scope2");
    });

    test("shallow and deep depths can both run (different timeWindows, not same dedup window)", async () => {
      mockRunReflector
        .mockResolvedValueOnce({ skipped: false, digestFactId: "jfact_shallow" })
        .mockResolvedValueOnce({ skipped: false, digestFactId: "jfact_deep" });

      const shallow = await reflect({ scopeId: SCOPE_NAME, depth: "shallow" }, AGENT_ID);
      const deep = await reflect({ scopeId: SCOPE_NAME, depth: "deep" }, AGENT_ID);

      expect((shallow as any).digestFactId).toBe("jfact_shallow");
      expect((deep as any).digestFactId).toBe("jfact_deep");
      expect(mockRunReflector).toHaveBeenNthCalledWith(
        1, SCOPE_ID, AGENT_ID, expect.objectContaining({ timeWindowHours: 6 })
      );
      expect(mockRunReflector).toHaveBeenNthCalledWith(
        2, SCOPE_ID, AGENT_ID, expect.objectContaining({ timeWindowHours: 720 })
      );
    });
  });

  // ── 6. Notification generation ───────────────────────────────────────────

  describe("Notification generation for active agents", () => {
    test("successful reflection returns notified agents in result (if reflector reports them)", async () => {
      mockRunReflector.mockResolvedValue({
        skipped: false,
        digestFactId: "jfact_notified",
        inputSummaries: 4,
        notifiedAgents: ["agent-alpha", "agent-beta"],
      });

      const result = await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);

      expect((result as any).digestFactId).toBe("jfact_notified");
      expect((result as any).notifiedAgents).toEqual(["agent-alpha", "agent-beta"]);
    });

    test("skipped reflection produces no notifiedAgents in result", async () => {
      mockRunReflector.mockResolvedValue({ skipped: true, reason: "No summaries" });

      const result = await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);

      expect((result as any).skipped).toBe(true);
      expect((result as any).notifiedAgents).toBeUndefined();
    });

    test("reflector is called with scopeId so it can query scope members for notifications", async () => {
      mockRunReflector.mockResolvedValue({ skipped: false, inputSummaries: 2 });

      await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);

      // The reflector Convex action receives the scopeId to look up active scope members
      expect(mockRunReflector).toHaveBeenCalledWith(
        SCOPE_ID,
        AGENT_ID,
        expect.any(Object)
      );
    });
  });

  // ── Error handling across pipeline ──────────────────────────────────────

  describe("Error handling across pipeline steps", () => {
    test("all three steps return isError when scope cannot be resolved", async () => {
      mockGetScopeByName.mockResolvedValue(null);
      mockGetAgentByAgentId.mockResolvedValue(null);

      const statusResult = await omStatus({ scopeId: "nonexistent-scope" }, AGENT_ID);
      const compressResult = await observeCompress({ scopeId: "nonexistent-scope" }, AGENT_ID);
      const reflectResult = await reflect({ scopeId: "nonexistent-scope" }, AGENT_ID);

      expect(statusResult).toMatchObject({ isError: true, message: "Could not resolve scope" });
      expect(compressResult).toMatchObject({ isError: true, message: "Could not resolve scope" });
      expect(reflectResult).toMatchObject({ isError: true, message: "Could not resolve scope" });
    });

    test("observer failure does not block reflector (independent pipeline steps)", async () => {
      mockRunObserver.mockRejectedValue(new Error("Observer LLM timeout"));
      mockRunReflector.mockResolvedValue({ skipped: false, digestFactId: "jfact_ok" });

      const compressResult = await observeCompress({ scopeId: SCOPE_NAME }, AGENT_ID);
      const reflectResult = await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);

      expect(compressResult).toMatchObject({
        isError: true,
        message: expect.stringContaining("Observer failed"),
      });
      expect(reflectResult).not.toHaveProperty("isError");
      expect((reflectResult as any).digestFactId).toBe("jfact_ok");
    });

    test("reflector failure returns structured isError with message", async () => {
      mockRunReflector.mockRejectedValue(new Error("Cohere rate limit exceeded"));

      const result = await reflect({ scopeId: SCOPE_NAME }, AGENT_ID);

      expect(result).toMatchObject({
        isError: true,
        message: expect.stringContaining("Reflector failed"),
      });
    });

    test("omStatus returns active: false for scope with no session (graceful, not isError)", async () => {
      mockGetObservationSession.mockResolvedValue(null);

      const result = await omStatus({ scopeId: SCOPE_NAME }, AGENT_ID);

      expect(result).not.toHaveProperty("isError");
      expect((result as any).active).toBe(false);
    });
  });
});
