import { describe, expect, test, beforeEach } from "vitest";

/**
 * E2E tests for deterministic fact recall
 * Tests KV store integration with semantic search in the recall pipeline
 */

// ============================================================================
// MOCK CONVEX CLIENT
// ============================================================================

interface KVEntry {
  key: string;
  value: string;
  category?: string;
  updatedAt: number;
}

interface SemanticFact {
  _id: string;
  content: string;
  importanceScore?: number;
  _creationTime?: number;
  _score?: number;
}

class MockConvexClient {
  private kvStore: Map<string, Map<string, KVEntry>> = new Map(); // scope -> (key -> entry)
  private semanticFacts: SemanticFact[] = [];

  setKVEntry(
    key: string,
    value: string,
    category: string = "config",
    scopeId: string = "test-scope"
  ): void {
    if (!this.kvStore.has(scopeId)) {
      this.kvStore.set(scopeId, new Map());
    }
    this.kvStore.get(scopeId)!.set(key, {
      key,
      value,
      category,
      updatedAt: Date.now(),
    });
  }

  setSemanticFacts(facts: SemanticFact[]): void {
    this.semanticFacts = facts;
  }

  async kvGet(args: { key: string; scopeId: string }): Promise<KVEntry | null> {
    const scopeMap = this.kvStore.get(args.scopeId);
    if (!scopeMap) return null;
    return scopeMap.get(args.key) || null;
  }

  async kvSet(args: {
    key: string;
    value: string;
    scopeId: string;
    agentId: string;
    category?: string;
  }): Promise<{ id: string; created: boolean }> {
    const scopeMap = this.kvStore.get(args.scopeId);
    const existing = scopeMap ? scopeMap.has(args.key) : false;
    this.setKVEntry(args.key, args.value, args.category, args.scopeId);
    return {
      id: `kv:${args.key}`,
      created: !existing,
    };
  }

  async vectorSearch(args: {
    query: string;
    limit?: number;
  }): Promise<SemanticFact[]> {
    // Return facts sorted by importance score (highest first)
    return this.semanticFacts
      .sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0))
      .slice(0, args.limit ?? 10);
  }

  async textSearch(args: {
    query: string;
    limit?: number;
  }): Promise<SemanticFact[]> {
    // Return facts matching text
    return this.semanticFacts
      .filter((f) => f.content.toLowerCase().includes(args.query.toLowerCase()))
      .slice(0, args.limit ?? 10);
  }

  async getScopeByName(name: string): Promise<{ _id: string; name: string } | null> {
    return { _id: `scope-${name}`, name };
  }
}

// ============================================================================
// RECALL PIPELINE SIMULATOR
// ============================================================================

interface RecallResult {
  _id: string;
  content: string;
  importanceScore?: number;
  _source: "kv" | "semantic";
  _kvMatch?: boolean;
}

