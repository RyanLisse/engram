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

          case "get":
            if (!rest) {
              console.log(fmt.warn("Usage: get <factId>"));
              break;
            }
            await handleGetFact(rest);
            break;

          case "bump":
            if (!rest) {
              console.log(fmt.warn("Usage: bump <factId>"));
              break;
            }
            await handleBump(rest);
            break;

          case "archive":
            if (!rest) {
              console.log(fmt.warn("Usage: archive <factId>"));
              break;
            }
            await handleArchive(rest);
            break;

          case "signal":
            if (args.length < 2) {
              console.log(fmt.warn("Usage: signal <factId> <type>"));
              break;
            }
            await handleSignal(args[0], args[1], agentId);
            break;

          case "whoami":
            await handleWhoami(agentId);
            break;

          case "notifications":
          case "notifs":
            await handleNotifications(agentId);
            break;

          case "config":
            if (!rest) {
              console.log(fmt.warn("Usage: config <key>"));
              break;
            }
            await handleGetConfig(rest);
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
  console.log(fmt.header("Primitives"));
  const primitives = [
    ["store <fact>", "Store a fact (alias: s)"],
    ["recall <query>", "Semantic search (alias: r)"],
    ["search <text>", "Full-text search (alias: q)"],
    ["get <factId>", "Get a single fact by ID"],
    ["bump <factId>", "Bump access count (ALMA signal)"],
    ["signal <id> <type>", "Record signal: useful|outdated|wrong"],
    ["archive <factId>", "Archive a fact"],
  ];
  for (const [cmd, desc] of primitives) {
    console.log(`  ${chalk.bold(cmd.padEnd(22))} ${chalk.dim(desc)}`);
  }

  console.log(fmt.header("Management"));
  const mgmt = [
    ["whoami", "Agent identity + scopes + health"],
    ["agents", "List registered agents"],
    ["scopes", "List accessible scopes"],
    ["notifications", "Unread notifications"],
    ["config <key>", "Get a config value"],
    ["status", "System status"],
  ];
  for (const [cmd, desc] of mgmt) {
    console.log(`  ${chalk.bold(cmd.padEnd(22))} ${chalk.dim(desc)}`);
  }

  console.log();
  console.log(fmt.dim("help | exit | Any unrecognized input → recall query"));
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

async function handleGetFact(factId: string) {
  const fact = await client.getFact(factId);
  if (!fact) {
    console.log(fmt.warn("Fact not found"));
    return;
  }
  console.log(fmt.label("ID", fact._id));
  console.log(fmt.label("Content", fact.content));
  console.log(fmt.label("Type", fact.factType));
  console.log(fmt.label("Importance", fact.importanceScore?.toFixed(3)));
  console.log(fmt.label("Tags", fact.tags?.join(", ")));
  console.log(fmt.label("Access Count", fact.accessedCount || 0));
}

async function handleBump(factId: string) {
  await client.bumpAccess(factId);
  console.log(fmt.success(`Bumped ${factId.slice(-8)}`));
}

async function handleArchive(factId: string) {
  await client.archiveFact(factId);
  console.log(fmt.success(`Archived ${factId.slice(-8)}`));
}

async function handleSignal(factId: string, type: string, agentId: string) {
  await client.recordSignal({
    factId,
    agentId,
    signalType: type,
    value: 1,
  });
  console.log(fmt.success(`Signal "${type}" on ${factId.slice(-8)}`));
}

async function handleWhoami(agentId: string) {
  const ctx = await client.getAgentContext(agentId);
  console.log(fmt.label("Agent", ctx.identity.name || ctx.identity.agentId));
  console.log(fmt.label("Telos", ctx.identity.telos || "(none)"));
  console.log(fmt.label("Capabilities", ctx.identity.capabilities.join(", ") || "(none)"));
  console.log(fmt.label("Scopes", ctx.scopes.map((s: any) => s.name).join(", ") || "(none)"));
  console.log(fmt.label("Facts", ctx.identity.factCount));
  console.log(fmt.label("Sessions", ctx.activeSessions));
  console.log(fmt.label("Notifications", ctx.unreadNotifications));
}

async function handleNotifications(agentId: string) {
  const notifications = await client.getUnreadNotifications({ agentId, limit: 10 });
  if (!notifications || !Array.isArray(notifications) || notifications.length === 0) {
    console.log(fmt.dim("No unread notifications"));
    return;
  }
  for (const n of notifications) {
    console.log(`  • ${chalk.yellow(`[${n.type || "info"}]`)} ${n.message || n.content || JSON.stringify(n)}`);
  }
}

async function handleGetConfig(key: string) {
  const value = await client.getConfig(key);
  if (value === null || value === undefined) {
    console.log(fmt.warn(`Config "${key}" not found`));
  } else {
    console.log(fmt.label(key, typeof value === "object" ? JSON.stringify(value) : value));
  }
}
