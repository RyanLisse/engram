/**
 * Memory Blocks (Phase 7) tool registry entries.
 *
 * memory_block_read  — Read a named block by label (value, version, limit).
 * memory_block_write — Append or replace block content; optional create if missing.
 */

import type { ToolEntry } from "./types.js";
import { blockRead, blockReadSchema } from "../../tools/memory-blocks.js";
import { blockWrite, blockWriteSchema } from "../../tools/memory-blocks.js";

export const entries: readonly ToolEntry[] = [
  {
    tool: {
      name: "memory_block_read",
      description:
        "Read a memory block by label. Blocks are named, character-limited text slots (e.g. persona, human, project_status) used for system prompt injection. Returns value, version, characterLimit, and length.",
      inputSchema: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "Block label (e.g. 'persona', 'human', 'project_status').",
          },
          scopeId: {
            type: "string",
            description: "Scope ID or name (defaults to agent's private scope).",
          },
        },
        required: ["label"],
      },
    },
    zodSchema: blockReadSchema,
    handler: (args, agentId) => blockRead(args, agentId),
  },
  {
    tool: {
      name: "memory_block_write",
      description:
        "Append to or replace a memory block. Enforces character limit; versions are snapshotted. Use createIfMissing and characterLimit to create a new block if it does not exist.",
      inputSchema: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "Block label (e.g. 'persona', 'human').",
          },
          mode: {
            type: "string",
            enum: ["append", "replace"],
            description: "Append to existing content or replace entirely.",
          },
          content: {
            type: "string",
            description: "Text to append or new full content.",
          },
          scopeId: {
            type: "string",
            description: "Scope ID or name (defaults to agent's private scope).",
          },
          characterLimit: {
            type: "number",
            description: "Max characters (required when createIfMissing is true).",
          },
          createIfMissing: {
            type: "boolean",
            description: "If true, create the block when it does not exist (requires characterLimit).",
          },
          expectedVersion: {
            type: "number",
            description: "Optimistic lock: write only if current version matches.",
          },
          reason: {
            type: "string",
            description: "Optional reason stored in version history.",
          },
        },
        required: ["label", "mode", "content"],
      },
    },
    zodSchema: blockWriteSchema,
    handler: (args, agentId) => blockWrite(args, agentId),
  },
];
