/**
 * engram context — Warm start context retrieval
 */

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const contextCommand = new Command("context")
  .description("Get warm-start context for a topic")
  .argument("<topic>", "Topic to gather context about")
  .option("-n, --max-facts <n>", "Max facts to include", "20")
  .option("-s, --scope <scope>", "Scope name")
  .option("--entities", "Include entities", true)
  .option("--themes", "Include themes", true)
  .option("--json", "Output raw JSON for agent consumption")
  .action(async (topic: string, opts) => {
    const spinner = ora(`Loading context for "${topic}"...`).start();
    try {
      const agentId = client.getAgentId();

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

      // Fetch facts
      const facts = await client.searchFactsMulti({
        query: topic,
        scopeIds,
        limit: parseInt(opts.maxFacts, 10),
      });
      const factList = Array.isArray(facts) ? facts : [];

      // Fetch entities
      let entList: any[] = [];
      if (opts.entities) {
        const entities = await client.searchEntities({ query: topic, limit: 10 });
        entList = Array.isArray(entities) ? entities : [];
      }

      // Fetch themes
      let relevant: any[] = [];
      if (opts.themes && scopeIds.length > 0) {
        const themes = await client.getThemesByScope(scopeIds[0]);
        const themeList = Array.isArray(themes) ? themes : [];
        relevant = themeList.filter(
          (t: any) =>
            t.name?.toLowerCase().includes(topic.toLowerCase()) ||
            t.description?.toLowerCase().includes(topic.toLowerCase())
        );
      }

      spinner.stop();

      // JSON output
      if (opts.json) {
        console.log(JSON.stringify({
          topic,
          facts: factList,
          entities: entList,
          themes: relevant,
        }, null, 2));
        return;
      }

      // Formatted output
      console.log(fmt.header(`Context: "${topic}"`));

      // Facts
      console.log(chalk.bold.white(`  📋 Facts (${factList.length})`));
      if (factList.length === 0) {
        console.log(fmt.dim("No facts found"));
      } else {
        for (let i = 0; i < Math.min(factList.length, 15); i++) {
          console.log(fmt.factRow(factList[i], i));
        }
        if (factList.length > 15) {
          console.log(fmt.dim(`  ... and ${factList.length - 15} more`));
        }
      }

      // Entities
      if (opts.entities) {
        console.log();
        console.log(chalk.bold.white(`  🔗 Entities (${entList.length})`));
        for (const e of entList) {
          console.log(fmt.entityRow(e));
        }
      }

      // Themes
      if (opts.themes && scopeIds.length > 0) {
        console.log();
        console.log(chalk.bold.white(`  🏷️  Themes (${relevant.length})`));
        for (const t of relevant) {
          console.log(`  • ${chalk.bold(t.name)} ${chalk.dim(t.description || "")}`);
        }
      }

      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });
