import { describe, test, expect, vi, beforeEach } from "vitest";

const {
  mockGetAgentByAgentId, mockGetScopeByName, mockGetEntityByEntityId,
  mockStoreFact, mockUpdateBacklinks,
  mockAutoLinkEntities,
} = vi.hoisted(() => ({
  mockGetAgentByAgentId: vi.fn(),
  mockGetScopeByName: vi.fn(),
  mockGetEntityByEntityId: vi.fn(),
  mockStoreFact: vi.fn(),
  mockUpdateBacklinks: vi.fn(),
  mockAutoLinkEntities: vi.fn((content: string) => content),
}));

vi.mock("../src/lib/convex-client.js", () => ({
  getAgentByAgentId: mockGetAgentByAgentId,
  getScopeByName: mockGetScopeByName,
  getEntityByEntityId: mockGetEntityByEntityId,
  storeFact: mockStoreFact,
  updateBacklinks: mockUpdateBacklinks,
}));

vi.mock("../src/lib/auto-linker.js", () => ({
  autoLinkEntities: mockAutoLinkEntities,
}));

import { storeFact } from "../src/tools/store-fact.js";

describe("storeFact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAutoLinkEntities.mockImplementation((content: string) => content);
  });

  test("stores a fact and returns factId + importanceScore", async () => {
    mockGetAgentByAgentId.mockResolvedValue({
      defaultScope: "j_scope_123",
    });
    mockStoreFact.mockResolvedValue({
      factId: "fact_abc",
      importanceScore: 0.7,
    });

    const result = await storeFact(
      { content: "TypeScript is the primary language" },
      "agent-1"
    );

    expect(result).toEqual({ factId: "fact_abc", importanceScore: 0.7, deterministic: false });
    expect(mockStoreFact).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "TypeScript is the primary language",
        createdBy: "agent-1",
        scopeId: "j_scope_123",
      })
    );
  });

  test("auto-links entity names in content", async () => {
    mockGetAgentByAgentId.mockResolvedValue({
      defaultScope: "j_scope_123",
    });
    mockGetEntityByEntityId.mockResolvedValue({
      name: "engram",
    });
    mockAutoLinkEntities.mockReturnValue(
      "[[engram]] is a memory system"
    );
    mockStoreFact.mockResolvedValue({
      factId: "fact_linked",
      importanceScore: 0.6,
    });

    const result = await storeFact(
      { content: "engram is a memory system", entityIds: ["entity-1"] },
      "agent-1"
    );

    expect(mockAutoLinkEntities).toHaveBeenCalledWith(
      "engram is a memory system",
      ["engram"]
    );
    expect(mockStoreFact).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "[[engram]] is a memory system",
      })
    );
    expect(result).toEqual({ factId: "fact_linked", importanceScore: 0.6, deterministic: false });
  });

  test("returns isError when scope not found", async () => {
    mockGetAgentByAgentId.mockResolvedValue({
      defaultScope: null,
    });
    mockGetScopeByName.mockResolvedValue(null);

    const result = await storeFact(
      { content: "some fact" },
      "agent-orphan"
    );

    expect(result).toEqual({
      isError: true,
      message: expect.stringContaining("agent-orphan"),
    });
  });

  test("handles missing entityIds gracefully (empty array)", async () => {
    mockGetAgentByAgentId.mockResolvedValue({
      defaultScope: "j_scope_123",
    });
    mockStoreFact.mockResolvedValue({
      factId: "fact_no_entities",
      importanceScore: 0.5,
    });

    const result = await storeFact(
      { content: "plain fact without entities" },
      "agent-1"
    );

    expect(result).toEqual({
      factId: "fact_no_entities",
      importanceScore: 0.5,
      deterministic: false,
    });
    expect(mockGetEntityByEntityId).not.toHaveBeenCalled();
    expect(mockUpdateBacklinks).not.toHaveBeenCalled();
  });

  test("calls updateBacklinks when entityIds provided", async () => {
    mockGetAgentByAgentId.mockResolvedValue({
      defaultScope: "j_scope_123",
    });
    mockGetEntityByEntityId.mockResolvedValue({
      name: "Ryan",
    });
    mockAutoLinkEntities.mockReturnValue("[[Ryan]] shipped it");
    mockStoreFact.mockResolvedValue({
      factId: "fact_backlinked",
      importanceScore: 0.8,
    });

    await storeFact(
      { content: "Ryan shipped it", entityIds: ["entity-ryan"] },
      "agent-1"
    );

    expect(mockUpdateBacklinks).toHaveBeenCalledWith({
      factId: "fact_backlinked",
      entityNames: ["Ryan"],
    });
  });
});
