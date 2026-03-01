/**
 * engram recall — Semantic search for facts
 */

import { Command } from "commander";
import ora from "ora";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";
import { runTextSearchPrimitive, runVectorSearchPrimitive } from "./search.js";

export const recallCommand = new Command("recall")
  .description("Deprecated composition helper: use vector-search + text-search primitives")
  .argument("<query>", "Search query")
  .option("-n, --limit <n>", "Max results", "10")
  .option("-s, --scope <scope>", "Scope name to search in")
  .option("-t, --type <type>", "Filter by fact type")
  .option("--no-fallback", "Disable text-search fallback when vector results are empty")
  .option("--json", "Output raw JSON for agent consumption")
  .action(async (query: string, opts) => {
    const spinner = ora("Composing recall from primitives...").start();
    try {
      const limit = parseInt(opts.limit, 10);

      let results = await runVectorSearchPrimitive({
        query,
        limit,
        scope: opts.scope,
        type: opts.type,
      });

      if ((!results || results.length === 0) && opts.fallback !== false) {
        results = await runTextSearchPrimitive({
          text: query,
          limit,
          type: opts.type,
        });
      }

      spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(results || [], null, 2));
        return;
      }

      console.log(fmt.warn("recall is deprecated; use vector-search and text-search primitives directly."));

      if (!results || !Array.isArray(results) || results.length === 0) {
        console.log(fmt.warn("No facts found"));
        return;
      }

      console.log(fmt.header(`Found ${results.length} facts`));
      for (let i = 0; i < results.length; i++) {
        console.log(fmt.factRow(results[i], i));
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });
