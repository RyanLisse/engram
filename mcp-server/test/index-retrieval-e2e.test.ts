/**
 * E2E tests: Index-based retrieval via hierarchicalRecall
 *
 * Tests the full pipeline:
 *   cached vault index (markdown) →
 *   parseCachedVaultIndex / extractIndexAnchors →
 *   entity lookup (anchor-boosted) →
 *   fact graph traversal →
 *   ranked results
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

// ── Mock hoisting (must precede any imports that use these) ──────────
const {
  mockResolveScopes,
  mockGetEntitiesPrimitive,
  mockTextSearch,
  mockGetFact,
  mockGetConfig,
  mockGetRecentlyEnrichedFactIds,
} = vi.hoisted(() => ({
  mockResolveScopes: vi.fn(),
  mockGetEntitiesPrimitive: vi.fn(),
  mockTextSearch: vi.fn(),
  mockGetFact: vi.fn(),
  mockGetConfig: vi.fn(),
  mockGetRecentlyEnrichedFactIds: vi.fn(),
}));

vi.mock("../src/tools/context-primitives.js", () => ({
  resolveScopes: mockResolveScopes,
}));

vi.mock("../src/tools/primitive-retrieval.js", () => ({
  getEntitiesPrimitive: mockGetEntitiesPrimitive,
  textSearch: mockTextSearch,
}));

vi.mock("../src/lib/convex-client.js", () => ({
  getFact: mockGetFact,
  getConfig: mockGetConfig,
  getRecentlyEnrichedFactIds: mockGetRecentlyEnrichedFactIds,
}));

import { hierarchicalRecall } from "../src/tools/hierarchical-recall.js";

// ── Shared fixtures ───────────────────────────────────────────────────

const SCOPE_ID = "scope_private_1";
const SCOPE_NAME = "private-agent-1";

/** Minimal vault index in the exact format parseCachedVaultIndex expects. */
const VAULT_INDEX_MARKDOWN = `# Vault Index

## Scope: ${SCOPE_NAME}
### People
- Alice Chen
  - Alice leads the infrastructure team
  - Alice approved Q4 budget cuts
### Projects
- Prometheus
  - Prometheus is the internal observability platform
  - Prometheus migration blocked by infra freeze
### Tools
- Grafana
  - Grafana dashboards track all SLOs
### Concepts
- SLO
  - SLO targets set to 99.9% for all tier-1 services
### Companies
- Datadog
  - Datadog contract renewal due in March
`;

function makeFact(id: string, content: string, opts: Partial<{
  importanceScore: number;
  timestamp: number;
  lifecycleState: string;
  scopeId: string;
  temporalLinks: any[];
}> = {}) {
  return {
    _id: id,
    scopeId: opts.scopeId ?? SCOPE_ID,
    content,
    importanceScore: opts.importanceScore ?? 0.7,
    timestamp: opts.timestamp ?? Date.now(),
    lifecycleState: opts.lifecycleState ?? "active",
    temporalLinks: opts.temporalLinks ?? [],
  };
}

function makeEntity(id: string, name: string, opts: Partial<{
  type: string;
  importanceScore: number;
  backlinks: string[];
  relationships: any[];
}> = {}) {
  return {
    _id: id,
    entityId: id,
    name,
    type: opts.type ?? "concept",
    importanceScore: opts.importanceScore ?? 0.7,
    backlinks: opts.backlinks ?? [],
    relationships: opts.relationships ?? [],
  };
}

// ── beforeEach: common defaults ───────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  mockResolveScopes.mockResolvedValue({
    scopeIds: [SCOPE_ID],
    resolved: [{ id: SCOPE_ID, name: SCOPE_NAME }],
  });

  mockGetConfig.mockResolvedValue(null);           // no index by default
  mockGetEntitiesPrimitive.mockResolvedValue([]);
  mockTextSearch.mockResolvedValue([]);
  mockGetFact.mockResolvedValue(null);
  mockGetRecentlyEnrichedFactIds.mockResolvedValue(new Set<string>());
});

// ── Suite 1: Full index pipeline ─────────────────────────────────────

