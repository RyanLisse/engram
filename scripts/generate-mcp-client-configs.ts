#!/usr/bin/env npx tsx
/**
 * Deterministic MCP client config generator.
 *
 * Reads config/engram-mcp.contract.json and generates per-client config files.
 *
 * Usage:
 *   npx tsx scripts/generate-mcp-client-configs.ts           # generate all
 *   npx tsx scripts/generate-mcp-client-configs.ts --client claude-code  # one client
 *   npx tsx scripts/generate-mcp-client-configs.ts --dry-run  # print, don't write
 *   npx tsx scripts/generate-mcp-client-configs.ts --verify   # check for drift
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import * as os from "node:os";

// ── Resolve paths ──────────────────────────────────────────
const ROOT = path.resolve(__dirname, "..");
const CONTRACT_PATH = path.join(ROOT, "config/engram-mcp.contract.json");

// ── Parse CLI args ─────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verify = args.includes("--verify");
const clientIdx = args.indexOf("--client");
const singleClient = clientIdx >= 0 ? args[clientIdx + 1] : null;

// ── Types ──────────────────────────────────────────────────
interface ContractEnvEntry {
  description: string;
  placeholder?: string;
  default?: string;
}

interface ContractClient {
  agentId: string;
  outputPath: string;
  format: "mcp-json" | "opencode-json" | "gemini-settings";
  argsPrefix: string;
}

interface Contract {
  version: string;
  server: {
    name: string;
    command: string;
    args: string[];
    description?: string;
  };
  env: {
    required: Record<string, ContractEnvEntry>;
    optional: Record<string, ContractEnvEntry>;
  };
  clients: Record<string, ContractClient>;
}

// ── Helpers ────────────────────────────────────────────────

/** Sort object keys deterministically. */
function sortKeys<T extends Record<string, any>>(obj: T): T {
  const sorted: any = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}

/** Deterministic JSON serialization with sorted keys. */
function stableStringify(obj: any): string {
  return JSON.stringify(obj, Object.keys(obj).sort(), 2);
}

