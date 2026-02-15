/**
 * engram search — Full-text + structured filters
 */

import { Command } from "commander";
import ora from "ora";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const searchCommand = new Command("search")
  .description("Full-text search with structured filters")
  .argument("[text]", "Search text")
  .option("-n, --limit <n>", "Max results", "20")
  .option("-s, --scope <scope>", "Scope name")
  .option("-t, --type <type>", "Filter by fact type")
  .option("--tags <tags>", "Comma-separated tags to filter")
  .action(async (text: string | undefined, opts) => {
    const spinner = ora("Searching...").start();
    try {
      const results = await client.searchFacts({
        query: text || "",
        limit: parseInt(opts.limit, 10),
        factType: opts.type,
      });

      spinner.stop();

      if (!results || !Array.isArray(results) || results.length === 0) {
        console.log(fmt.warn("No results"));
        return;
      }

      // Client-side tag filter
      let filtered = results;
      if (opts.tags) {
        const tagFilter = opts.tags.split(",").map((t: string) => t.trim());
        filtered = filtered.filter((f: any) =>
          tagFilter.some((t: string) => f.tags?.includes(t))
        );
      }

      console.log(fmt.header(`Found ${filtered.length} facts`));
      for (let i = 0; i < filtered.length; i++) {
        console.log(fmt.factRow(filtered[i], i));
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });
