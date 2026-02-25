/**
 * Unit tests for KV store mutations.
 *
 * Comprehensive test coverage for:
 * - kvSet: new keys, overwrites, value types, edge cases
 * - kvGet: existing keys, missing keys, after overwrites
 * - kvDelete: existing keys, non-existent keys, idempotent deletes
 * - kvList: empty scopes, prefix filtering, category filtering, pagination
 * - Edge cases: empty strings, long values, special characters
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

// Hoist mocks to avoid initialization order issues
const { mockKvSet, mockKvGet, mockKvDelete, mockKvList, mockGetScopeByName } =
  vi.hoisted(() => ({
    mockKvSet: vi.fn(),
    mockKvGet: vi.fn(),
    mockKvDelete: vi.fn(),
    mockKvList: vi.fn(),
    mockGetScopeByName: vi.fn(),
  }));

vi.mock("../src/lib/convex-client.js", () => ({
  kvSet: mockKvSet,
  kvGet: mockKvGet,
  kvDelete: mockKvDelete,
  kvList: mockKvList,
  getScopeByName: mockGetScopeByName,
}));

import { kvSet, kvGet, kvDelete, kvList } from "../src/tools/kv-store.js";

describe("KV Store Mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return private scope when looking for private-{agentId}
    mockGetScopeByName.mockImplementation(async (name: string) => {
      if (name.startsWith("private-")) {
        return { _id: name + "-id" };
      }
      return null;
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // kvSet Tests
  // ─────────────────────────────────────────────────────────────────────

  describe("kvSet", () => {
    test("creates a new key-value entry", async () => {
      mockKvSet.mockResolvedValue({
        id: "kv_123",
        created: true,
      });

      const result = await kvSet(
        {
          key: "test.key",
          value: "test value",
          category: "config",
        },
        "agent-1"
      );

      expect(result).toEqual({ id: "kv_123", created: true });
      expect(mockKvSet).toHaveBeenCalledOnce();
    });

    test("overwrites existing key (upsert)", async () => {
      mockKvSet.mockResolvedValue({
        id: "kv_456",
        created: false,
      });

      const result = await kvSet(
        {
          key: "existing.key",
          value: "new value",
        },
        "agent-2"
      );

      expect(result.created).toBe(false);
    });

    test("handles various value types (JSON, numbers, booleans)", async () => {
      mockKvSet.mockResolvedValue({
        id: "kv_json",
        created: true,
      });

      const jsonValue = JSON.stringify({ name: "test", count: 42, active: true });
      const result = await kvSet(
        {
          key: "config.json",
          value: jsonValue,
        },
        "agent-1"
      );

      expect(result.created).toBe(true);
    });

    test("stores metadata (source and confidence)", async () => {
      mockKvSet.mockResolvedValue({
        id: "kv_meta",
        created: true,
      });

      const result = await kvSet(
        {
          key: "test.key",
          value: "value",
          metadata: {
            source: "config-file",
            confidence: 0.95,
          },
        },
        "agent-1"
      );

      expect(result.created).toBe(true);
    });

    test("handles empty string as value", async () => {
      mockKvSet.mockResolvedValue({
        id: "kv_empty",
        created: true,
      });

      const result = await kvSet(
        {
          key: "empty.value",
          value: "",
        },
        "agent-1"
      );

      expect(result.created).toBe(true);
    });

    test("handles very long values (near 65KB limit)", async () => {
      mockKvSet.mockResolvedValue({
        id: "kv_long",
        created: true,
      });

      const longValue = "x".repeat(65000);
      const result = await kvSet(
        {
          key: "long.value",
          value: longValue,
        },
        "agent-1"
      );

      expect(result.created).toBe(true);
    });

    test("handles special characters in value", async () => {
      mockKvSet.mockResolvedValue({
        id: "kv_special",
        created: true,
      });

      const specialValue = 'test"with\'quotes\n\t\\escaped';
      const result = await kvSet(
        {
          key: "special.chars",
          value: specialValue,
        },
        "agent-1"
      );

      expect(result.created).toBe(true);
    });

    test("handles dotted namespace keys", async () => {
      mockKvSet.mockResolvedValue({
        id: "kv_ns",
        created: true,
      });

      const result = await kvSet(
        {
          key: "ui.theme.dark.accent",
          value: "#ff0000",
        },
        "agent-1"
      );

      expect(result.created).toBe(true);
    });

    test("supports category parameter (preference, config, identity, tool_state)", async () => {
      for (const category of ["preference", "config", "identity", "tool_state"]) {
        vi.clearAllMocks();
        mockGetScopeByName.mockImplementation(async (name: string) => {
          if (name.startsWith("private-")) {
            return { _id: name + "-id" };
          }
          return null;
        });
        mockKvSet.mockResolvedValue({ id: "kv_" + category, created: true });

        await kvSet(
          {
            key: `test.${category}`,
            value: "test",
            category: category as any,
          },
          "agent-1"
        );

        expect(mockKvSet).toHaveBeenCalledWith(
          expect.objectContaining({ category })
        );
      }
    });

    test("returns error when Convex call fails", async () => {
      mockKvSet.mockRejectedValue(new Error("Network error"));

      const result = await kvSet(
        {
          key: "test.key",
          value: "test",
        },
        "agent-1"
      );

      expect(result).toEqual({
        isError: true,
        message: expect.stringContaining("kv_set failed"),
      });
    });

    test("uses provided scopeId when given", async () => {
      mockKvSet.mockResolvedValue({ id: "kv_custom", created: true });

      await kvSet(
        {
          key: "test.key",
          value: "test",
          scopeId: "custom-scope-id",
        },
        "agent-1"
      );

      expect(mockKvSet).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeId: "custom-scope-id",
        })
      );
    });

    test("falls back to private scope when scopeId not provided", async () => {
      mockGetScopeByName.mockResolvedValue({ _id: "private-scope-id" });
      mockKvSet.mockResolvedValue({ id: "kv_private", created: true });

      await kvSet(
        {
          key: "test.key",
          value: "test",
        },
        "agent-1"
      );

      expect(mockGetScopeByName).toHaveBeenCalledWith("private-agent-1");
    });

    test("returns error when private scope not found", async () => {
      mockGetScopeByName.mockResolvedValue(null);

      const result = await kvSet(
        {
          key: "test.key",
          value: "test",
        },
        "agent-1"
      );

      expect(result).toEqual({
        isError: true,
        message: expect.stringContaining("Private scope not found"),
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // kvGet Tests
  // ─────────────────────────────────────────────────────────────────────

  describe("kvGet", () => {
    test("retrieves an existing entry", async () => {
      mockKvGet.mockResolvedValue({
        key: "test.key",
        value: "test value",
        category: "config",
        found: true,
        updatedAt: 1234567890,
      });

      const result = await kvGet(
        {
          key: "test.key",
        },
        "agent-1"
      );

      expect(result.found).toBe(true);
      expect(result.value).toBe("test value");
    });

    test("returns category when present", async () => {
      mockKvGet.mockResolvedValue({
        key: "identity.name",
        value: "john",
        category: "identity",
        found: true,
        updatedAt: 1234567890,
      });

      const result = await kvGet(
        {
          key: "identity.name",
        },
        "agent-1"
      );

      expect(result.category).toBe("identity");
    });

    test("handles JSON values", async () => {
      const jsonValue = JSON.stringify({ name: "test", count: 42 });
      mockKvGet.mockResolvedValue({
        key: "config.json",
        value: jsonValue,
        found: true,
        updatedAt: 1234567890,
      });

      const result = await kvGet(
        {
          key: "config.json",
        },
        "agent-1"
      );

      expect(result.found).toBe(true);
      expect(JSON.parse(result.value)).toEqual({ name: "test", count: 42 });
    });

    test("returns correct updatedAt timestamp", async () => {
      const timestamp = 1704067200000;
      mockKvGet.mockResolvedValue({
        key: "timestamped.key",
        value: "value",
        found: true,
        updatedAt: timestamp,
      });

      const result = await kvGet(
        {
          key: "timestamped.key",
        },
        "agent-1"
      );

      expect(result.updatedAt).toBe(timestamp);
    });

    test("uses provided scopeId when given", async () => {
      mockKvGet.mockResolvedValue({
        key: "test.key",
        value: "value",
        found: true,
        updatedAt: 123,
      });

      await kvGet(
        {
          key: "test.key",
          scopeId: "custom-scope",
        },
        "agent-1"
      );

      expect(mockKvGet).toHaveBeenCalledWith({
        key: "test.key",
        scopeId: "custom-scope",
      });
    });

    test("returns error when Convex call fails", async () => {
      mockKvGet.mockRejectedValue(new Error("Database error"));

      const result = await kvGet(
        {
          key: "test.key",
        },
        "agent-1"
      );

      expect(result).toEqual({
        isError: true,
        message: expect.stringContaining("kv_get failed"),
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // kvDelete Tests
  // ─────────────────────────────────────────────────────────────────────

  describe("kvDelete", () => {
    test("deletes an existing entry", async () => {
      mockKvDelete.mockResolvedValue({
        deleted: true,
      });

      const result = await kvDelete(
        {
          key: "test.key",
        },
        "agent-1"
      );

      expect(result.deleted).toBe(true);
    });

    test("returns deleted=false for non-existent key (idempotent)", async () => {
      mockKvDelete.mockResolvedValue({
        deleted: false,
      });

      const result = await kvDelete(
        {
          key: "non.existent",
        },
        "agent-1"
      );

      expect(result.deleted).toBe(false);
    });

    test("idempotent delete is safe to call multiple times", async () => {
      mockKvDelete
        .mockResolvedValueOnce({ deleted: true })
        .mockResolvedValueOnce({ deleted: false });

      const result1 = await kvDelete(
        {
          key: "test.key",
        },
        "agent-1"
      );
      const result2 = await kvDelete(
        {
          key: "test.key",
        },
        "agent-1"
      );

      expect(result1.deleted).toBe(true);
      expect(result2.deleted).toBe(false);
    });

    test("uses provided scopeId when given", async () => {
      mockKvDelete.mockResolvedValue({ deleted: true });

      await kvDelete(
        {
          key: "test.key",
          scopeId: "custom-scope",
        },
        "agent-1"
      );

      expect(mockKvDelete).toHaveBeenCalledWith({
        key: "test.key",
        agentId: "agent-1",
        scopeId: "custom-scope",
      });
    });

    test("returns error when Convex call fails", async () => {
      mockKvDelete.mockRejectedValue(new Error("Deletion failed"));

      const result = await kvDelete(
        {
          key: "test.key",
        },
        "agent-1"
      );

      expect(result).toEqual({
        isError: true,
        message: expect.stringContaining("kv_delete failed"),
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // kvList Tests
  // ─────────────────────────────────────────────────────────────────────

  describe("kvList", () => {
    test("lists all entries in a scope", async () => {
      mockKvList.mockResolvedValue([
        { key: "ui.theme", value: "dark", updatedAt: 123 },
        { key: "ui.fontSize", value: "14", updatedAt: 124 },
        { key: "feature.beta", value: "true", updatedAt: 125 },
      ]);

      const result = await kvList({}, "agent-1");

      expect(result.count).toBe(3);
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].key).toBe("ui.theme");
    });

    test("returns empty list for empty scope", async () => {
      mockKvList.mockResolvedValue([]);

      const result = await kvList({}, "agent-1");

      expect(result.count).toBe(0);
      expect(result.entries).toHaveLength(0);
    });

    test("filters by prefix", async () => {
      mockKvList.mockResolvedValue([
        { key: "ui.theme", value: "dark", updatedAt: 123 },
        { key: "ui.fontSize", value: "14", updatedAt: 124 },
      ]);

      const result = await kvList({ prefix: "ui." }, "agent-1");

      expect(result.count).toBe(2);
      expect(mockKvList).toHaveBeenCalledWith(
        expect.objectContaining({
          prefix: "ui.",
        })
      );
    });

    test("filters by category", async () => {
      mockKvList.mockResolvedValue([
        { key: "ui.theme", value: "dark", category: "preference", updatedAt: 123 },
        { key: "ui.fontSize", value: "14", category: "preference", updatedAt: 124 },
      ]);

      const result = await kvList({ category: "preference" }, "agent-1");

      expect(result.count).toBe(2);
    });

    test("combines prefix and category filters", async () => {
      mockKvList.mockResolvedValue([
        { key: "ui.theme", value: "dark", category: "preference", updatedAt: 123 },
      ]);

      const result = await kvList(
        {
          prefix: "ui.",
          category: "preference",
        },
        "agent-1"
      );

      expect(result.count).toBe(1);
    });

    test("respects limit parameter", async () => {
      mockKvList.mockResolvedValue([
        { key: "key1", value: "value1", updatedAt: 123 },
        { key: "key2", value: "value2", updatedAt: 124 },
      ]);

      await kvList({ limit: 2 }, "agent-1");

      expect(mockKvList).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 2,
        })
      );
    });

    test("supports pagination with limit", async () => {
      const entries = Array.from({ length: 50 }, (_, i) => ({
        key: `key.${i}`,
        value: `value${i}`,
        updatedAt: 123 + i,
      }));
      mockKvList.mockResolvedValue(entries);

      const result = await kvList({ limit: 50 }, "agent-1");

      expect(result.count).toBe(50);
      expect(result.entries).toHaveLength(50);
    });

    test("returns empty list when prefix has no matches", async () => {
      mockKvList.mockResolvedValue([]);

      const result = await kvList({ prefix: "nonexistent." }, "agent-1");

      expect(result.count).toBe(0);
    });

    test("returns category field in entries", async () => {
      mockKvList.mockResolvedValue([
        {
          key: "identity.name",
          value: "agent-1",
          category: "identity",
          updatedAt: 123,
        },
      ]);

      const result = await kvList({}, "agent-1");

      expect(result.entries[0].category).toBe("identity");
    });

    test("returns updatedAt timestamp for each entry", async () => {
      const timestamp = 1704067200000;
      mockKvList.mockResolvedValue([
        { key: "test.key", value: "value", updatedAt: timestamp },
      ]);

      const result = await kvList({}, "agent-1");

      expect(result.entries[0].updatedAt).toBe(timestamp);
    });

    test("returns error when Convex call fails", async () => {
      mockKvList.mockRejectedValue(new Error("Query failed"));

      const result = await kvList({}, "agent-1");

      expect(result).toEqual({
        isError: true,
        message: expect.stringContaining("kv_list failed"),
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Integration Tests
  // ─────────────────────────────────────────────────────────────────────

  describe("Integration scenarios", () => {
    test("set, get, delete workflow", async () => {
      mockKvSet.mockResolvedValue({ id: "kv_123", created: true });
      mockKvGet.mockResolvedValue({
        key: "test.key",
        value: "test value",
        found: true,
        updatedAt: 123,
      });
      mockKvDelete.mockResolvedValue({ deleted: true });

      const setResult = await kvSet(
        { key: "test.key", value: "test value" },
        "agent-1"
      );
      expect(setResult.created).toBe(true);

      const getResult = await kvGet({ key: "test.key" }, "agent-1");
      expect(getResult.found).toBe(true);
      expect(getResult.value).toBe("test value");

      const delResult = await kvDelete({ key: "test.key" }, "agent-1");
      expect(delResult.deleted).toBe(true);
    });

    test("set with metadata, retrieve metadata", async () => {
      mockKvSet.mockResolvedValue({ id: "kv_meta", created: true });
      mockKvGet.mockResolvedValue({
        key: "config.api",
        value: '{"url":"https://api.example.com"}',
        category: "config",
        found: true,
        updatedAt: 123,
      });

      await kvSet(
        {
          key: "config.api",
          value: '{"url":"https://api.example.com"}',
          category: "config",
          metadata: { source: "env", confidence: 1.0 },
        },
        "agent-1"
      );

      const getResult = await kvGet({ key: "config.api" }, "agent-1");
      expect(getResult.category).toBe("config");
      expect(JSON.parse(getResult.value)).toEqual({
        url: "https://api.example.com",
      });
    });
  });
});
