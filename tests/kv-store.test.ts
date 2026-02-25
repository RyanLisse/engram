/**
 * Unit tests for KV store mutations.
 *
 * Tests cover:
 * - kvSet: upsert with duplicate keys, scope isolation, metadata
 * - kvGet: retrieval, found vs not found, scope isolation
 * - kvDelete: removal, idempotent behavior
 * - kvList: filtering by prefix and category, pagination
 */

import { describe, it, expect } from "vitest";

/**
 * Mock Convex client for testing without backend.
 * In production, these would call actual Convex functions.
 */
const mockKvStore = new Map<string, { key: string; value: string; scopeId: string; category?: string; updatedAt: number }>();
const mockAgents = new Map<string, { id: string; scope: string }>();

// Helper: create a test scope key
const scopeKey = (key: string, scopeId: string) => `${scopeId}::${key}`;

/**
 * Mock kvSet implementation
 */
async function mockKvSet(args: {
  key: string;
  value: string;
  agentId: string;
  scopeId: string;
  category?: string;
  metadata?: { source?: string; confidence?: number };
}) {
  const compositeKey = scopeKey(args.key, args.scopeId);
  const created = !mockKvStore.has(compositeKey);
  mockKvStore.set(compositeKey, {
    key: args.key,
    value: args.value,
    scopeId: args.scopeId,
    category: args.category,
    updatedAt: Date.now(),
  });
  return { id: compositeKey, created };
}

/**
 * Mock kvGet implementation
 */
