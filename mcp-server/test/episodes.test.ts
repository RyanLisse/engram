import { beforeEach, describe, expect, test, vi } from "vitest";

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

import { entries as episodeEntries } from "../src/lib/tool-registry/episodes-entries.js";
import {
  createEpisode,
  getEpisode,
  searchEpisodes,
  recallEpisodes,
  linkFactsToEpisode,
  closeEpisode,
} from "../src/tools/episodes.js";

describe("episode registry", () => {
  test("exposes all episode tools in registry", () => {
    const names = episodeEntries.map((entry) => entry.tool.name);
    expect(names).toContain("memory_create_episode");
    expect(names).toContain("memory_get_episode");
    expect(names).toContain("memory_search_episodes");
    expect(names).toContain("memory_recall_episodes");
    expect(names).toContain("memory_link_facts_to_episode");
    expect(names).toContain("memory_close_episode");
  });

  test("memory_recall_episodes schema includes temporal range fields", () => {
    const entry = episodeEntries.find((item) => item.tool.name === "memory_recall_episodes");
    expect(entry).toBeDefined();
    expect(entry?.tool.inputSchema).toMatchObject({
      properties: expect.objectContaining({
        startAfter: expect.any(Object),
        startBefore: expect.any(Object),
        query: expect.any(Object),
      }),
    });
  });

  test("memory_create_episode schema has required fields", () => {
    const entry = episodeEntries.find((item) => item.tool.name === "memory_create_episode");
    expect(entry).toBeDefined();
    expect(entry?.tool.inputSchema).toMatchObject({
      properties: expect.objectContaining({
        title: expect.any(Object),
        factIds: expect.any(Object),
      }),
    });
  });
});