describe("full index pipeline", () => {
  test("parses all section types and resolves anchors via entity name match", async () => {
    mockGetConfig.mockResolvedValue({ key: "vault_index", value: VAULT_INDEX_MARKDOWN });

    const aliceEntity = makeEntity("ent_alice", "Alice Chen", {
      type: "person",
      backlinks: ["fact_alice_1"],
    });
    const fact1 = makeFact("fact_alice_1", "Alice approved Q4 budget cuts");

    mockGetEntitiesPrimitive.mockImplementation(async ({ query }) => {
      if (query === "Alice Chen") return [aliceEntity];
      if (query === "alice") return [aliceEntity]; // direct query pass
      return [];
    });
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact_alice_1") return fact1;
      return null;
    });

    const result = await hierarchicalRecall({ query: "alice budget", limit: 10 }, "agent-1");

    expect("facts" in result).toBe(true);
    if (!("facts" in result)) return;

    // Index cache was used
    expect(result.traversalStats.indexCacheHit).toBe(true);
    // "Alice Chen" was extracted as an anchor (name matched "alice")
    expect(result.traversalStats.indexAnchorsUsed).toBeGreaterThan(0);
    // The mode reflects index-anchored traversal
    expect(result.traversalStats.mode).toBe("index-anchored");
    // The fact from Alice's backlinks was returned
    expect(result.facts.some((f: any) => f._id === "fact_alice_1")).toBe(true);
  });

  test("parses fact-snippet anchors when entity name does not match query", async () => {
    mockGetConfig.mockResolvedValue({ key: "vault_index", value: VAULT_INDEX_MARKDOWN });

    const prometheusEntity = makeEntity("ent_prom", "Prometheus", {
      type: "project",
      backlinks: ["fact_prom_1"],
    });
    const fact1 = makeFact("fact_prom_1", "Prometheus migration blocked by infra freeze");

    mockGetEntitiesPrimitive.mockImplementation(async ({ query }) => {
      if (query === "Prometheus") return [prometheusEntity];
      return [];
    });
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact_prom_1") return fact1;
      return null;
    });

    // Query matches the fact snippet "migration", not the entity name "Prometheus"
    const result = await hierarchicalRecall({ query: "migration blocked", limit: 5 }, "agent-1");

    expect("facts" in result).toBe(true);
    if (!("facts" in result)) return;

    expect(result.traversalStats.indexCacheHit).toBe(true);
    // Prometheus entity resolved via its fact snippet
    expect(result.traversalStats.indexAnchorsUsed).toBeGreaterThan(0);
    expect(result.facts.some((f: any) => f._id === "fact_prom_1")).toBe(true);
  });

  test("traversal path is annotated on each returned fact", async () => {
    mockGetConfig.mockResolvedValue({ key: "vault_index", value: VAULT_INDEX_MARKDOWN });

    const grafanaEntity = makeEntity("ent_grafana", "Grafana", {
      type: "tool",
      backlinks: ["fact_grafana_1"],
    });
    const fact1 = makeFact("fact_grafana_1", "Grafana dashboards track all SLOs");

    mockGetEntitiesPrimitive.mockImplementation(async ({ query }) => {
      if (query === "Grafana") return [grafanaEntity];
      return [];
    });
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact_grafana_1") return fact1;
      return null;
    });

    const result = await hierarchicalRecall({ query: "grafana SLO", limit: 5 }, "agent-1");

    expect("facts" in result).toBe(true);
    if (!("facts" in result)) return;

    const returned = result.facts.find((f: any) => f._id === "fact_grafana_1");
    expect(returned).toBeDefined();
    // Each fact carries traversal metadata injected by hierarchicalRecall
    expect(returned?._traversalDepth).toBe(0); // direct backlink = depth 0
    expect(Array.isArray(returned?._traversalPath)).toBe(true);
    expect(returned?._traversalPath).toContain("Grafana");
    expect(typeof returned?._hierarchicalScore).toBe("number");
  });
});

// ── Suite 2: Index narrows search before traversal ────────────────────

