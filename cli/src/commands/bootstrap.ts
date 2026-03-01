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
import { spawn } from "child_process";

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

async function runBootstrapScript(scriptPath: string, scriptArgs: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn("npx", ["tsx", scriptPath, ...scriptArgs], {
      cwd: resolve(process.cwd()),
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`Bootstrap script exited with code ${code ?? "unknown"}`));
      }
    });
    child.on("error", rejectPromise);
  });
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
      if (options.source === "claude-code") {
        const pattern = resolve(sessionPath, "**", "*.jsonl");
        const args = [pattern, "--concurrency", String(options.concurrency)];
        if (options.limit) args.push("--limit", String(options.limit));
        if (options.dryRun) args.push("--dry-run");
        await runBootstrapScript(resolve(process.cwd(), "scripts", "bootstrap-parallel.ts"), args);
      } else {
        const args = [sessionPath];
        if (options.limit) args.push("--limit", String(options.limit));
        if (options.dryRun) args.push("--dry-run");
        await runBootstrapScript(resolve(process.cwd(), "scripts", "bootstrap-from-sessions.ts"), args);
      }
    } catch (err: any) {
      console.error(`Bootstrap failed: ${err.message}`);
      process.exit(1);
    }
  });
