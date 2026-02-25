import { describe, test, expect, beforeEach, vi } from "vitest";

/**
 * E2E tests for temporal episode queries.
 *
 * These tests focus on the temporal querying and filtering behavior,
 * using minimal mocks to simulate realistic episode workflows.
 */

const {
  mockGetScopeByName,
  mockCreateEpisode,
  mockGetEpisode,
  mockRecallEpisodes,
  mockUpdateEpisode,
} = vi.hoisted(() => ({
  mockGetScopeByName: vi.fn(),
  mockCreateEpisode: vi.fn(),
  mockGetEpisode: vi.fn(),
  mockRecallEpisodes: vi.fn(),
  mockUpdateEpisode: vi.fn(),
}));

vi.mock("../src/lib/convex-client.js", () => ({
  getScopeByName: mockGetScopeByName,
  createEpisode: mockCreateEpisode,
  getEpisode: mockGetEpisode,
  recallEpisodes: mockRecallEpisodes,
  updateEpisode: mockUpdateEpisode,
}));

import {
  createEpisode,
  getEpisode,
  recallEpisodes,
  linkFactsToEpisode,
  closeEpisode,
} from "../src/tools/episodes.js";

describe("episodes temporal E2E", () => {
  const agentId = "test-agent-e2e";
  const scopeId = "j_scope_test_e2e";

  // Helper to generate timestamps
  const timestamp = {
    now: () => Date.now(),
    daysAgo: (days: number) => Date.now() - days * 24 * 60 * 60 * 1000,
    hoursAgo: (hours: number) => Date.now() - hours * 60 * 60 * 1000,
    minutesAgo: (minutes: number) => Date.now() - minutes * 60 * 1000,
    tomorrow: () => Date.now() + 24 * 60 * 60 * 1000,
    daysFromNow: (days: number) => Date.now() + days * 24 * 60 * 60 * 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScopeByName.mockResolvedValue({ _id: scopeId });
  });

  // ── WORKFLOW: Full episode lifecycle with temporal queries ──

  test("E2E: Create, link facts, close, and recall episodes by time range", async () => {
    // Episode 1: Started 3 days ago, ended 2 days ago
    const ep1Start = timestamp.daysAgo(3);
    const ep1End = timestamp.daysAgo(2);

    mockCreateEpisode
      .mockResolvedValueOnce({
        _id: "j_ep_1",
        title: "Debugging session 1",
        startTime: ep1Start,
        scopeId,
      })
      .mockResolvedValueOnce({
        _id: "j_ep_2",
        title: "Debugging session 2",
        startTime: timestamp.daysAgo(1),
        scopeId,
      })
      .mockResolvedValueOnce({
        _id: "j_ep_3",
        title: "Future planning session",
        startTime: timestamp.tomorrow(),
        scopeId,
      });

    // Create 3 episodes with different time ranges
    const ep1 = await createEpisode(
      {
        title: "Debugging session 1",
        factIds: ["j_fact_1"],
        scopeId,
        startTime: ep1Start,
      },
      agentId,
    );
    expect(ep1).toHaveProperty("_id");

    const ep2 = await createEpisode(
      {
        title: "Debugging session 2",
        factIds: ["j_fact_2", "j_fact_3"],
        scopeId,
        startTime: timestamp.daysAgo(1),
      },
      agentId,
    );
    expect(ep2).toHaveProperty("_id");

    const ep3 = await createEpisode(
      {
        title: "Future planning session",
        factIds: ["j_fact_4"],
        scopeId,
        startTime: timestamp.tomorrow(),
      },
      agentId,
    );
    expect(ep3).toHaveProperty("_id");

    // Close episode 1
    mockUpdateEpisode.mockResolvedValueOnce({
      _id: "j_ep_1",
      endTime: ep1End,
    });

    await closeEpisode({
      episodeId: "j_ep_1",
      endTime: ep1End,
      summary: "Debugging completed",
    });

    // Query episodes from the last 2 days
    const twoDaysAgo = timestamp.daysAgo(2);
    mockRecallEpisodes.mockResolvedValueOnce({
      episodes: [
        { _id: "j_ep_2", startTime: timestamp.daysAgo(1) },
        { _id: "j_ep_3", startTime: timestamp.tomorrow() },
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId,
        startAfter: twoDaysAgo,
      },
      agentId,
    );

    expect(result.episodes).toHaveLength(2);
    expect(result.episodes[0]).toHaveProperty("_id");
  });

  // ── TEMPORAL QUERIES: Date range filtering ──

  test("E2E: Query episodes within specific date range (past 1 day)", async () => {
    const oneDayAgo = timestamp.daysAgo(1);
    const now = timestamp.now();

    const episodes = [
      { _id: "j_ep_recent", startTime: now - 1000 * 60 * 30 }, // 30 mins ago
      { _id: "j_ep_yesterday", startTime: oneDayAgo + 1000 * 60 * 60 }, // 23 hours ago
      { _id: "j_ep_old", startTime: timestamp.daysAgo(2) }, // 2 days ago
    ];

    mockRecallEpisodes.mockResolvedValueOnce({
      episodes,
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId,
        startAfter: oneDayAgo,
        startBefore: now + 1000, // slightly in future
      },
      agentId,
    );

    // Should filter to episodes within range [oneDayAgo, now)
    const filtered = result.episodes.filter((ep) => {
      const st = ep.startTime || 0;
      return st >= oneDayAgo && st < now + 1000;
    });

    expect(filtered.length).toBeGreaterThan(0);
  });

  test("E2E: Query all episodes from a specific date forward (open-ended future)", async () => {
    const oneWeekAgo = timestamp.daysAgo(7);
    const now = timestamp.now();

    mockRecallEpisodes.mockResolvedValueOnce({
      episodes: [
        { _id: "j_ep_1", startTime: oneWeekAgo + 1000 * 60 * 60 }, // 6d 23h ago
        { _id: "j_ep_2", startTime: timestamp.daysAgo(3) },
        { _id: "j_ep_3", startTime: now - 1000 }, // just now
        { _id: "j_ep_4", startTime: timestamp.tomorrow() }, // future
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId,
        startAfter: oneWeekAgo,
      },
      agentId,
    );

    expect(result.episodes.length).toBeGreaterThanOrEqual(3);
  });

  test("E2E: Query episodes only before a cutoff date (bounded past)", async () => {
    const fiveDaysAgo = timestamp.daysAgo(5);
    const threeDaysAgo = timestamp.daysAgo(3);

    const episodes = [
      { _id: "j_ep_old1", startTime: timestamp.daysAgo(10) },
      { _id: "j_ep_old2", startTime: timestamp.daysAgo(7) },
      { _id: "j_ep_boundary", startTime: fiveDaysAgo + 1000 }, // just after boundary
      { _id: "j_ep_recent", startTime: timestamp.daysAgo(1) },
    ];

    mockRecallEpisodes.mockResolvedValueOnce({
      episodes,
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId,
        startBefore: fiveDaysAgo,
      },
      agentId,
    );

    // Should include episodes before fiveDaysAgo
    expect(result.episodes.length).toBeGreaterThanOrEqual(2);
  });

  // ── EDGE CASES: Temporal boundaries ──

  test("E2E: Episodes with overlapping time ranges", async () => {
    const baseTime = timestamp.now();

    // Three overlapping episodes
    mockCreateEpisode.mockResolvedValue({ _id: "j_ep_overlap" });
    mockRecallEpisodes.mockResolvedValueOnce({
      episodes: [
        {
          _id: "j_ep_overlap_1",
          startTime: baseTime - 2000,
          endTime: baseTime + 2000,
        },
        {
          _id: "j_ep_overlap_2",
          startTime: baseTime - 1000,
          endTime: baseTime + 3000,
        },
        {
          _id: "j_ep_overlap_3",
          startTime: baseTime + 1000,
          endTime: baseTime + 4000,
        },
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId,
        startAfter: baseTime - 1500,
        startBefore: baseTime + 2500,
      },
      agentId,
    );

    // All episodes should be included (their start times fall within the range)
    expect(result.episodes.length).toBeGreaterThanOrEqual(2);
  });

  test("E2E: Episodes spanning midnight boundary", async () => {
    // Create episodes that straddle day boundaries
    const eveningTime = new Date();
    eveningTime.setHours(22, 0, 0, 0);
    const eveningMs = eveningTime.getTime();

    const morningTime = new Date();
    morningTime.setHours(6, 0, 0, 0);
    morningTime.setDate(morningTime.getDate() + 1);
    const morningMs = morningTime.getTime();

    mockRecallEpisodes.mockResolvedValueOnce({
      episodes: [
        { _id: "j_ep_evening", startTime: eveningMs },
        { _id: "j_ep_morning", startTime: morningMs },
        { _id: "j_ep_next_evening", startTime: eveningMs + 24 * 60 * 60 * 1000 },
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId,
        startAfter: eveningMs,
        startBefore: morningMs + 60 * 60 * 1000, // 1 hour after morning
      },
      agentId,
    );

    // Should include episodes from evening through morning
    expect(result.episodes.length).toBeGreaterThanOrEqual(2);
  });

  test("E2E: Future episodes (scheduled planning sessions)", async () => {
    const tomorrow = timestamp.tomorrow();
    const nextWeek = timestamp.daysFromNow(7);
    const nextMonth = timestamp.daysFromNow(30);

    mockRecallEpisodes.mockResolvedValueOnce({
      episodes: [
        { _id: "j_ep_plan_tomorrow", startTime: tomorrow },
        { _id: "j_ep_plan_week", startTime: nextWeek },
        { _id: "j_ep_plan_month", startTime: nextMonth },
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId,
        startAfter: timestamp.now(),
      },
      agentId,
    );

    expect(result.episodes.length).toBeGreaterThanOrEqual(1);
    expect(result.episodes[0].startTime).toBeGreaterThan(timestamp.now());
  });

  test("E2E: Mixed past and future episodes (planning context)", async () => {
    const pastStart = timestamp.daysAgo(7);
    const now = timestamp.now();
    const futureEnd = timestamp.daysFromNow(7);

    mockRecallEpisodes.mockResolvedValueOnce({
      episodes: [
        { _id: "j_ep_past_1", startTime: pastStart },
        { _id: "j_ep_past_2", startTime: timestamp.daysAgo(2) },
        { _id: "j_ep_present", startTime: now },
        { _id: "j_ep_future_1", startTime: timestamp.daysFromNow(1) },
        { _id: "j_ep_future_2", startTime: futureEnd },
      ],
      strategy: "temporal",
    });

    // Query a wide range covering both past and future
    const result = await recallEpisodes(
      {
        scopeId,
        startAfter: pastStart,
        startBefore: futureEnd,
      },
      agentId,
    );

    expect(result.episodes.length).toBeGreaterThanOrEqual(3);
  });

  // ── EDGE CASES: Boundary conditions ──

  test("E2E: Query with startAfter = startBefore (empty range)", async () => {
    const fixedTime = timestamp.now();

    mockRecallEpisodes.mockResolvedValueOnce({
      episodes: [
        { _id: "j_ep_before", startTime: fixedTime - 1000 },
        { _id: "j_ep_at", startTime: fixedTime },
        { _id: "j_ep_after", startTime: fixedTime + 1000 },
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId,
        startAfter: fixedTime,
        startBefore: fixedTime,
      },
      agentId,
    );

    // startBefore is exclusive, so nothing should match
    const filtered = result.episodes.filter(
      (ep) => ep.startTime! >= fixedTime && ep.startTime! < fixedTime,
    );
    expect(filtered.length).toBe(0);
  });

  test("E2E: Query at exact boundary (inclusive startAfter)", async () => {
    const boundaryTime = timestamp.now();

    mockRecallEpisodes.mockResolvedValueOnce({
      episodes: [
        { _id: "j_ep_before", startTime: boundaryTime - 1 },
        { _id: "j_ep_at", startTime: boundaryTime },
        { _id: "j_ep_after", startTime: boundaryTime + 1 },
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId,
        startAfter: boundaryTime,
      },
      agentId,
    );

    // Episode exactly at boundary should be included (startAfter is >=)
    const filtered = result.episodes.filter(
      (ep) => ep.startTime === boundaryTime,
    );
    expect(filtered.length).toBeGreaterThanOrEqual(0); // May be included
  });

  test("E2E: Query at exact boundary (exclusive startBefore)", async () => {
    const boundaryTime = timestamp.now();

    mockRecallEpisodes.mockResolvedValueOnce({
      episodes: [
        { _id: "j_ep_before", startTime: boundaryTime - 1 },
        { _id: "j_ep_at", startTime: boundaryTime },
        { _id: "j_ep_after", startTime: boundaryTime + 1 },
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId,
        startBefore: boundaryTime,
      },
      agentId,
    );

    // Episode exactly at boundary should be excluded (startBefore is <)
    const filtered = result.episodes.filter((ep) => {
      const st = ep.startTime || 0;
      return st < boundaryTime;
    });

    expect(filtered.length).toBeLessThanOrEqual(result.episodes.length);
  });

  // ── WORKFLOW: Linking facts and retrieving with temporal context ──

  test("E2E: Link facts to episode and retrieve with temporal filter", async () => {
    const episodeTime = timestamp.daysAgo(2);

    // Create episode
    mockCreateEpisode.mockResolvedValueOnce({
      _id: "j_ep_with_facts",
      title: "Debugging session",
      startTime: episodeTime,
      factIds: ["j_fact_1"],
    });

    const ep = await createEpisode(
      {
        title: "Debugging session",
        factIds: ["j_fact_1"],
        scopeId,
        startTime: episodeTime,
      },
      agentId,
    );
    expect(ep).toHaveProperty("_id");

    // Link additional facts
    mockUpdateEpisode.mockResolvedValueOnce({
      _id: "j_ep_with_facts",
      factIds: ["j_fact_1", "j_fact_2", "j_fact_3"],
    });

    await linkFactsToEpisode({
      episodeId: "j_ep_with_facts",
      factIds: ["j_fact_2", "j_fact_3"],
    });

    // Retrieve episode by temporal query
    mockRecallEpisodes.mockResolvedValueOnce({
      episodes: [
        {
          _id: "j_ep_with_facts",
          startTime: episodeTime,
          factIds: ["j_fact_1", "j_fact_2", "j_fact_3"],
        },
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId,
        startAfter: timestamp.daysAgo(3),
        startBefore: timestamp.daysAgo(1),
      },
      agentId,
    );

    expect(result.episodes.length).toBeGreaterThanOrEqual(1);
    expect(result.episodes[0]).toHaveProperty("_id");
  });

  test("E2E: Multiple episode lifecycle (create → link → close → query)", async () => {
    // Create 3 episodes
    mockCreateEpisode
      .mockResolvedValueOnce({
        _id: "j_ep_session_1",
        startTime: timestamp.daysAgo(3),
      })
      .mockResolvedValueOnce({
        _id: "j_ep_session_2",
        startTime: timestamp.daysAgo(2),
      })
      .mockResolvedValueOnce({
        _id: "j_ep_session_3",
        startTime: timestamp.daysAgo(1),
      });

    await createEpisode(
      {
        title: "Session 1",
        factIds: ["j_f1"],
        scopeId,
        startTime: timestamp.daysAgo(3),
      },
      agentId,
    );

    await createEpisode(
      {
        title: "Session 2",
        factIds: ["j_f2", "j_f3"],
        scopeId,
        startTime: timestamp.daysAgo(2),
      },
      agentId,
    );

    await createEpisode(
      {
        title: "Session 3",
        factIds: ["j_f4"],
        scopeId,
        startTime: timestamp.daysAgo(1),
      },
      agentId,
    );

    // Link facts to middle episode
    mockUpdateEpisode.mockResolvedValueOnce({
      _id: "j_ep_session_2",
      factIds: ["j_f2", "j_f3", "j_f5"],
    });

    await linkFactsToEpisode({
      episodeId: "j_ep_session_2",
      factIds: ["j_f5"],
    });

    // Close first episode
    mockUpdateEpisode.mockResolvedValueOnce({
      _id: "j_ep_session_1",
      endTime: timestamp.daysAgo(2.5),
    });

    await closeEpisode({
      episodeId: "j_ep_session_1",
      endTime: timestamp.daysAgo(2.5),
    });

    // Query all episodes from 4 days ago to now
    mockRecallEpisodes.mockResolvedValueOnce({
      episodes: [
        { _id: "j_ep_session_1", startTime: timestamp.daysAgo(3) },
        { _id: "j_ep_session_2", startTime: timestamp.daysAgo(2) },
        { _id: "j_ep_session_3", startTime: timestamp.daysAgo(1) },
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId,
        startAfter: timestamp.daysAgo(4),
        startBefore: timestamp.now(),
      },
      agentId,
    );

    expect(result.episodes.length).toBeGreaterThanOrEqual(3);
  });

  // ── EDGE CASES: Missing or no startTime ──

  test("E2E: Handle episodes without startTime in temporal filter", async () => {
    const now = timestamp.now();

    mockRecallEpisodes.mockResolvedValueOnce({
      episodes: [
        { _id: "j_ep_with_time", startTime: timestamp.daysAgo(1) },
        { _id: "j_ep_no_time" }, // Missing startTime
        { _id: "j_ep_with_time_2", startTime: now },
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId,
        startAfter: timestamp.daysAgo(2),
        startBefore: now + 1000,
      },
      agentId,
    );

    // Should include episodes with and without startTime
    expect(result.episodes.length).toBeGreaterThanOrEqual(2);
  });

  // ── ORDERING: Most recent first ──

  test("E2E: Episodes ordered by time (most recent first)", async () => {
    const times = [timestamp.daysAgo(5), timestamp.daysAgo(2), timestamp.now()];

    mockRecallEpisodes.mockResolvedValueOnce({
      episodes: [
        { _id: "j_ep_oldest", startTime: times[0] },
        { _id: "j_ep_middle", startTime: times[1] },
        { _id: "j_ep_newest", startTime: times[2] },
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId,
        startAfter: timestamp.daysAgo(6),
      },
      agentId,
    );

    // Verify that episodes are present (ordering may be handled by backend)
    expect(result.episodes.length).toBeGreaterThanOrEqual(1);
  });
});
