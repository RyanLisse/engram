/**
 * engram entities — Search and manage entities
 */

import { Command } from "commander";
import ora from "ora";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const entitiesCommand = new Command("entities")
  .description("Search and manage entities");

entitiesCommand
  .command("search")
  .description("Search entities by name or type")
  .argument("<query>", "Search query")
  .option("-t, --type <type>", "Filter by entity type (person, project, tool, concept)")
  .option("-n, --limit <n>", "Max results", "10")
  .option("--json", "Output raw JSON for agent consumption")
  .action(async (query: string, opts: any) => {
    const spinner = ora("Searching entities...").start();
    try {
      const results = await client.searchEntities({
        query,
        type: opts.type,
        limit: parseInt(opts.limit, 10),
      });
      spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(results || [], null, 2));
        return;
      }

      if (!results || !Array.isArray(results) || results.length === 0) {
        console.log(fmt.warn("No entities found"));
        return;
      }

      console.log(fmt.header(`${results.length} Entities`));
      for (const entity of results) {
        console.log(fmt.entityRow(entity));
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

entitiesCommand
  .command("create")
  .description("Create or update an entity")
  .argument("<entityId>", "Unique entity ID")
  .argument("<name>", "Entity display name")
  .option("-t, --type <type>", "Entity type", "concept")
  .action(async (entityId: string, name: string, opts: any) => {
    const spinner = ora("Creating entity...").start();
    try {
      await client.upsertEntity({
        entityId,
        name,
        type: opts.type,
        createdBy: client.getAgentId(),
      });
      spinner.succeed(`Entity "${name}" created`);
      console.log(fmt.label("ID", entityId));
      console.log(fmt.label("Type", opts.type));
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });
