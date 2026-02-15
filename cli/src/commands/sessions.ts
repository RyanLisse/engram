/**
 * engram sessions — Session lifecycle management (action parity)
 */

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const sessionsCommand = new Command("sessions")
  .description("Manage agent sessions");

sessionsCommand
  .command("list")
  .description("List sessions for current agent")
  .action(async () => {
    const spinner = ora("Loading sessions...").start();
    try {
      const agentId = client.getAgentId();
      const sessions = await client.getSessionsByAgent(agentId);
      spinner.stop();

      if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
        console.log(fmt.warn("No sessions"));
        return;
      }

      console.log(fmt.header(`${sessions.length} Sessions`));
      for (const s of sessions) {
        const time = chalk.gray(new Date(s.startTime || s._creationTime).toLocaleString());
        const summary = s.contextSummary || "(no summary)";
        console.log(`  • ${time} ${summary}`);
      }
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

sessionsCommand
  .command("create")
  .description("Create a new session")
  .argument("<summary>", "Context summary for the session")
  .option("--parent <sessionId>", "Parent session ID for continuity")
  .action(async (summary: string, opts: any) => {
    const spinner = ora("Creating session...").start();
    try {
      const agentId = client.getAgentId();
      const result = await client.createSession({
        agentId,
        contextSummary: summary,
        parentSession: opts.parent,
      });
      spinner.succeed("Session created");
      console.log(fmt.label("Session ID", result));
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

sessionsCommand
  .command("delete")
  .description("Delete a session")
  .argument("<sessionId>", "Session ID")
  .option("--hard", "Hard delete (permanent)")
  .action(async (sessionId: string, opts: any) => {
    const spinner = ora("Deleting session...").start();
    try {
      await client.deleteSession({ sessionId, hardDelete: opts.hard });
      spinner.succeed("Session deleted");
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });
