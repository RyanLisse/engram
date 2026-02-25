import { beforeEach, describe, expect, test, vi } from "vitest";

const {
  mockGetScopeByName,
  mockBlockGet,
  mockBlockCreate,
  mockBlockWrite,
} = vi.hoisted(() => ({
  mockGetScopeByName: vi.fn(),
  mockBlockGet: vi.fn(),
  mockBlockCreate: vi.fn(),
  mockBlockWrite: vi.fn(),
}));

vi.mock("../src/lib/convex-client.js", () => ({
  getScopeByName: mockGetScopeByName,
  blockGet: mockBlockGet,
  blockCreate: mockBlockCreate,
  blockWrite: mockBlockWrite,
}));

import { entries as blockEntries } from "../src/lib/tool-registry/block-entries.js";
import {
  blockRead,
  blockWrite,
} from "../src/tools/memory-blocks.js";

describe("memory block registry", () => {
  test("exposes memory_block_read and memory_block_write", () => {
    const names = blockEntries.map((entry) => entry.tool.name);
    expect(names).toContain("memory_block_read");
    expect(names).toContain("memory_block_write");
  });
});

describe("memory block tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScopeByName.mockResolvedValue({ _id: "j_scope_private" });
  });

  test("blockRead returns found=false for missing block", async () => {
    mockBlockGet.mockResolvedValue(null);

    const result = await blockRead({ label: "persona" }, "agent-1");

    expect(result).toMatchObject({
      found: false,
      label: "persona",
      version: 0,
      length: 0,
    });
  });

  test("blockRead returns block payload when found", async () => {
    mockBlockGet.mockResolvedValue({
      _id: "j_block_1",
      label: "persona",
      value: "You are concise.",
      version: 3,
      characterLimit: 2000,
      updatedAt: 1234,
    });

    const result = await blockRead({ label: "persona" }, "agent-1");

    expect(result).toMatchObject({
      found: true,
      label: "persona",
      value: "You are concise.",
      version: 3,
      characterLimit: 2000,
      length: 16,
      updatedAt: 1234,
    });
  });

  test("blockWrite errors when createIfMissing=true without characterLimit", async () => {
    mockBlockGet.mockResolvedValue(null);

    const result = await blockWrite(
      {
        label: "persona",
        mode: "replace",
        content: "hello",
        createIfMissing: true,
      },
      "agent-1",
    );

    expect(result).toMatchObject({
      isError: true,
      message: expect.stringContaining("characterLimit is required"),
    });
  });

  test("blockWrite creates block when createIfMissing=true in replace mode", async () => {
    mockBlockGet.mockResolvedValue(null);
    mockBlockCreate.mockResolvedValue({ blockId: "j_block_1", version: 1 });

    const result = await blockWrite(
      {
        label: "persona",
        mode: "replace",
        content: "You are practical.",
        createIfMissing: true,
        characterLimit: 2000,
      },
      "agent-1",
    );

    expect(mockBlockCreate).toHaveBeenCalledWith({
      label: "persona",
      value: "You are practical.",
      characterLimit: 2000,
      scopeId: "j_scope_private",
      createdBy: "agent-1",
    });
    expect(result).toMatchObject({
      blockId: "j_block_1",
      version: 1,
      created: true,
    });
  });

  test("blockWrite appends to existing block", async () => {
    mockBlockGet.mockResolvedValue({
      _id: "j_block_1",
      label: "persona",
      value: "base",
      version: 2,
      characterLimit: 2000,
      updatedAt: 1000,
    });
    mockBlockWrite.mockResolvedValue({
      blockId: "j_block_1",
      version: 3,
      length: 9,
      characterLimit: 2000,
    });

    const result = await blockWrite(
      {
        label: "persona",
        mode: "append",
        content: " plus",
        expectedVersion: 2,
      },
      "agent-1",
    );

    expect(mockBlockWrite).toHaveBeenCalledWith({
      scopeId: "j_scope_private",
      label: "persona",
      mode: "append",
      content: " plus",
      agentId: "agent-1",
      expectedVersion: 2,
      reason: undefined,
    });
    expect(result).toMatchObject({
      blockId: "j_block_1",
      version: 3,
      created: false,
    });
  });

  test("blockWrite returns error when block missing and createIfMissing=false", async () => {
    mockBlockGet.mockResolvedValue(null);

    const result = await blockWrite(
      {
        label: "persona",
        mode: "append",
        content: "x",
      },
      "agent-1",
    );

    expect(result).toMatchObject({
      isError: true,
      message: expect.stringContaining("not found"),
    });
  });
});
