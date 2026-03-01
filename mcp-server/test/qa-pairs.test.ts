/**
 * Tests for QA-Pair Representation (Panini-inspired, Phase 4).
 *
 * Covers:
 *   - Heuristic QA generation (factType → question template)
 *   - Entity extraction, confidence, unsupported factTypes
 *   - QA recall pathway integration in hybrid mode
 *   - RRF fusion of text + vector + QA result sets
 *   - _qaMatch flag on QA-sourced facts
 *   - Deduplication when same fact appears in multiple pathways
 *   - Chain recall: maxHops depth limit, shallowest-wins dedup
 */

import { describe, test, expect, vi, beforeEach, beforeAll } from "vitest";
import { generateHeuristicQA, generateQAPair } from "../src/lib/enrich-qa.js";
// NOTE: rrf.js is mocked below for recall integration tests, so we use vi.importActual
// in the RRF describe block to test the real implementation.
let realRRF: (sets: Array<Array<{ _id: string; [key: string]: any }>>, k?: number) => any[];

// ─── Mocks for recall integration tests ──────────────────────────────────────

const {
  mockTextSearch,
  mockVectorSearch,
  mockBumpAccessBatch,
  mockRecordRecall,
  mockRankCandidatesPrimitive,
  mockResolveScopes,
  mockGetGraphNeighbors,
  mockReciprocalRankFusion,
  mockExtractEntityIds,
  mockReadFile,
  mockKvGet,
  mockLogEvent,
  mockGetRecentlyEnrichedFactIds,
  mockSearchByQA,
} = vi.hoisted(() => ({
  mockTextSearch: vi.fn(),
  mockVectorSearch: vi.fn(),
  mockBumpAccessBatch: vi.fn(),
  mockRecordRecall: vi.fn(),
  mockRankCandidatesPrimitive: vi.fn(),
  mockResolveScopes: vi.fn(),
  mockGetGraphNeighbors: vi.fn(),
  mockReciprocalRankFusion: vi.fn(),
  mockExtractEntityIds: vi.fn(),
  mockReadFile: vi.fn(),
  mockKvGet: vi.fn(),
  mockLogEvent: vi.fn(),
  mockGetRecentlyEnrichedFactIds: vi.fn(),
  mockSearchByQA: vi.fn(),
}));

vi.mock("../src/tools/primitive-retrieval.js", () => ({
  textSearch: mockTextSearch,
  vectorSearch: mockVectorSearch,
  bumpAccessBatch: mockBumpAccessBatch,
  recordRecall: mockRecordRecall,
}));

vi.mock("../src/tools/rank-candidates.js", () => ({
  rankCandidatesPrimitive: mockRankCandidatesPrimitive,
}));

vi.mock("../src/tools/context-primitives.js", () => ({
  resolveScopes: mockResolveScopes,
  getGraphNeighbors: mockGetGraphNeighbors,
}));

vi.mock("../src/lib/rrf.js", () => ({
  reciprocalRankFusion: mockReciprocalRankFusion,
  extractEntityIds: mockExtractEntityIds,
}));

vi.mock("node:fs/promises", () => ({
  default: { readFile: mockReadFile },
}));

vi.mock("../src/lib/convex-client.js", () => ({
  kvGet: mockKvGet,
  logEvent: mockLogEvent,
  getRecentlyEnrichedFactIds: mockGetRecentlyEnrichedFactIds,
  searchByQA: mockSearchByQA,
}));

import { recall } from "../src/tools/recall.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_FACT = {
  _id: "fact_base",
  content: "We decided to use TypeScript for all new services.",
  timestamp: Date.now(),
  importanceScore: 0.8,
  entityIds: ["entity-typescript"],
  factType: "decision",
};

function makeFact(overrides: Partial<typeof BASE_FACT> & { _id: string }) {
  return { ...BASE_FACT, ...overrides };
}

function defaultRank(facts: any[]) {
  return {
    ranked: facts,
    totalCandidates: facts.length,
    returnedCount: facts.length,
  };
}

// ─── Part 1: Heuristic QA Generation ─────────────────────────────────────────

