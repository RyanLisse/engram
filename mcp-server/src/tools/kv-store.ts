/**
 * KV Store MCP tool handlers.
 *
 * memory_kv_set    — Upsert a key-value pair in a scope
 * memory_kv_get    — Retrieve a value by key from a scope
 * memory_kv_delete — Remove a key-value pair from a scope
 * memory_kv_list   — List key-value pairs in a scope with optional filters
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

// ── Scope resolution helper ───────────────────────────────────────────

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
  // Try name lookup first; fall back to treating input as a raw Convex ID
  const byName = await convex.getScopeByName(scopeId);
  if (byName) return { id: byName._id };
  return { id: scopeId };
}

// ── memory_kv_set ─────────────────────────────────────────────────────

export const kvSetSchema = z.object({
  key: z.string().max(512).describe("Key to store (use dotted paths for namespacing, e.g. 'ui.theme' or 'feature.enabled')"),
  value: z.string().max(65_536).describe("Value to store — use JSON.stringify() for structured data"),
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent's private scope)"),
  category: z.string().optional().describe("Category: 'preference' | 'config' | 'identity' | 'tool_state'"),
  metadata: z.object({
    source: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  }).optional().describe("Optional metadata about the entry"),
});

export type KvSetInput = z.infer<typeof kvSetSchema>;

export async function kvSet(
  input: KvSetInput,
  agentId: string
): Promise<{ id: string; created: boolean } | { isError: true; message: string }> {
  try {
    const scope = await resolveScope(input.scopeId, agentId);
    if ("error" in scope) return { isError: true, message: scope.error };

    const result = await convex.kvSet({
      key: input.key,
      value: input.value,
      agentId,
      scopeId: scope.id,
      category: input.category,
      metadata: input.metadata,
    });

    return { id: result.id, created: result.created };
  } catch (error: any) {
    return { isError: true, message: `kv_set failed: ${error.message}` };
  }
}

// ── memory_kv_get ─────────────────────────────────────────────────────

export const kvGetSchema = z.object({
  key: z.string().describe("Key to retrieve"),
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent's private scope)"),
});

export type KvGetInput = z.infer<typeof kvGetSchema>;

export async function kvGet(
  input: KvGetInput,
  agentId: string
): Promise<{ key: string; value: string; category?: string; found: boolean; updatedAt: number } | { isError: true; message: string }> {
  try {
    const scope = await resolveScope(input.scopeId, agentId);
    if ("error" in scope) return { isError: true, message: scope.error };

    const entry = await convex.kvGet({ key: input.key, scopeId: scope.id });
    if (!entry) {
      return { key: input.key, value: "", found: false, updatedAt: 0 };
    }

    return {
      key: entry.key,
      value: entry.value,
      category: entry.category,
      found: true,
      updatedAt: entry.updatedAt,
    };
  } catch (error: any) {
    return { isError: true, message: `kv_get failed: ${error.message}` };
  }
}

// ── memory_kv_delete ──────────────────────────────────────────────────

export const kvDeleteSchema = z.object({
  key: z.string().describe("Key to delete"),
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent's private scope)"),
});

export type KvDeleteInput = z.infer<typeof kvDeleteSchema>;

export async function kvDelete(
  input: KvDeleteInput,
  agentId: string
): Promise<{ deleted: boolean } | { isError: true; message: string }> {
  try {
    const scope = await resolveScope(input.scopeId, agentId);
    if ("error" in scope) return { isError: true, message: scope.error };

    const result = await convex.kvDelete({
      key: input.key,
      agentId,
      scopeId: scope.id,
    });

    return { deleted: result.deleted };
  } catch (error: any) {
    return { isError: true, message: `kv_delete failed: ${error.message}` };
  }
}

// ── memory_kv_list ────────────────────────────────────────────────────

export const kvListSchema = z.object({
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent's private scope)"),
  prefix: z.string().optional().describe("Filter keys by prefix (e.g. 'ui.' returns all ui.* keys)"),
  category: z.string().optional().describe("Filter by category: 'preference' | 'config' | 'identity' | 'tool_state'"),
  limit: z.number().int().min(1).max(500).optional().describe("Max entries to return (default: 100)"),
});

export type KvListInput = z.infer<typeof kvListSchema>;

export async function kvList(
  input: KvListInput,
  agentId: string
): Promise<{ entries: Array<{ key: string; value: string; category?: string; updatedAt: number }>; count: number } | { isError: true; message: string }> {
  try {
    const scope = await resolveScope(input.scopeId, agentId);
    if ("error" in scope) return { isError: true, message: scope.error };

    const rows = await convex.kvList({
      scopeId: scope.id,
      prefix: input.prefix,
      category: input.category,
      limit: input.limit,
    });

    const entries = (rows as any[]).map((r: any) => ({
      key: r.key,
      value: r.value,
      category: r.category,
      updatedAt: r.updatedAt,
    }));

    return { entries, count: entries.length };
  } catch (error: any) {
    return { isError: true, message: `kv_list failed: ${error.message}` };
  }
}
