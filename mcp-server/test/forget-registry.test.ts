import { describe, test, expect } from "vitest";
import { getToolDefinitions } from "../src/lib/tool-registry/index.js";

describe("tool registry forget wiring", () => {
  test("registers memory_forget tool", () => {
    const names = getToolDefinitions().map((tool) => tool.name);
    expect(names).toContain("memory_forget");
  });
});
