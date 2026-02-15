/**
 * engram status — System health and stats
 */

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const statusCommand = new Command("status")
  .description("Show system status and stats")
  .action(async () => {
    const spinner = ora("Checking status...").start();
    try {
      const agentId = client.getAgentId();
      const { agent, scopes, sessions } = await client.getStats(agentId);

      spinner.stop();

      console.log(fmt.header("Engram Status"));
      console.log(fmt.label("Convex URL", process.env.CONVEX_URL || "not set"));
      console.log(fmt.label("Agent ID", agentId));
      console.log();

      if (agent) {
        console.log(chalk.bold.white("  🤖 Agent"));
        console.log(fmt.label("  Name", agent.name));
        console.log(fmt.label("  Facts Stored", agent.factCount || 0));
        console.log(fmt.label("  Capabilities", agent.capabilities?.join(", ")));
        console.log(fmt.label("  Last Seen", agent.lastSeen ? new Date(agent.lastSeen).toLocaleString() : "never"));
      } else {
        console.log(fmt.warn(`Agent "${agentId}" not registered. Run: engram agents register ${agentId} "My Agent"`));
      }

      console.log();
      const scopeList = Array.isArray(scopes) ? scopes : [];
      console.log(chalk.bold.white(`  🔒 Scopes (${scopeList.length})`));
      for (const scope of scopeList.slice(0, 5)) {
        console.log(fmt.scopeRow(scope));
      }
      if (scopeList.length > 5) {
        console.log(fmt.dim(`  ... and ${scopeList.length - 5} more`));
      }

      console.log();
      const sessionList = Array.isArray(sessions) ? sessions : [];
      console.log(chalk.bold.white(`  📝 Sessions (${sessionList.length})`));
      if (sessionList.length > 0) {
        const recent = sessionList[0];
        console.log(fmt.label("  Latest", recent.contextSummary || "no summary"));
        console.log(fmt.label("  Started", new Date(recent.startTime).toLocaleString()));
      }

      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });
