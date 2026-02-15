/**
 * engram conversations — Conversation threading + handoffs (action parity)
 */

import { Command } from "commander";
import ora from "ora";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const conversationsCommand = new Command("conversations")
  .description("Manage conversations and handoffs");

conversationsCommand
  .command("create")
  .description("Create a new conversation thread")
  .argument("<sessionId>", "Session ID")
  .argument("<summary>", "Context summary")
  .option("--participants <agents>", "Comma-separated agent IDs")
  .option("--tags <tags>", "Comma-separated tags")
  .action(async (sessionId: string, summary: string, opts: any) => {
    const spinner = ora("Creating conversation...").start();
    try {
      const agentId = client.getAgentId();
      const participants = opts.participants
        ? opts.participants.split(",").map((p: string) => p.trim())
        : [agentId];
      const tags = opts.tags
        ? opts.tags.split(",").map((t: string) => t.trim())
        : [];

      const result = await client.createConversation({
        sessionId,
        participants,
        contextSummary: summary,
        tags,
      });
      spinner.succeed("Conversation created");
      console.log(fmt.label("Conversation ID", result));
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

conversationsCommand
  .command("add-fact")
  .description("Add a fact to a conversation")
  .argument("<conversationId>", "Conversation ID")
  .argument("<factId>", "Fact ID to add")
  .action(async (conversationId: string, factId: string) => {
    try {
      await client.addFactToConversation({ conversationId, factId });
      console.log(fmt.success("Fact added to conversation"));
    } catch (err: any) {
      console.log(fmt.error(err.message));
      process.exit(1);
    }
  });

conversationsCommand
  .command("handoff")
  .description("Record an agent handoff on a conversation")
  .argument("<conversationId>", "Conversation ID")
  .argument("<toAgent>", "Target agent ID")
  .argument("<summary>", "Handoff context summary")
  .action(async (conversationId: string, toAgent: string, summary: string) => {
    const spinner = ora("Recording handoff...").start();
    try {
      const fromAgent = client.getAgentId();
      await client.addHandoff({
        conversationId,
        fromAgent,
        toAgent,
        contextSummary: summary,
      });
      spinner.succeed(`Handoff: ${fromAgent} → ${toAgent}`);
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

conversationsCommand
  .command("delete")
  .description("Delete a conversation")
  .argument("<conversationId>", "Conversation ID")
  .option("--hard", "Hard delete (permanent)")
  .action(async (conversationId: string, opts: any) => {
    const spinner = ora("Deleting conversation...").start();
    try {
      await client.deleteConversation({ conversationId, hardDelete: opts.hard });
      spinner.succeed("Conversation deleted");
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });
