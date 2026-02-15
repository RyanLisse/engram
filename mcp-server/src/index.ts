#!/usr/bin/env node

/**
 * Engram MCP Server — Agent-Native Architecture
 *
 * 69 memory tools: primitives for facts, entities, scopes, sessions,
 * conversations, signals, events, config, agent identity, vault, and health.
 *
 * All tool definitions and routing live in lib/tool-registry.ts.
 * This file: stdio transport + rate limiter + optional SSE server + event bus.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getToolDefinitions, routeToolCall } from "./lib/tool-registry.js";
import { eventBus } from "./lib/event-bus.js";
import { startSSEServer } from "./lib/sse-server.js";
import * as convex from "./lib/convex-client.js";

// Get agent ID from env (defaults to "indy")
const AGENT_ID = process.env.ENGRAM_AGENT_ID || "indy";
const MCP_API_KEY = process.env.ENGRAM_API_KEY;
const RATE_LIMIT_PER_MIN = 100;
const requestBuckets = new Map<string, { windowStart: number; count: number }>();

// Ensure CONVEX_URL is set
if (!process.env.CONVEX_URL) {
  console.error("[engram-mcp] ERROR: CONVEX_URL environment variable is required");
  process.exit(1);
}
if (MCP_API_KEY && process.env.ENGRAM_CLIENT_KEY !== MCP_API_KEY) {
  console.error("[engram-mcp] ERROR: ENGRAM_CLIENT_KEY does not match ENGRAM_API_KEY");
  process.exit(1);
}

console.error("[engram-mcp] Starting Engram MCP Server (v2 agent-native)...");
console.error(`[engram-mcp] Agent ID: ${AGENT_ID}`);
console.error(`[engram-mcp] Convex URL: ${process.env.CONVEX_URL}`);

// Start event bus polling from Convex
eventBus.startPolling(async (watermark) => {
  const result = await convex.pollEvents({ agentId: AGENT_ID, watermark, limit: 50 });
  return (result?.events ?? []).map((e: any) => ({
    type: e.type ?? "unknown",
    agentId: e.agentId ?? AGENT_ID,
    scopeId: e.scopeId,
    payload: e,
    timestamp: e.createdAt ?? Date.now(),
  }));
}, 2000);

// Optionally start SSE HTTP server for real-time streaming
const SSE_PORT = process.env.ENGRAM_SSE_PORT ? parseInt(process.env.ENGRAM_SSE_PORT, 10) : undefined;
if (SSE_PORT) {
  startSSEServer(SSE_PORT);
}

// Create server instance
const server = new Server(
  {
    name: "engram-mcp-server",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool list handler — reads from declarative registry
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: getToolDefinitions() };
});

// Register tool call handler — single dispatch via registry
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[engram-mcp] Tool called: ${name}`);

  // Rate limiting
  const now = Date.now();
  const bucket = requestBuckets.get(AGENT_ID);
  if (!bucket || now - bucket.windowStart > 60_000) {
    requestBuckets.set(AGENT_ID, { windowStart: now, count: 1 });
  } else {
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT_PER_MIN) {
      return {
        content: [{ type: "text", text: JSON.stringify({ isError: true, message: "Rate limit exceeded" }) }],
        isError: true,
      };
    }
  }

  try {
    const result = await routeToolCall(name, args, AGENT_ID);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error: any) {
    console.error(`[engram-mcp] Error in ${name}:`, error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            isError: true,
            message: error.message || "Internal error",
          }),
        },
      ],
      isError: true,
    };
  }
});

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[engram-mcp] Server running on stdio (${getToolDefinitions().length} tools)`);
}

main().catch((error) => {
  console.error("[engram-mcp] Fatal error:", error);
  process.exit(1);
});
