import { describe, test, expect, vi, beforeEach } from "vitest";

const { mockPollEvents, mockGetEmbeddingProvider, mockGetSnapshot, mockGetTopTools } = vi.hoisted(() => ({
  mockPollEvents: vi.fn(),
  mockGetEmbeddingProvider: vi.fn(),
  mockGetSnapshot: vi.fn(),
  mockGetTopTools: vi.fn(),
}));

vi.mock("../src/lib/convex-client.js", () => ({
  pollEvents: mockPollEvents,
}));

vi.mock("../src/lib/embeddings.js", () => ({
  getEmbeddingProvider: mockGetEmbeddingProvider,
}));

vi.mock("../src/lib/metrics.js", () => ({
  metrics: {
    getSnapshot: mockGetSnapshot,
    getTopTools: mockGetTopTools,
  },
}));

import { health } from "../src/tools/health.js";

describe("health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSnapshot.mockReturnValue({
      uptimeMs: 60_000,
      totalCalls: 42,
      totalErrors: 2,
      tools: {},
      slowTools: [],
    });
    mockGetTopTools.mockReturnValue([
      { name: "store_fact", calls: 20, avgMs: 50 },
    ]);
    mockGetEmbeddingProvider.mockReturnValue("cohere");
  });

  test("returns ok: true with valid metrics snapshot", async () => {
    mockPollEvents.mockResolvedValue({ events: [] });

    const result = await health();

    expect(result.ok).toBe(true);
    expect(result.metrics.uptimeMs).toBe(60_000);
    expect(result.metrics.totalCalls).toBe(42);
    expect(result.metrics.totalErrors).toBe(2);
    expect(result.metrics.errorRate).toBeCloseTo(2 / 42, 3);
    expect(result.metrics.topTools).toEqual([
      { name: "store_fact", calls: 20, avgMs: 50 },
    ]);
  });

  test("includes embeddingProvider field", async () => {
    mockPollEvents.mockResolvedValue({ events: [] });
    mockGetEmbeddingProvider.mockReturnValue("ollama");

    const result = await health();

    expect(result.embeddingProvider).toBe("ollama");
  });

  test("eventLagMs is null when no events exist", async () => {
    mockPollEvents.mockResolvedValue({ events: [] });

    const result = await health();

    expect(result.latestEventAt).toBeNull();
    expect(result.eventLagMs).toBeNull();
  });

  test("eventLagMs is positive when events exist", async () => {
    const recentTs = Date.now() - 5000;
    mockPollEvents.mockResolvedValue({
      events: [{ createdAt: recentTs }],
    });

    const result = await health();

    expect(result.latestEventAt).toBe(recentTs);
    expect(result.eventLagMs).toBeGreaterThan(0);
    expect(result.eventLagMs).toBeLessThan(10_000);
  });
});
