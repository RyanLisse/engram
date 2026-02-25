import { describe, test, expect } from "vitest";
import {
  buildAutoEpisodeTitle,
  buildObservationEpisodeTags,
  mergeUniqueFactIds,
} from "../convex/functions/episodes.helpers";

describe("episodes domain helpers", () => {
  test("mergeUniqueFactIds deduplicates and preserves order", () => {
    const merged = mergeUniqueFactIds(
      ["a", "b", "c"],
      ["b", "c", "d", "e"],
    );
    expect(merged).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("buildObservationEpisodeTags includes source, generation, and custom tags", () => {
    const tags = buildObservationEpisodeTags("observer", 3, ["state", "compression"]);
    expect(tags).toEqual([
      "observation-session",
      "observer",
      "observer-generation-3",
      "state",
      "compression",
    ]);
  });

  test("buildAutoEpisodeTitle formats source, generation, and date", () => {
    const title = buildAutoEpisodeTitle({
      source: "reflector",
      generation: 5,
      startTime: Date.UTC(2026, 1, 24, 10, 20, 30),
    });
    expect(title).toBe("Reflector Episode #5 (2026-02-24)");
  });
});