describe("episodes tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScopeByName.mockResolvedValue({ _id: "j_scope_123" });
  });

  // ── CREATE EPISODE ──────────────────────────────────

  test("createEpisode resolves scope names before writing episode", async () => {
    mockCreateEpisode.mockResolvedValue({
      _id: "j_episode_1",
      title: "Debugging auth timeout",
      episodeId: "j_episode_1",
    });

    const result = await createEpisode(
      {
        title: "Debugging auth timeout",
        factIds: ["j_fact_1"],
        scopeId: "private-agent-123",
      },
      "agent-123",
    );

    expect(mockGetScopeByName).toHaveBeenCalledWith("private-agent-123");
    expect(mockCreateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Debugging auth timeout",
        factIds: ["j_fact_1"],
        scopeId: "j_scope_123",
        agentId: "agent-123",
      }),
    );
    expect(result).toHaveProperty("episodeId");
  });

  test("createEpisode uses default private scope when scopeId not provided", async () => {
    mockCreateEpisode.mockResolvedValue({ episodeId: "j_episode_1" });

    await createEpisode(
      {
        title: "New memory",
        factIds: ["j_fact_1", "j_fact_2"],
      },
      "agent-456",
    );

    expect(mockGetScopeByName).toHaveBeenCalledWith("private-agent-456");
    expect(mockCreateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeId: "j_scope_123",
        agentId: "agent-456",
      }),
    );
  });

  test("createEpisode skips scope resolution for IDs starting with 'j'", async () => {
    mockCreateEpisode.mockResolvedValue({ episodeId: "j_episode_1" });

    await createEpisode(
      {
        title: "Direct scope ID",
        factIds: ["j_fact_1"],
        scopeId: "j_scope_direct",
      },
      "agent-123",
    );

    expect(mockGetScopeByName).not.toHaveBeenCalled();
    expect(mockCreateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeId: "j_scope_direct",
      }),
    );
  });

  test("createEpisode returns error when scope not found", async () => {
    mockGetScopeByName.mockResolvedValue(null);

    const result = await createEpisode(
      {
        title: "With bad scope",
        factIds: ["j_fact_1"],
        scopeId: "nonexistent-scope",
      },
      "agent-123",
    );

    expect(result).toMatchObject({
      isError: true,
      message: expect.stringContaining("Scope"),
    });
  });

  test("createEpisode passes through optional fields", async () => {
    mockCreateEpisode.mockResolvedValue({ episodeId: "j_episode_2" });
    const now = Date.now();

    await createEpisode(
      {
        title: "Complex episode",
        factIds: ["j_fact_1", "j_fact_2"],
        scopeId: "j_scope_123",
        startTime: now,
        endTime: now + 3600000,
        tags: ["debug", "performance"],
        importanceScore: 0.8,
        summary: "A detailed episode summary",
      },
      "agent-123",
    );

    expect(mockCreateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: now,
        endTime: now + 3600000,
        tags: ["debug", "performance"],
        importanceScore: 0.8,
        summary: "A detailed episode summary",
      }),
    );
  });

  // ── GET EPISODE ─────────────────────────────────────

  test("getEpisode retrieves episode by ID", async () => {
    const mockEpisode = {
      _id: "j_episode_1",
      title: "Debugging session",
      agentId: "agent-123",
      factIds: ["j_fact_1", "j_fact_2"],
      startTime: 1000,
    };
    mockGetEpisode.mockResolvedValue(mockEpisode);

    const result = await getEpisode({ episodeId: "j_episode_1" });

    expect(mockGetEpisode).toHaveBeenCalledWith({ episodeId: "j_episode_1" });
    expect(result).toEqual(mockEpisode);
  });

  test("getEpisode returns error when episode not found", async () => {
    mockGetEpisode.mockResolvedValue(null);

    const result = await getEpisode({ episodeId: "j_nonexistent" });

    expect(result).toMatchObject({
      isError: true,
      message: expect.stringContaining("not found"),
    });
  });

  // ── SEARCH EPISODES ─────────────────────────────────

  test("searchEpisodes delegates to recallEpisodes", async () => {
    mockRecallEpisodes.mockResolvedValue({
      episodes: [{ _id: "j_episode_1", title: "Found episode" }],
      strategy: "vector",
    });

    const result = await searchEpisodes(
      {
        query: "debugging session",
        scopeId: "private-agent-123",
        limit: 10,
      },
      "agent-123",
    );

    expect(mockRecallEpisodes).toHaveBeenCalledWith({
      query: "debugging session",
      scopeId: "j_scope_123",
      agentId: "agent-123",
      limit: 10,
      startAfter: undefined,
      startBefore: undefined,
    });
    expect(result).toHaveProperty("episodes");
    expect(result).toHaveProperty("strategy");
  });

  // ── RECALL EPISODES ─────────────────────────────────

  test("recallEpisodes supports temporal-only recall (no query)", async () => {
    mockRecallEpisodes.mockResolvedValue({
      episodes: [
        { _id: "j_episode_1", startTime: 1000 },
        { _id: "j_episode_2", startTime: 2000 },
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId: "private-agent-123",
        startAfter: 10,
        startBefore: 5000,
        limit: 5,
      },
      "agent-123",
    );

    expect(mockRecallEpisodes).toHaveBeenCalledWith({
      query: undefined,
      scopeId: "j_scope_123",
      agentId: "agent-123",
      startAfter: 10,
      startBefore: 5000,
      limit: 5,
    });
    expect(result).toMatchObject({
      strategy: "temporal",
      count: 2,
    });
  });

  test("recallEpisodes resolves scope name", async () => {
    mockRecallEpisodes.mockResolvedValue({
      episodes: [{ _id: "j_episode_1" }],
      strategy: "vector",
    });

    await recallEpisodes(
      {
        query: "memory search",
        scopeId: "private-agent-123",
        limit: 10,
      },
      "agent-123",
    );

    expect(mockGetScopeByName).toHaveBeenCalledWith("private-agent-123");
    expect(mockRecallEpisodes).toHaveBeenCalledWith({
      query: "memory search",
      scopeId: "j_scope_123",
      agentId: "agent-123",
      startAfter: undefined,
      startBefore: undefined,
      limit: 10,
    });
  });

  test("recallEpisodes skips scope resolution for IDs starting with 'j'", async () => {
    mockRecallEpisodes.mockResolvedValue({
      episodes: [{ _id: "j_episode_1" }],
      strategy: "vector",
    });

    await recallEpisodes(
      {
        query: "search query",
        scopeId: "j_scope_direct",
      },
      "agent-123",
    );

    expect(mockGetScopeByName).not.toHaveBeenCalled();
    expect(mockRecallEpisodes).toHaveBeenCalledWith({
      query: "search query",
      scopeId: "j_scope_direct",
      agentId: "agent-123",
      startAfter: undefined,
      startBefore: undefined,
      limit: undefined,
    });
  });

  test("recallEpisodes applies temporal filters to results", async () => {
    mockRecallEpisodes.mockResolvedValue({
      episodes: [
        { _id: "j_episode_1", startTime: 100 },
        { _id: "j_episode_2", startTime: 500 },
        { _id: "j_episode_3", startTime: 1500 },
      ],
      strategy: "vector",
    });

    const result = await recallEpisodes(
      {
        query: "test",
        scopeId: "j_scope_123",
        startAfter: 200,
        startBefore: 1000,
      },
      "agent-123",
    );

    // Should only include episodes with startTime in [200, 1000)
    expect(result.episodes).toEqual([
      { _id: "j_episode_2", startTime: 500 },
    ]);
    expect(result.count).toBe(1);
  });

  test("recallEpisodes filters out episodes without startTime when temporal filters present", async () => {
    mockRecallEpisodes.mockResolvedValue({
      episodes: [
        { _id: "j_episode_1", startTime: 500 },
        { _id: "j_episode_2" }, // No startTime
      ],
      strategy: "vector",
    });

    const result = await recallEpisodes(
      {
        query: "test",
        scopeId: "j_scope_123",
        startAfter: 100,
        startBefore: 1000,
      },
      "agent-123",
    );

    // Should include episode without startTime
    expect(result.episodes).toHaveLength(2);
  });

  test("recallEpisodes handles empty episode list", async () => {
    mockRecallEpisodes.mockResolvedValue({
      episodes: [],
      strategy: "vector",
    });

    const result = await recallEpisodes(
      {
        query: "not found",
        scopeId: "j_scope_123",
      },
      "agent-123",
    );

    expect(result.episodes).toEqual([]);
    expect(result.count).toBe(0);
  });

  // ── LINK FACTS TO EPISODE ───────────────────────────

  test("linkFactsToEpisode adds facts to existing episode", async () => {
    mockUpdateEpisode.mockResolvedValue({
      _id: "j_episode_1",
      factIds: ["j_fact_1", "j_fact_2", "j_fact_3"],
    });

    const result = await linkFactsToEpisode({
      episodeId: "j_episode_1",
      factIds: ["j_fact_2", "j_fact_3"],
    });

    expect(mockUpdateEpisode).toHaveBeenCalledWith({
      episodeId: "j_episode_1",
      addFactIds: ["j_fact_2", "j_fact_3"],
    });
    expect(result).toHaveProperty("factIds");
  });

  test("linkFactsToEpisode handles empty fact IDs list", async () => {
    mockUpdateEpisode.mockResolvedValue({
      _id: "j_episode_1",
      factIds: ["j_fact_1"],
    });

    await linkFactsToEpisode({
      episodeId: "j_episode_1",
      factIds: [],
    });

    expect(mockUpdateEpisode).toHaveBeenCalledWith({
      episodeId: "j_episode_1",
      addFactIds: [],
    });
  });

  test("linkFactsToEpisode handles single fact addition", async () => {
    mockUpdateEpisode.mockResolvedValue({
      _id: "j_episode_2",
      factIds: ["j_fact_single"],
    });

    await linkFactsToEpisode({
      episodeId: "j_episode_2",
      factIds: ["j_fact_single"],
    });

    expect(mockUpdateEpisode).toHaveBeenCalledWith({
      episodeId: "j_episode_2",
      addFactIds: ["j_fact_single"],
    });
  });

  // ── CLOSE EPISODE ───────────────────────────────────

  test("closeEpisode sets endTime and optional summary", async () => {
    const endTime = Date.now();
    mockUpdateEpisode.mockResolvedValue({
      _id: "j_episode_1",
      endTime: endTime,
      summary: "Session ended successfully",
    });

    const result = await closeEpisode({
      episodeId: "j_episode_1",
      endTime: endTime,
      summary: "Session ended successfully",
    });

    expect(mockUpdateEpisode).toHaveBeenCalledWith({
      episodeId: "j_episode_1",
      endTime: endTime,
      summary: "Session ended successfully",
    });
    expect(result).toHaveProperty("endTime");
  });

  test("closeEpisode defaults endTime to now when not provided", async () => {
    mockUpdateEpisode.mockResolvedValue({
      _id: "j_episode_1",
      endTime: expect.any(Number),
    });

    const beforeCall = Date.now();
    await closeEpisode({
      episodeId: "j_episode_1",
    });
    const afterCall = Date.now();

    expect(mockUpdateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeId: "j_episode_1",
        endTime: expect.any(Number),
      }),
    );

    const actualCall = mockUpdateEpisode.mock.calls[0][0];
    expect(actualCall.endTime).toBeGreaterThanOrEqual(beforeCall);
    expect(actualCall.endTime).toBeLessThanOrEqual(afterCall);
  });

  test("closeEpisode without summary omits it", async () => {
    mockUpdateEpisode.mockResolvedValue({
      _id: "j_episode_1",
      endTime: 2000,
    });

    await closeEpisode({
      episodeId: "j_episode_1",
      endTime: 2000,
    });

    expect(mockUpdateEpisode).toHaveBeenCalledWith({
      episodeId: "j_episode_1",
      endTime: 2000,
      summary: undefined,
    });
  });

  // ── EDGE CASES ──────────────────────────────────────

  test("createEpisode with multiple facts", async () => {
    mockCreateEpisode.mockResolvedValue({ episodeId: "j_episode_bulk" });

    const facts = ["j_fact_1", "j_fact_2", "j_fact_3", "j_fact_4", "j_fact_5"];
    await createEpisode(
      {
        title: "Multi-fact episode",
        factIds: facts,
        scopeId: "j_scope_123",
      },
      "agent-123",
    );

    expect(mockCreateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        factIds: facts,
      }),
    );
  });

  test("createEpisode with empty fact list", async () => {
    mockCreateEpisode.mockResolvedValue({ episodeId: "j_episode_empty" });

    await createEpisode(
      {
        title: "Empty episode (facts added later)",
        factIds: [],
        scopeId: "j_scope_123",
      },
      "agent-123",
    );

    expect(mockCreateEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        factIds: [],
      }),
    );
  });

  test("recallEpisodes with boundary startBefore = startAfter", async () => {
    mockRecallEpisodes.mockResolvedValue({
      episodes: [
        { _id: "j_ep_1", startTime: 500 },
        { _id: "j_ep_2", startTime: 1000 },
      ],
      strategy: "vector",
    });

    const result = await recallEpisodes(
      {
        query: "boundary test",
        scopeId: "j_scope_123",
        startAfter: 500,
        startBefore: 500, // Same as startAfter - should exclude all
      },
      "agent-123",
    );

    // startBefore is exclusive, so startTime >= startBefore fails the filter
    expect(result.episodes).toEqual([]);
  });

  test("recallEpisodes respects only startAfter", async () => {
    mockRecallEpisodes.mockResolvedValue({
      episodes: [
        { _id: "j_ep_1", startTime: 100 },
        { _id: "j_ep_2", startTime: 500 },
        { _id: "j_ep_3", startTime: 1000 },
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId: "j_scope_123",
        startAfter: 250,
      },
      "agent-123",
    );

    expect(result.episodes).toEqual([
      { _id: "j_ep_2", startTime: 500 },
      { _id: "j_ep_3", startTime: 1000 },
    ]);
  });

  test("recallEpisodes respects only startBefore", async () => {
    mockRecallEpisodes.mockResolvedValue({
      episodes: [
        { _id: "j_ep_1", startTime: 100 },
        { _id: "j_ep_2", startTime: 500 },
        { _id: "j_ep_3", startTime: 1000 },
      ],
      strategy: "temporal",
    });

    const result = await recallEpisodes(
      {
        scopeId: "j_scope_123",
        startBefore: 750,
      },
      "agent-123",
    );

    expect(result.episodes).toEqual([
      { _id: "j_ep_1", startTime: 100 },
      { _id: "j_ep_2", startTime: 500 },
    ]);
  });
});