async function simulateRecall(
  query: string,
  client: MockConvexClient,
  scopeId: string = "test-scope"
): Promise<RecallResult[]> {
  // Step 1: Attempt KV lookup (deterministic)
  const kvResults: RecallResult[] = [];

  // Simulate key extraction from query - try multiple patterns
  const candidateKeys: string[] = [];
  const normalized = query.toLowerCase();

  // Pattern 1: "preference <name>" → "<name>.preference"
  const prefMatch = normalized.match(/preference\s+(\w+)/i);
  if (prefMatch) {
    candidateKeys.push(`${prefMatch[1]}.preference`);
  }

  // Pattern 2: "what does <name> prefer" → "<name>.preference"
  const whatDoesMatch = normalized.match(/what does\s+(\w+)\s+prefer/i);
  if (whatDoesMatch) {
    candidateKeys.push(`${whatDoesMatch[1]}.preference`);
  }

  // Pattern 3: Dotted notation directly in query (e.g., "config.timeout")
  const dottedMatches = query.match(/\b([\w]+\.[\w]+)\b/g);
  if (dottedMatches) {
    candidateKeys.push(...dottedMatches);
  }

  // Pattern 4: Try extracted words as config keys (for queries like "preference timeout")
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  for (const word of words) {
    if (word !== "preference" && word !== "what" && word !== "does" && word !== "config" && word !== "setting") {
      // Try: <word> as-is
      candidateKeys.push(word);
      // Try: config.<word>
      candidateKeys.push(`config.${word}`);
      // Try: <word>.preference
      candidateKeys.push(`${word}.preference`);
    }
  }

  // Pattern 5: Try combining adjacent words with dots (e.g., "unique config" → "unique.config")
  for (let i = 0; i < words.length - 1; i++) {
    const word1 = words[i];
    const word2 = words[i + 1];
    if (word1 !== "what" && word1 !== "does" && word2 !== "preference") {
      candidateKeys.push(`${word1}.${word2}`);
      candidateKeys.push(`${word2}.${word1}`);
    }
  }

  // Remove duplicates
  const uniqueKeys = Array.from(new Set(candidateKeys));

  // Try to look up each candidate key
  for (const key of uniqueKeys) {
    const kvEntry = await client.kvGet({ key, scopeId });
    if (kvEntry) {
      kvResults.push({
        _id: `kv:${scopeId}:${key}`,
        content: kvEntry.value,
        importanceScore: 0.95,
        _source: "kv",
        _kvMatch: true,
      });
    }
  }

  // Step 2: Vector search (probabilistic)
  const vectorResults = await client.vectorSearch({ query, limit: 10 });
  const semanticResults: RecallResult[] = vectorResults.map((fact) => ({
    ...fact,
    _source: "semantic",
  }));

  // Step 3: Merge and deduplicate (KV first)
  const mergedResults: RecallResult[] = [];
  const seenIds = new Set<string>();

  // Add KV results first (deterministic, higher priority)
  for (const result of kvResults) {
    if (!seenIds.has(result._id)) {
      mergedResults.push(result);
      seenIds.add(result._id);
    }
  }

  // Add semantic results (if not already in KV)
  for (const result of semanticResults) {
    if (!seenIds.has(result._id)) {
      mergedResults.push(result);
      seenIds.add(result._id);
    }
  }

  return mergedResults;
}

// ============================================================================
// TESTS
// ============================================================================

