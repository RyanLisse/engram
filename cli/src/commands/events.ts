/**
 * engram events — Event polling primitive (Phase 3 real-time)
 *
 * Watermark-based incremental event polling.
 * Agents use this for near-real-time state change awareness.
 */

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const eventsCommand = new Command("events")
  .description("Poll memory events (watermark-based)");

eventsCommand
  .command("poll")
  .description("Poll for new events since watermark")
  .option("-w, --watermark <n>", "Last watermark (0 = from beginning)", "0")
  .option("-s, --scope <scope>", "Filter by scope name")
  .option("-n, --limit <n>", "Max events", "50")
  .option("--json", "Output as JSON")
  .action(async (opts: any) => {
    const spinner = ora("Polling events...").start();
    try {
      const agentId = client.getAgentId();
      const args: any = {
        agentId,
        watermark: parseInt(opts.watermark, 10),
        limit: parseInt(opts.limit, 10),
      };

      if (opts.scope) {
        const scope = await client.getScopeByName(opts.scope);
        if (scope) args.scopeId = scope._id;
      }

      const events = await client.pollEvents(args);
      spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(events, null, 2));
        return;
      }

      if (!events || !Array.isArray(events) || events.length === 0) {
        console.log(fmt.dim("No new events"));
        return;
      }

      console.log(fmt.header(`${events.length} Events`));
      for (const event of events) {
        const type = chalk.magenta(`[${event.eventType}]`);
        const time = chalk.gray(new Date(event.timestamp).toLocaleTimeString());
        const wm = chalk.dim(`wm:${event.watermark}`);
        console.log(`  ${type} ${time} ${wm}`);
        if (event.payload?.factId) {
          console.log(fmt.dim(`  factId: ${event.payload.factId}`));
        }
      }

      const lastWm = events[events.length - 1]?.watermark || opts.watermark;
      console.log();
      console.log(fmt.dim(`Next watermark: ${lastWm}`));
      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

eventsCommand
  .command("notifications")
  .description("Get unread notifications for current agent")
  .option("-n, --limit <n>", "Max notifications", "10")
  .option("--mark-read", "Mark as read after displaying")
  .action(async (opts: any) => {
    const spinner = ora("Loading notifications...").start();
    try {
      const agentId = client.getAgentId();
      const notifications = await client.getUnreadNotifications({
        agentId,
        limit: parseInt(opts.limit, 10),
      });
      spinner.stop();

      if (!notifications || !Array.isArray(notifications) || notifications.length === 0) {
        console.log(fmt.dim("No unread notifications"));
        return;
      }

      console.log(fmt.header(`${notifications.length} Notifications`));
      for (const n of notifications) {
        const type = chalk.yellow(`[${n.type || "info"}]`);
        console.log(`  • ${type} ${n.message || n.content || JSON.stringify(n)}`);
      }

      if (opts.markRead) {
        await client.markNotificationsRead(notifications.map((n: any) => n._id));
        console.log(fmt.success(`${notifications.length} marked as read`));
      }

      console.log();
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });
