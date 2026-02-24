/**
 * Engram OpenClaw Native Plugin
 *
 * Registers all 72 Engram memory tools as native OpenClaw extensions.
 * Reuses the shared tool registry from mcp-server for zero drift.
 *
 * Install: openclaw plugins install @engram/openclaw-plugin
 */

import { TOOL_REGISTRY, routeToolCall } from "../../../mcp-server/dist/lib/tool-registry.js";

declare const process: {
  env: Record<string, string | undefined>;
};

const AGENT_ID = process.env.ENGRAM_AGENT_ID || "openclaw-agent";

/**
 * OpenClaw plugin entry point.
 * Called by OpenClaw runtime with the plugin API object.
 */
export default function register(api: any) {
  // Validate environment
  if (!process.env.CONVEX_URL) {
    console.error("[engram-openclaw] WARNING: CONVEX_URL not set. Tools will fail at runtime.");
  }

  // Register each tool from the shared registry
  for (const entry of TOOL_REGISTRY) {
    api.registerTool({
      name: entry.tool.name,
      description: entry.tool.description,
      schema: entry.tool.inputSchema,
      handler: async (args: any) => {
        try {
          return await routeToolCall(entry.tool.name, args, AGENT_ID);
        } catch (error: any) {
          return {
            isError: true,
            message: error.message || "Engram tool error",
          };
        }
      },
    });
  }

  console.error(`[engram-openclaw] Registered ${TOOL_REGISTRY.length} memory tools for agent: ${AGENT_ID}`);
}

/**
 * Direct import for programmatic use outside OpenClaw plugin system.
 *
 * Example:
 *   import { callTool, listTools } from "@engram/openclaw-plugin";
 *   const result = await callTool("memory_recall", { query: "auth" });
 */
export async function callTool(toolName: string, args: unknown) {
  return await routeToolCall(toolName, args, AGENT_ID);
}

export function listTools() {
  return TOOL_REGISTRY.map((entry: (typeof TOOL_REGISTRY)[number]) => ({
    name: entry.tool.name,
    description: entry.tool.description,
  }));
}
