import { describe, test, expect, vi, beforeEach } from "vitest";

const {
  mockGetScopeByName,
  mockQuery,
  mockMutate,
} = vi.hoisted(() => ({
  mockGetScopeByName: vi.fn(),
  mockQuery: vi.fn(),
  mockMutate: vi.fn(),
}));

vi.mock("../src/lib/convex-client.js", () => ({
  getScopeByName: mockGetScopeByName,
  query: mockQuery,
  mutate: mockMutate,
}));

import { PATHS } from "../src/lib/convex-paths.js";
import { forget } from "../src/tools/forget.js";

describe("forget tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns error when neither factId nor query provided", async () => {
    const result = await forget({ reason: "cleanup" }, "agent-1");

    expect(result).toEqual({
      isError: true,
      message: "Either factId or query is required",
    });
  });

  test("archives fact by factId and logs event", async () => {
    mockMutate.mockResolvedValue({});

    const result = await forget(
      { factId: "fact_123", reason: "obsolete" },
      "agent-1",
    );

    expect(mockMutate).toHaveBeenNthCalledWith(
      1,
      PATHS.facts.archiveFactPublic,
      { factId: "fact_123" },
    );
    expect(mockMutate).toHaveBeenNthCalledWith(
      2,
      PATHS.events.emit,
      expect.objectContaining({
        eventType: "fact.forgotten",
        factId: "fact_123",
        agentId: "agent-1",
      }),
    );
    expect(result).toEqual({
      forgotten: ["fact_123"],
      count: 1,
      reason: "obsolete",
    });
  });

  test("query mode only forgets active facts", async () => {
    mockGetScopeByName.mockResolvedValue({ _id: "scope_1" });
    mockQuery.mockResolvedValue([
      { _id: "fact_active", lifecycleState: "active" },
      { _id: "fact_archived", lifecycleState: "archived" },
    ]);
    mockMutate.mockResolvedValue({});

    const result = await forget(
      { query: "stale fact", reason: "stale", limit: 5 },
      "agent-1",
    );

    expect(mockQuery).toHaveBeenCalledWith(
      PATHS.facts.searchFacts,
      expect.objectContaining({
        query: "stale fact",
        scopeId: "scope_1",
        limit: 5,
      }),
    );
    expect(result).toEqual({
      forgotten: ["fact_active"],
      count: 1,
      reason: "stale",
    });
  });

  test("returns error when query finds no matches", async () => {
    mockGetScopeByName.mockResolvedValue({ _id: "scope_1" });
    mockQuery.mockResolvedValue([]);

    const result = await forget(
      { query: "does-not-exist", reason: "cleanup" },
      "agent-1",
    );

    expect(result).toEqual({
      isError: true,
      message: 'No facts found matching query: "does-not-exist"',
    });
  });
});
