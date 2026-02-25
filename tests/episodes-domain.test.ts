import { strict as assert } from "node:assert";
import {
  buildAutoEpisodeTitle,
  buildObservationEpisodeTags,
  mergeUniqueFactIds,
} from "../convex/functions/episodes.helpers";

const merged = mergeUniqueFactIds(
  ["a", "b", "c"],
  ["b", "c", "d", "e"],
);
assert.deepEqual(merged, ["a", "b", "c", "d", "e"]);

const tags = buildObservationEpisodeTags("observer", 3, ["state", "compression"]);
assert.deepEqual(tags, [
  "observation-session",
  "observer",
  "observer-generation-3",
  "state",
  "compression",
]);

const title = buildAutoEpisodeTitle({
  source: "reflector",
  generation: 5,
  startTime: Date.UTC(2026, 1, 24, 10, 20, 30),
});
assert.equal(title, "Reflector Episode #5 (2026-02-24)");

console.log("episodes-domain: PASS");
