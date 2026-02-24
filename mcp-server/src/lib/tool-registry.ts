/**
 * Re-export barrel — preserves the original import path for all consumers.
 *
 * Actual implementation lives in ./tool-registry/ directory.
 */
export {
  TOOL_REGISTRY,
  TOOL_MAP,
  getToolDefinitions,
  routeToolCall,
} from "./tool-registry/index.js";
export type { ToolEntry } from "./tool-registry/types.js";