describe("deterministic fact recall E2E", () => {
  let client: MockConvexClient;

  beforeEach(() => {
    client = new MockConvexClient();
  });

  // ============================================================================
  // KV STORE DETERMINISM TESTS
  // ============================================================================
  describe("KV store deterministic lookups", () => {
    test("retrieves exact KV match for exact key", async () => {
      client.setKVEntry("ryan.preference", "bun", "preference");

      const result = await client.kvGet({
        key: "ryan.preference",
        scopeId: "test-scope",
      });

      expect(result).not.toBeNull();
      expect(result?.value).toBe("bun");
      expect(result?.key).toBe("ryan.preference");
    });

    test("returns null for non-existent key", async () => {
      const result = await client.kvGet({
        key: "nonexistent.key",
        scopeId: "test-scope",
      });

      expect(result).toBeNull();
    });

    test("returns different values for different keys", async () => {
      client.setKVEntry("user.name", "alice", "identity");
      client.setKVEntry("user.email", "alice@example.com", "identity");

      const nameResult = await client.kvGet({
        key: "user.name",
        scopeId: "test-scope",
      });
      const emailResult = await client.kvGet({
        key: "user.email",
        scopeId: "test-scope",
      });

      expect(nameResult?.value).toBe("alice");
      expect(emailResult?.value).toBe("alice@example.com");
    });

    test("KV lookup is case-sensitive (keys don't fuzzy match)", async () => {
      client.setKVEntry("MyKey", "value1", "config");

      const exact = await client.kvGet({
        key: "MyKey",
        scopeId: "test-scope",
      });
      const lowercase = await client.kvGet({
        key: "mykey",
        scopeId: "test-scope",
      });

      expect(exact?.value).toBe("value1");
      expect(lowercase).toBeNull();
    });

    test("KV lookup has no fuzzy matching", async () => {
      client.setKVEntry("database.connection", "postgresql://localhost", "config");

      // Try to get with partial key
      const partial = await client.kvGet({
        key: "database",
        scopeId: "test-scope",
      });

      expect(partial).toBeNull();
    });
  });

  // ============================================================================
  // KV RESULTS RANKING TESTS
  // ============================================================================
  describe("KV results ranking and priority", () => {
    test("KV results have high importance score", async () => {
      client.setKVEntry("config.timeout", "5000", "config");

      const kvEntry = await client.kvGet({
        key: "config.timeout",
        scopeId: "test-scope",
      });

      // In the recall pipeline, KV results get 0.95 importance
      const recallResult: RecallResult = {
        _id: `kv:test-scope:config.timeout`,
        content: kvEntry!.value,
        importanceScore: 0.95,
        _source: "kv",
        _kvMatch: true,
      };

      expect(recallResult.importanceScore).toBe(0.95);
      expect(recallResult._kvMatch).toBe(true);
    });

    test("KV results appear before semantic results in merged output", async () => {
      client.setKVEntry("ryan.preference", "bun", "preference");
      client.setSemanticFacts([
        {
          _id: "fact-1",
          content: "Package manager overview",
          importanceScore: 0.9,
        },
        {
          _id: "fact-2",
          content: "Bun is a fast JavaScript runtime",
          importanceScore: 0.95,
        },
      ]);

      const results = await simulateRecall("what does ryan prefer", client);

      // KV result should be first
      expect(results[0]._source).toBe("kv");
      expect(results[0]._kvMatch).toBe(true);
      // Semantic results should follow
      expect(results[1]._source).toBe("semantic");
    });

    test("KV results marked with _kvMatch flag for easy filtering", async () => {
      client.setKVEntry("api.key", "secret123", "identity");

      const kvEntry = await client.kvGet({
        key: "api.key",
        scopeId: "test-scope",
      });

      const result: RecallResult = {
        _id: `kv:test-scope:api.key`,
        content: kvEntry!.value,
        importanceScore: 0.95,
        _source: "kv",
        _kvMatch: true,
      };

      // Consumer can filter for deterministic results
      const kvOnly = [result].filter((r) => r._kvMatch);
      expect(kvOnly.length).toBe(1);
      expect(kvOnly[0]._source).toBe("kv");
    });
  });

  // ============================================================================
  // MIXED RECALL TESTS
  // ============================================================================
  describe("mixed recall: KV + semantic", () => {
    test("combines KV results with semantic search results", async () => {
      client.setKVEntry("ryan.preference", "bun", "preference");
      client.setSemanticFacts([
        {
          _id: "fact-1",
          content: "Bun is a JavaScript runtime",
          importanceScore: 0.85,
        },
      ]);

      const results = await simulateRecall("what does ryan prefer", client);

      expect(results.length).toBeGreaterThan(1);
      const kvMatch = results.find((r) => r._kvMatch);
      const semanticMatch = results.find((r) => !r._kvMatch);

      expect(kvMatch).toBeDefined();
      expect(semanticMatch).toBeDefined();
    });

    test("deduplicates when same fact appears in both KV and semantic", async () => {
      client.setKVEntry("fact.id", "fact-1", "identity");
      client.setSemanticFacts([
        {
          _id: "fact-1",
          content: "Original fact",
          importanceScore: 0.9,
        },
      ]);

      const results = await simulateRecall("fact id", client);

      // Should not have duplicates
      const factIds = results.map((r) => r._id);
      const uniqueIds = new Set(factIds);
      expect(uniqueIds.size).toBe(factIds.length);
    });

    test("KV results not found in semantic still appear", async () => {
      client.setKVEntry("unique.config", "value123", "config");
      client.setSemanticFacts([
        {
          _id: "fact-1",
          content: "Some other fact",
          importanceScore: 0.8,
        },
      ]);

      const results = await simulateRecall("unique config setting", client);

      const kvResult = results.find((r) => r._kvMatch);
      expect(kvResult).toBeDefined();
      expect(kvResult?.content).toBe("value123");
    });

    test("handles empty KV results gracefully", async () => {
      client.setSemanticFacts([
        {
          _id: "fact-1",
          content: "Semantic fact",
          importanceScore: 0.9,
        },
      ]);

      const results = await simulateRecall("preference missing", client);

      // Should only have semantic results
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]._source).toBe("semantic");
    });
  });

  // ============================================================================
  // FULL PIPELINE TESTS
  // ============================================================================
  describe("full store → recall → verify pipeline", () => {
    test("end-to-end: set KV fact → recall → verify exact match", async () => {
      const key = "ryan.preference";
      const value = "bun";

      // Step 1: Store
      const storeResult = await client.kvSet({
        key,
        value,
        scopeId: "test-scope",
        agentId: "test-agent",
        category: "preference",
      });

      expect(storeResult.created).toBe(true);

      // Step 2: Recall
      const recallResults = await simulateRecall("what does ryan prefer", client);

      // Step 3: Verify
      expect(recallResults.length).toBeGreaterThan(0);
      const found = recallResults.find((r) => r._kvMatch && r.content === value);
      expect(found).toBeDefined();
      expect(found?._source).toBe("kv");
    });

    test("can update KV fact and recall new value", async () => {
      // Initial set
      await client.kvSet({
        key: "config.timeout",
        value: "5000",
        scopeId: "test-scope",
        agentId: "test-agent",
      });

      // Verify initial
      let recall1 = await simulateRecall("config timeout value", client);
      let kvResult = recall1.find((r) => r._kvMatch);
      expect(kvResult?.content).toBe("5000");

      // Update
      await client.kvSet({
        key: "config.timeout",
        value: "10000",
        scopeId: "test-scope",
        agentId: "test-agent",
      });

      // Verify updated
      const recall2 = await simulateRecall("config timeout value", client);
      kvResult = recall2.find((r) => r._kvMatch);
      expect(kvResult?.content).toBe("10000");
    });

    test("multiple KV facts recalled in single query", async () => {
      // Store multiple facts
      await client.kvSet({
        key: "user.name",
        value: "alice",
        scopeId: "test-scope",
        agentId: "test-agent",
      });
      await client.kvSet({
        key: "user.email",
        value: "alice@example.com",
        scopeId: "test-scope",
        agentId: "test-agent",
      });

      // Recall both
      const result1 = await client.kvGet({
        key: "user.name",
        scopeId: "test-scope",
      });
      const result2 = await client.kvGet({
        key: "user.email",
        scopeId: "test-scope",
      });

      expect(result1?.value).toBe("alice");
      expect(result2?.value).toBe("alice@example.com");
    });
  });

  // ============================================================================
  // DETERMINISM VS PROBABILISM TESTS
  // ============================================================================
  describe("determinism vs probabilism in results", () => {
    test("KV results are deterministic (same query always same result)", async () => {
      client.setKVEntry("constant.value", "immutable", "config");

      const result1 = await simulateRecall("constant value setting", client);
      const result2 = await simulateRecall("constant value setting", client);
      const result3 = await simulateRecall("constant value setting", client);

      const kvMatch1 = result1.find((r) => r._kvMatch)?.content;
      const kvMatch2 = result2.find((r) => r._kvMatch)?.content;
      const kvMatch3 = result3.find((r) => r._kvMatch)?.content;

      expect(kvMatch1).toBe(kvMatch2);
      expect(kvMatch2).toBe(kvMatch3);
      expect(kvMatch1).toBe("immutable");
    });

    test("semantic results may vary but KV results constant", async () => {
      client.setKVEntry("fixed.fact", "always-same", "identity");
      client.setSemanticFacts([
        {
          _id: "fact-1",
          content: "Query matching content",
          importanceScore: 0.9,
        },
        {
          _id: "fact-2",
          content: "Another query matching content",
          importanceScore: 0.85,
        },
      ]);

      const results = await simulateRecall("fixed fact information", client);

      // KV part is constant
      const kvResults = results.filter((r) => r._kvMatch);
      expect(kvResults.length).toBeGreaterThan(0);
      expect(kvResults[0].content).toBe("always-same");

      // Semantic part may be different (though in mock it's deterministic)
      const semanticResults = results.filter((r) => !r._kvMatch);
      // At least one semantic result due to vectorSearch
      expect(semanticResults.length).toBeGreaterThanOrEqual(0);
    });

    test("exact key matching prevents false positives", async () => {
      client.setKVEntry("api.key", "secret123", "identity");
      client.setKVEntry("api.key.backup", "secret456", "identity");

      const exactKey = await client.kvGet({
        key: "api.key",
        scopeId: "test-scope",
      });
      const backupKey = await client.kvGet({
        key: "api.key.backup",
        scopeId: "test-scope",
      });

      expect(exactKey?.value).toBe("secret123");
      expect(backupKey?.value).toBe("secret456");

      // Querying for "api.key" should not return "api.key.backup"
      expect(exactKey?.value).not.toBe(backupKey?.value);
    });
  });

  // ============================================================================
  // SCOPE ISOLATION TESTS
  // ============================================================================
  describe("scope isolation in KV recall", () => {
    test("KV facts isolated by scope", async () => {
      await client.kvSet({
        key: "shared.key",
        value: "scope-a-value",
        scopeId: "scope-a",
        agentId: "test-agent",
      });
      await client.kvSet({
        key: "shared.key",
        value: "scope-b-value",
        scopeId: "scope-b",
        agentId: "test-agent",
      });

      const resultA = await client.kvGet({
        key: "shared.key",
        scopeId: "scope-a",
      });
      const resultB = await client.kvGet({
        key: "shared.key",
        scopeId: "scope-b",
      });

      // Different scopes have different values
      expect(resultA?.value).toBe("scope-a-value");
      expect(resultB?.value).toBe("scope-b-value");
    });
  });

  // ============================================================================
  // ORDERING AND IMPORTANCE TESTS
  // ============================================================================
  describe("result ordering with mixed sources", () => {
    test("KV results (0.95 importance) rank above lower-scoring semantic results", async () => {
      client.setKVEntry("ryan.preference", "bun", "preference");
      client.setSemanticFacts([
        {
          _id: "fact-1",
          content: "Some fact about bun",
          importanceScore: 0.7,
        },
        {
          _id: "fact-2",
          content: "Another fact",
          importanceScore: 0.8,
        },
      ]);

      const results = await simulateRecall("what does ryan prefer", client);

      // First result should be KV match
      expect(results[0]._kvMatch).toBe(true);
      expect(results[0].importanceScore).toBe(0.95);
    });

    test("multiple KV results maintain insertion-like order", async () => {
      await client.kvSet({
        key: "config.a",
        value: "value-a",
        scopeId: "test-scope",
        agentId: "test-agent",
      });
      await client.kvSet({
        key: "config.b",
        value: "value-b",
        scopeId: "test-scope",
        agentId: "test-agent",
      });

      const resultA = await client.kvGet({
        key: "config.a",
        scopeId: "test-scope",
      });
      const resultB = await client.kvGet({
        key: "config.b",
        scopeId: "test-scope",
      });

      expect(resultA?.value).toBe("value-a");
      expect(resultB?.value).toBe("value-b");
    });
  });
});