describe("generateHeuristicQA — question templates", () => {
  test("decision factType produces 'What was decided about' question", () => {
    const result = generateHeuristicQA(
      "We decided to adopt TypeScript across all services.",
      "decision",
      ["entity-typescript"]
    );
    expect(result).not.toBeNull();
    expect(result!.qaQuestion).toBe("What was decided about typescript?");
  });

  test("observation factType produces 'What was observed about' question", () => {
    const result = generateHeuristicQA(
      "Memory usage spiked during the batch job.",
      "observation",
      ["entity-memory"]
    );
    expect(result).not.toBeNull();
    expect(result!.qaQuestion).toBe("What was observed about memory?");
  });

  test("insight factType produces 'What insight was gained about' question", () => {
    const result = generateHeuristicQA(
      "Caching query results reduces latency significantly.",
      "insight",
      ["entity-caching"]
    );
    expect(result).not.toBeNull();
    expect(result!.qaQuestion).toBe("What insight was gained about caching?");
  });

  test("correction factType produces 'What correction was made to' question", () => {
    const result = generateHeuristicQA(
      "The authentication flow was fixed to use bcrypt.",
      "correction",
      ["entity-authentication"]
    );
    expect(result).not.toBeNull();
    expect(result!.qaQuestion).toBe("What correction was made to authentication?");
  });

  test("unsupported factType (plan) returns null — no QA for plan facts", () => {
    const result = generateHeuristicQA(
      "Plan to refactor the API gateway.",
      "plan",
      ["entity-api"]
    );
    expect(result).toBeNull();
  });

  test("unsupported factType (session_summary) returns null", () => {
    const result = generateHeuristicQA(
      "Session summary: reviewed architecture docs.",
      "session_summary",
      []
    );
    expect(result).toBeNull();
  });

  test("unsupported factType (learning) returns null", () => {
    const result = generateHeuristicQA(
      "Learned that Cohere Embed 4 works well for code.",
      "learning",
      ["entity-cohere"]
    );
    expect(result).toBeNull();
  });
});

describe("generateHeuristicQA — answer field", () => {
  test("qaAnswer is the full content verbatim", () => {
    const content = "We decided to migrate from REST to GraphQL.";
    const result = generateHeuristicQA(content, "decision", ["entity-graphql"]);
    expect(result!.qaAnswer).toBe(content);
  });
});

describe("generateHeuristicQA — confidence", () => {
  test("heuristic QA pairs always have 0.6 confidence", () => {
    for (const factType of ["decision", "observation", "insight", "correction"] as const) {
      const result = generateHeuristicQA("Some content.", factType, ["entity-foo"]);
      expect(result!.qaConfidence).toBe(0.6);
    }
  });

  test("confidence is not 0.9 (which signals LLM-generated, not heuristic)", () => {
    const result = generateHeuristicQA("A decision was made.", "decision", []);
    expect(result!.qaConfidence).not.toBe(0.9);
  });
});

describe("generateQAPair — high-value upgrade path", () => {
  test("upgrades high-importance decision facts above heuristic confidence", () => {
    const result = generateQAPair(
      "We decided to standardize on TypeScript for all new backend services because the tooling is stronger.",
      "decision",
      ["entity-typescript", "entity-backend"],
      0.86
    );

    expect(result).not.toBeNull();
    expect(result!.qaConfidence).toBeGreaterThan(0.6);
    expect(result!.qaQuestion).toContain("TypeScript");
  });

  test("keeps low-importance observations on heuristic confidence", () => {
    const result = generateQAPair(
      "The cache warmed successfully after the cron tick.",
      "observation",
      ["entity-cache"],
      0.45
    );

    expect(result).not.toBeNull();
    expect(result!.qaConfidence).toBe(0.6);
  });
});

