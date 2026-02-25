/**
 * Declarative tool registry — single source of truth for all Engram MCP tools.
 *
 * Each entry maps a tool name to its JSON Schema, Zod schema, handler, and
 * whether the handler requires the current agentId.
 *
 * Consumers:
 *   - mcp-server/src/index.ts   (MCP stdio transport)
 *   - plugins/claude-code/       (config generation)
 *   - plugins/openclaw/          (native extension)
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// ── Re-export shared type ────────────────────────────
export type { ToolEntry } from "./types.js";
import type { ToolEntry } from "./types.js";

// ── Sub-registry imports ─────────────────────────────
import { entries as coreEntries } from "./core-entries.js";
import { entries as retrievalEntries } from "./retrieval-entries.js";
import { entries as lifecycleEntries } from "./lifecycle-entries.js";
import { entries as vaultEntries } from "./vault-entries.js";
import { entries as eventsEntries } from "./events-entries.js";
import { entries as contextEntries } from "./context-entries.js";
import { entries as discoveryEntries, makeListCapabilitiesEntry } from "./discovery-entries.js";
import { entries as episodesEntries } from "./episodes-entries.js";
import { entries as kvEntries } from "./kv-entries.js";
import { entries as subspaceEntries } from "./subspace-entries.js";

// ── Dispatch ─────────────────────────────────────────
import { routeToolCall as _routeToolCall } from "./dispatch.js";

// ── Assemble full registry ───────────────────────────

const _baseEntries: ToolEntry[] = [
  ...coreEntries,
  ...vaultEntries,
  ...eventsEntries,
  ...lifecycleEntries,
  ...retrievalEntries,
  ...contextEntries,
  ...episodesEntries,
  ...kvEntries,
  ...subspaceEntries,
  ...discoveryEntries,
];

/** Pre-built name→entry lookup map (includes list_capabilities) */
export const TOOL_MAP = new Map<string, ToolEntry>(
  _baseEntries.map((entry) => [entry.tool.name, entry])
);

// Build the list_capabilities entry now that TOOL_MAP exists
const _listCapabilities = makeListCapabilitiesEntry(_baseEntries, TOOL_MAP);

/** Complete tool registry — all Engram MCP tools. */
export const TOOL_REGISTRY: ToolEntry[] = [..._baseEntries, _listCapabilities];

// Add list_capabilities to TOOL_MAP as well
TOOL_MAP.set(_listCapabilities.tool.name, _listCapabilities);

/** Extract MCP Tool[] array for ListTools handler */
export function getToolDefinitions(): Tool[] {
  return TOOL_REGISTRY.map((entry) => entry.tool);
}

/** Route a tool call: validate + execute. Throws on unknown tool. */
export async function routeToolCall(
  toolName: string,
  args: unknown,
  agentId: string,
): Promise<any> {
  return _routeToolCall(toolName, args, agentId, TOOL_MAP);
}
