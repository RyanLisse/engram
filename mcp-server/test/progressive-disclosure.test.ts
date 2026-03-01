/**
 * Progressive Disclosure — Unit tests
 *
 * Covers:
 *   - generateFactSummary() pure utility
 *   - pinFact() / unpinFact() — pin limit enforcement, toggle
 *   - getManifest() — pinned facts, category distribution, counts
 *   - buildFullSystemPrompt() — PINNED MEMORIES section, manifest section
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

// ── Mock setup (vi.hoisted ensures refs exist before vi.mock factories run) ──
const {
  mockGetFact,
  mockUpdateFact,
  mockListPinnedByScope,
  mockGetPinnedFacts,
  mockListFactsByScope,
  mockGetScopeByName,
  mockGetAgentByAgentId,
  mockGetPermittedScopes,
  mockListAgents,
  mockListConfigs,
  mockGetRecentHandoffs,
  mockSearchFacts,
  mockListObservationSummaries,
} = vi.hoisted(() => ({
  mockGetFact: vi.fn(),
  mockUpdateFact: vi.fn(),
  mockListPinnedByScope: vi.fn(),
  mockGetPinnedFacts: vi.fn(),
  mockListFactsByScope: vi.fn(),
  mockGetScopeByName: vi.fn(),
  mockGetAgentByAgentId: vi.fn(),
  mockGetPermittedScopes: vi.fn(),
  mockListAgents: vi.fn(),
  mockListConfigs: vi.fn(),
  mockGetRecentHandoffs: vi.fn(),
  mockSearchFacts: vi.fn(),
  mockListObservationSummaries: vi.fn(),
}));

vi.mock("../src/lib/convex-client.js", () => ({
  getFact: mockGetFact,
  updateFact: mockUpdateFact,
  listPinnedByScope: mockListPinnedByScope,
  getPinnedFacts: mockGetPinnedFacts,
  listFactsByScope: mockListFactsByScope,
  getScopeByName: mockGetScopeByName,
  getAgentByAgentId: mockGetAgentByAgentId,
  getPermittedScopes: mockGetPermittedScopes,
  listAgents: mockListAgents,
  listConfigs: mockListConfigs,
  getRecentHandoffs: mockGetRecentHandoffs,
  searchFacts: mockSearchFacts,
  listObservationSummaries: mockListObservationSummaries,
}));

// context-primitives and primitive-retrieval are needed by system-prompt-builder
const { mockGetActivityStats, mockGetNotifications } = vi.hoisted(() => ({
  mockGetActivityStats: vi.fn(),
  mockGetNotifications: vi.fn(),
}));

vi.mock("../src/tools/context-primitives.js", () => ({
  resolveScopes: vi.fn(),
  getActivityStats: mockGetActivityStats,
}));

vi.mock("../src/tools/primitive-retrieval.js", () => ({
  getNotifications: mockGetNotifications,
}));

// ── Imports (after mock registration) ───────────────────────────────────────
import { generateFactSummary, stripMarkdown } from "../src/lib/fact-summary.js";
import { pinFact, unpinFact } from "../src/tools/pin-fact.js";
import { getManifest } from "../src/tools/manifest.js";
import { buildFullSystemPrompt } from "../src/tools/system-prompt-builder.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFact(overrides: Record<string, unknown> = {}) {
  return {
    _id: "jfact001",
    content: "TypeScript is the primary language",
    factType: "observation",
    lifecycleState: "active",
    importanceScore: 0.6,
    scopeId: "jscope001",
    tags: ["typescript"],
    timestamp: Date.now(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. generateFactSummary — pure utility, no mocks needed
// ─────────────────────────────────────────────────────────────────────────────

describe("generateFactSummary", () => {
  test("returns short content (≤100 chars) unchanged", () => {
    const short = "TypeScript is the primary language.";
    expect(generateFactSummary(short)).toBe(short);
  });

  test("truncates long content at 150 chars with ellipsis", () => {
    const long = "a".repeat(160);
    const result = generateFactSummary(long);
    expect(result).toHaveLength(153); // 150 + "..."
    expect(result.endsWith("...")).toBe(true);
  });

  test("strips markdown headers from content", () => {
    expect(generateFactSummary("## Decision Made\nUse Convex.")).toBe("Decision Made Use Convex.");
  });

  test("strips bold/italic markdown", () => {
    expect(generateFactSummary("**important**: always use *types*")).toBe("important: always use types");
  });

  test("strips inline code backticks but keeps text", () => {
    expect(generateFactSummary("Call `memory_store_fact` first")).toBe("Call memory_store_fact first");
  });

  test("strips fenced code blocks entirely", () => {
    const content = "Install with:\n```bash\nnpm install\n```";
    const result = generateFactSummary(content);
    expect(result).not.toContain("```");
    expect(result).toContain("Install with:");
  });

  test("strips unordered list bullets", () => {
    expect(generateFactSummary("- item one\n- item two")).toBe("item one item two");
  });

  test("collapses newlines to spaces", () => {
    expect(generateFactSummary("line one\n\nline two")).toBe("line one line two");
  });

  test("prefixes decision factType with [decision]", () => {
    const result = generateFactSummary("Use Convex for storage", "decision");
    expect(result.startsWith("[decision]")).toBe(true);
    expect(result).toContain("Use Convex for storage");
  });

  test("prefixes error factType with [error]", () => {
    expect(generateFactSummary("Connection timed out", "error")).toMatch(/^\[error\]/);
  });

  test("prefixes insight factType with [insight]", () => {
    expect(generateFactSummary("Facts decay faster when unreferenced", "insight")).toMatch(/^\[insight\]/);
  });

  test("prefixes steering_rule factType with [rule]", () => {
    expect(generateFactSummary("Always snapshot before mutation", "steering_rule")).toMatch(/^\[rule\]/);
  });

  test("prefixes plan factType with [plan]", () => {
    expect(generateFactSummary("Migrate to new schema", "plan")).toMatch(/^\[plan\]/);
  });

  test("omits prefix for observation factType (default)", () => {
    const result = generateFactSummary("Agent started session", "observation");
    expect(result.startsWith("[")).toBe(false);
  });

  test("handles empty string content", () => {
    expect(generateFactSummary("")).toBe("");
  });

  test("truncates long content AFTER stripping markdown (correct length accounting)", () => {
    // Markdown adds length; strip first then measure
    const content = "## Header\n" + "word ".repeat(30); // >100 chars after stripping
    const result = generateFactSummary(content);
    // Result without prefix should end with ...
    expect(result.endsWith("...")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. pinFact — pin limit enforcement, idempotency, error paths
// ─────────────────────────────────────────────────────────────────────────────

describe("pinFact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateFact.mockResolvedValue(undefined);
    mockListPinnedByScope.mockResolvedValue([]);
  });

  test("returns isError when fact not found", async () => {
    mockGetFact.mockResolvedValue(null);
    const result = await pinFact({ factId: "jfact999" }, "agent-1");
    expect(result).toMatchObject({ isError: true });
    expect((result as any).message).toContain("jfact999");
  });

  test("returns isError when fact is archived", async () => {
    mockGetFact.mockResolvedValue(makeFact({ archived: true }));
    const result = await pinFact({ factId: "jfact001", scopeId: "jscope001" }, "agent-1");
    expect(result).toMatchObject({ isError: true });
    expect((result as any).message).toContain("archived");
  });

  test("returns pinned: true without calling updateFact when already pinned", async () => {
    const pinnedList = [makeFact()];
    mockGetFact.mockResolvedValue(makeFact({ pinned: true }));
    mockListPinnedByScope.mockResolvedValue(pinnedList);
    const result = await pinFact({ factId: "jfact001", scopeId: "jscope001" }, "agent-1");
    expect(result).toMatchObject({ pinned: true, factId: "jfact001" });
    expect(mockUpdateFact).not.toHaveBeenCalled();
  });

  test("returns isError when scope is at the 20-fact pin limit", async () => {
    mockGetFact.mockResolvedValue(makeFact({ pinned: false }));
    const twentyPinned = Array.from({ length: 20 }, (_, i) => makeFact({ _id: `jfact${i}` }));
    mockListPinnedByScope.mockResolvedValue(twentyPinned);
    const result = await pinFact({ factId: "jfact001", scopeId: "jscope001" }, "agent-1");
    expect(result).toMatchObject({ isError: true });
    expect((result as any).message).toContain("20");
    expect((result as any).pinnedFacts).toHaveLength(20);
  });

  test("pins fact and returns new pinnedCount when under limit", async () => {
    const fivePinned = Array.from({ length: 5 }, (_, i) => makeFact({ _id: `jfact${i}` }));
    mockGetFact.mockResolvedValue(makeFact({ pinned: false }));
    mockListPinnedByScope.mockResolvedValue(fivePinned);
    const result = await pinFact({ factId: "jfact001", scopeId: "jscope001" }, "agent-1");
    expect(result).toMatchObject({ pinned: true, factId: "jfact001", pinnedCount: 6 });
    expect(mockUpdateFact).toHaveBeenCalledWith(expect.objectContaining({ factId: "jfact001", pinned: true }));
  });

  test("resolves scope from fact.scopeId when scopeId arg is omitted", async () => {
    mockGetFact.mockResolvedValue(makeFact({ pinned: false, scopeId: "jscope001" }));
    mockListPinnedByScope.mockResolvedValue([]);
    const result = await pinFact({ factId: "jfact001" }, "agent-1");
    expect(mockListPinnedByScope).toHaveBeenCalledWith(expect.objectContaining({ scopeId: "jscope001" }));
    expect(result).toMatchObject({ pinned: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. unpinFact
// ─────────────────────────────────────────────────────────────────────────────

describe("unpinFact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateFact.mockResolvedValue(undefined);
  });

  test("returns isError when fact not found", async () => {
    mockGetFact.mockResolvedValue(null);
    const result = await unpinFact({ factId: "jfact999" });
    expect(result).toMatchObject({ isError: true });
    expect((result as any).message).toContain("jfact999");
  });

  test("returns pinned: false and calls updateFact with pinned: false", async () => {
    mockGetFact.mockResolvedValue(makeFact({ pinned: true }));
    const result = await unpinFact({ factId: "jfact001" });
    expect(result).toEqual({ pinned: false, factId: "jfact001" });
    expect(mockUpdateFact).toHaveBeenCalledWith(expect.objectContaining({ factId: "jfact001", pinned: false }));
  });

  test("succeeds even when fact is already unpinned (idempotent)", async () => {
    mockGetFact.mockResolvedValue(makeFact({ pinned: false }));
    const result = await unpinFact({ factId: "jfact001" });
    expect(result).toMatchObject({ pinned: false });
    expect(mockUpdateFact).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. getManifest — pinned facts, category distribution, counts
// ─────────────────────────────────────────────────────────────────────────────

describe("getManifest", () => {
  const SCOPE_ID = "jscope001";

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: scope resolves by name lookup skipped (already a Convex ID starting with "j")
    mockGetPinnedFacts.mockResolvedValue([]);
    mockListFactsByScope.mockResolvedValue([]);
    mockGetScopeByName.mockResolvedValue({ _id: SCOPE_ID, name: "private-agent-1" });
  });

  test("returns isError when no scope can be resolved", async () => {
    mockGetScopeByName.mockResolvedValue(null);
    mockGetAgentByAgentId.mockResolvedValue(null);
    const result = await getManifest({ scopeId: undefined }, "agent-orphan");
    expect(result).toMatchObject({ isError: true });
  });

  test("returns pinned facts in the pinned array", async () => {
    const pinned = [
      makeFact({ _id: "jp1", content: "Always use TypeScript", pinned: true }),
      makeFact({ _id: "jp2", content: "Prefer Convex for storage", pinned: true }),
    ];
    mockGetPinnedFacts.mockResolvedValue(pinned);
    mockListFactsByScope.mockResolvedValue(pinned);
    const result = await getManifest({ scopeId: SCOPE_ID }, "agent-1");
    expect(result).not.toHaveProperty("isError");
    const m = result as any;
    expect(m.pinned).toHaveLength(2);
    expect(m.totalPinned).toBe(2);
  });

  test("includes full content in pinned entries by default (includePinnedContent: true)", async () => {
    const pinned = [makeFact({ _id: "jp1", content: "Always use TypeScript", pinned: true })];
    mockGetPinnedFacts.mockResolvedValue(pinned);
    mockListFactsByScope.mockResolvedValue(pinned);
    const result = await getManifest({ scopeId: SCOPE_ID, includePinnedContent: true }, "agent-1") as any;
    expect(result.pinned[0].content).toBe("Always use TypeScript");
  });

  test("omits content from pinned entries when includePinnedContent is false", async () => {
    const pinned = [makeFact({ _id: "jp1", content: "Secret stuff", pinned: true, summary: "1-liner" })];
    mockGetPinnedFacts.mockResolvedValue(pinned);
    mockListFactsByScope.mockResolvedValue(pinned);
    const result = await getManifest({ scopeId: SCOPE_ID, includePinnedContent: false }, "agent-1") as any;
    expect(result.pinned[0].content).toBeUndefined();
    expect(result.pinned[0].summary).toBe("1-liner");
  });

  test("falls back to factualSummary for pinned entries when summary is missing", async () => {
    const pinned = [
      makeFact({
        _id: "jp1",
        content: "Secret stuff that should not be exposed in summary-only mode",
        pinned: true,
        summary: undefined,
        factualSummary: "Fallback disclosure summary",
      }),
    ];
    mockGetPinnedFacts.mockResolvedValue(pinned);
    mockListFactsByScope.mockResolvedValue(pinned);
    const result = await getManifest({ scopeId: SCOPE_ID, includePinnedContent: false }, "agent-1") as any;
    expect(result.pinned[0].summary).toBe("Fallback disclosure summary");
  });

  test("computes category distribution from all non-pruned/merged facts", async () => {
    const facts = [
      makeFact({ factType: "decision" }),
      makeFact({ factType: "decision" }),
      makeFact({ factType: "observation" }),
      makeFact({ factType: "error", lifecycleState: "pruned" }), // excluded from count
    ];
    mockListFactsByScope.mockResolvedValue(facts);
    const result = await getManifest({ scopeId: SCOPE_ID }, "agent-1") as any;
    const decisionCat = result.categories.find((c: any) => c.type === "decision");
    expect(decisionCat).toBeDefined();
    expect(decisionCat.count).toBe(2);
    // pruned fact type should not appear in categories (pruned loop is filtered)
    const observationCat = result.categories.find((c: any) => c.type === "observation");
    expect(observationCat.count).toBe(1);
  });

  test("excludes pruned and merged facts from totalFacts count", async () => {
    const facts = [
      makeFact({ factType: "observation", lifecycleState: "active" }),
      makeFact({ factType: "observation", lifecycleState: "pruned" }),
      makeFact({ factType: "observation", lifecycleState: "merged" }),
    ];
    mockListFactsByScope.mockResolvedValue(facts);
    const result = await getManifest({ scopeId: SCOPE_ID }, "agent-1") as any;
    expect(result.totalFacts).toBe(1);
  });

  test("sorts categories by count descending (most common type first)", async () => {
    const facts = [
      makeFact({ factType: "observation" }),
      makeFact({ factType: "observation" }),
      makeFact({ factType: "observation" }),
      makeFact({ factType: "decision" }),
      makeFact({ factType: "decision" }),
      makeFact({ factType: "error" }),
    ];
    mockListFactsByScope.mockResolvedValue(facts);
    const result = await getManifest({ scopeId: SCOPE_ID }, "agent-1") as any;
    expect(result.categories[0].type).toBe("observation"); // 3
    expect(result.categories[1].type).toBe("decision");    // 2
    expect(result.categories[2].type).toBe("error");       // 1
  });

  test("hint string is present in result", async () => {
    const result = await getManifest({ scopeId: SCOPE_ID }, "agent-1") as any;
    expect(result.hint).toContain("memory_recall");
  });

  test("category recentSummary falls back from summary to factualSummary to truncated content", async () => {
    const facts = [
      makeFact({
        _id: "jfact-summary",
        factType: "decision",
        timestamp: 3000,
        summary: "Primary summary",
        factualSummary: "Should not be used",
        content: "Longer content that should not be used",
      }),
      makeFact({
        _id: "jfact-factual",
        factType: "insight",
        timestamp: 2000,
        summary: undefined,
        factualSummary: "Fallback factual summary",
        content: "Longer content that should not be used either",
      }),
      makeFact({
        _id: "jfact-content",
        factType: "plan",
        timestamp: 1000,
        summary: undefined,
        factualSummary: undefined,
        content: "x".repeat(140),
      }),
    ];
    mockListFactsByScope.mockResolvedValue(facts);

    const result = await getManifest({ scopeId: SCOPE_ID }, "agent-1") as any;

    expect(result.categories.find((c: any) => c.type === "decision").recentSummary).toBe("Primary summary");
    expect(result.categories.find((c: any) => c.type === "insight").recentSummary).toBe("Fallback factual summary");
    expect(result.categories.find((c: any) => c.type === "plan").recentSummary).toBe("x".repeat(120));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. buildFullSystemPrompt — PINNED MEMORIES + manifest sections
// ─────────────────────────────────────────────────────────────────────────────

describe("buildFullSystemPrompt — progressive disclosure sections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Agent with one scope
    mockGetAgentByAgentId.mockResolvedValue({
      agentId: "agent-1", name: "Indy", telos: "Ship code", capabilities: ["memory"],
      defaultScope: "jscope001",
    });
    mockGetPermittedScopes.mockResolvedValue([
      { _id: "jscope001", name: "private-agent-1", members: ["agent-1"] },
    ]);
    mockListPinnedByScope.mockResolvedValue([]);
    mockListFactsByScope.mockResolvedValue([]);
    mockGetActivityStats.mockResolvedValue({
      factsStored: 5, recalls: 3, signals: 1, handoffs: 0, totalEvents: 9,
    });
    mockListAgents.mockResolvedValue([]);
    mockListConfigs.mockResolvedValue([]);
    mockGetRecentHandoffs.mockResolvedValue([]);
    mockSearchFacts.mockResolvedValue([]);
    mockListObservationSummaries.mockResolvedValue([]);
    mockGetNotifications.mockResolvedValue([]);
  });

  test("includes PINNED MEMORIES section when pinned facts exist", async () => {
    const pinnedFacts = [
      makeFact({ _id: "jp1", content: "Always snapshot before mutation", factType: "steering_rule" }),
    ];
    mockListPinnedByScope.mockResolvedValue(pinnedFacts);
    const result = await buildFullSystemPrompt({ includePinned: true }, "agent-1");
    expect(result.prompt).toContain("Pinned Memories");
    expect(result.prompt).toContain("Always snapshot before mutation");
  });

  test("omits PINNED MEMORIES section when no pinned facts exist", async () => {
    mockListPinnedByScope.mockResolvedValue([]);
    const result = await buildFullSystemPrompt({ includePinned: true }, "agent-1");
    expect(result.prompt).not.toContain("Pinned Memories");
  });

  test("omits PINNED MEMORIES section when includePinned is false", async () => {
    mockListPinnedByScope.mockResolvedValue([
      makeFact({ content: "Should not appear", pinned: true }),
    ]);
    const result = await buildFullSystemPrompt({ includePinned: false }, "agent-1");
    expect(result.prompt).not.toContain("Pinned Memories");
  });

  test("includes Memory Manifest section when facts exist and includeManifest is true", async () => {
    mockListFactsByScope.mockResolvedValue([
      makeFact({ factType: "decision" }),
      makeFact({ factType: "decision" }),
    ]);
    const result = await buildFullSystemPrompt({ includeManifest: true }, "agent-1");
    expect(result.prompt).toContain("Memory Manifest");
    expect(result.prompt).toContain("decision");
  });

  test("formats output as markdown by default (## headers)", async () => {
    const result = await buildFullSystemPrompt({}, "agent-1");
    // Output uses markdown format (## headers) even when format arg is omitted
    expect(result.prompt).toContain("## Agent Identity");
    // format field reflects the schema default (undefined when .prefault() is used)
    expect(result.prompt).toMatch(/^##\s/m);
  });

  test("formats output as XML when format=xml", async () => {
    const result = await buildFullSystemPrompt({ format: "xml" }, "agent-1");
    expect(result.prompt).toContain("<agent_identity>");
  });

  test("reports withinBudget: false when output exceeds tokenBudget", async () => {
    // Tiny budget — identity section alone will exceed it
    const result = await buildFullSystemPrompt({ tokenBudget: 1 }, "agent-1");
    expect(result.withinBudget).toBe(false);
  });

  test("pinned facts include factType label in formatted output", async () => {
    mockListPinnedByScope.mockResolvedValue([
      makeFact({ content: "Use atomic writes", factType: "steering_rule" }),
    ]);
    const result = await buildFullSystemPrompt({ includePinned: true }, "agent-1");
    expect(result.prompt).toContain("[steering_rule]");
  });
});
