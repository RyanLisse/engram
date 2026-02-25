#!/usr/bin/env npx tsx

/**
 * Bootstrap Engram memory from OpenClaw session history.
 *
 * Finds session files (*.json, *.jsonl) in a directory, parses OpenClaw format,
 * extracts facts using the same heuristics as Claude Code parser, and outputs
 * JSON array compatible with Engram ingestion.
 *
 * Usage:
 *   npx tsx scripts/bootstrap-from-sessions.ts [sessions-dir] [--dry-run] [--limit N]
 *
 * Examples:
 *   npx tsx scripts/bootstrap-from-sessions.ts ~/.openclaw/sessions
 *   npx tsx scripts/bootstrap-from-sessions.ts ./sessions --dry-run --limit 5
 */

import { promises as fs } from "fs";
import * as path from "path";
import { stat, readdir } from "fs/promises";
import { deduplicateFacts, extractFacts } from "./parse-claude-code-history.js";
import type { ParsedFact } from "./parse-claude-code-history.js";

interface OpenClawMessage {
  role: string;
  content: string;
  timestamp?: number;
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
  let limit: number | null = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--limit") {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (!args[i].startsWith("--")) {
      sessionsDir = args[i];
    }
  }

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
