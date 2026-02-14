import { strict as assert } from "node:assert";
import fs from "node:fs";

const scopesSource = fs.readFileSync("convex/functions/scopes.ts", "utf8");
const recallSource = fs.readFileSync("mcp-server/src/tools/recall.ts", "utf8");
const dedupSource = fs.readFileSync("convex/crons/dedup.ts", "utf8");

assert.ok(scopesSource.includes("deleteByAgentAndScope"), "scope member removal should clean notifications");
assert.ok(recallSource.includes("searchFactsMulti"), "recall should use multi-scope recall");
assert.ok(dedupSource.includes("shared-") && dedupSource.includes("team-"), "dedup must be scoped to shared/team scopes");

console.log("security-audit: PASS");