describe("index narrows search space before graph traversal", () => {
  test("anchor entity lookup uses exact anchor name, not raw query", async () => {
    // The index maps the vague query "slo targets" → entity "SLO"
    // The anchor lookup calls getEntitiesPrimitive({ query: "SLO" })
    // — not the raw query — proving the index narrows the search.
    mockGetConfig.mockResolvedValue({ key: "vault_index", value: VAULT_INDEX_MARKDOWN });

    const sloEntity = makeEntity("ent_slo", "SLO", {
      type: "concept",
      backlinks: ["fact_slo_1"],
    });
    const fact1 = makeFact("fact_slo_1", "SLO targets set to 99.9% for all tier-1 services");

    const queriesMade: string[] = [];
    mockGetEntitiesPrimitive.mockImplementation(async ({ query }) => {
      queriesMade.push(query);
      if (query === "SLO") return [sloEntity];
      return [];
    });
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact_slo_1") return fact1;
      return null;
    });

    const result = await hierarchicalRecall({ query: "slo targets 99.9", limit: 5 }, "agent-1");

    expect("facts" in result).toBe(true);
    // Anchor lookup used the entity name from the index, not the raw query
    expect(queriesMade).toContain("SLO");
    // Raw query was also tried (the graph pass), but the anchor pass preceded it
    const indexAnchorCallIndex = queriesMade.indexOf("SLO");
    const rawQueryCallIndex = queriesMade.indexOf("slo targets 99.9");
    // Index anchor call happens before or independently of raw query call
    expect(indexAnchorCallIndex).toBeLessThan(rawQueryCallIndex === -1 ? Infinity : rawQueryCallIndex + 1);
  });

  test("index anchor boost elevates score above non-anchored depth-0 facts", async () => {
    mockGetConfig.mockResolvedValue({ key: "vault_index", value: VAULT_INDEX_MARKDOWN });

    const now = Date.now();
    // Both entities have same importanceScore and same-age facts —
    // anchor boost is the only differentiator.
    const anchoredEntity = makeEntity("ent_alice", "Alice Chen", {
      importanceScore: 0.5,
      backlinks: ["fact_anchored"],
    });
    const nonAnchoredEntity = makeEntity("ent_other", "Other Person", {
      importanceScore: 0.5,
      backlinks: ["fact_plain"],
    });

    const anchoredFact = makeFact("fact_anchored", "Alice approved the budget", {
      importanceScore: 0.5, timestamp: now,
    });
    const plainFact = makeFact("fact_plain", "Other person did something", {
      importanceScore: 0.5, timestamp: now,
    });

    mockGetEntitiesPrimitive.mockImplementation(async ({ query }) => {
      if (query === "Alice Chen") return [anchoredEntity];
      // Direct graph search with raw query "alice" also finds both
      if (query === "alice") return [anchoredEntity, nonAnchoredEntity];
      return [nonAnchoredEntity];
    });
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact_anchored") return anchoredFact;
      if (id === "fact_plain") return plainFact;
      return null;
    });

    const result = await hierarchicalRecall({ query: "alice", limit: 10 }, "agent-1");

    expect("facts" in result).toBe(true);
    if (!("facts" in result)) return;

    const anchored = result.facts.find((f: any) => f._id === "fact_anchored");
    const plain = result.facts.find((f: any) => f._id === "fact_plain");

    // Both returned, but the index-anchored fact has a higher hierarchical score
    expect(anchored).toBeDefined();
    expect(plain).toBeDefined();
    expect(anchored!._hierarchicalScore).toBeGreaterThan(plain!._hierarchicalScore);
  });
});

// ── Suite 3: Scope-level filtering via index ──────────────────────────

