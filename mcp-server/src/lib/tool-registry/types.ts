/**
 * Shared type for a single entry in the Engram tool registry.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ZodSchema } from "zod";

export interface ToolEntry {
  /** MCP Tool definition (name, description, inputSchema) */
  tool: Tool;
  /** Zod validation schema for args */
  zodSchema: ZodSchema;
  /** Handler — receives (parsedArgs, agentId) */
  handler: (args: any, agentId: string) => Promise<any>;
}