describe("generateHeuristicQA — entity extraction", () => {
  test("entity IDs are included in qaEntities", () => {
    const result = generateHeuristicQA(
      "Decided to adopt Convex for the backend.",
      "decision",
      ["entity-convex", "entity-backend"]
    );
    expect(result!.qaEntities).toContain("entity-convex");
    expect(result!.qaEntities).toContain("entity-backend");
  });

  test("qaEntities is capped at 5 entities to prevent oversized arrays", () => {
    const manyEntities = ["e1", "e2", "e3", "e4", "e5", "e6", "e7"];
    const result = generateHeuristicQA("Decision content.", "decision", manyEntities);
    expect(result!.qaEntities!.length).toBeLessThanOrEqual(5);
  });

  test("falls back to proper noun from content when no entities provided", () => {
    const result = generateHeuristicQA(
      "PostgreSQL was chosen for the database layer.",
      "decision",
      []
    );
    expect(result).not.toBeNull();
    // Topic should be extracted from content (PostgreSQL is a proper noun)
    expect(result!.qaQuestion).toMatch(/PostgreSQL|chosen|PostgreSQL/i);
  });

  test("falls back to first words when no entities and no proper nouns", () => {
    const result = generateHeuristicQA(
      "something was decided here about the setup",
      "decision",
      []
    );
    // Should still return a non-null result (last-resort fallback)
    expect(result).not.toBeNull();
    expect(result!.qaQuestion.length).toBeGreaterThan(0);
  });

  test("entity label is derived from entity ID by stripping 'entity-' prefix", () => {
    const result = generateHeuristicQA(
      "Decision about the search system.",
      "decision",
      ["entity-search-system"]
    );
    // "entity-search-system" → "search system"
    expect(result!.qaQuestion).toContain("search system");
  });
});

// ─── Part 2: RRF Fusion (real implementation, not mocked) ────────────────────

describe("reciprocalRankFusion — QA pathway fusion", () => {
  // rrf.js is mocked globally for the recall integration tests in this file.
  // We use vi.importActual here to exercise the real algorithm.
  beforeAll(async () => {
    const mod = await vi.importActual<{ reciprocalRankFusion: typeof realRRF }>(
      "../src/lib/rrf.js"
    );
    realRRF = mod.reciprocalRankFusion;
  });

  test("same fact in text and QA pathways is deduped into single result", () => {
    const sharedFact = { _id: "fact_shared", content: "Shared result", importanceScore: 0.8 };
    const textOnly = { _id: "fact_text_only", content: "Text result", importanceScore: 0.5 };
    const qaOnly = { _id: "fact_qa_only", content: "QA result", importanceScore: 0.6 };

    const fused = realRRF([
      [sharedFact, textOnly],   // text results
      [sharedFact, qaOnly],     // QA results
    ]);

    const ids = fused.map((f: any) => f._id);
    expect(ids.filter((id: string) => id === "fact_shared")).toHaveLength(1);
    expect(ids).toHaveLength(3);
  });

  test("fact appearing in both text and QA pathways scores higher than single-pathway facts", () => {
    const sharedFact = { _id: "fact_shared", content: "Shared" };
    const singleFact = { _id: "fact_single", content: "Single" };

    const fused = realRRF([
      [sharedFact],             // text pathway rank 0
      [sharedFact, singleFact], // QA pathway rank 0, 1
    ]);

    const sharedEntry = fused.find((f: any) => f._id === "fact_shared")!;
    const singleEntry = fused.find((f: any) => f._id === "fact_single")!;
    expect(sharedEntry.rrf_score).toBeGreaterThan(singleEntry.rrf_score);
  });

  test("3-way fusion (vector + text + QA) ranks triple-pathway fact highest", () => {
    const tripleHit = { _id: "triple", content: "Found everywhere" };
    const doubleHit = { _id: "double", content: "Found in two pathways" };
    const singleHit = { _id: "single", content: "Found in one pathway" };

    const fused = realRRF([
      [tripleHit, doubleHit],            // vector
      [tripleHit, doubleHit, singleHit], // text
      [tripleHit, singleHit],            // QA
    ]);

    const ranked = fused.map((f: any) => f._id);
    expect(ranked[0]).toBe("triple");
    expect(ranked[1]).toBe("double");
  });

  test("rrf_score is non-zero for every returned fact", () => {
    const facts = [
      { _id: "a", content: "alpha" },
      { _id: "b", content: "beta" },
    ];
    const fused = realRRF([facts]);
    for (const fact of fused) {
      expect(fact.rrf_score).toBeGreaterThan(0);
    }
  });

  test("merges pathway metadata when the same fact appears in multiple result sets", () => {
    const sharedFactText = { _id: "fact_shared", content: "Shared", _pathways: ["symbolic"] };
    const sharedFactQa = {
      _id: "fact_shared",
      content: "Shared",
      _pathways: ["qa"],
      _qaMatch: true,
      qaConfidence: 0.82,
    };

    const fused = realRRF([
      [sharedFactText],
      [sharedFactQa],
    ]);

    expect(fused[0]._pathways).toEqual(expect.arrayContaining(["symbolic", "qa"]));
    expect(fused[0]._qaMatch).toBe(true);
    expect(fused[0].qaConfidence).toBe(0.82);
  });
});

