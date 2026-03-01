#!/usr/bin/env npx tsx

/**
 * Bootstrap Engram memory from OpenClaw session history.
 *
 * Finds session files (*.json, *.jsonl) in a directory, parses OpenClaw format,
 * extracts facts using the same heuristics as Claude Code parser, and either
 * outputs JSON or ingests facts directly into Engram.
 *
 * Usage:
 *   npx tsx scripts/bootstrap-from-sessions.ts [sessions-dir] [--dry-run] [--limit N]
 *   npx tsx scripts/bootstrap-from-sessions.ts [sessions-dir] --ingest --scope <scopeId> --agent-id <agentId>
 *
 * Examples:
 *   npx tsx scripts/bootstrap-from-sessions.ts ~/.openclaw/sessions
 *   npx tsx scripts/bootstrap-from-sessions.ts ./sessions --dry-run --limit 5
 *   npx tsx scripts/bootstrap-from-sessions.ts ~/.openclaw/sessions --ingest --scope jscope123 --agent-id codex
 */

import { promises as fs } from "fs";
import * as path from "path";
import { stat, readdir } from "fs/promises";
import { createHash } from "crypto";
import { deduplicateFacts, extractFacts } from "./parse-claude-code-history.js";
import type { ParsedFact } from "./parse-claude-code-history.js";
import { storeFact as storeFactInEngram } from "../mcp-server/src/lib/convex-client/facts.js";
import { generateFactSummary } from "../mcp-server/src/lib/fact-summary.js";

interface OpenClawMessage {
  role: string;
  content: string;
  timestamp?: number;
}

type BootstrapMode = "dry-run" | "json" | "ingest";

interface BootstrapStoreInput {
  content: string;
  source: string;
  createdBy: string;
  scopeId: string;
  factType: string;
  entityIds: string[];
  tags: string[];
  summary?: string;
}

interface IngestFactsOptions {
  agentId: string;
  scopeId: string;
  importMode: "dry-run" | "ingest";
  importedAt?: number;
  existingDedupKeys?: Set<string>;
  storeFact?: (input: BootstrapStoreInput) => Promise<unknown>;
}

export function buildContentDedupKey(content: string): string {
  return `sha1:${createHash("sha1").update(content.trim()).digest("hex")}`;
}

export function buildBootstrapTags(args: {
  source: string;
  importMode: "dry-run" | "ingest";
  existingTags?: string[];
}): string[] {
  const sourceBase = path.basename(args.source).replace(/\.[^.]+$/, "");
  return Array.from(new Set([
    ...(args.existingTags ?? []),
    "bootstrap",
    "session-import",
    `import:${args.importMode}`,
    `session:${sourceBase}`,
  ]));
}