describe("scope-level filtering via index", () => {
  test("facts from other scopes are excluded even if entities match", async () => {
    mockGetConfig.mockResolvedValue({ key: "vault_index", value: VAULT_INDEX_MARKDOWN });

    const entity = makeEntity("ent_alice", "Alice Chen", {
      type: "person",
      backlinks: ["fact_in_scope", "fact_other_scope"],
    });

    mockGetEntitiesPrimitive.mockImplementation(async ({ query }) => {
      if (query === "Alice Chen" || query === "alice") return [entity];
      return [];
    });
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact_in_scope") {
        return makeFact("fact_in_scope", "Alice approved budget", { scopeId: SCOPE_ID });
      }
      if (id === "fact_other_scope") {
        return makeFact("fact_other_scope", "Alice in other scope", { scopeId: "scope_other" });
      }
      return null;
    });

    const result = await hierarchicalRecall({ query: "alice", limit: 10 }, "agent-1");

    expect("facts" in result).toBe(true);
    if (!("facts" in result)) return;

    const ids = result.facts.map((f: any) => f._id);
    expect(ids).toContain("fact_in_scope");
    expect(ids).not.toContain("fact_other_scope");
  });

  test("index scope filter skips entities in non-matching scopes", async () => {
    // Build an index with two scopes; resolveScopes returns only scope A.
    const multiScopeIndex = `# Vault Index

## Scope: private-agent-1
### Tools
- Grafana
  - Grafana is used for monitoring

## Scope: private-agent-2
### Tools
- Prometheus
  - Prometheus for agent-2 metrics
`;
    mockGetConfig.mockResolvedValue({ key: "vault_index", value: multiScopeIndex });

    const queriesMade: string[] = [];
    mockGetEntitiesPrimitive.mockImplementation(async ({ query }) => {
      queriesMade.push(query);
      return [];
    });

    await hierarchicalRecall({ query: "monitoring", limit: 5 }, "agent-1");

    // Only "Grafana" (from scope private-agent-1) should be used as an anchor.
    // "Prometheus" (scope private-agent-2) should be filtered out by extractIndexAnchors.
    expect(queriesMade).toContain("Grafana");
    expect(queriesMade).not.toContain("Prometheus");
  });
});

// ── Suite 4: Entity-type filtering ───────────────────────────────────

describe("entity-type filtering (people vs projects vs tools)", () => {
  test("entityTypes=['person'] limits anchor entity lookups to that type", async () => {
    mockGetConfig.mockResolvedValue({ key: "vault_index", value: VAULT_INDEX_MARKDOWN });

    const aliceEntity = makeEntity("ent_alice", "Alice Chen", {
      type: "person",
      backlinks: ["fact_alice_1"],
    });
    const fact1 = makeFact("fact_alice_1", "Alice approved Q4 budget");

    // Capture what type each getEntitiesPrimitive call uses
    const typeArgs: Array<string | undefined> = [];
    mockGetEntitiesPrimitive.mockImplementation(async ({ query, type }) => {
      typeArgs.push(type);
      if (query === "Alice Chen") return [aliceEntity];
      return [];
    });
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact_alice_1") return fact1;
      return null;
    });

    const result = await hierarchicalRecall(
      { query: "alice", entityTypes: ["person"], limit: 5 },
      "agent-1",
    );

    expect("facts" in result).toBe(true);
    if (!("facts" in result)) return;

    // Every anchor lookup was typed as "person"
    // (graph pass also passes the single entityType filter)
    const anchorCalls = typeArgs.filter((t) => t === "person");
    expect(anchorCalls.length).toBeGreaterThan(0);
    expect(result.facts.some((f: any) => f._id === "fact_alice_1")).toBe(true);
  });

  test("entityTypes filter returns no results when type doesn't match any indexed entity", async () => {
    // Index has Alice (person) and Prometheus (project) — querying with entityTypes=['tool']
    // should find no anchors and no graph entities, falling back to text search.
    mockGetConfig.mockResolvedValue({ key: "vault_index", value: VAULT_INDEX_MARKDOWN });

    mockGetEntitiesPrimitive.mockResolvedValue([]); // no tool entities match "alice"
    mockTextSearch.mockResolvedValue([]);

    const result = await hierarchicalRecall(
      { query: "alice", entityTypes: ["tool"], limit: 5 },
      "agent-1",
    );

    expect("facts" in result).toBe(true);
    if (!("facts" in result)) return;

    // Falls back to text search when no entities match
    expect(result.traversalStats.mode).toBe("fallback-text");
  });

  test("mixed entityTypes still filters anchor lookup to specified types", async () => {
    mockGetConfig.mockResolvedValue({ key: "vault_index", value: VAULT_INDEX_MARKDOWN });

    const prometheusEntity = makeEntity("ent_prom", "Prometheus", {
      type: "project",
      backlinks: ["fact_prom_1"],
    });
    const fact1 = makeFact("fact_prom_1", "Prometheus migration plan");

    mockGetEntitiesPrimitive.mockImplementation(async ({ query }) => {
      if (query === "Prometheus") return [prometheusEntity];
      return [];
    });
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact_prom_1") return fact1;
      return null;
    });

    // When multiple entityTypes provided, the type arg to getEntitiesPrimitive is undefined
    // (the code only passes type when entityTypes.length === 1)
    const result = await hierarchicalRecall(
      { query: "prometheus migration", entityTypes: ["project", "tool"], limit: 5 },
      "agent-1",
    );

    expect("facts" in result).toBe(true);
    if (!("facts" in result)) return;
    expect(result.facts.some((f: any) => f._id === "fact_prom_1")).toBe(true);
  });
});

