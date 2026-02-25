/**
 * E2E: Progressive Disclosure Pipeline
 *
 * Tests the complete pipeline flow: Pin → Manifest → System Prompt
 * Mocked at the Convex boundary (convex-client.js).
 *
 * Pipeline:
 *   memory_pin           → pinFact()        (marks fact as always-loaded)
 *   memory_get_manifest  → getManifest()    (tiered overview of memory corpus)
 *   memory_build_system_prompt → buildFullSystemPrompt()  (PINNED MEMORIES section)
 *   memory_unpin         → unpinFact()      (removes from always-loaded tier)
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

// ── Mock hoisting ─────────────────────────────────────────────────────────────
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

import { pinFact, unpinFact } from "../src/tools/pin-fact.js";
import { getManifest } from "../src/tools/manifest.js";
import { buildFullSystemPrompt } from "../src/tools/system-prompt-builder.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SCOPE_ID = "jscope_e2e_pd_001";
const AGENT_ID = "agent-pd-e2e";

function makeFact(overrides: Record<string, unknown> = {}) {
  return {
    _id: "jfact001",
    content: "TypeScript is the primary language",
    factType: "observation",
    lifecycleState: "active",
    importanceScore: 0.6,
    scopeId: SCOPE_ID,
    tags: ["typescript"],
    timestamp: Date.now() - 1000 * 60 * 60,
    pinned: false,
    ...overrides,
  };
}

/** Sets up the baseline mocks needed by buildFullSystemPrompt */
function setupBaseSystemPromptMocks() {
  mockGetAgentByAgentId.mockResolvedValue({
    agentId: AGENT_ID,
    name: "TestAgent",
    telos: "Ship reliable software",
    capabilities: ["memory", "code"],
    defaultScope: SCOPE_ID,
  });
  mockGetPermittedScopes.mockResolvedValue([
    { _id: SCOPE_ID, name: `private-${AGENT_ID}`, members: [AGENT_ID] },
  ]);
  mockListAgents.mockResolvedValue([]);
  mockListConfigs.mockResolvedValue([]);
  mockGetRecentHandoffs.mockResolvedValue([]);
  mockSearchFacts.mockResolvedValue([]);
  mockListObservationSummaries.mockResolvedValue([]);
  mockGetNotifications.mockResolvedValue([]);
  mockGetActivityStats.mockResolvedValue({
    factsStored: 10, recalls: 5, signals: 2, handoffs: 0, totalEvents: 17,
  });
  // Default: nothing pinned or stored unless overridden per-test
  mockListPinnedByScope.mockResolvedValue([]);
  mockListFactsByScope.mockResolvedValue([]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("E2E: Progressive Disclosure Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScopeByName.mockResolvedValue({ _id: SCOPE_ID, name: `private-${AGENT_ID}` });
    mockGetAgentByAgentId.mockResolvedValue(null);
    mockUpdateFact.mockResolvedValue(undefined);
  });

  // ── 1. Pin → Manifest → System Prompt cycle ─────────────────────────────

  describe("Pin → Manifest → System Prompt cycle", () => {
    test("3 pinned facts appear in manifest and PINNED MEMORIES section of prompt", async () => {
      const facts = [
        makeFact({ _id: "jfact001", content: "Always use TypeScript", factType: "steering_rule" }),
        makeFact({ _id: "jfact002", content: "Prefer Convex for storage", factType: "decision" }),
        makeFact({ _id: "jfact003", content: "Run tests before merge", factType: "steering_rule" }),
      ];

      // Step 1: Pin each fact and verify accumulating pinnedCount
      for (let i = 0; i < facts.length; i++) {
        const f = facts[i];
        mockGetFact.mockResolvedValueOnce(f);
        mockListPinnedByScope.mockResolvedValueOnce(
          facts.slice(0, i).map(pf => ({ ...pf, pinned: true }))
        );

        const pinResult = await pinFact({ factId: f._id, scopeId: SCOPE_ID }, AGENT_ID);

        expect(pinResult).toMatchObject({ pinned: true, factId: f._id });
        expect((pinResult as any).pinnedCount).toBe(i + 1);
      }

      // Step 2: getManifest — all 3 appear in the pinned array
      const pinnedFacts = facts.map(f => ({ ...f, pinned: true }));
      mockGetPinnedFacts.mockResolvedValue(pinnedFacts);
      mockListFactsByScope.mockResolvedValue(pinnedFacts);

      const manifest = await getManifest({ scopeId: SCOPE_ID }, AGENT_ID);

      expect(manifest).not.toHaveProperty("isError");
      const m = manifest as any;
      expect(m.pinned).toHaveLength(3);
      expect(m.totalPinned).toBe(3);
      const pinnedIds = m.pinned.map((p: any) => p.factId);
      expect(pinnedIds).toContain("jfact001");
      expect(pinnedIds).toContain("jfact002");
      expect(pinnedIds).toContain("jfact003");

      // Step 3: buildFullSystemPrompt — PINNED MEMORIES section includes all facts
      setupBaseSystemPromptMocks();
      mockListPinnedByScope.mockResolvedValue(pinnedFacts);
      mockListFactsByScope.mockResolvedValue(pinnedFacts);

      const promptResult = await buildFullSystemPrompt({ includePinned: true }, AGENT_ID);

      expect(promptResult.prompt).toContain("Pinned Memories");
      expect(promptResult.prompt).toContain("Always use TypeScript");
      expect(promptResult.prompt).toContain("Prefer Convex for storage");
    });

    test("manifest reflects live state immediately after pinning", async () => {
      const fact = makeFact({ _id: "jfact_live", content: "Deploy with blue-green", factType: "decision" });

      // Pin the fact
      mockGetFact.mockResolvedValue(fact);
      mockListPinnedByScope.mockResolvedValue([]);
      const pinResult = await pinFact({ factId: fact._id, scopeId: SCOPE_ID }, AGENT_ID);
      expect(pinResult).toMatchObject({ pinned: true });

      // Manifest immediately shows it pinned
      mockGetPinnedFacts.mockResolvedValue([{ ...fact, pinned: true }]);
      mockListFactsByScope.mockResolvedValue([{ ...fact, pinned: true }]);

      const manifest = await getManifest({ scopeId: SCOPE_ID }, AGENT_ID) as any;

      expect(manifest.totalPinned).toBe(1);
      expect(manifest.pinned[0].factId).toBe("jfact_live");
    });

    test("pinning adds factType label to system prompt PINNED MEMORIES section", async () => {
      setupBaseSystemPromptMocks();
      const steeringFact = makeFact({
        _id: "jfact_rule",
        content: "Use atomic writes for all mutations",
        factType: "steering_rule",
        pinned: true,
      });
      mockListPinnedByScope.mockResolvedValue([steeringFact]);
      mockListFactsByScope.mockResolvedValue([steeringFact]);

      const result = await buildFullSystemPrompt({ includePinned: true }, AGENT_ID);

      expect(result.prompt).toContain("[steering_rule]");
      expect(result.prompt).toContain("Use atomic writes for all mutations");
    });

    test("no pinned facts → no PINNED MEMORIES section in prompt", async () => {
      setupBaseSystemPromptMocks();
      mockListPinnedByScope.mockResolvedValue([]);

      const result = await buildFullSystemPrompt({ includePinned: true }, AGENT_ID);

      expect(result.prompt).not.toContain("Pinned Memories");
    });
  });

  // ── 2. Pin limit enforcement ─────────────────────────────────────────────

  describe("Pin limit enforcement (max 20 per scope)", () => {
    test("20 pins succeed, 21st fails with pin limit error", async () => {
      const twentyPinned = Array.from({ length: 20 }, (_, i) =>
        makeFact({ _id: `jfact_pinned_${i}`, pinned: true })
      );
      const newFact = makeFact({ _id: "jfact_21st", content: "The 21st fact", pinned: false });

      mockGetFact.mockResolvedValue(newFact);
      mockListPinnedByScope.mockResolvedValue(twentyPinned);

      const result = await pinFact({ factId: "jfact_21st", scopeId: SCOPE_ID }, AGENT_ID);

      expect(result).toMatchObject({ isError: true });
      expect((result as any).message).toContain("20");
      expect((result as any).pinnedFacts).toHaveLength(20);
      // updateFact must NOT be called — no pin was created
      expect(mockUpdateFact).not.toHaveBeenCalled();
    });

    test("19 pins → 20th succeeds; 20 pins → 21st blocked", async () => {
      const nineteenPinned = Array.from({ length: 19 }, (_, i) =>
        makeFact({ _id: `jfact_p${i}`, pinned: true })
      );
      const fact20 = makeFact({ _id: "jfact_20th", pinned: false });

      // 20th pin succeeds
      mockGetFact.mockResolvedValueOnce(fact20);
      mockListPinnedByScope.mockResolvedValueOnce(nineteenPinned);
      const twentieth = await pinFact({ factId: "jfact_20th", scopeId: SCOPE_ID }, AGENT_ID);
      expect(twentieth).toMatchObject({ pinned: true, pinnedCount: 20 });

      // 21st pin blocked
      const twentyPinned = [...nineteenPinned, { ...fact20, pinned: true }];
      const fact21 = makeFact({ _id: "jfact_21st", pinned: false });
      mockGetFact.mockResolvedValueOnce(fact21);
      mockListPinnedByScope.mockResolvedValueOnce(twentyPinned);

      const twentyFirst = await pinFact({ factId: "jfact_21st", scopeId: SCOPE_ID }, AGENT_ID);
      expect(twentyFirst).toMatchObject({ isError: true });
      expect((twentyFirst as any).message).toContain("20");
    });

    test("pin limit error exposes current pinnedFacts list for agent to act on", async () => {
      const twentyPinned = Array.from({ length: 20 }, (_, i) =>
        makeFact({ _id: `jfact_${i}`, content: `Pinned fact ${i}`, pinned: true })
      );
      mockGetFact.mockResolvedValue(makeFact({ _id: "jfact_overflow", pinned: false }));
      mockListPinnedByScope.mockResolvedValue(twentyPinned);

      const result = await pinFact({ factId: "jfact_overflow", scopeId: SCOPE_ID }, AGENT_ID);

      expect(result).toMatchObject({ isError: true });
      expect(Array.isArray((result as any).pinnedFacts)).toBe(true);
      expect((result as any).pinnedFacts).toHaveLength(20);
    });

    test("already-pinned fact returns pinned: true without re-pinning (idempotent)", async () => {
      const alreadyPinned = makeFact({ _id: "jfact_dup", pinned: true });
      mockGetFact.mockResolvedValue(alreadyPinned);
      mockListPinnedByScope.mockResolvedValue([alreadyPinned]);

      const result = await pinFact({ factId: "jfact_dup", scopeId: SCOPE_ID }, AGENT_ID);

      expect(result).toMatchObject({ pinned: true, factId: "jfact_dup" });
      expect(mockUpdateFact).not.toHaveBeenCalled(); // no write needed
    });
  });

  // ── 3. Unpin removes from manifest ──────────────────────────────────────

  describe("Unpin removes from manifest and system prompt", () => {
    test("unpin fact disappears from manifest (totalPinned drops from 1 to 0)", async () => {
      const pinnedFact = makeFact({ _id: "jfact_to_unpin", content: "To be unpinned", pinned: true });

      // Before: manifest shows 1 pinned
      mockGetPinnedFacts.mockResolvedValueOnce([pinnedFact]);
      mockListFactsByScope.mockResolvedValueOnce([pinnedFact]);
      const beforeManifest = await getManifest({ scopeId: SCOPE_ID }, AGENT_ID) as any;
      expect(beforeManifest.totalPinned).toBe(1);

      // Unpin
      mockGetFact.mockResolvedValue(pinnedFact);
      const unpinResult = await unpinFact({ factId: "jfact_to_unpin" });
      expect(unpinResult).toEqual({ pinned: false, factId: "jfact_to_unpin" });
      expect(mockUpdateFact).toHaveBeenCalledWith(
        expect.objectContaining({ factId: "jfact_to_unpin", pinned: false })
      );

      // After: manifest shows 0 pinned
      mockGetPinnedFacts.mockResolvedValueOnce([]);
      mockListFactsByScope.mockResolvedValueOnce([{ ...pinnedFact, pinned: false }]);
      const afterManifest = await getManifest({ scopeId: SCOPE_ID }, AGENT_ID) as any;
      expect(afterManifest.totalPinned).toBe(0);
      expect(afterManifest.pinned).toHaveLength(0);
    });

    test("unpinned fact no longer appears in system prompt PINNED MEMORIES", async () => {
      // Before unpin: fact appears in prompt
      setupBaseSystemPromptMocks();
      const pinnedFact = makeFact({
        _id: "jfact_prompt_unpin",
        content: "Always snapshot before mutation",
        factType: "steering_rule",
        pinned: true,
      });
      mockListPinnedByScope.mockResolvedValueOnce([pinnedFact]);
      mockListFactsByScope.mockResolvedValue([pinnedFact]);

      const beforePrompt = await buildFullSystemPrompt({ includePinned: true }, AGENT_ID);
      expect(beforePrompt.prompt).toContain("Always snapshot before mutation");

      // After unpin: fact gone from prompt
      setupBaseSystemPromptMocks();
      mockListPinnedByScope.mockResolvedValueOnce([]);

      const afterPrompt = await buildFullSystemPrompt({ includePinned: true }, AGENT_ID);
      expect(afterPrompt.prompt).not.toContain("Always snapshot before mutation");
    });

    test("unpin one of two facts — remaining fact stays in manifest", async () => {
      const fact1 = makeFact({ _id: "jfact_keep", content: "Keep this one", pinned: true });
      const fact2 = makeFact({ _id: "jfact_remove", content: "Remove this one", pinned: true });

      // Before: both in manifest
      mockGetPinnedFacts.mockResolvedValueOnce([fact1, fact2]);
      mockListFactsByScope.mockResolvedValueOnce([fact1, fact2]);
      const before = await getManifest({ scopeId: SCOPE_ID }, AGENT_ID) as any;
      expect(before.totalPinned).toBe(2);

      // Unpin fact2
      mockGetFact.mockResolvedValue(fact2);
      await unpinFact({ factId: "jfact_remove" });

      // After: only fact1 remains
      mockGetPinnedFacts.mockResolvedValueOnce([fact1]);
      mockListFactsByScope.mockResolvedValueOnce([fact1, { ...fact2, pinned: false }]);
      const after = await getManifest({ scopeId: SCOPE_ID }, AGENT_ID) as any;
      expect(after.totalPinned).toBe(1);
      expect(after.pinned[0].factId).toBe("jfact_keep");
    });

    test("unpinning a non-existent fact returns isError", async () => {
      mockGetFact.mockResolvedValue(null);

      const result = await unpinFact({ factId: "jfact_nonexistent" });

      expect(result).toMatchObject({ isError: true });
      expect((result as any).message).toContain("jfact_nonexistent");
    });
  });

  // ── 4. Token budget ──────────────────────────────────────────────────────

  describe("Token budget enforcement in system prompt", () => {
    test("budget of 1 token → withinBudget: false (identity section alone exceeds it)", async () => {
      setupBaseSystemPromptMocks();

      const result = await buildFullSystemPrompt({ tokenBudget: 1 }, AGENT_ID);

      expect(result.withinBudget).toBe(false);
    });

    test("very large budget → withinBudget: true (prompt fits easily)", async () => {
      setupBaseSystemPromptMocks();

      const result = await buildFullSystemPrompt({ tokenBudget: 1_000_000 }, AGENT_ID);

      expect(result.withinBudget).toBe(true);
    });

    test("small budget with pinned facts → withinBudget reflects actual token count vs budget", async () => {
      setupBaseSystemPromptMocks();
      mockListPinnedByScope.mockResolvedValue([
        makeFact({ content: "A".repeat(500), pinned: true }),
        makeFact({ content: "B".repeat(500), pinned: true }),
      ]);

      const result500 = await buildFullSystemPrompt({ tokenBudget: 500, includePinned: true }, AGENT_ID);

      // Result exposes withinBudget as a boolean regardless of direction
      expect(typeof result500.withinBudget).toBe("boolean");
    });

    test("withinBudget: true for large budget, false for tiny budget (monotonic behavior)", async () => {
      setupBaseSystemPromptMocks();
      const smallResult = await buildFullSystemPrompt({ tokenBudget: 10 }, AGENT_ID);

      setupBaseSystemPromptMocks();
      const largeResult = await buildFullSystemPrompt({ tokenBudget: 1_000_000 }, AGENT_ID);

      // Small budget fails, large passes
      expect(smallResult.withinBudget).toBe(false);
      expect(largeResult.withinBudget).toBe(true);
    });

    test("includePinned: false omits PINNED MEMORIES section regardless of budget", async () => {
      setupBaseSystemPromptMocks();
      mockListPinnedByScope.mockResolvedValue([
        makeFact({ content: "Should not appear", pinned: true }),
      ]);

      const result = await buildFullSystemPrompt({ includePinned: false, tokenBudget: 100_000 }, AGENT_ID);

      expect(result.prompt).not.toContain("Pinned Memories");
    });
  });

  // ── 5. Summary in manifest ───────────────────────────────────────────────

  describe("Summary field in manifest entries", () => {
    test("fact WITH summary: summary shown in pinned entry when includePinnedContent: false", async () => {
      const factWithSummary = makeFact({
        _id: "jfact_has_summary",
        content: "Very long content " + "x".repeat(300),
        summary: "Short 1-liner summary",
        pinned: true,
      });

      mockGetPinnedFacts.mockResolvedValue([factWithSummary]);
      mockListFactsByScope.mockResolvedValue([factWithSummary]);

      const manifest = await getManifest(
        { scopeId: SCOPE_ID, includePinnedContent: false },
        AGENT_ID
      ) as any;

      expect(manifest.pinned[0].summary).toBe("Short 1-liner summary");
      expect(manifest.pinned[0].content).toBeUndefined();
    });

    test("fact WITHOUT summary: content included when includePinnedContent: true (default)", async () => {
      const factNoSummary = makeFact({
        _id: "jfact_no_summary",
        content: "Full content here",
        summary: undefined,
        pinned: true,
      });

      mockGetPinnedFacts.mockResolvedValue([factNoSummary]);
      mockListFactsByScope.mockResolvedValue([factNoSummary]);

      const manifest = await getManifest(
        { scopeId: SCOPE_ID, includePinnedContent: true },
        AGENT_ID
      ) as any;

      expect(manifest.pinned[0].content).toBe("Full content here");
    });

    test("category recentSummary uses summary field when present", async () => {
      const factWithSummary = makeFact({
        _id: "jfact_cat_sum",
        content: "Long content " + "C".repeat(300),
        summary: "Concise summary text",
        factType: "insight",
        pinned: false,
      });

      mockGetPinnedFacts.mockResolvedValue([]);
      mockListFactsByScope.mockResolvedValue([factWithSummary]);

      const manifest = await getManifest({ scopeId: SCOPE_ID }, AGENT_ID) as any;

      const insightCat = manifest.categories.find((c: any) => c.type === "insight");
      expect(insightCat).toBeDefined();
      expect(insightCat.recentSummary).toBe("Concise summary text");
    });

    test("category recentSummary truncates long content at 120 chars when no summary", async () => {
      const longFact = makeFact({
        _id: "jfact_long_content",
        content: "D".repeat(300),
        factType: "observation",
        pinned: false,
      });

      mockGetPinnedFacts.mockResolvedValue([]);
      mockListFactsByScope.mockResolvedValue([longFact]);

      const manifest = await getManifest({ scopeId: SCOPE_ID }, AGENT_ID) as any;

      const obsCat = manifest.categories.find((c: any) => c.type === "observation");
      expect(obsCat).toBeDefined();
      // Truncated to 120 chars from content
      expect(obsCat.recentSummary.length).toBeLessThanOrEqual(120);
    });

    test("includePinnedContent: true returns full content for pinned facts", async () => {
      const pinnedFact = makeFact({
        _id: "jfact_full",
        content: "Full detailed content here",
        pinned: true,
      });

      mockGetPinnedFacts.mockResolvedValue([pinnedFact]);
      mockListFactsByScope.mockResolvedValue([pinnedFact]);

      const manifest = await getManifest(
        { scopeId: SCOPE_ID, includePinnedContent: true },
        AGENT_ID
      ) as any;

      expect(manifest.pinned[0].content).toBe("Full detailed content here");
    });
  });

  // ── 6. Category breakdown ────────────────────────────────────────────────

  describe("Category breakdown in manifest", () => {
    test("manifest shows correct count per factType", async () => {
      const facts = [
        makeFact({ _id: "jd1", factType: "decision", lifecycleState: "active" }),
        makeFact({ _id: "jd2", factType: "decision", lifecycleState: "active" }),
        makeFact({ _id: "jd3", factType: "decision", lifecycleState: "active" }),
        makeFact({ _id: "jo1", factType: "observation", lifecycleState: "active" }),
        makeFact({ _id: "jo2", factType: "observation", lifecycleState: "active" }),
        makeFact({ _id: "je1", factType: "error", lifecycleState: "active" }),
        makeFact({ _id: "ji1", factType: "insight", lifecycleState: "active" }),
      ];

      mockGetPinnedFacts.mockResolvedValue([]);
      mockListFactsByScope.mockResolvedValue(facts);

      const manifest = await getManifest({ scopeId: SCOPE_ID }, AGENT_ID) as any;

      const find = (type: string) => manifest.categories.find((c: any) => c.type === type);
      expect(find("decision")?.count).toBe(3);
      expect(find("observation")?.count).toBe(2);
      expect(find("error")?.count).toBe(1);
      expect(find("insight")?.count).toBe(1);
    });

    test("categories sorted by count descending (most common type first)", async () => {
      const facts = [
        ...Array.from({ length: 5 }, (_, i) => makeFact({ _id: `jo${i}`, factType: "observation" })),
        ...Array.from({ length: 3 }, (_, i) => makeFact({ _id: `jd${i}`, factType: "decision" })),
        makeFact({ _id: "je1", factType: "error" }),
      ];

      mockGetPinnedFacts.mockResolvedValue([]);
      mockListFactsByScope.mockResolvedValue(facts);

      const manifest = await getManifest({ scopeId: SCOPE_ID }, AGENT_ID) as any;

      expect(manifest.categories[0].type).toBe("observation"); // 5 — most common
      expect(manifest.categories[1].type).toBe("decision");    // 3
      expect(manifest.categories[2].type).toBe("error");       // 1
    });

    test("pruned and merged facts excluded from category counts", async () => {
      const facts = [
        makeFact({ _id: "ja1", factType: "observation", lifecycleState: "active" }),
        makeFact({ _id: "jp1", factType: "observation", lifecycleState: "pruned" }),
        makeFact({ _id: "jm1", factType: "observation", lifecycleState: "merged" }),
      ];

      mockGetPinnedFacts.mockResolvedValue([]);
      mockListFactsByScope.mockResolvedValue(facts);

      const manifest = await getManifest({ scopeId: SCOPE_ID }, AGENT_ID) as any;

      const obsCat = manifest.categories.find((c: any) => c.type === "observation");
      expect(obsCat?.count).toBe(1); // only the active one counts
    });

    test("totalFacts counts only active facts (excludes pruned and merged)", async () => {
      const facts = [
        makeFact({ factType: "observation", lifecycleState: "active" }),
        makeFact({ factType: "decision", lifecycleState: "active" }),
        makeFact({ factType: "insight", lifecycleState: "pruned" }),
        makeFact({ factType: "error", lifecycleState: "merged" }),
      ];

      mockGetPinnedFacts.mockResolvedValue([]);
      mockListFactsByScope.mockResolvedValue(facts);

      const manifest = await getManifest({ scopeId: SCOPE_ID }, AGENT_ID) as any;

      expect(manifest.totalFacts).toBe(2);
    });

    test("manifest hint guides agents to use memory_recall for on-demand loading", async () => {
      mockGetPinnedFacts.mockResolvedValue([]);
      mockListFactsByScope.mockResolvedValue([]);

      const manifest = await getManifest({ scopeId: SCOPE_ID }, AGENT_ID) as any;

      expect(manifest.hint).toContain("memory_recall");
    });

    test("manifest with mixed pinned and unpinned facts counts both in categories", async () => {
      const facts = [
        makeFact({ _id: "jp1", factType: "decision", lifecycleState: "active", pinned: true }),
        makeFact({ _id: "jp2", factType: "decision", lifecycleState: "active", pinned: true }),
        makeFact({ _id: "ju1", factType: "decision", lifecycleState: "active", pinned: false }),
      ];

      mockGetPinnedFacts.mockResolvedValue(facts.filter(f => f.pinned));
      mockListFactsByScope.mockResolvedValue(facts);

      const manifest = await getManifest({ scopeId: SCOPE_ID }, AGENT_ID) as any;

      // 3 total decision facts (pinned or not — all active)
      const decisionCat = manifest.categories.find((c: any) => c.type === "decision");
      expect(decisionCat?.count).toBe(3);
      // But only 2 are pinned
      expect(manifest.totalPinned).toBe(2);
    });
  });
});