// ─── Part 3: Recall Integration — QA Pathway ─────────────────────────────────

describe("recall — QA search pathway integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    mockResolveScopes.mockResolvedValue({
      scopeIds: ["scope_1"],
      resolved: [{ name: "private-agent-1", id: "scope_1" }],
    });
    mockExtractEntityIds.mockReturnValue([]);
    mockBumpAccessBatch.mockResolvedValue(undefined);
    mockRecordRecall.mockResolvedValue(undefined);
    mockKvGet.mockResolvedValue(null);
    mockLogEvent.mockResolvedValue(undefined);
    mockGetRecentlyEnrichedFactIds.mockResolvedValue(new Set());
    mockSearchByQA.mockResolvedValue([]);
    mockTextSearch.mockResolvedValue([]);
    mockVectorSearch.mockResolvedValue([]);
    mockReciprocalRankFusion.mockImplementation((sets: any[][]) => sets.flat());
  });

  test("QA search is called when strategy is 'hybrid'", async () => {
    const fact = makeFact({ _id: "fact_qa" });
    mockSearchByQA.mockResolvedValue([{ ...fact, _qaMatch: true }]);
    mockRankCandidatesPrimitive.mockResolvedValue(defaultRank([fact]));

    await recall({ query: "What was decided about TypeScript?", searchStrategy: "hybrid" }, "agent-1");

    expect(mockSearchByQA).toHaveBeenCalledWith(
      expect.objectContaining({ query: "What was decided about TypeScript?", scopeIds: ["scope_1"] })
    );
  });

  test("QA search is NOT called when strategy is 'text-only'", async () => {
    mockRankCandidatesPrimitive.mockResolvedValue(defaultRank([]));

    await recall({ query: "TypeScript decision", searchStrategy: "text-only" }, "agent-1");

    expect(mockSearchByQA).not.toHaveBeenCalled();
  });

  test("QA search is NOT called when strategy is 'vector-only'", async () => {
    mockRankCandidatesPrimitive.mockResolvedValue(defaultRank([]));

    await recall({ query: "TypeScript decision", searchStrategy: "vector-only" }, "agent-1");

    expect(mockSearchByQA).not.toHaveBeenCalled();
  });

  test("'qa' pathway appears in result pathways when QA search returns results", async () => {
    const qaFact = { ...makeFact({ _id: "fact_qa" }), _qaMatch: true };
    mockSearchByQA.mockResolvedValue([qaFact]);
    mockRankCandidatesPrimitive.mockResolvedValue(defaultRank([qaFact]));

    const result = await recall(
      { query: "TypeScript decision", searchStrategy: "hybrid" },
      "agent-1"
    );

    expect("pathways" in result).toBe(true);
    if ("pathways" in result) {
      expect(result.pathways).toContain("qa");
    }
  });

  test("'qa' pathway does NOT appear when QA search returns no results", async () => {
    mockSearchByQA.mockResolvedValue([]);
    mockTextSearch.mockResolvedValue([makeFact({ _id: "fact_text" })]);
    mockRankCandidatesPrimitive.mockResolvedValue(defaultRank([makeFact({ _id: "fact_text" })]));

    const result = await recall(
      { query: "TypeScript", searchStrategy: "hybrid" },
      "agent-1"
    );

    expect("pathways" in result).toBe(true);
    if ("pathways" in result) {
      expect(result.pathways).not.toContain("qa");
    }
  });

  test("QA-sourced facts carry _qaMatch=true flag", async () => {
    const qaFact = { ...makeFact({ _id: "fact_qa" }), _qaMatch: true };
    mockSearchByQA.mockResolvedValue([qaFact]);
    mockRankCandidatesPrimitive.mockResolvedValue(defaultRank([qaFact]));

    const result = await recall(
      { query: "TypeScript", searchStrategy: "hybrid" },
      "agent-1"
    );

    expect("facts" in result).toBe(true);
    if ("facts" in result) {
      const qaFacts = result.facts.filter((f: any) => f._qaMatch === true);
      expect(qaFacts.length).toBeGreaterThan(0);
    }
  });

  test("facts found only via text search do NOT have _qaMatch=true", async () => {
    const textFact = makeFact({ _id: "fact_text" }); // no _qaMatch
    mockSearchByQA.mockResolvedValue([]);
    mockTextSearch.mockResolvedValue([textFact]);
    mockRankCandidatesPrimitive.mockResolvedValue(defaultRank([textFact]));

    const result = await recall(
      { query: "TypeScript", searchStrategy: "hybrid" },
      "agent-1"
    );

    expect("facts" in result).toBe(true);
    if ("facts" in result) {
      const qaFacts = result.facts.filter((f: any) => f._qaMatch === true);
      expect(qaFacts.length).toBe(0);
    }
  });

  test("QA search failure is non-fatal — recall still succeeds", async () => {
    mockSearchByQA.mockRejectedValue(new Error("Convex QA search timeout"));
    mockTextSearch.mockResolvedValue([makeFact({ _id: "fact_text" })]);
    mockRankCandidatesPrimitive.mockResolvedValue(defaultRank([makeFact({ _id: "fact_text" })]));

    const result = await recall(
      { query: "TypeScript", searchStrategy: "hybrid" },
      "agent-1"
    );

    // Should succeed despite QA failure
    expect("facts" in result).toBe(true);
    expect("isError" in result).toBe(false);
  });

  test("RRF is invoked when QA + text both return results (3 sets with vector)", async () => {
    const textFact = makeFact({ _id: "fact_text" });
    const qaFact = { ...makeFact({ _id: "fact_qa" }), _qaMatch: true };
    const vectorFact = makeFact({ _id: "fact_vector" });

    mockTextSearch.mockResolvedValue([textFact]);
    mockVectorSearch.mockResolvedValue([vectorFact]);
    mockSearchByQA.mockResolvedValue([qaFact]);
    mockReciprocalRankFusion.mockReturnValue([textFact, qaFact, vectorFact]);
    mockRankCandidatesPrimitive.mockResolvedValue(defaultRank([textFact, qaFact, vectorFact]));

    await recall({ query: "TypeScript decisions", searchStrategy: "hybrid" }, "agent-1");

    expect(mockReciprocalRankFusion).toHaveBeenCalled();
    // Should have been called with sets including QA results
    const rrfArgs = mockReciprocalRankFusion.mock.calls[0][0] as any[][];
    const allIds = rrfArgs.flat().map((f: any) => f._id);
    expect(allIds).toContain("fact_qa");
  });

  test("same fact found via text AND QA search is deduplicated in output", async () => {
    const sharedFact = makeFact({ _id: "fact_shared" });
    const sharedQaFact = { ...sharedFact, _qaMatch: true };

    mockTextSearch.mockResolvedValue([sharedFact]);
    mockSearchByQA.mockResolvedValue([sharedQaFact]);
    // Real RRF deduplication behavior
    mockReciprocalRankFusion.mockImplementation((sets: any[][]) => {
      const byId = new Map<string, any>();
      for (const set of sets) {
        for (const f of set) {
          if (!byId.has(f._id)) byId.set(f._id, f);
        }
      }
      return [...byId.values()];
    });
    mockRankCandidatesPrimitive.mockImplementation(async ({ candidates }) =>
      defaultRank(candidates)
    );

    const result = await recall(
      { query: "TypeScript", searchStrategy: "hybrid" },
      "agent-1"
    );

    expect("facts" in result).toBe(true);
    if ("facts" in result) {
      const sharedOccurrences = result.facts.filter((f: any) => f._id === "fact_shared");
      expect(sharedOccurrences).toHaveLength(1);
    }
  });

  test("passes explicit fused QA weighting into ranking candidates", async () => {
    const textFact = { ...makeFact({ _id: "fact_text" }), _pathways: ["symbolic"] };
    const qaFact = {
      ...makeFact({ _id: "fact_qa" }),
      _qaMatch: true,
      qaConfidence: 0.82,
      _pathways: ["qa"],
    };

    mockTextSearch.mockResolvedValue([textFact]);
    mockSearchByQA.mockResolvedValue([qaFact]);
    mockReciprocalRankFusion.mockImplementation((sets: any[][]) => [
      {
        ...qaFact,
        rrf_score: 0.04,
        _pathways: ["qa"],
      },
      {
        ...textFact,
        rrf_score: 0.03,
        _pathways: ["symbolic"],
      },
    ]);
    mockRankCandidatesPrimitive.mockResolvedValue(defaultRank([qaFact, textFact]));

    await recall({ query: "TypeScript", searchStrategy: "hybrid" }, "agent-1");

    const rankingInput = mockRankCandidatesPrimitive.mock.calls[0][0];
    const rankedQaFact = rankingInput.candidates.find((candidate: any) => candidate._id === "fact_qa");
    const rankedTextFact = rankingInput.candidates.find((candidate: any) => candidate._id === "fact_text");

    expect(rankedQaFact._score).toBeGreaterThan(rankedTextFact._score);
    expect(rankedQaFact._qaMatch).toBe(true);
  });
});