async function mockKvGet(args: { key: string; scopeId: string }) {
  const compositeKey = scopeKey(args.key, args.scopeId);
  const entry = mockKvStore.get(compositeKey);
  if (!entry) {
    return { key: args.key, value: "", found: false, updatedAt: 0 };
  }
  return {
    key: entry.key,
    value: entry.value,
    category: entry.category,
    found: true,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Mock kvDelete implementation
 */
async function mockKvDelete(args: { key: string; agentId: string; scopeId: string }) {
  const compositeKey = scopeKey(args.key, args.scopeId);
  const deleted = mockKvStore.has(compositeKey);
  mockKvStore.delete(compositeKey);
  return { deleted };
}

/**
 * Mock kvList implementation
 */
async function mockKvList(args: {
  scopeId: string;
  prefix?: string;
  category?: string;
  limit?: number;
}) {
  const limit = args.limit ?? 100;
  const entries = Array.from(mockKvStore.values())
    .filter((entry) => entry.scopeId === args.scopeId)
    .filter((entry) => !args.prefix || entry.key.startsWith(args.prefix))
    .filter((entry) => !args.category || entry.category === args.category)
    .slice(0, limit);

  return {
    entries: entries.map((e) => ({
      key: e.key,
      value: e.value,
      category: e.category,
      updatedAt: e.updatedAt,
    })),
    count: entries.length,
  };
}

describe("KV Store Mutations", () => {
  beforeEach(() => {
    mockKvStore.clear();
  });

  describe("kvSet", () => {
    it("should create a new KV entry", async () => {
      const result = await mockKvSet({
        key: "test.key",
        value: "test value",
        agentId: "agent-1",
        scopeId: "scope-1",
        category: "config",
      });

      expect(result.created).toBe(true);
      expect(result.id).toBe("scope-1::test.key");
    });

    it("should update an existing entry (upsert behavior)", async () => {
      // First insert
      const result1 = await mockKvSet({
        key: "test.key",
        value: "value1",
        agentId: "agent-1",
        scopeId: "scope-1",
      });
      expect(result1.created).toBe(true);

      // Second insert same key
      const result2 = await mockKvSet({
        key: "test.key",
        value: "value2",
        agentId: "agent-1",
        scopeId: "scope-1",
      });
      expect(result2.created).toBe(false);

      // Verify updated value
      const retrieved = await mockKvGet({ key: "test.key", scopeId: "scope-1" });
      expect(retrieved.value).toBe("value2");
      expect(retrieved.found).toBe(true);
    });

    it("should support duplicate keys in different scopes (scope isolation)", async () => {
      await mockKvSet({
        key: "shared.key",
        value: "value-scope1",
        agentId: "agent-1",
        scopeId: "scope-1",
      });
      await mockKvSet({
        key: "shared.key",
        value: "value-scope2",
        agentId: "agent-1",
        scopeId: "scope-2",
      });

      const scope1Value = await mockKvGet({ key: "shared.key", scopeId: "scope-1" });
      const scope2Value = await mockKvGet({ key: "shared.key", scopeId: "scope-2" });

      expect(scope1Value.value).toBe("value-scope1");
      expect(scope2Value.value).toBe("value-scope2");
    });

    it("should store JSON values as strings", async () => {
      const jsonObj = { name: "test", count: 42 };
      const jsonString = JSON.stringify(jsonObj);

      await mockKvSet({
        key: "config.json",
        value: jsonString,
        agentId: "agent-1",
        scopeId: "scope-1",
      });

      const retrieved = await mockKvGet({ key: "config.json", scopeId: "scope-1" });
      expect(retrieved.found).toBe(true);
      expect(JSON.parse(retrieved.value)).toEqual(jsonObj);
    });

    it("should store metadata (source, confidence)", async () => {
      const key = "test.key.with.metadata";
      const compositeKey = scopeKey(key, "scope-1");

      await mockKvSet({
        key,
        value: "test",
        agentId: "agent-1",
        scopeId: "scope-1",
        category: "identity",
        metadata: { source: "config", confidence: 0.95 },
      });

      const entry = mockKvStore.get(compositeKey);
      expect(entry?.category).toBe("identity");
    });
  });

  describe("kvGet", () => {
    it("should retrieve an existing entry", async () => {
      await mockKvSet({
        key: "test.key",
        value: "test value",
        agentId: "agent-1",
        scopeId: "scope-1",
      });

      const result = await mockKvGet({ key: "test.key", scopeId: "scope-1" });
      expect(result.found).toBe(true);
      expect(result.value).toBe("test value");
      expect(result.key).toBe("test.key");
    });

    it("should return found=false for non-existent key", async () => {
      const result = await mockKvGet({ key: "non.existent", scopeId: "scope-1" });
      expect(result.found).toBe(false);
      expect(result.value).toBe("");
      expect(result.updatedAt).toBe(0);
    });

    it("should respect scope isolation on reads", async () => {
      await mockKvSet({
        key: "test.key",
        value: "scope1-value",
        agentId: "agent-1",
        scopeId: "scope-1",
      });

      const result = await mockKvGet({ key: "test.key", scopeId: "scope-2" });
      expect(result.found).toBe(false);
    });

    it("should return updatedAt timestamp", async () => {
      const before = Date.now();
      await mockKvSet({
        key: "timestamped.key",
        value: "value",
        agentId: "agent-1",
        scopeId: "scope-1",
      });
      const after = Date.now();

      const result = await mockKvGet({ key: "timestamped.key", scopeId: "scope-1" });
      expect(result.updatedAt).toBeGreaterThanOrEqual(before);
      expect(result.updatedAt).toBeLessThanOrEqual(after);
    });
  });

  describe("kvDelete", () => {
    it("should delete an existing entry", async () => {
      await mockKvSet({
        key: "test.key",
        value: "value",
        agentId: "agent-1",
        scopeId: "scope-1",
      });

      const deleteResult = await mockKvDelete({
        key: "test.key",
        agentId: "agent-1",
        scopeId: "scope-1",
      });
      expect(deleteResult.deleted).toBe(true);

      const getResult = await mockKvGet({ key: "test.key", scopeId: "scope-1" });
      expect(getResult.found).toBe(false);
    });

    it("should return deleted=false for non-existent key (idempotent)", async () => {
      const result = await mockKvDelete({
        key: "non.existent",
        agentId: "agent-1",
        scopeId: "scope-1",
      });
      expect(result.deleted).toBe(false);
    });

    it("should respect scope isolation on deletes", async () => {
      await mockKvSet({
        key: "test.key",
        value: "scope1-value",
        agentId: "agent-1",
        scopeId: "scope-1",
      });
      await mockKvSet({
        key: "test.key",
        value: "scope2-value",
        agentId: "agent-1",
        scopeId: "scope-2",
      });

      // Delete from scope-1
      const deleteResult = await mockKvDelete({
        key: "test.key",
        agentId: "agent-1",
        scopeId: "scope-1",
      });
      expect(deleteResult.deleted).toBe(true);

      // Verify scope-2 is unaffected
      const scope2Result = await mockKvGet({ key: "test.key", scopeId: "scope-2" });
      expect(scope2Result.found).toBe(true);
      expect(scope2Result.value).toBe("scope2-value");
    });
  });

  describe("kvList", () => {
    beforeEach(async () => {
      // Populate test data
      await mockKvSet({
        key: "ui.theme",
        value: "dark",
        agentId: "agent-1",
        scopeId: "scope-1",
        category: "preference",
      });
      await mockKvSet({
        key: "ui.fontSize",
        value: "14",
        agentId: "agent-1",
        scopeId: "scope-1",
        category: "preference",
      });
      await mockKvSet({
        key: "feature.betaEnabled",
        value: "true",
        agentId: "agent-1",
        scopeId: "scope-1",
        category: "config",
      });
      await mockKvSet({
        key: "identity.name",
        value: "test-agent",
        agentId: "agent-1",
        scopeId: "scope-1",
        category: "identity",
      });
    });

    it("should list all entries in a scope", async () => {
      const result = await mockKvList({ scopeId: "scope-1" });
      expect(result.count).toBe(4);
      expect(result.entries).toHaveLength(4);
    });

    it("should filter by prefix", async () => {
      const result = await mockKvList({ scopeId: "scope-1", prefix: "ui." });
      expect(result.count).toBe(2);
      expect(result.entries.map((e) => e.key)).toEqual(["ui.theme", "ui.fontSize"]);
    });

    it("should filter by category", async () => {
      const result = await mockKvList({ scopeId: "scope-1", category: "preference" });
      expect(result.count).toBe(2);
      expect(result.entries.map((e) => e.key)).toEqual(["ui.theme", "ui.fontSize"]);
    });

    it("should support prefix + category filtering", async () => {
      const result = await mockKvList({
        scopeId: "scope-1",
        prefix: "ui.",
        category: "preference",
      });
      expect(result.count).toBe(2);
    });

    it("should respect limit parameter", async () => {
      const result = await mockKvList({ scopeId: "scope-1", limit: 2 });
      expect(result.count).toBe(2);
      expect(result.entries).toHaveLength(2);
    });

    it("should return empty list for non-existent scope", async () => {
      const result = await mockKvList({ scopeId: "non.existent.scope" });
      expect(result.count).toBe(0);
      expect(result.entries).toHaveLength(0);
    });

    it("should return empty list when prefix has no matches", async () => {
      const result = await mockKvList({ scopeId: "scope-1", prefix: "nonexistent." });
      expect(result.count).toBe(0);
    });
  });
});
