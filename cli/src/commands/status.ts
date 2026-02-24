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
  .option("--json", "Output raw JSON for agent consumption")
  .option("--robot", "Output machine-readable JSON status (includes health check)")
  .action(async (opts: any) => {
    const spinner = ora("Checking status...").start();
    try {
      const agentId = client.getAgentId();
      const { agent, scopes, sessions } = await client.getStats(agentId);

      const scopeList = Array.isArray(scopes) ? scopes : [];
      const sessionList = Array.isArray(sessions) ? sessions : [];
      const convexUrl = process.env.CONVEX_URL || "not set";
      const isHealthy = !!agent && convexUrl !== "not set";

      spinner.stop();

      // Robot mode: machine-readable JSON with health check
      if (opts.robot) {
        const robotStatus = {
          healthy: isHealthy,
          agentId,
          agentRegistered: !!agent,
          convexUrl,
          factCount: agent?.factCount || 0,
          scopeCount: scopeList.length,
          sessionCount: sessionList.length,
          lastActivity: agent?.lastSeen || null,
          timestamp: Date.now(),
        };
        console.log(JSON.stringify(robotStatus, null, 2));
        return;
      }

      // JSON mode: raw stats data
      if (opts.json) {
        console.log(JSON.stringify({
          agentId,
          convexUrl,
          agent,
          scopes: scopeList,
          sessions: sessionList,
        }, null, 2));
        return;
      }

      // Formatted output
      console.log(fmt.header("Engram Status"));
      console.log(fmt.label("Convex URL", convexUrl));
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
      console.log(chalk.bold.white(`  🔒 Scopes (${scopeList.length})`));
      for (const scope of scopeList.slice(0, 5)) {
        console.log(fmt.scopeRow(scope));
      }
      if (scopeList.length > 5) {
        console.log(fmt.dim(`  ... and ${scopeList.length - 5} more`));
      }

      console.log();
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
