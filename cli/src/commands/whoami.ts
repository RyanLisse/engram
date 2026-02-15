/**
 * engram whoami — Agent identity context injection (Phase 3)
 *
 * Returns full agent identity, capabilities, permitted scopes,
 * and system health. Designed for agents to build system prompts.
 */

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const whoamiCommand = new Command("whoami")
  .description("Show full agent identity context (capabilities, scopes, health)")
  .option("--json", "Output as JSON for agent consumption")
  .action(async (opts: any) => {
    const spinner = ora("Loading agent context...").start();
    try {
      const agentId = client.getAgentId();
      const ctx = await client.getAgentContext(agentId);

      spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(ctx, null, 2));
        return;
      }

      console.log(fmt.header("Agent Identity"));
      console.log(fmt.label("Agent ID", ctx.identity.agentId));
      console.log(fmt.label("Name", ctx.identity.name || "(unregistered)"));
      console.log(fmt.label("Telos", ctx.identity.telos || "(none)"));
      console.log(fmt.label("Capabilities", ctx.identity.capabilities.join(", ") || "(none)"));
      console.log(fmt.label("Default Scope", ctx.identity.defaultScope || "(none)"));
      console.log(fmt.label("Facts Stored", ctx.identity.factCount));
      console.log(
        fmt.label(
          "Last Seen",
          ctx.identity.lastSeen ? new Date(ctx.identity.lastSeen).toLocaleString() : "never"
        )
      );

      console.log();
      console.log(chalk.bold.white(`  🔒 Permitted Scopes (${ctx.scopes.length})`));
      for (const scope of ctx.scopes) {
        const policy = chalk.dim(`r:${scope.readPolicy} w:${scope.writePolicy}`);
        const members = chalk.gray(`(${scope.memberCount} members)`);
        console.log(`  • ${chalk.bold(scope.name)} ${members} ${policy}`);
      }

      console.log();
      console.log(chalk.bold.white("  📊 System Health"));
      console.log(fmt.label("Active Sessions", ctx.activeSessions));
      console.log(fmt.label("Unread Notifications", ctx.unreadNotifications));

      if (!ctx.identity.name) {
        console.log();
        console.log(
          fmt.warn(`Agent "${agentId}" not registered. Run: engram agents register ${agentId} "Name"`)
        );
      }

      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });
