#!/usr/bin/env node

/**
 * Engram CLI — Interactive memory management for multi-agent systems
 */

import { Command } from "commander";
import { storeCommand } from "./commands/store.js";
import { recallCommand } from "./commands/recall.js";
import { searchCommand } from "./commands/search.js";
import { contextCommand } from "./commands/context.js";
import { agentsCommand } from "./commands/agents.js";
import { scopesCommand } from "./commands/scopes.js";
import { entitiesCommand } from "./commands/entities.js";
import { statusCommand } from "./commands/status.js";
import { replCommand } from "./commands/repl.js";

// Load .env from cli dir or project root
import { resolve, dirname } from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const paths = [
    resolve(__dirname, "..", ".env"),
    resolve(__dirname, "..", "..", ".env"),
    resolve(__dirname, "..", "..", "mcp-server", ".env"),
  ];
  for (const p of paths) {
    try {
      const content = readFileSync(p, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    } catch {
      // file not found, skip
    }
  }
}

loadEnv();

const program = new Command();

program
  .name("engram")
  .description("Engram Memory CLI — store, recall, search, and manage multi-agent memory")
  .version("1.0.0");

program.addCommand(storeCommand);
program.addCommand(recallCommand);
program.addCommand(searchCommand);
program.addCommand(contextCommand);
program.addCommand(agentsCommand);
program.addCommand(scopesCommand);
program.addCommand(entitiesCommand);
program.addCommand(statusCommand);
program.addCommand(replCommand);

program.parse();
