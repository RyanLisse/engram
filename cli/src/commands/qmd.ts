/**
 * engram qmd — QMD local-first search integration
 *
 * Provides BM25 keyword search, semantic vector search, hybrid LLM-reranked
 * queries, and fused cloud+local deep search via the QMD engine.
 */

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import * as fmt from "../lib/format.js";

// ── QMD Client Helpers ────────────────────────────────

function getQmdBaseUrl(): string {
  return process.env.QMD_URL || "http://localhost:3773";
}

async function qmdRequest<T = any>(
  endpoint: string,
  params: Record<string, any>
): Promise<T> {
  const url = new URL(endpoint, getQmdBaseUrl());
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`QMD request failed (${response.status}): ${detail || response.statusText}`);
  }

  return (await response.json()) as T;
}

async function qmdGet<T = any>(endpoint: string): Promise<T> {
  const url = new URL(endpoint, getQmdBaseUrl());
  const response = await fetch(url.toString());

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`QMD request failed (${response.status}): ${detail || response.statusText}`);
  }

  return (await response.json()) as T;
}

// ── Score Formatting ──────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 0.8) return chalk.green(score.toFixed(3));
  if (score >= 0.5) return chalk.yellow(score.toFixed(3));
  return chalk.dim(score.toFixed(3));
}

function searchModeBadge(mode?: string): string {
  if (!mode) return "";
  const badges: Record<string, string> = {
    bm25: chalk.bgBlue.white(" BM25 "),
    vector: chalk.bgMagenta.white(" VEC "),
    hybrid: chalk.bgGreen.white(" HYB "),
    deep: chalk.bgCyan.white(" DEEP "),
    cloud: chalk.bgYellow.black(" CLOUD "),
    local: chalk.bgBlue.white(" LOCAL "),
  };
  return badges[mode.toLowerCase()] || chalk.bgGray.white(` ${mode.toUpperCase()} `);
}

function sourceAttribution(source?: string): string {
  if (!source) return "";
  const labels: Record<string, string> = {
    cloud: chalk.yellow("cloud"),
    local: chalk.blue("local"),
    both: chalk.cyan("cloud+local"),
  };
  return labels[source.toLowerCase()] || chalk.dim(source);
}

// ── Result Rendering ──────────────────────────────────

interface QmdResult {
  content?: string;
  text?: string;
  score?: number;
  searchMode?: string;
  source?: string;
  factType?: string;
  tags?: string[];
  importanceScore?: number;
  id?: string;
  path?: string;
  snippet?: string;
  metadata?: Record<string, any>;
}

function printQmdResults(
  results: QmdResult[],
  opts: { showSource?: boolean } = {}
) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    console.log(fmt.warn("No results"));
    return;
  }

  console.log(fmt.header(`Found ${results.length} results`));

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const idx = chalk.gray(`${i + 1}.`);
    const score = r.score != null ? scoreColor(r.score) : "";
    const mode = searchModeBadge(r.searchMode);
    const src = opts.showSource ? sourceAttribution(r.source) : "";
    const type = r.factType ? chalk.magenta(`[${r.factType}]`) : "";
    const importance =
      r.importanceScore != null
        ? chalk.yellow(`*${r.importanceScore.toFixed(2)}`)
        : "";

    const body = r.content || r.text || r.snippet || "";
    const content =
      body.length > 120 ? body.slice(0, 120) + chalk.dim("...") : body;

    const tags =
      r.tags && r.tags.length > 0
        ? chalk.cyan(r.tags.map((t: string) => `#${t}`).join(" "))
        : "";

    const path = r.path ? chalk.dim(r.path) : "";

    const parts = [idx, score, mode, src, type, importance, content, tags, path].filter(Boolean);
    console.log(`  ${parts.join(" ")}`);
  }

  console.log();
}

// ── Command Definition ────────────────────────────────

