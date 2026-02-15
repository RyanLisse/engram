/**
 * engram recall — Semantic search for facts
 */

import { Command } from "commander";
import ora from "ora";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const recallCommand = new Command("recall")
  .description("Semantic search for facts (primary retrieval)")
  .argument("<query>", "Search query")
  .option("-n, --limit <n>", "Max results", "10")
  .option("-s, --scope <scope>", "Scope name to search in")
  .option("-t, --type <type>", "Filter by fact type")
  .action(async (query: string, opts) => {
    const spinner = ora("Searching memory...").start();
    try {
      const agentId = client.getAgentId();
      const limit = parseInt(opts.limit, 10);

      // Resolve scopes
      let scopeIds: string[];
      if (opts.scope) {
        const scope = await client.getScopeByName(opts.scope);
        if (!scope) {
          spinner.fail(`Scope "${opts.scope}" not found`);
          process.exit(1);
        }
        scopeIds = [scope._id];
      } else {
        const permitted = await client.getPermittedScopes(agentId);
        scopeIds = Array.isArray(permitted) ? permitted.map((s: any) => s._id) : [];
      }

      const results = await client.searchFactsMulti({
        query,
        scopeIds,
        factType: opts.type,
        limit,
      });

      spinner.stop();

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