// ─── Part 4: Chain Recall Simulation ─────────────────────────────────────────

describe("chain recall — hop traversal and deduplication", () => {
  /**
   * Chain recall is simulated here as a pure traversal function.
   * Full integration will wire into the actual chain recall tool in a later bead.
   * These tests validate the traversal logic in isolation.
   */

  interface ChainFact {
    _id: string;
    qaEntities?: string[];
    entityIds?: string[];
    timestamp?: number;
    depth?: number;
  }

  function chainRecall(
    seeds: ChainFact[],
    factsByEntity: Map<string, ChainFact[]>,
    maxHops: number
  ): ChainFact[] {
    const visited = new Map<string, number>(); // factId → shallowest hop depth
    const queue: Array<{ fact: ChainFact; depth: number }> = seeds.map((f) => ({
      fact: { ...f, depth: 0 },
      depth: 0,
    }));

    while (queue.length > 0) {
      const { fact, depth } = queue.shift()!;
      if (visited.has(fact._id) && visited.get(fact._id)! <= depth) continue;
      visited.set(fact._id, depth);

      if (depth >= maxHops) continue;

      const entities = [...(fact.qaEntities ?? []), ...(fact.entityIds ?? [])];
      for (const entityId of entities) {
        const neighbors = factsByEntity.get(entityId) ?? [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor._id) || visited.get(neighbor._id)! > depth + 1) {
            queue.push({ fact: neighbor, depth: depth + 1 });
          }
        }
      }
    }

    return seeds
      .concat(
        [...visited.entries()]
          .filter(([id]) => !seeds.find((s) => s._id === id))
          .map(([id, depth]) => ({ _id: id, depth }))
      )
      .map((f) => ({ ...f, depth: visited.get(f._id) ?? 0 }));
  }

  test("maxHops=0 returns only seed facts (no traversal)", () => {
    const seed = { _id: "seed", entityIds: ["entity-a"] };
    const neighbor = { _id: "neighbor", entityIds: [] };
    const factsByEntity = new Map([["entity-a", [neighbor]]]);

    const result = chainRecall([seed], factsByEntity, 0);

    expect(result.map((f) => f._id)).toContain("seed");
    expect(result.map((f) => f._id)).not.toContain("neighbor");
  });

  test("maxHops=1 traverses one hop from seed", () => {
    const seed = { _id: "seed", entityIds: ["entity-a"] };
    const hop1 = { _id: "hop1", entityIds: ["entity-b"] };
    const hop2 = { _id: "hop2", entityIds: [] };
    const factsByEntity = new Map([
      ["entity-a", [hop1]],
      ["entity-b", [hop2]],
    ]);

    const result = chainRecall([seed], factsByEntity, 1);
    const ids = result.map((f) => f._id);

    expect(ids).toContain("seed");
    expect(ids).toContain("hop1");
    expect(ids).not.toContain("hop2");
  });

  test("maxHops=2 traverses two hops from seed", () => {
    const seed = { _id: "seed", entityIds: ["entity-a"] };
    const hop1 = { _id: "hop1", entityIds: ["entity-b"] };
    const hop2 = { _id: "hop2", entityIds: [] };
    const factsByEntity = new Map([
      ["entity-a", [hop1]],
      ["entity-b", [hop2]],
    ]);

    const result = chainRecall([seed], factsByEntity, 2);
    const ids = result.map((f) => f._id);

    expect(ids).toContain("seed");
    expect(ids).toContain("hop1");
    expect(ids).toContain("hop2");
  });

  test("fact reachable at depth 1 and depth 2 is kept at depth 1 (shallowest wins)", () => {
    const seed = { _id: "seed", entityIds: ["entity-a", "entity-b"] };
    const earlyHit = { _id: "early", entityIds: [] };
    // Both entity-a and entity-b lead to earlyHit
    const factsByEntity = new Map([
      ["entity-a", [earlyHit]],
      ["entity-b", [earlyHit]], // second path also reaches it
    ]);

    const result = chainRecall([seed], factsByEntity, 2);
    const occurrences = result.filter((f) => f._id === "early");

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].depth).toBe(1);
  });

  test("QA entities (qaEntities) are followed in chain traversal", () => {
    const seed = { _id: "seed", qaEntities: ["entity-qa"], entityIds: [] };
    const qaNeighbor = { _id: "qa_neighbor", entityIds: [] };
    const factsByEntity = new Map([["entity-qa", [qaNeighbor]]]);

    const result = chainRecall([seed], factsByEntity, 1);
    const ids = result.map((f) => f._id);

    expect(ids).toContain("qa_neighbor");
  });

  test("cycles in entity graph do not cause infinite loops", () => {
    const factA = { _id: "a", entityIds: ["entity-ab"] };
    const factB = { _id: "b", entityIds: ["entity-ba"] };
    // A → B → A (cycle)
    const factsByEntity = new Map([
      ["entity-ab", [factB]],
      ["entity-ba", [factA]],
    ]);

    // Should terminate without stack overflow
    expect(() => chainRecall([factA], factsByEntity, 5)).not.toThrow();
    const result = chainRecall([factA], factsByEntity, 5);
    // Both nodes should appear exactly once
    const ids = result.map((f) => f._id);
    expect(ids.filter((id) => id === "a")).toHaveLength(1);
    expect(ids.filter((id) => id === "b")).toHaveLength(1);
  });

  test("multiple seeds share traversal — dedup across all starting points", () => {
    const seedA = { _id: "seed_a", entityIds: ["entity-shared"] };
    const seedB = { _id: "seed_b", entityIds: ["entity-shared"] };
    const shared = { _id: "shared_neighbor", entityIds: [] };
    const factsByEntity = new Map([["entity-shared", [shared]]]);

    const result = chainRecall([seedA, seedB], factsByEntity, 1);
    const occurrences = result.filter((f) => f._id === "shared_neighbor");

    expect(occurrences).toHaveLength(1);
  });

  test("seed fact depth is always 0", () => {
    const seed = { _id: "seed", entityIds: [] };
    const result = chainRecall([seed], new Map(), 2);
    const seedResult = result.find((f) => f._id === "seed");
    expect(seedResult!.depth).toBe(0);
  });
});
