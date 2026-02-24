/**
 * engram store — Store a fact into memory
 */

import { Command } from "commander";
import ora from "ora";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const storeCommand = new Command("store")
  .description("Store a fact into memory")
  .argument("<content>", "The fact content to store")
  .option("-t, --type <type>", "Fact type (observation, decision, correction, insight, plan)", "observation")
  .option("-s, --scope <scope>", "Scope name to store in")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--source <source>", "Source of the fact", "cli")
  .option("--emotion <emotion>", "Emotional context (frustrated, proud, key-insight, etc.)")
  .option("--json", "Output raw JSON for agent consumption")
  .action(async (content: string, opts) => {
    const spinner = ora("Storing fact...").start();
    try {
      const agentId = client.getAgentId();

      // Resolve scope
      let scopeId: string | undefined;
      if (opts.scope) {
        const scope = await client.getScopeByName(opts.scope);
        if (!scope) {
          spinner.fail(`Scope "${opts.scope}" not found`);
          process.exit(1);
        }
        scopeId = scope._id;
      } else {
        const agent = await client.getAgent(agentId);
        if (agent?.defaultScope) {
          scopeId = agent.defaultScope;
        } else {
          const privateScope = await client.getScopeByName(`private-${agentId}`);
          if (privateScope) scopeId = privateScope._id;
        }
      }

      if (!scopeId) {
        spinner.fail("No scope available. Register an agent first: engram agents register");
        process.exit(1);
      }

      const tags = opts.tags ? opts.tags.split(",").map((t: string) => t.trim()) : undefined;

      const result = await client.storeFact({
        content,
        source: opts.source,
        createdBy: agentId,
        scopeId,
        factType: opts.type,
        tags,
        emotionalContext: opts.emotion,
      });

      spinner.succeed("Fact stored");

      if (opts.json) {
        console.log(JSON.stringify({
          factId: result.factId,
          importanceScore: result.importanceScore ?? 0.5,
          factType: opts.type,
          tags: tags || [],
          scopeId,
        }, null, 2));
        return;
      }

      console.log(fmt.label("Fact ID", result.factId));
      console.log(fmt.label("Importance", (result.importanceScore ?? 0.5).toFixed(2)));
      console.log(fmt.label("Type", opts.type));
      if (tags) console.log(fmt.label("Tags", tags.join(", ")));
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });
