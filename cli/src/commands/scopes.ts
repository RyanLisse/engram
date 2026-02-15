/**
 * engram scopes — Manage memory scopes
 */

import { Command } from "commander";
import ora from "ora";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const scopesCommand = new Command("scopes")
  .description("Manage memory scopes");

scopesCommand
  .command("list")
  .description("List scopes accessible to current agent")
  .action(async () => {
    const spinner = ora("Loading scopes...").start();
    try {
      const agentId = client.getAgentId();
      const scopes = await client.getPermittedScopes(agentId);
      spinner.stop();

      if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
        console.log(fmt.warn("No scopes found"));
        return;
      }

      console.log(fmt.header(`${scopes.length} Scopes`));
      for (const scope of scopes) {
        console.log(fmt.scopeRow(scope));
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

scopesCommand
  .command("create")
  .description("Create a new scope")
  .argument("<name>", "Scope name")
  .option("-d, --description <desc>", "Scope description", "")
  .option("-m, --members <members>", "Comma-separated agent IDs")
  .option("--read-policy <policy>", "Read policy (members|all)", "members")
  .option("--write-policy <policy>", "Write policy (members|creator|all)", "members")
  .action(async (name: string, opts: any) => {
    const spinner = ora("Creating scope...").start();
    try {
      const agentId = client.getAgentId();
      const members = opts.members
        ? opts.members.split(",").map((m: string) => m.trim())
        : [agentId];

      await client.createScope({
        name,
        description: opts.description || `Scope: ${name}`,
        members,
        readPolicy: opts.readPolicy,
        writePolicy: opts.writePolicy,
      });

      spinner.succeed(`Scope "${name}" created`);
      console.log(fmt.label("Members", members.join(", ")));
      console.log(fmt.label("Read Policy", opts.readPolicy));
      console.log(fmt.label("Write Policy", opts.writePolicy));
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

scopesCommand
  .command("facts")
  .description("List facts in a scope")
  .argument("<scope>", "Scope name")
  .option("-n, --limit <n>", "Max results", "20")
  .action(async (scopeName: string, opts: any) => {
    const spinner = ora("Loading facts...").start();
    try {
      const scope = await client.getScopeByName(scopeName);
      if (!scope) {
        spinner.fail(`Scope "${scopeName}" not found`);
        process.exit(1);
      }

      const facts = await client.listFactsByScope({
        scopeId: scope._id,
        limit: parseInt(opts.limit, 10),
      });
      spinner.stop();

      if (!facts || !Array.isArray(facts) || facts.length === 0) {
        console.log(fmt.warn("No facts in this scope"));
        return;
      }

      console.log(fmt.header(`Facts in "${scopeName}" (${facts.length})`));
      for (let i = 0; i < facts.length; i++) {
        console.log(fmt.factRow(facts[i], i));
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });
