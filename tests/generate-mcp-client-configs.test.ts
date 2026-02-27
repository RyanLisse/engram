/**
 * Tests for scripts/generate-mcp-client-configs.ts
 *
 * Run: npx tsx tests/generate-mcp-client-configs.test.ts
 * Exit 0 = all pass, exit 1 = failures
 */
import { execSync, spawnSync } from "node:child_process";
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

function runWithStatus(args: string[] = []): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync("npx", ["tsx", SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 15000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function parseDryRunJson(client: string): any {
  const output = run(`--dry-run --client ${client}`);
  const jsonStart = output.indexOf("{");
  assert(jsonStart >= 0, `no JSON found for client: ${client}`);
  return JSON.parse(output.slice(jsonStart));
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

// ── Additional coverage requested ──
test("determinism: same contract generates byte-identical output twice", () => {
  const first = run("--dry-run --client codex");
  const second = run("--dry-run --client codex");
  assertEqual(first, second, "dry-run output must be byte-identical");
});

test("per-client format: Claude Code .mcp.json has mcpServers.engram with command/args/env", () => {
  const json = parseDryRunJson("claude-code");
  assert(json.mcpServers !== undefined, "missing mcpServers");
  assert(json.mcpServers.engram !== undefined, "missing mcpServers.engram");
  assert(typeof json.mcpServers.engram.command === "string", "missing command");
  assert(Array.isArray(json.mcpServers.engram.args), "missing args array");
  assert(typeof json.mcpServers.engram.env === "object", "missing env object");
});

test("per-client format: Codex .mcp.json has mcpServers.engram with command/args/env", () => {
  const json = parseDryRunJson("codex");
  assert(json.mcpServers !== undefined, "missing mcpServers");
  assert(json.mcpServers.engram !== undefined, "missing mcpServers.engram");
  assert(typeof json.mcpServers.engram.command === "string", "missing command");
  assert(Array.isArray(json.mcpServers.engram.args), "missing args array");
  assert(typeof json.mcpServers.engram.env === "object", "missing env object");
});

test("per-client format: OpenCode opencode.json has expected top-level shape", () => {
  const json = parseDryRunJson("opencode");
  assert(typeof json.$schema === "string", "missing $schema");
  assert(json.$schema.includes("opencode"), "unexpected $schema");
  assert(json.mcpServers !== undefined, "missing mcpServers");
  assert(json.mcpServers.engram !== undefined, "missing mcpServers.engram");
});

test("per-client format: Gemini CLI template has expected structure", () => {
  const output = run("--dry-run --client gemini-cli");
  assert(
    output.includes(".gemini-settings"),
    "dry-run header should include gemini settings template path"
  );
  const json = parseDryRunJson("gemini-cli");
  assert(json.mcpServers !== undefined, "missing mcpServers");
  assert(json.mcpServers.engram !== undefined, "missing mcpServers.engram");
  assert(typeof json._generated === "object", "missing _generated metadata");
});

test("per-client format: FactoryDroid config has expected structure", () => {
  const output = run("--dry-run --client factory-droid");
  assert(
    output.includes(".factory-mcp.json"),
    "dry-run header should include factory-droid config path"
  );
  const json = parseDryRunJson("factory-droid");
  assert(json.mcpServers !== undefined, "missing mcpServers");
  assert(json.mcpServers.engram !== undefined, "missing mcpServers.engram");
  assert(typeof json.mcpServers.engram.env === "object", "missing env object");
});

test("env vars: required vars CONVEX_URL and ENGRAM_AGENT_ID are present in every client config", () => {
  for (const client of [
    "claude-code",
    "codex",
    "opencode",
    "gemini-cli",
    "factory-droid",
  ]) {
    const json = parseDryRunJson(client);
    const env = json.mcpServers.engram.env;
    assert("CONVEX_URL" in env, `[${client}] missing CONVEX_URL`);
    assert("ENGRAM_AGENT_ID" in env, `[${client}] missing ENGRAM_AGENT_ID`);
  }
});

test("env vars: configs contain placeholders/defaults, not literal secret API key values", () => {
  for (const client of [
    "claude-code",
    "codex",
    "opencode",
    "gemini-cli",
    "factory-droid",
  ]) {
    const json = parseDryRunJson(client);
    const env = json.mcpServers.engram.env as Record<string, string>;
    for (const [key, valueRaw] of Object.entries(env)) {
      const value = String(valueRaw ?? "");
      if (!key.includes("API_KEY")) continue;

      const looksLikeLiveSecret =
        /sk-[A-Za-z0-9]/.test(value) ||
        /co-[A-Za-z0-9]{8,}/.test(value) ||
        /[A-Za-z0-9]{24,}/.test(value);
      const looksLikePlaceholder =
        value === "" ||
        value.includes("YOUR_") ||
        value.includes("<") ||
        value.includes("${");
      assert(
        !looksLikeLiveSecret || looksLikePlaceholder,
        `[${client}] ${key} appears to include a literal secret value`
      );
    }
  }
});

test("verify mode: exits with status 0 when generated files match committed files", () => {
  run("");
  const result = runWithStatus(["--verify"]);
  assertEqual(result.status, 0, "expected --verify to exit 0");
});

test("dry-run mode: does not write files to disk", () => {
  const files = [
    path.join(ROOT, "plugins/claude-code/.mcp.json"),
    path.join(ROOT, "plugins/codex/.mcp.json"),
    path.join(ROOT, "plugins/opencode/opencode.json"),
    path.join(ROOT, "plugins/gemini-cli/.gemini-settings.template.json"),
    path.join(ROOT, "plugins/factory-droid/.factory-mcp.json"),
  ];

  run("");
  const before = files.map((file) =>
    fs.existsSync(file)
      ? fs.readFileSync(file, "utf-8")
      : "__MISSING_FILE_SENTINEL__"
  );
  run("--dry-run");
  const after = files.map((file) =>
    fs.existsSync(file)
      ? fs.readFileSync(file, "utf-8")
      : "__MISSING_FILE_SENTINEL__"
  );

  assertEqual(
    JSON.stringify(after),
    JSON.stringify(before),
    "dry-run should not modify generated files"
  );
});

test("edge case: missing contract file throws a clear error", () => {
  const backup = `${CONTRACT}.bak`;
  assert(fs.existsSync(CONTRACT), "contract must exist before test");
  if (fs.existsSync(backup)) fs.unlinkSync(backup);

  fs.renameSync(CONTRACT, backup);
  try {
    const result = runWithStatus(["--dry-run"]);
    assertEqual(result.status, 1, "expected exit code 1 for missing contract");
    const combined = `${result.stdout}\n${result.stderr}`;
    assert(
      combined.includes("Contract not found"),
      "expected clear 'Contract not found' error message"
    );
  } finally {
    if (fs.existsSync(backup)) {
      fs.renameSync(backup, CONTRACT);
    }
  }
});

// ── Summary ──
console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