export function mapParsedFactToStoreInput(
  fact: ParsedFact,
  options: {
    agentId: string;
    scopeId: string;
    importMode: "dry-run" | "ingest";
    importedAt?: number;
  }
): BootstrapStoreInput {
  const entityIds = fact.entityHints
    .map((hint) => hint.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .map((slug) => `entity-${slug}`);

  return {
    content: fact.content,
    source: fact.source,
    createdBy: options.agentId,
    scopeId: options.scopeId,
    factType: fact.factType,
    entityIds,
    tags: buildBootstrapTags({
      source: fact.source,
      importMode: options.importMode,
      existingTags: [
        `fact-type:${fact.factType}`,
        `imported-at:${options.importedAt ?? Date.now()}`,
      ],
    }),
    summary: generateFactSummary(fact.content, fact.factType),
  };
}

export async function ingestFacts(
  facts: ParsedFact[],
  options: IngestFactsOptions
): Promise<{ attempted: number; imported: number; skippedDuplicates: number; failed: number }> {
  const dedupKeys = options.existingDedupKeys ?? new Set<string>();
  const storeFact = options.storeFact ?? storeFactInEngram;
  let imported = 0;
  let skippedDuplicates = 0;
  let failed = 0;

  for (const fact of facts) {
    const dedupKey = buildContentDedupKey(fact.content);
    if (dedupKeys.has(dedupKey)) {
      skippedDuplicates++;
      continue;
    }

    try {
      await storeFact(mapParsedFactToStoreInput(fact, options));
      dedupKeys.add(dedupKey);
      imported++;
    } catch (error) {
      failed++;
      console.error(`[bootstrap] Failed to ingest fact from ${fact.source}:`, error);
    }
  }

  return {
    attempted: facts.length,
    imported,
    skippedDuplicates,
    failed,
  };
}

/**
 * Find all session files (*.json, *.jsonl) in a directory recursively.
 * Returns paths sorted by modification time (newest first).
 */
export async function findSessionFiles(dir: string): Promise<string[]> {
  const files: Array<{ path: string; mtime: number }> = [];

  async function walk(current: string): Promise<void> {
    try {
      const entries = await readdir(current, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          if (entry.name.endsWith(".json") || entry.name.endsWith(".jsonl")) {
            try {
              const stats = await stat(fullPath);
              files.push({ path: fullPath, mtime: stats.mtimeMs });
            } catch (e) {
              // Skip files we can't stat
            }
          }
        }
      }
    } catch (e) {
      // Directory doesn't exist or can't be read
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Error reading directory ${current}:`, e);
      }
    }
  }

  await walk(dir);

  // Sort by modification time (newest first)
  files.sort((a, b) => b.mtime - a.mtime);
  return files.map((f) => f.path);
}

/**
 * Parse an OpenClaw session file (JSONL or JSON array format).
 * Returns array of normalized messages with role, content, and timestamp.
 */
export async function parseOpenClawSession(
  filePath: string
): Promise<Array<{ role: string; content: string; timestamp: number }>> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());

  if (lines.length === 0) {
    return [];
  }

  // Detect format: if first line starts with [, assume JSON array
  const isJsonArray = lines[0].trim().startsWith("[");

  if (isJsonArray) {
    // Parse as single JSON array
    const fullContent = lines.join("\n");
    const data = JSON.parse(fullContent);

    if (!Array.isArray(data)) {
      throw new Error("Expected JSON array at root");
    }

    return data.map((item: OpenClawMessage) => ({
      role: item.role || "",
      content: item.content || "",
      timestamp: item.timestamp || Date.now(),
    }));
  } else {
    // Parse as JSONL (one JSON object per line)
    const messages: Array<{ role: string; content: string; timestamp: number }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const item = JSON.parse(trimmed) as OpenClawMessage;
      messages.push({
        role: item.role || "",
        content: item.content || "",
        timestamp: item.timestamp || Date.now(),
      });
    }

    return messages;
  }
}

/**
 * Extract facts from session messages using the same heuristics as Claude Code parser.
 * Only extracts from user messages (following the original pattern).
 * Applies deduplication to remove similar facts.
 */
export function extractFactsFromSession(
  messages: Array<{ role: string; content: string; timestamp: number }>,
  source: string
): ParsedFact[] {
  // Filter to user messages only (matching parse-claude-code-history behavior)
  const userMessages = messages.filter((m) => m.role === "user");

  if (userMessages.length === 0) {
    return [];
  }

  // Extract facts using the shared heuristics from parse-claude-code-history
  let facts = extractFacts(userMessages);

  // Set the source to the session file path
  facts = facts.map((f) => ({
    ...f,
    source,
  }));

  // Deduplicate within the session
  facts = deduplicateFacts(facts);

  return facts;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let sessionsDir = "./sessions";
  let dryRun = false;
  let ingest = false;
  let limit: number | null = null;
  let scopeId: string | null = null;
  let agentId: string | null = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--ingest") {
      ingest = true;
    } else if (args[i] === "--limit") {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--scope") {
      scopeId = args[i + 1] ?? null;
      i++;
    } else if (args[i] === "--agent-id") {
      agentId = args[i + 1] ?? null;
      i++;
    } else if (!args[i].startsWith("--")) {
      sessionsDir = args[i];
    }
  }

  const mode: BootstrapMode = dryRun ? "dry-run" : ingest ? "ingest" : "json";

  // Validate directory
  try {
    const stats = await stat(sessionsDir);
    if (!stats.isDirectory()) {
      console.error(`Error: ${sessionsDir} is not a directory`);
      process.exit(1);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`Error: Directory ${sessionsDir} does not exist`);
    } else {
      console.error(`Error accessing ${sessionsDir}:`, err);
    }
    process.exit(1);
  }

  // Find session files
  const sessionFiles = await findSessionFiles(sessionsDir);

  if (sessionFiles.length === 0) {
    console.error(`No session files found in ${sessionsDir}`);
    process.exit(1);
  }

  // Limit files if requested
  const filesToProcess = limit ? sessionFiles.slice(0, limit) : sessionFiles;

  if (dryRun) {
    console.log(`\n📄 OpenClaw Session Bootstrap Summary`);
    console.log(`${"=".repeat(60)}`);
    console.log(`Directory: ${sessionsDir}`);
    console.log(`Total sessions found: ${sessionFiles.length}`);
    console.log(`Sessions to process: ${filesToProcess.length}`);
    console.log(`${"=".repeat(60)}\n`);
  }

  let totalFacts = 0;
  const allFacts: ParsedFact[] = [];

  // Process each session file
  for (const filePath of filesToProcess) {
    try {
      const messages = await parseOpenClawSession(filePath);
      const facts = extractFactsFromSession(messages, filePath);

      if (dryRun) {
        const relPath = path.relative(sessionsDir, filePath);
        console.log(
          `✓ ${relPath}: ${messages.length} messages → ${facts.length} facts`
        );
      }

      allFacts.push(...facts);
      totalFacts += facts.length;
    } catch (err) {
      const relPath = path.relative(sessionsDir, filePath);
      console.error(`✗ Failed to parse ${relPath}:`, err);
    }
  }

  if (dryRun) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Total facts extracted: ${totalFacts}`);
    console.log(`After deduplication: ${allFacts.length}`);
    console.log(`${"=".repeat(60)}\n`);

    // Show sample facts
    if (allFacts.length > 0) {
      console.log("Sample extracted facts:\n");
      for (const fact of allFacts.slice(0, 5)) {
        const timestamp = new Date(fact.timestamp).toISOString();
        console.log(`📌 [${fact.factType.toUpperCase()}] (${fact.importance.toFixed(1)})`);
        console.log(`   ${fact.content.slice(0, 70)}${fact.content.length > 70 ? "..." : ""}`);
        if (fact.entityHints.length > 0) {
          console.log(`   Entities: ${fact.entityHints.join(", ")}`);
        }
        console.log(`   Timestamp: ${timestamp}\n`);
      }
    }
  } else if (mode === "ingest") {
    if (!scopeId || !agentId) {
      console.error("Error: --ingest requires --scope <scopeId> and --agent-id <agentId>");
      process.exit(1);
    }

    const result = await ingestFacts(allFacts, {
      agentId,
      scopeId,
      importMode: "ingest",
      importedAt: Date.now(),
    });
    console.log(JSON.stringify(result, null, 2));
  } else {
    // JSON output (Engram-compatible)
    console.log(JSON.stringify(allFacts, null, 2));
  }
}

// Only run main() if this is the direct entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
