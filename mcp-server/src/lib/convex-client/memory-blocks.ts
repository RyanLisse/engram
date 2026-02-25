/**
 * Convex HTTP Client — Memory Blocks (Phase 7)
 */

import { query, mutate, PATHS } from "./core.js";

export async function blockCreate(args: {
  label: string;
  value: string;
  characterLimit: number;
  scopeId: string;
  createdBy: string;
  shared?: boolean;
}) {
  return await mutate(PATHS.memoryBlocks.blockCreate, args);
}

export async function blockGet(args: { scopeId: string; label: string }) {
  return await query(PATHS.memoryBlocks.blockGet, args);
}

export async function blockListByScope(args: {
  scopeId: string;
  limit?: number;
}) {
  return await query(PATHS.memoryBlocks.blockListByScope, args);
}

export async function blockWrite(args: {
  scopeId: string;
  label: string;
  mode: "append" | "replace";
  content: string;
  agentId: string;
  expectedVersion?: number;
  reason?: string;
}) {
  return await mutate(PATHS.memoryBlocks.blockWrite, args);
}

export async function blockGetVersions(args: {
  blockId: string;
  limit?: number;
}) {
  return await query(PATHS.memoryBlocks.blockGetVersions, args);
}
