import { describe, expect, test } from "vitest";
import { autoLinkEntities } from "../src/lib/auto-linker.js";

describe("auto-linker", () => {
  test("wraps plain entity mentions in wiki links", () => {
    const out = autoLinkEntities("Ryan shipped engram", ["Ryan", "engram"]);
    expect(out).toContain("[[Ryan]]");
    expect(out).toContain("[[engram]]");
  });

  test("does not double-wrap linked entities", () => {
    const out = autoLinkEntities("[[Ryan]] updated docs", ["Ryan"]);
    expect(out).toBe("[[Ryan]] updated docs");
  });
});
