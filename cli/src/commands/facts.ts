/**
 * engram facts — Atomic fact lifecycle primitives
 *
 * Agent-native: each subcommand is a single primitive operation.
 * Agents compose these to build custom workflows.
 */

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const factsCommand = new Command("facts")
  .description("Atomic fact lifecycle primitives");

factsCommand
  .command("get")
  .description("Get a single fact by ID")
  .argument("<factId>", "Fact ID")
  .option("--json", "Output as JSON")
  .action(async (factId: string, opts: any) => {
    const spinner = ora("Loading...").start();
    try {
      const fact = await client.getFact(factId);
      spinner.stop();

      if (!fact) {
        console.log(fmt.warn("Fact not found"));
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(fact, null, 2));
        return;
      }

      console.log(fmt.header("Fact"));
      console.log(fmt.label("ID", fact._id));
      console.log(fmt.label("Content", fact.content));
      console.log(fmt.label("Type", fact.factType));
      console.log(fmt.label("Importance", fact.importanceScore?.toFixed(3)));
      console.log(fmt.label("Tags", fact.tags?.join(", ")));
      console.log(fmt.label("Created By", fact.createdBy));
      console.log(fmt.label("Scope", fact.scopeId));
      console.log(fmt.label("Access Count", fact.accessedCount || 0));
      console.log(fmt.label("Observation Tier", fact.observationTier));
      console.log(fmt.label("Created", new Date(fact._creationTime).toLocaleString()));
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

factsCommand
  .command("update")
  .description("Update a fact's content, tags, or type")
  .argument("<factId>", "Fact ID")
  .option("-c, --content <content>", "New content")
  .option("-t, --type <type>", "New fact type")
  .option("--tags <tags>", "New comma-separated tags")
  .action(async (factId: string, opts: any) => {
    const spinner = ora("Updating...").start();
    try {
      const args: any = { factId };
      if (opts.content) args.content = opts.content;
      if (opts.type) args.factType = opts.type;
      if (opts.tags) args.tags = opts.tags.split(",").map((t: string) => t.trim());

      await client.updateFact(args);
      spinner.succeed("Fact updated");
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

factsCommand
  .command("archive")
  .description("Archive a fact (soft delete)")
  .argument("<factId>", "Fact ID")
  .action(async (factId: string) => {
    const spinner = ora("Archiving...").start();
    try {
      await client.archiveFact(factId);
      spinner.succeed("Fact archived");
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

factsCommand
  .command("bump")
  .description("Bump access count — signals fact usefulness to ALMA")
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

factsCommand
  .command("boost")
  .description("Boost relevance score for a fact")
  .argument("<factId>", "Fact ID")
  .option("-v, --value <n>", "Boost value (default 0.1)", "0.1")
  .action(async (factId: string, opts: any) => {
    try {
      await client.boostRelevance({ factId, boost: parseFloat(opts.value) });
      console.log(fmt.success(`Boosted by ${opts.value}`));
    } catch (err: any) {
      console.log(fmt.error(err.message));
      process.exit(1);
    }
  });

factsCommand
  .command("stale")
  .description("List stale facts candidates for pruning")
  .option("-s, --scope <scope>", "Scope name")
  .option("-d, --days <n>", "Older than N days", "30")
  .option("-n, --limit <n>", "Max results", "20")
  .action(async (opts: any) => {
    const spinner = ora("Finding stale facts...").start();
    try {
      const args: any = {
        olderThanDays: parseInt(opts.days, 10),
        limit: parseInt(opts.limit, 10),
      };

      if (opts.scope) {
        const scope = await client.getScopeByName(opts.scope);
        if (!scope) {
          spinner.fail(`Scope "${opts.scope}" not found`);
          process.exit(1);
        }
        args.scopeId = scope._id;
      }

      const facts = await client.listStaleFacts(args);
      spinner.stop();

      if (!facts || !Array.isArray(facts) || facts.length === 0) {
        console.log(fmt.warn("No stale facts found"));
        return;
      }

      console.log(fmt.header(`${facts.length} Stale Facts`));
      for (let i = 0; i < facts.length; i++) {
        console.log(fmt.factRow(facts[i], i));
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

factsCommand
  .command("prune")
  .description("Mark facts as pruned (batch archive)")
  .argument("<factIds...>", "Fact IDs to prune")
  .action(async (factIds: string[]) => {
    const spinner = ora(`Pruning ${factIds.length} facts...`).start();
    try {
      await client.markPruned(factIds);
      spinner.succeed(`${factIds.length} facts pruned`);
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

factsCommand
  .command("merge")
  .description("Mark source facts as merged into a target fact")
  .argument("<targetFactId>", "Target fact ID")
  .argument("<sourceFactIds...>", "Source fact IDs to merge")
  .action(async (targetFactId: string, sourceFactIds: string[]) => {
    const spinner = ora("Merging...").start();
    try {
      await client.markFactsMerged({ sourceFactIds, targetFactId });
      spinner.succeed(`${sourceFactIds.length} facts merged into ${targetFactId.slice(-8)}`);
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

factsCommand
  .command("signals")
  .description("View signals on a fact")
  .argument("<factId>", "Fact ID")
  .action(async (factId: string) => {
    const spinner = ora("Loading signals...").start();
    try {
      const signals = await client.getSignalsByFact(factId);
      spinner.stop();

      if (!signals || !Array.isArray(signals) || signals.length === 0) {
        console.log(fmt.warn("No signals on this fact"));
        return;
      }

      console.log(fmt.header(`Signals on ${factId.slice(-8)}`));
      for (const sig of signals) {
        const type = chalk.magenta(`[${sig.signalType}]`);
        const value = sig.value > 0 ? chalk.green(`+${sig.value}`) : chalk.red(`${sig.value}`);
        const agent = chalk.gray(`by ${sig.agentId}`);
        const comment = sig.comment ? chalk.dim(sig.comment) : "";
        console.log(`  • ${type} ${value} ${agent} ${comment}`);
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });
