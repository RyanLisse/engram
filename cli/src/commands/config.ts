/**
 * engram config — Prompt-native configuration management
 *
 * All weights, rates, and thresholds are tunable without code changes.
 * Supports system-wide config + scope-specific policy overrides.
 */

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const configCommand = new Command("config")
  .description("Manage system config and scope policies (prompt-native)");

configCommand
  .command("get")
  .description("Get a config value by key")
  .argument("<key>", "Config key (e.g. decay_rate_decision)")
  .option("--json", "Output as JSON")
  .action(async (key: string, opts: any) => {
    try {
      const value = await client.getConfig(key);
      if (opts.json) {
        console.log(JSON.stringify({ key, value }, null, 2));
      } else if (value === null || value === undefined) {
        console.log(fmt.warn(`Config "${key}" not found`));
      } else {
        console.log(fmt.label(key, typeof value === "object" ? JSON.stringify(value) : value));
      }
    } catch (err: any) {
      console.log(fmt.error(err.message));
      process.exit(1);
    }
  });

configCommand
  .command("list")
  .description("List all configs, optionally by category")
  .option("-c, --category <cat>", "Filter by category (decay_rates, importance_weights, thresholds)")
  .option("--json", "Output as JSON")
  .action(async (opts: any) => {
    const spinner = ora("Loading configs...").start();
    try {
      const configs = await client.listConfigs(opts.category);
      spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(configs, null, 2));
        return;
      }

      if (!configs || !Array.isArray(configs) || configs.length === 0) {
        console.log(fmt.warn("No configs found"));
        return;
      }

      console.log(fmt.header(`${configs.length} Configs`));
      let lastCat = "";
      for (const c of configs) {
        if (c.category !== lastCat) {
          console.log(chalk.bold.white(`\n  [${c.category}]`));
          lastCat = c.category;
        }
        const val = typeof c.value === "object" ? JSON.stringify(c.value) : c.value;
        console.log(`  ${chalk.cyan(c.key)} = ${chalk.yellow(val)}  ${chalk.dim(c.description || "")}`);
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

configCommand
  .command("set")
  .description("Set a system config value")
  .argument("<key>", "Config key")
  .argument("<value>", "Config value (string, number, or boolean)")
  .option("-c, --category <cat>", "Category", "general")
  .option("-d, --description <desc>", "Description")
  .action(async (key: string, value: string, opts: any) => {
    try {
      const agentId = client.getAgentId();

      // Auto-detect value type
      let parsed: string | number | boolean | null = value;
      if (value === "true") parsed = true;
      else if (value === "false") parsed = false;
      else if (value === "null") parsed = null;
      else if (!isNaN(Number(value))) parsed = Number(value);

      await client.setConfig({
        key,
        value: parsed,
        category: opts.category,
        description: opts.description || `Set by ${agentId} via CLI`,
        updatedBy: agentId,
      });
      console.log(fmt.success(`${key} = ${parsed}`));
    } catch (err: any) {
      console.log(fmt.error(err.message));
      process.exit(1);
    }
  });

configCommand
  .command("policies")
  .description("List scope-specific policy overrides")
  .argument("<scope>", "Scope name")
  .action(async (scopeName: string) => {
    const spinner = ora("Loading policies...").start();
    try {
      const scope = await client.getScopeByName(scopeName);
      if (!scope) {
        spinner.fail(`Scope "${scopeName}" not found`);
        process.exit(1);
      }

      const policies = await client.listScopePolicies(scope._id);
      spinner.stop();

      if (!policies || !Array.isArray(policies) || policies.length === 0) {
        console.log(fmt.dim(`No policy overrides for "${scopeName}"`));
        return;
      }

      console.log(fmt.header(`Policies for "${scopeName}"`));
      for (const p of policies) {
        const val = typeof p.policyValue === "object" ? JSON.stringify(p.policyValue) : p.policyValue;
        const priority = chalk.gray(`p:${p.priority || 0}`);
        console.log(`  ${chalk.cyan(p.policyKey)} = ${chalk.yellow(val)} ${priority}`);
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

configCommand
  .command("set-policy")
  .description("Set a scope-specific policy override")
  .argument("<scope>", "Scope name")
  .argument("<key>", "Policy key")
  .argument("<value>", "Policy value")
  .option("-p, --priority <n>", "Priority (higher overrides lower)", "10")
  .action(async (scopeName: string, key: string, value: string, opts: any) => {
    try {
      const scope = await client.getScopeByName(scopeName);
      if (!scope) {
        console.log(fmt.error(`Scope "${scopeName}" not found`));
        process.exit(1);
      }

      const agentId = client.getAgentId();

      let parsed: string | number | boolean | null = value;
      if (value === "true") parsed = true;
      else if (value === "false") parsed = false;
      else if (value === "null") parsed = null;
      else if (!isNaN(Number(value))) parsed = Number(value);

      await client.setScopePolicy({
        scopeId: scope._id,
        policyKey: key,
        policyValue: parsed,
        priority: parseInt(opts.priority, 10),
        createdBy: agentId,
      });
      console.log(fmt.success(`${scopeName}/${key} = ${parsed}`));
    } catch (err: any) {
      console.log(fmt.error(err.message));
      process.exit(1);
    }
  });