export function qmdCommand(): Command {
  const cmd = new Command("qmd").description(
    "QMD local-first search integration"
  );

  // engram qmd search <query>
  cmd
    .command("search <query>")
    .description("BM25 full-text keyword search across local vault files")
    .option("-n, --limit <n>", "Max results", "10")
    .option("-s, --scope <scope>", "Filter by scope")
    .option("--min-score <score>", "Minimum relevance (0-1)", "0.2")
    .option("--json", "JSON output for agents")
    .action(async (query: string, opts: any) => {
      const spinner = ora("Running BM25 search...").start();
      try {
        const params: Record<string, any> = {
          query,
          limit: parseInt(opts.limit, 10),
          minScore: parseFloat(opts.minScore),
        };
        if (opts.scope) params.scope = opts.scope;

        const response = await qmdRequest<{ results: QmdResult[] }>(
          "/api/search",
          params
        );
        const results = response.results || [];

        spinner.stop();

        if (opts.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        printQmdResults(results);
      } catch (err: any) {
        spinner.fail(err.message);
        process.exit(1);
      }
    });

  // engram qmd vsearch <query>
  cmd
    .command("vsearch <query>")
    .description("Semantic vector search via on-device embeddings")
    .option("-n, --limit <n>", "Max results", "10")
    .option("-s, --scope <scope>", "Filter by scope")
    .option("--min-score <score>", "Minimum relevance (0-1)", "0.2")
    .option("--json", "JSON output for agents")
    .action(async (query: string, opts: any) => {
      const spinner = ora("Running vector search...").start();
      try {
        const params: Record<string, any> = {
          query,
          limit: parseInt(opts.limit, 10),
          minScore: parseFloat(opts.minScore),
        };
        if (opts.scope) params.scope = opts.scope;

        const response = await qmdRequest<{ results: QmdResult[] }>(
          "/api/vsearch",
          params
        );
        const results = response.results || [];

        spinner.stop();

        if (opts.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        printQmdResults(results);
      } catch (err: any) {
        spinner.fail(err.message);
        process.exit(1);
      }
    });

  // engram qmd query <query>
  cmd
    .command("query <query>")
    .description("Hybrid search with LLM reranking (most accurate)")
    .option("-n, --limit <n>", "Max results", "10")
    .option("-s, --scope <scope>", "Filter by scope")
    .option("--min-score <score>", "Minimum relevance (0-1)", "0.3")
    .option("--full", "Include full document content")
    .option("--json", "JSON output for agents")
    .action(async (query: string, opts: any) => {
      const spinner = ora("Running hybrid query with LLM reranking...").start();
      try {
        const params: Record<string, any> = {
          query,
          limit: parseInt(opts.limit, 10),
          minScore: parseFloat(opts.minScore),
          includeContent: !!opts.full,
        };
        if (opts.scope) params.scope = opts.scope;

        const response = await qmdRequest<{ results: QmdResult[] }>(
          "/api/query",
          params
        );
        const results = response.results || [];

        spinner.stop();

        if (opts.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        printQmdResults(results);
      } catch (err: any) {
        spinner.fail(err.message);
        process.exit(1);
      }
    });

  // engram qmd deep <query>
  cmd
    .command("deep <query>")
    .description("Fused cloud+local search (Engram + QMD via RRF)")
    .option("-n, --limit <n>", "Max results", "10")
    .option("-s, --scope <scope>", "Filter by scope")
    .option("--cloud-weight <w>", "Cloud search weight (0-1)", "0.5")
    .option("--local-weight <w>", "Local search weight (0-1)", "0.5")
    .option("--json", "JSON output for agents")
    .action(async (query: string, opts: any) => {
      const spinner = ora("Running fused cloud+local deep search...").start();
      try {
        const params: Record<string, any> = {
          query,
          limit: parseInt(opts.limit, 10),
          cloudWeight: parseFloat(opts.cloudWeight),
          localWeight: parseFloat(opts.localWeight),
        };
        if (opts.scope) params.scope = opts.scope;

        const response = await qmdRequest<{ results: QmdResult[] }>(
          "/api/deep-search",
          params
        );
        const results = response.results || [];

        spinner.stop();

        if (opts.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        printQmdResults(results, { showSource: true });
      } catch (err: any) {
        spinner.fail(err.message);
        process.exit(1);
      }
    });

  // engram qmd status
  cmd
    .command("status")
    .description("QMD integration health and stats")
    .option("--json", "JSON output")
    .action(async (opts: any) => {
      const spinner = ora("Checking QMD status...").start();
      try {
        const status = await qmdGet<{
          healthy?: boolean;
          version?: string;
          indexedFiles?: number;
          indexedFacts?: number;
          embeddingModel?: string;
          lastSync?: string;
          uptime?: number;
          [key: string]: any;
        }>("/api/status");

        spinner.stop();

        if (opts.json) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }

        console.log(fmt.header("QMD Status"));
        console.log(
          fmt.label(
            "  Health",
            status.healthy !== false
              ? chalk.green("healthy")
              : chalk.red("unhealthy")
          )
        );
        console.log(fmt.label("  URL", getQmdBaseUrl()));
        if (status.version) {
          console.log(fmt.label("  Version", status.version));
        }
        if (status.embeddingModel) {
          console.log(fmt.label("  Embedding Model", status.embeddingModel));
        }
        if (status.indexedFiles != null) {
          console.log(fmt.label("  Indexed Files", status.indexedFiles));
        }
        if (status.indexedFacts != null) {
          console.log(fmt.label("  Indexed Facts", status.indexedFacts));
        }
        if (status.lastSync) {
          console.log(
            fmt.label("  Last Sync", new Date(status.lastSync).toLocaleString())
          );
        }
        if (status.uptime != null) {
          const hrs = Math.floor(status.uptime / 3600);
          const mins = Math.floor((status.uptime % 3600) / 60);
          console.log(fmt.label("  Uptime", `${hrs}h ${mins}m`));
        }
        console.log();

        console.log(
          fmt.dim(
            "Tip: Use 'engram qmd query <text>' for hybrid local search with LLM reranking"
          )
        );
        console.log();
      } catch (err: any) {
        spinner.fail(
          `Cannot reach QMD at ${getQmdBaseUrl()}: ${err.message}`
        );
        console.log(
          fmt.dim(
            "Set QMD_URL environment variable if QMD runs on a different address"
          )
        );
        process.exit(1);
      }
    });

  return cmd;
}
