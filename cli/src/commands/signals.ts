/**
 * engram signal — Atomic signal primitive for ALMA feedback loop
 *
 * Signals are how agents express quality judgments about facts.
 * This feeds the Adaptive Learning Memory Architecture (ALMA).
 */

import { Command } from "commander";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const signalCommand = new Command("signal")
  .description("Record a signal on a fact (ALMA feedback loop)")
  .argument("<factId>", "Fact ID to signal")
  .argument("<type>", "Signal type: useful | outdated | wrong | duplicate | important")
  .option("-v, --value <n>", "Signal value (-1 to 1)", "1")
  .option("-c, --comment <text>", "Optional comment")
  .action(async (factId: string, type: string, opts: any) => {
    try {
      const agentId = client.getAgentId();
      await client.recordSignal({
        factId,
        agentId,
        signalType: type,
        value: parseFloat(opts.value),
        comment: opts.comment,
      });
      console.log(fmt.success(`Signal "${type}" recorded on ${factId.slice(-8)}`));
    } catch (err: any) {
      console.log(fmt.error(err.message));
      process.exit(1);
    }
  });
