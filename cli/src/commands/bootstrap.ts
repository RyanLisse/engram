/**
 * engram bootstrap — Ingest session history into Engram memory.
 *
 * Parses Claude Code or OpenClaw session files, extracts facts via heuristics,
 * deduplicates across files, and outputs Engram-compatible JSON.
 */

import { Command } from "commander";
import { homedir } from "os";
import { resolve } from "path";
import { existsSync } from "fs";

export interface BootstrapOptions {
  source: "claude-code" | "openclaw";
  path?: string;
  concurrency: number;
  dryRun: boolean;
  limit?: number;
}

const DEFAULT_PATHS: Record<string, string> = {
  "claude-code": resolve(homedir(), ".claude", "projects"),
  openclaw: resolve(homedir(), ".openclaw", "sessions"),
};

export function resolveBootstrapPath(source: string, overridePath?: string): string {
  if (overridePath) return resolve(overridePath);
  return DEFAULT_PATHS[source] ?? "";
}

export const bootstrapCommand = new Command("bootstrap")
  .description("Ingest session history into Engram memory")
  .requiredOption("-s, --source <source>", "Source type: claude-code | openclaw")
  .option("-p, --path <path>", "Override default session path")
  .option("-c, --concurrency <n>", "Parallel file processing limit", "4")
  .option("-l, --limit <n>", "Max sessions to process")
  .option("--dry-run", "Preview without storing facts", false)
  .action(async (opts) => {
    const options: BootstrapOptions = {
      source: opts.source as BootstrapOptions["source"],
      path: opts.path,
      concurrency: parseInt(opts.concurrency, 10) || 4,
      dryRun: opts.dryRun ?? false,
      limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
    };

    if (!["claude-code", "openclaw"].includes(options.source)) {
      console.error(`Unknown source: ${options.source}. Use "claude-code" or "openclaw".`);
      process.exit(1);
    }

    const sessionPath = resolveBootstrapPath(options.source, options.path);

    if (!existsSync(sessionPath)) {
      console.log(`Session directory not found: ${sessionPath}`);
      console.log(`Create it or use --path to specify a custom location.`);
      process.exit(0);
    }

    try {
      // Dynamic imports to avoid loading heavy modules when not needed
      const { findSessionFiles } = await import("../../../scripts/bootstrap-from-sessions.js");
      const { processFilesBatch, crossFileDedup, summarizeResults } = await import(
        "../../../scripts/bootstrap-parallel.js"
      );

      let files: string[];
      if (options.source === "claude-code") {
        // For Claude Code, find JSONL files recursively
        const { globSync } = await import("glob");
        const pattern = resolve(sessionPath, "**", "*.jsonl");
        files = globSync(pattern).sort();
      } else {
        files = findSessionFiles(sessionPath);
      }

      if (options.limit) {
        files = files.slice(0, options.limit);
      }

      if (files.length === 0) {
        console.log(`No session files found in: ${sessionPath}`);
        process.exit(0);
      }

      console.error(`Found ${files.length} session file(s). Processing...`);

      const rawFacts = await processFilesBatch(files, options.concurrency);
      const deduped = crossFileDedup(rawFacts);
      const stats = summarizeResults(deduped);

      if (options.dryRun) {
        console.log("\n--- Bootstrap Dry Run ---");
        console.log(`Files processed:    ${stats.totalFiles || files.length}`);
        console.log(`Facts extracted:    ${stats.totalFactsExtracted || rawFacts.length}`);
        console.log(`After dedup:        ${stats.factsAfterDedup || deduped.length}`);
        console.log(`Processing time:    ${stats.processingTimeMs || 0}ms`);
        console.log("\nBy type:");
        const byType = stats.byType || {};
        for (const [type, count] of Object.entries(byType)) {
          console.log(`  ${type}: ${count}`);
        }
      } else {
        // Output JSON to stdout for piping to engram store or other tools
        console.log(JSON.stringify(deduped, null, 2));
      }
    } catch (err: any) {
      console.error(`Bootstrap failed: ${err.message}`);
      process.exit(1);
    }
  });
