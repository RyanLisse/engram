/**
 * Tool dispatch: coerceArgs (private) + routeToolCall (public).
 */

import type { ToolEntry } from "./types.js";

/**
 * Coerce string values to numbers/booleans based on JSON Schema type hints.
 * MCP clients (especially via JSON-RPC) sometimes serialize all values as strings.
 * Without this, Zod rejects "20" for a z.number() field.
 */
function coerceArgs(args: unknown, inputSchema: Record<string, any>): unknown {
  if (!args || typeof args !== "object" || !inputSchema?.properties) return args;
  const coerced = { ...(args as Record<string, unknown>) };
  for (const [key, prop] of Object.entries(inputSchema.properties as Record<string, any>)) {
    if (!(key in coerced) || coerced[key] === undefined || coerced[key] === null) continue;
    const val = coerced[key];
    if (prop.type === "number" && typeof val === "string") {
      const n = Number(val);
      if (!Number.isNaN(n)) coerced[key] = n;
    } else if (prop.type === "boolean" && typeof val === "string") {
      if (val === "true") coerced[key] = true;
      else if (val === "false") coerced[key] = false;
    }
  }
  return coerced;
}

/** Route a tool call: validate + execute. Throws on unknown tool. */
export async function routeToolCall(
  toolName: string,
  args: unknown,
  agentId: string,
  toolMap: Map<string, ToolEntry>,
): Promise<any> {
  const entry = toolMap.get(toolName);
  if (!entry) throw new Error(`Unknown tool: ${toolName}`);
  const coerced = coerceArgs(args, entry.tool.inputSchema as Record<string, any>);
  const validated = entry.zodSchema.parse(coerced);
  return await entry.handler(validated, agentId);
}