/** Deep sort all object keys recursively for deterministic output. */
function deepSortKeys(value: any): any {
  if (Array.isArray(value)) {
    return value.map(deepSortKeys);
  }
  if (value !== null && typeof value === "object") {
    const sorted: any = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = deepSortKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

/** Build the _generated metadata block. */
function generatedMeta(contract: Contract): Record<string, string> {
  return {
    from: "config/engram-mcp.contract.json",
    version: contract.version,
    warning:
      "DO NOT EDIT — regenerate with: npx tsx scripts/generate-mcp-client-configs.ts",
  };
}

/** Build the env block for a given client. */
function buildEnv(
  contract: Contract,
  client: ContractClient
): Record<string, string> {
  const env: Record<string, string> = {};

  // Required env vars (use placeholder)
  for (const [key, entry] of Object.entries(contract.env.required)) {
    env[key] = entry.placeholder ?? "";
  }

  // Agent ID (always set per client)
  env["ENGRAM_AGENT_ID"] = client.agentId;

  // Optional env vars (use default)
  for (const [key, entry] of Object.entries(contract.env.optional)) {
    env[key] = entry.default ?? "";
  }

  return env;
}

/** Build the args array with the client's prefix. */
function buildArgs(contract: Contract, client: ContractClient): string[] {
  return contract.server.args.map((arg) => client.argsPrefix + arg);
}

// ── Format generators ──────────────────────────────────────

function generateMcpJson(contract: Contract, client: ContractClient): string {
  const config = deepSortKeys({
    _generated: generatedMeta(contract),
    mcpServers: {
      [contract.server.name]: {
        command: contract.server.command,
        args: buildArgs(contract, client),
        env: buildEnv(contract, client),
      },
    },
  });
  return JSON.stringify(config, null, 2) + "\n";
}

function generateOpenCodeJson(
  contract: Contract,
  client: ContractClient
): string {
  const config = deepSortKeys({
    $schema: "https://opencode.ai/config.json",
    _generated: generatedMeta(contract),
    mcpServers: {
      [contract.server.name]: {
        command: contract.server.command,
        args: buildArgs(contract, client),
        env: buildEnv(contract, client),
      },
    },
  });
  return JSON.stringify(config, null, 2) + "\n";
}

function generateGeminiSettings(
  contract: Contract,
  client: ContractClient
): string {
  const config = deepSortKeys({
    _generated: generatedMeta(contract),
    mcpServers: {
      [contract.server.name]: {
        command: contract.server.command,
        args: buildArgs(contract, client),
        env: buildEnv(contract, client),
      },
    },
  });
  return JSON.stringify(config, null, 2) + "\n";
}

function generateConfig(contract: Contract, client: ContractClient): string {
  switch (client.format) {
    case "mcp-json":
      return generateMcpJson(contract, client);
    case "opencode-json":
      return generateOpenCodeJson(contract, client);
    case "gemini-settings":
      return generateGeminiSettings(contract, client);
    default:
      throw new Error(`Unknown format: ${client.format}`);
  }
}

// ── Main ───────────────────────────────────────────────────

function main() {
  // Load contract
  if (!fs.existsSync(CONTRACT_PATH)) {
    console.error(`Contract not found: ${CONTRACT_PATH}`);
    process.exit(1);
  }
  const contract: Contract = JSON.parse(
    fs.readFileSync(CONTRACT_PATH, "utf-8")
  );

  // Determine which clients to process
  const clientNames = singleClient
    ? [singleClient]
    : Object.keys(contract.clients).sort();

  for (const name of clientNames) {
    const client = contract.clients[name];
    if (!client) {
      console.error(`Unknown client: ${name}`);
      process.exit(1);
    }
  }

  if (verify) {
    // ── Verify mode ──
    let driftCount = 0;
    for (const name of clientNames) {
      const client = contract.clients[name];
      const expected = generateConfig(contract, client);
      const outputPath = path.join(ROOT, client.outputPath);

      if (!fs.existsSync(outputPath)) {
        console.log(`DRIFT [${name}]: file missing — ${client.outputPath}`);
        driftCount++;
        continue;
      }

      const actual = fs.readFileSync(outputPath, "utf-8");
      if (actual !== expected) {
        console.log(`DRIFT [${name}]: content differs — ${client.outputPath}`);
        // Show diff if possible
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-verify-"));
        const tmpFile = path.join(tmpDir, path.basename(client.outputPath));
        fs.writeFileSync(tmpFile, expected);
        try {
          const diff = execSync(
            `diff -u "${outputPath}" "${tmpFile}" || true`,
            { encoding: "utf-8" }
          );
          if (diff.trim()) {
            console.log(diff);
          }
        } catch {
          // diff not available, skip
        }
        fs.rmSync(tmpDir, { recursive: true });
        driftCount++;
      } else {
        console.log(`OK [${name}]: ${client.outputPath}`);
      }
    }

    console.log(
      `\n${driftCount} drifted, ${clientNames.length - driftCount} ok`
    );
    if (driftCount > 0) {
      console.log(
        "\nRemediation: npx tsx scripts/generate-mcp-client-configs.ts"
      );
      process.exit(1);
    }
    console.log("no drift detected");
    process.exit(0);
  }

  if (dryRun) {
    // ── Dry-run mode ──
    for (const name of clientNames) {
      const client = contract.clients[name];
      const content = generateConfig(contract, client);
      console.log(`--- ${name} (${client.outputPath}) ---`);
      console.log(content);
    }
    process.exit(0);
  }

  // ── Write mode ──
  for (const name of clientNames) {
    const client = contract.clients[name];
    const content = generateConfig(contract, client);
    const outputPath = path.join(ROOT, client.outputPath);
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, content);
    console.log(`wrote: ${client.outputPath}`);
  }
  console.log(`\nGenerated ${clientNames.length} config files.`);
}

main();
