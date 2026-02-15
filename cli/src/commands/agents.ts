/**
 * engram agents — Manage agent registrations
 */

import { Command } from "commander";
import ora from "ora";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const agentsCommand = new Command("agents")
  .description("Manage agent registrations");

agentsCommand
  .command("list")
  .description("List all registered agents")
  .action(async () => {
    const spinner = ora("Loading agents...").start();
    try {
      const agents = await client.listAgents();
      spinner.stop();

      if (!agents || !Array.isArray(agents) || agents.length === 0) {
        console.log(fmt.warn("No agents registered"));
        return;
      }

      console.log(fmt.header(`${agents.length} Agents`));
      for (const agent of agents) {
        console.log(fmt.agentRow(agent));
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

agentsCommand
  .command("register")
  .description("Register a new agent")
  .argument("<agentId>", "Unique agent ID")
  .argument("<name>", "Display name")
  .option("-c, --capabilities <caps>", "Comma-separated capabilities", "memory")
  .option("-t, --telos <telos>", "Agent purpose/goal")
  .action(async (agentId: string, name: string, opts: any) => {
    const spinner = ora("Registering agent...").start();
    try {
      const capabilities = opts.capabilities.split(",").map((c: string) => c.trim());

      const result = await client.registerAgent({
        agentId,
        name,
        capabilities,
        defaultScope: `private-${agentId}`,
        telos: opts.telos,
      });

      spinner.succeed(`Agent "${name}" registered`);
      console.log(fmt.label("Agent ID", agentId));
      console.log(fmt.label("Default Scope", `private-${agentId}`));
      console.log(fmt.label("Capabilities", capabilities.join(", ")));
      if (opts.telos) console.log(fmt.label("Telos", opts.telos));
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

agentsCommand
  .command("info")
  .description("Get details about an agent")
  .argument("[agentId]", "Agent ID (defaults to ENGRAM_AGENT_ID)")
  .action(async (agentId?: string) => {
    const id = agentId || client.getAgentId();
    const spinner = ora(`Loading agent ${id}...`).start();
    try {
      const agent = await client.getAgent(id);
      spinner.stop();

      if (!agent) {
        console.log(fmt.warn(`Agent "${id}" not found`));
        return;
      }

      console.log(fmt.header(`Agent: ${agent.name}`));
      console.log(fmt.label("ID", agent.agentId));
      console.log(fmt.label("Name", agent.name));
      console.log(fmt.label("Facts", agent.factCount || 0));
      console.log(fmt.label("Capabilities", agent.capabilities?.join(", ")));
      console.log(fmt.label("Default Scope", agent.defaultScope));
      if (agent.telos) console.log(fmt.label("Telos", agent.telos));
      console.log(fmt.label("Last Seen", agent.lastSeen ? new Date(agent.lastSeen).toLocaleString() : "never"));
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });
