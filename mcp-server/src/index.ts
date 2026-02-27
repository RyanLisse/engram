#!/usr/bin/env node

/**
 * Engram MCP Server — Agent-Native Architecture
 *
 * 73 memory tools: primitives for facts, entities, scopes, sessions,
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
import { metrics } from "./lib/metrics.js";

// Get agent ID from env (defaults to "indy")
const AGENT_ID = process.env.ENGRAM_AGENT_ID || "indy";
const MCP_API_KEY = process.env.ENGRAM_API_KEY;
const RATE_LIMIT_PER_MIN = parseInt(process.env.ENGRAM_RATE_LIMIT || "200", 10);
const requestBuckets = new Map<string, { windowStart: number; count: number }>();

// Periodic cleanup of stale rate-limit buckets (prevents memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of requestBuckets) {
    if (now - bucket.windowStart > 120_000) requestBuckets.delete(key);
  }
}, 60_000);

// Request counter for tracing
let requestSeq = 0;

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

const convexUrl = process.env.CONVEX_URL || "";
const isPlaceholderConvexUrl = convexUrl.includes("your-deployment.convex.cloud");
const disableEventBus = process.env.ENGRAM_DISABLE_EVENT_BUS === "1" || isPlaceholderConvexUrl;

function normalizeEventType(rawType: string): string {
  if (rawType === "fact.stored") return "fact_stored";
  if (rawType === "recall_completed") return "recall";
  if (rawType.includes(".")) return rawType.replace(/\./g, "_");
  return rawType;
}

if (disableEventBus) {
  console.error("[engram-mcp] Event bus polling disabled (test or placeholder configuration)");
} else {
  // Register event bus poll function (demand-driven — only polls when subscriptions exist)
  eventBus.startPolling(async (watermark) => {
    const result = await convex.pollEvents({ agentId: AGENT_ID, watermark, limit: 50 });
    return (result?.events ?? []).map((e: any) => ({
      type: normalizeEventType(e.eventType ?? e.type ?? "unknown"),
      agentId: e.agentId ?? AGENT_ID,
      scopeId: e.scopeId,
      payload: e,
      timestamp: e.createdAt ?? Date.now(),
    }));
  }, 5000);
}

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
  const reqId = ++requestSeq;
  const startMs = Date.now();

  // Rate limiting with per-agent buckets
  const bucket = requestBuckets.get(AGENT_ID);
  if (!bucket || startMs - bucket.windowStart > 60_000) {
    requestBuckets.set(AGENT_ID, { windowStart: startMs, count: 1 });
  } else {
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT_PER_MIN) {
      console.error(`[engram-mcp] #${reqId} RATE_LIMITED ${name}`);
      return {
        content: [{ type: "text", text: JSON.stringify({
          isError: true,
          code: "RATE_LIMITED",
          message: `Rate limit exceeded (${RATE_LIMIT_PER_MIN}/min). Retry after ${Math.ceil((bucket.windowStart + 60_000 - startMs) / 1000)}s.`,
          retryAfterMs: bucket.windowStart + 60_000 - startMs,
        }) }],
        isError: true,
      };
    }
  }

  try {
    const result = await routeToolCall(name, args, AGENT_ID);
    const durationMs = Date.now() - startMs;
    metrics.record(name, durationMs, false);
    console.error(`[engram-mcp] #${reqId} ${name} OK ${durationMs}ms`);
    // Compact JSON (no pretty-printing) — saves ~30% tokens per response
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  } catch (error: any) {
    const durationMs = Date.now() - startMs;
    metrics.record(name, durationMs, true);
    console.error(`[engram-mcp] #${reqId} ${name} ERR ${durationMs}ms:`, error.message);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            isError: true,
            code: error.code || "INTERNAL_ERROR",
            message: error.message || "Internal error",
            tool: name,
            hint: getErrorHint(name, error),
          }),
        },
      ],
      isError: true,
    };
  }
});

/** Agent-legible error recovery hints based on tool + error pattern */
function getErrorHint(tool: string, error: any): string | undefined {
  const msg = error.message?.toLowerCase() || "";
  if (msg.includes("not found")) return "The referenced ID may be invalid or the item was deleted. Use memory_search or memory_recall to find the correct ID.";
  if (msg.includes("scope")) return "Resolve scope with memory_resolve_scopes first, then retry with the returned scope ID.";
  if (msg.includes("permission") || msg.includes("access")) return "Agent may not have write access to this scope. Check with memory_get_agent_info.";
  if (msg.includes("validation") || msg.includes("parse")) return "Check the tool's input schema via memory_list_capabilities for correct parameter types.";
  return undefined;
}

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
