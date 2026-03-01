/**
 * engram search primitives — atomic retrieval + feedback commands
 */

import { Command } from "commander";
import ora from "ora";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

function printFactResults(results: any[]) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    console.log(fmt.warn("No results"));
    return;
  }
  console.log(fmt.header(`Found ${results.length} facts`));
  for (let i = 0; i < results.length; i++) {
    console.log(fmt.factRow(results[i], i));
  }
  console.log();
}

export async function runTextSearchPrimitive(args: {
  text: string;
  limit: number;
  type?: string;
  tags?: string;
}) {
  const results = await client.searchFacts({
    query: args.text,
    limit: args.limit,
    factType: args.type,
  });

  let filtered = results;
  if (args.tags) {
    const tagFilter = args.tags.split(",").map((t: string) => t.trim());
    filtered = filtered.filter((f: any) => tagFilter.some((t: string) => f.tags?.includes(t)));
  }

  return filtered;
}

export async function runVectorSearchPrimitive(args: {
  query: string;
  scope?: string;
  limit: number;
  type?: string;
}) {
  const agentId = client.getAgentId();
  let scopeIds: string[];

  if (args.scope) {
    const scope = await client.getScopeByName(args.scope);
    if (!scope) {
      throw new Error(`Scope "${args.scope}" not found`);
    }
    scopeIds = [scope._id];
  } else {
    const permitted = await client.getPermittedScopes(agentId);
    scopeIds = Array.isArray(permitted) ? permitted.map((s: any) => s._id) : [];
  }

  const results = await client.vectorSearchByText({
    query: args.query,
    scopeIds,
    factType: args.type,
    limit: args.limit,
  });
  return Array.isArray(results) ? results.map((row: any) => row._value ?? row) : [];
}

export const textSearchCommand = new Command("text-search")
  .description("Primitive: full-text search")
  .argument("<text>", "Search text")
  .option("-n, --limit <n>", "Max results", "20")
  .option("-t, --type <type>", "Filter by fact type")
  .option("--tags <tags>", "Comma-separated tags to filter")
  .option("--json", "Output raw JSON for agent consumption")
  .action(async (text: string, opts) => {
    const spinner = ora("Running text search...").start();
    try {
      const results = await runTextSearchPrimitive({
        text,
        limit: parseInt(opts.limit, 10),
        type: opts.type,
        tags: opts.tags,
      });
      spinner.stop();
      if (opts.json) {
        console.log(JSON.stringify(results || [], null, 2));
        return;
      }
      printFactResults(results);
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

export const vectorSearchCommand = new Command("vector-search")
  .description("Primitive: semantic vector search")
  .argument("<query>", "Semantic query")
  .option("-n, --limit <n>", "Max results", "20")
  .option("-s, --scope <scope>", "Scope name to search in")
  .option("-t, --type <type>", "Filter by fact type")
  .option("--json", "Output raw JSON for agent consumption")
  .action(async (query: string, opts) => {
    const spinner = ora("Running vector search...").start();
    try {
      const results = await runVectorSearchPrimitive({
        query,
        scope: opts.scope,
        limit: parseInt(opts.limit, 10),
        type: opts.type,
      });
      spinner.stop();
      if (opts.json) {
        console.log(JSON.stringify(results || [], null, 2));
        return;
      }
      printFactResults(results);
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

export const bumpAccessCommand = new Command("bump-access")
  .description("Primitive: bump access count for a fact")
  .argument("<factId>", "Fact ID")
  .action(async (factId: string) => {
    try {
      await client.bumpAccess(factId);
      console.log(fmt.success("Access bumped"));
    } catch (err: any) {
      console.log(fmt.error(err.message));
      process.exit(1);
    }
  });

export const recordRecallCommand = new Command("record-recall")
  .description("Primitive: record recall result fact IDs")
  .argument("<recallId>", "Recall ID")
  .argument("<factIds...>", "Fact IDs returned for the recall")
  .action(async (recallId: string, factIds: string[]) => {
    try {
      const result = await client.recordRecallResult({ recallId, factIds });
      console.log(fmt.success(`Recorded recall: ${result.recorded ?? factIds.length} facts`));
    } catch (err: any) {
      console.log(fmt.error(err.message));
      process.exit(1);
    }
  });

export const recordSignalCommand = new Command("record-signal")
  .description("Primitive: record quality signal feedback")
  .argument("<factId>", "Fact ID to signal")
  .argument("<type>", "Signal type: useful | outdated | wrong | duplicate | important")
  .option("-v, --value <n>", "Signal value (-1 to 1)", "1")
  .option("-c, --comment <text>", "Optional comment")
  .action(async (factId: string, type: string, opts: any) => {
    try {
      const agentId = client.getAgentId();
      await client.recordSignal({
        factId,
        agentId,
        signalType: type,
        value: parseFloat(opts.value),
        comment: opts.comment,
      });
      console.log(fmt.success(`Signal \"${type}\" recorded on ${factId.slice(-8)}`));
    } catch (err: any) {
      console.log(fmt.error(err.message));
      process.exit(1);
    }
  });

export const searchCommand = new Command("search")
  .description("Backwards-compatible alias for text-search")
  .argument("[text]", "Search text")
  .option("-n, --limit <n>", "Max results", "20")
  .option("-t, --type <type>", "Filter by fact type")
  .option("--tags <tags>", "Comma-separated tags to filter")
  .option("--json", "Output raw JSON for agent consumption")
  .action(async (text: string | undefined, opts: any) => {
    if (!text) {
      console.log(fmt.warn("Usage: engram text-search <text> (or engram search <text>)"));
      return;
    }
    const spinner = ora("Running text search...").start();
    try {
      const results = await runTextSearchPrimitive({
        text,
        limit: parseInt(opts.limit, 10),
        type: opts.type,
        tags: opts.tags,
      });
      spinner.stop();
      if (opts.json) {
        console.log(JSON.stringify(results || [], null, 2));
        return;
      }
      printFactResults(results);
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });
