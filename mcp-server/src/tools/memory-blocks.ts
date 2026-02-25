/**
 * Memory Blocks MCP tool handlers.
 * Phase 7: memory_block_read, memory_block_write (append/replace, optional create).
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

async function resolveScope(
  scopeId: string | undefined,
  agentId: string
): Promise<{ id: string } | { error: string }> {
  if (!scopeId) {
    const privateScope = await convex.getScopeByName(`private-${agentId}`);
    if (!privateScope) {
      return { error: `Private scope not found for agent ${agentId}` };
    }
    return { id: privateScope._id };
  }
  const byName = await convex.getScopeByName(scopeId);
  if (byName) return { id: byName._id };
  return { id: scopeId };
}

// ── memory_block_read ────────────────────────────────────────────────

export const blockReadSchema = z.object({
  label: z.string().describe("Block label (e.g. 'persona', 'human', 'project_status')"),
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent's private scope)"),
});

export type BlockReadInput = z.infer<typeof blockReadSchema>;

export async function blockRead(
  input: BlockReadInput,
  agentId: string
): Promise<
  | {
      found: boolean;
      label: string;
      value: string;
      version: number;
      characterLimit: number;
      length: number;
      updatedAt: number;
    }
  | { isError: true; message: string }
> {
  try {
    const scope = await resolveScope(input.scopeId, agentId);
    if ("error" in scope) return { isError: true, message: scope.error };

    const block = await convex.blockGet({ scopeId: scope.id, label: input.label });
    if (!block) {
      return {
        found: false,
        label: input.label,
        value: "",
        version: 0,
        characterLimit: 0,
        length: 0,
        updatedAt: 0,
      };
    }
    return {
      found: true,
      label: block.label,
      value: block.value,
      version: block.version,
      characterLimit: block.characterLimit,
      length: block.value.length,
      updatedAt: block.updatedAt,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { isError: true, message: `memory_block_read failed: ${message}` };
  }
}

// ── memory_block_write ───────────────────────────────────────────────

export const blockWriteSchema = z.object({
  label: z.string().describe("Block label (e.g. 'persona', 'human')"),
  mode: z.enum(["append", "replace"]).describe("Append to or replace current content"),
  content: z.string().describe("Text to append or new full content"),
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent's private scope)"),
  characterLimit: z.number().int().min(1).optional().describe("Required when createIfMissing is true; max characters for the block"),
  createIfMissing: z.boolean().optional().describe("If true and block does not exist, create it (requires characterLimit)"),
  expectedVersion: z.number().int().optional().describe("Optimistic lock: write only if current version matches"),
  reason: z.string().optional().describe("Optional reason for the change (stored in version history)"),
});

export type BlockWriteInput = z.infer<typeof blockWriteSchema>;

export async function blockWrite(
  input: BlockWriteInput,
  agentId: string
): Promise<
  | { blockId: string; version: number; length: number; characterLimit: number; created: boolean }
  | { isError: true; message: string }
> {
  try {
    const scope = await resolveScope(input.scopeId, agentId);
    if ("error" in scope) return { isError: true, message: scope.error };

    let block = await convex.blockGet({ scopeId: scope.id, label: input.label });
    if (!block && input.createIfMissing) {
      const limit = input.characterLimit ?? 0;
      if (limit < 1) {
        return { isError: true, message: "characterLimit is required when createIfMissing is true" };
      }
      const result = await convex.blockCreate({
        label: input.label,
        value: input.mode === "replace" ? input.content : "",
        characterLimit: limit,
        scopeId: scope.id,
        createdBy: agentId,
      });
      if (input.mode === "append") {
        if (input.content.length > 0) {
          await convex.blockWrite({
            scopeId: scope.id,
            label: input.label,
            mode: "append",
            content: input.content,
            agentId,
            reason: input.reason,
          });
        }
        const updated = await convex.blockGet({ scopeId: scope.id, label: input.label });
        return {
          blockId: result.blockId,
          version: updated?.version ?? 1,
          length: updated?.value.length ?? 0,
          characterLimit: limit,
          created: true,
        };
      }
      return {
        blockId: result.blockId,
        version: 1,
        length: input.content.length,
        characterLimit: limit,
        created: true,
      };
    }

    if (!block) {
      return {
        isError: true,
        message: `Block "${input.label}" not found. Set createIfMissing: true and characterLimit to create it.`,
      };
    }

    const result = await convex.blockWrite({
      scopeId: scope.id,
      label: input.label,
      mode: input.mode,
      content: input.content,
      agentId,
      expectedVersion: input.expectedVersion,
      reason: input.reason,
    });
    return {
      blockId: result.blockId,
      version: result.version,
      length: result.length,
      characterLimit: result.characterLimit,
      created: false,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { isError: true, message: `memory_block_write failed: ${message}` };
  }
}
