/**
 * engram repl — Interactive memory shell
 */

import { Command } from "commander";
import chalk from "chalk";
import * as readline from "readline";
import * as client from "../lib/client.js";
import * as fmt from "../lib/format.js";

export const replCommand = new Command("repl")
  .description("Interactive memory shell")
  .action(async () => {
    const agentId = client.getAgentId();

    console.log(fmt.header("Engram Interactive Shell"));
    console.log(fmt.dim(`Agent: ${agentId} | Type "help" for commands, "exit" to quit`));
    console.log();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan("engram> "),
    });

    rl.prompt();

    rl.on("line", async (line) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }

      const [cmd, ...args] = input.split(/\s+/);
      const rest = args.join(" ");

      try {
        switch (cmd) {
          case "help":
            printHelp();
            break;

          case "store":
          case "s":
            if (!rest) {
              console.log(fmt.warn("Usage: store <fact content>"));
              break;
            }
            await handleStore(rest, agentId);
            break;

          case "recall":
          case "r":
            if (!rest) {
              console.log(fmt.warn("Usage: recall <query>"));
              break;
            }
            await handleRecall(rest, agentId);
            break;

          case "search":
          case "q":
            if (!rest) {
              console.log(fmt.warn("Usage: search <text>"));
              break;
            }
            await handleSearch(rest);
            break;

          case "agents":
            await handleListAgents();
            break;

          case "scopes":
            await handleListScopes(agentId);
            break;

          case "status":
            await handleStatus(agentId);
            break;

          case "exit":
          case "quit":
          case ".exit":
            console.log(fmt.dim("Goodbye"));
            rl.close();
            process.exit(0);
            break;

          default:
            // Treat as recall query by default
            await handleRecall(input, agentId);
            break;
        }
      } catch (err: any) {
        console.log(fmt.error(err.message));
      }

      rl.prompt();
    });

    rl.on("close", () => {
      process.exit(0);
    });
  });

function printHelp() {
  console.log(fmt.header("Commands"));
  const cmds = [
    ["store <fact>", "Store a fact (alias: s)"],
    ["recall <query>", "Semantic search (alias: r)"],
    ["search <text>", "Full-text search (alias: q)"],
    ["agents", "List registered agents"],
    ["scopes", "List accessible scopes"],
    ["status", "Show system status"],
    ["help", "Show this help"],
    ["exit", "Quit the shell"],
  ];
  for (const [cmd, desc] of cmds) {
    console.log(`  ${chalk.bold(cmd.padEnd(20))} ${chalk.dim(desc)}`);
  }
  console.log();
  console.log(fmt.dim("Tip: Any unrecognized input is treated as a recall query"));
  console.log();
}

async function handleStore(content: string, agentId: string) {
  const agent = await client.getAgent(agentId);
  let scopeId = agent?.defaultScope;
  if (!scopeId) {
    const scope = await client.getScopeByName(`private-${agentId}`);
    scopeId = scope?._id;
  }
  if (!scopeId) {
    console.log(fmt.error("No scope available. Register agent first."));
    return;
  }

  const result = await client.storeFact({
    content,
    source: "cli-repl",
    createdBy: agentId,
    scopeId,
    factType: "observation",
  });
  console.log(fmt.success(`Stored (${result.factId?.slice(-8) || "ok"})`));
}

async function handleRecall(query: string, agentId: string) {
  const permitted = await client.getPermittedScopes(agentId);
  const scopeIds = Array.isArray(permitted) ? permitted.map((s: any) => s._id) : [];

  const results = await client.searchFactsMulti({
    query,
    scopeIds,
    limit: 8,
  });

  if (!results || !Array.isArray(results) || results.length === 0) {
    console.log(fmt.dim("No results"));
    return;
  }

  for (let i = 0; i < results.length; i++) {
    console.log(fmt.factRow(results[i], i));
  }
}

async function handleSearch(text: string) {
  const results = await client.searchFacts({ query: text, limit: 10 });
  if (!results || !Array.isArray(results) || results.length === 0) {
    console.log(fmt.dim("No results"));
    return;
  }
  for (let i = 0; i < results.length; i++) {
    console.log(fmt.factRow(results[i], i));
  }
}

async function handleListAgents() {
  const agents = await client.listAgents();
  if (!agents || !Array.isArray(agents) || agents.length === 0) {
    console.log(fmt.dim("No agents"));
    return;
  }
  for (const agent of agents) {
    console.log(fmt.agentRow(agent));
  }
}

async function handleListScopes(agentId: string) {
  const scopes = await client.getPermittedScopes(agentId);
  if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
    console.log(fmt.dim("No scopes"));
    return;
  }
  for (const scope of scopes) {
    console.log(fmt.scopeRow(scope));
  }
}

async function handleStatus(agentId: string) {
  const { agent, scopes, sessions } = await client.getStats(agentId);
  const scopeCount = Array.isArray(scopes) ? scopes.length : 0;
  const sessionCount = Array.isArray(sessions) ? sessions.length : 0;

  console.log(fmt.label("Agent", agent?.name || agentId));
  console.log(fmt.label("Facts", agent?.factCount || 0));
  console.log(fmt.label("Scopes", scopeCount));
  console.log(fmt.label("Sessions", sessionCount));
}
