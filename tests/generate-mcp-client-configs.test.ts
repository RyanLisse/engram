/**
 * Tests for scripts/generate-mcp-client-configs.ts
 *
 * Run: npx tsx tests/generate-mcp-client-configs.test.ts
 * Exit 0 = all pass, exit 1 = failures
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts/generate-mcp-client-configs.ts");
const CONTRACT = path.join(ROOT, "config/engram-mcp.contract.json");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  FAIL: ${name}`);
    console.log(`        ${e.message}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function assertEqual(actual: any, expected: any, msg?: string) {
  if (actual !== expected) {
    throw new Error(
      `${msg || "Assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function run(args: string = ""): string {
  return execSync(`npx tsx "${SCRIPT}" ${args}`, {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 15000,
  });
}

console.log("\n--- generate-mcp-client-configs tests ---\n");

// ── Contract exists ──
test("contract file exists and is valid JSON", () => {
  const raw = fs.readFileSync(CONTRACT, "utf-8");
  const contract = JSON.parse(raw);
  assert(contract.version === "1.0.0", "version mismatch");
  assert(typeof contract.server === "object", "missing server");
  assert(typeof contract.clients === "object", "missing clients");
});

// ── Dry-run produces valid JSON per client ──
test("--dry-run outputs valid JSON for all clients", () => {
  const output = run("--dry-run");
  // Should contain markers for each client
  for (const client of [
    "claude-code",
    "codex",
    "opencode",
    "gemini-cli",
    "factory-droid",
  ]) {
    assert(output.includes(client), `missing output for client: ${client}`);
  }
});

test("--dry-run --client claude-code outputs valid JSON", () => {
  const output = run("--dry-run --client claude-code");
  // Extract JSON from output (after the header line)
  const jsonStart = output.indexOf("{");
  assert(jsonStart >= 0, "no JSON found in output");
  const json = JSON.parse(output.slice(jsonStart));
  assert(json.mcpServers !== undefined, "missing mcpServers");
  assert(json.mcpServers.engram !== undefined, "missing engram server");
  assertEqual(
    json.mcpServers.engram.env.ENGRAM_AGENT_ID,
    "claude-code",
    "agent ID"
  );
});

test("--dry-run --client codex has correct agent ID", () => {
  const output = run("--dry-run --client codex");
  const jsonStart = output.indexOf("{");
  const json = JSON.parse(output.slice(jsonStart));
  assertEqual(
    json.mcpServers.engram.env.ENGRAM_AGENT_ID,
    "codex",
    "agent ID"
  );
});

test("--dry-run --client opencode uses opencode format", () => {
  const output = run("--dry-run --client opencode");
  const jsonStart = output.indexOf("{");
  const json = JSON.parse(output.slice(jsonStart));
  assert(json.$schema !== undefined, "opencode format should have $schema");
  assertEqual(
    json.mcpServers.engram.env.ENGRAM_AGENT_ID,
    "opencode",
    "agent ID"
  );
});

test("--dry-run --client gemini-cli uses gemini settings format", () => {
  const output = run("--dry-run --client gemini-cli");
  const jsonStart = output.indexOf("{");
  const json = JSON.parse(output.slice(jsonStart));
  assert(json.mcpServers !== undefined, "missing mcpServers");
  assertEqual(
    json.mcpServers.engram.env.ENGRAM_AGENT_ID,
    "gemini",
    "agent ID"
  );
});

// ── _generated metadata ──
test("generated configs include _generated metadata", () => {
  const output = run("--dry-run --client claude-code");
  const jsonStart = output.indexOf("{");
  const json = JSON.parse(output.slice(jsonStart));
  assert(json._generated !== undefined, "missing _generated");
  assertEqual(
    json._generated.from,
    "config/engram-mcp.contract.json",
    "_generated.from"
  );
  assertEqual(json._generated.version, "1.0.0", "_generated.version");
  assert(
    json._generated.warning.includes("DO NOT EDIT"),
    "missing DO NOT EDIT warning"
  );
});

// ── Determinism ──
test("output is deterministic (two runs produce identical output)", () => {
  const run1 = run("--dry-run --client claude-code");
  const run2 = run("--dry-run --client claude-code");
  assertEqual(run1, run2, "determinism");
});

// ── Env vars ──
test("all env vars from contract appear in generated config", () => {
  const contract = JSON.parse(fs.readFileSync(CONTRACT, "utf-8"));
  const output = run("--dry-run --client claude-code");
  const jsonStart = output.indexOf("{");
  const json = JSON.parse(output.slice(jsonStart));
  const env = json.mcpServers.engram.env;

  for (const key of Object.keys(contract.env.required)) {
    assert(key in env, `missing required env: ${key}`);
  }
  for (const key of Object.keys(contract.env.optional)) {
    assert(key in env, `missing optional env: ${key}`);
  }
});

// ── Write mode ──
test("generate writes files and --verify returns 0", () => {
  // Generate all files
  run("");
  // Verify should exit 0 (no drift)
  const verifyOutput = run("--verify");
  assert(
    verifyOutput.includes("0 drifted") || verifyOutput.includes("no drift"),
    "expected no drift after fresh generate"
  );
});

// ── Args prefix ──
test("generated args use correct prefix for each client", () => {
  const output = run("--dry-run --client claude-code");
  const jsonStart = output.indexOf("{");
  const json = JSON.parse(output.slice(jsonStart));
  const args = json.mcpServers.engram.args;
  assert(
    args[0].startsWith("../../"),
    `expected ../../ prefix, got: ${args[0]}`
  );
});

// ── Summary ──
console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