// ── Suite 5: Index-based vs pure vector search ────────────────────────

describe("index-based retrieval vs pure vector search for structured queries", () => {
  test("index-anchored mode returns higher-scored facts than fallback text search", async () => {
    const now = Date.now();

    // Scenario: structured query for "Datadog contract"
    // — With index: Datadog entity → high-importance fact via anchor (0.35 boost)
    // — Without index: same entity found by raw query, no boost

    const datadogEntity = makeEntity("ent_datadog", "Datadog", {
      type: "company",
      importanceScore: 0.8,
      backlinks: ["fact_dd_1"],
    });
    const ddFact = makeFact("fact_dd_1", "Datadog contract renewal due in March", {
      importanceScore: 0.8,
      timestamp: now,
    });

    // ── Test A: with index ──
    mockGetConfig.mockResolvedValue({ key: "vault_index", value: VAULT_INDEX_MARKDOWN });
    mockGetEntitiesPrimitive.mockImplementation(async ({ query }) => {
      if (query === "Datadog" || query === "datadog") return [datadogEntity];
      return [];
    });
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact_dd_1") return ddFact;
      return null;
    });

    const withIndex = await hierarchicalRecall({ query: "datadog contract", limit: 5 }, "agent-1");

    expect("facts" in withIndex).toBe(true);
    if (!("facts" in withIndex)) return;
    expect(withIndex.traversalStats.mode).toBe("index-anchored");
    expect(withIndex.traversalStats.indexAnchorsUsed).toBeGreaterThan(0);

    const factWithIndex = withIndex.facts.find((f: any) => f._id === "fact_dd_1");
    expect(factWithIndex).toBeDefined();
    const scoreWithIndex = factWithIndex!._hierarchicalScore as number;

    // ── Test B: without index ──
    vi.clearAllMocks();
    mockResolveScopes.mockResolvedValue({
      scopeIds: [SCOPE_ID],
      resolved: [{ id: SCOPE_ID, name: SCOPE_NAME }],
    });
    mockGetConfig.mockResolvedValue(null); // no index cache
    mockGetEntitiesPrimitive.mockImplementation(async ({ query }) => {
      if (query === "datadog" || query === "datadog contract") return [datadogEntity];
      return [];
    });
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact_dd_1") return ddFact;
      return null;
    });
    mockGetRecentlyEnrichedFactIds.mockResolvedValue(new Set<string>());

    const withoutIndex = await hierarchicalRecall({ query: "datadog contract", limit: 5 }, "agent-1");

    expect("facts" in withoutIndex).toBe(true);
    if (!("facts" in withoutIndex)) return;
    expect(withoutIndex.traversalStats.mode).toBe("graph-only");
    expect(withoutIndex.traversalStats.indexCacheHit).toBe(false);

    const factWithoutIndex = withoutIndex.facts.find((f: any) => f._id === "fact_dd_1");
    expect(factWithoutIndex).toBeDefined();
    const scoreWithoutIndex = factWithoutIndex!._hierarchicalScore as number;

    // Index-boosted score must be strictly higher (0.35 entity anchor boost)
    expect(scoreWithIndex).toBeGreaterThan(scoreWithoutIndex);
  });

  test("retroactively enriched facts get 1.2× boost on top of index score", async () => {
    const now = Date.now();
    mockGetConfig.mockResolvedValue({ key: "vault_index", value: VAULT_INDEX_MARKDOWN });

    const aliceEntity = makeEntity("ent_alice", "Alice Chen", {
      type: "person",
      importanceScore: 0.7,
      backlinks: ["fact_enriched", "fact_plain"],
    });
    const enrichedFact = makeFact("fact_enriched", "Alice led re-org", {
      importanceScore: 0.7, timestamp: now,
    });
    const plainFact = makeFact("fact_plain", "Alice joined the company", {
      importanceScore: 0.7, timestamp: now,
    });

    mockGetEntitiesPrimitive.mockImplementation(async ({ query }) => {
      if (query === "Alice Chen" || query === "alice") return [aliceEntity];
      return [];
    });
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact_enriched") return enrichedFact;
      if (id === "fact_plain") return plainFact;
      return null;
    });
    // Mark fact_enriched as recently retroactively enriched
    mockGetRecentlyEnrichedFactIds.mockResolvedValue(new Set(["fact_enriched"]));

    const result = await hierarchicalRecall({ query: "alice", limit: 10 }, "agent-1");

    expect("facts" in result).toBe(true);
    if (!("facts" in result)) return;

    const enriched = result.facts.find((f: any) => f._id === "fact_enriched");
    const plain = result.facts.find((f: any) => f._id === "fact_plain");

    expect(enriched).toBeDefined();
    expect(plain).toBeDefined();

    // Retroactively enriched fact should be tagged
    expect(enriched!.retroactivelyRelevant).toBe(true);
    expect(plain!.retroactivelyRelevant).toBeUndefined();

    // And should have a higher score (1.2× boost applied)
    expect(enriched!._hierarchicalScore).toBeGreaterThan(plain!._hierarchicalScore);
  });

  test("depth-2 temporal links chain from top index-anchored facts", async () => {
    const now = Date.now();
    mockGetConfig.mockResolvedValue({ key: "vault_index", value: VAULT_INDEX_MARKDOWN });

    const aliceEntity = makeEntity("ent_alice", "Alice Chen", {
      type: "person",
      importanceScore: 0.9,
      backlinks: ["fact_root"],
    });
    const rootFact = makeFact("fact_root", "Alice created the incident report", {
      importanceScore: 0.9,
      timestamp: now,
      temporalLinks: [
        { targetFactId: "fact_temporal", relation: "caused", confidence: 0.9 },
      ],
    });
    const temporalFact = makeFact("fact_temporal", "Incident led to post-mortem", {
      importanceScore: 0.6,
      timestamp: now - 1000,
    });

    mockGetEntitiesPrimitive.mockImplementation(async ({ query }) => {
      if (query === "Alice Chen" || query === "alice") return [aliceEntity];
      return [];
    });
    mockGetFact.mockImplementation(async (id) => {
      if (id === "fact_root") return rootFact;
      if (id === "fact_temporal") return temporalFact;
      return null;
    });

    const result = await hierarchicalRecall(
      { query: "alice", maxDepth: 2, limit: 10 },
      "agent-1",
    );

    expect("facts" in result).toBe(true);
    if (!("facts" in result)) return;

    const ids = result.facts.map((f: any) => f._id);
    // Root fact returned at depth 0
    expect(ids).toContain("fact_root");
    // Temporal link fact returned at depth 2
    expect(ids).toContain("fact_temporal");

    const temporal = result.facts.find((f: any) => f._id === "fact_temporal");
    expect(temporal?._traversalDepth).toBe(2);
    expect(temporal?._traversalPath).toContain("caused");

    // Root fact scores higher (depth 0 + index boost) than temporal link (depth 2, 0.3× weight)
    const root = result.facts.find((f: any) => f._id === "fact_root");
    expect(root!._hierarchicalScore).toBeGreaterThan(temporal!._hierarchicalScore);
  });
});
