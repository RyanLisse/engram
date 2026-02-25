/**
 * Convex HTTP Client — KV Store domain
 */

import { query, mutate, PATHS } from "./core.js";

export async function kvSet(args: {
  key: string;
  value: string;
  agentId: string;
  scopeId: string;
  category?: string;
  metadata?: { source?: string; confidence?: number };
}) {
  return await mutate(PATHS.kvStore.kvSet, args);
}

export async function kvGet(args: { key: string; scopeId: string }) {
  return await query(PATHS.kvStore.kvGet, args);
}

export async function kvDelete(args: {
  key: string;
  agentId: string;
  scopeId: string;
}) {
  return await mutate(PATHS.kvStore.kvDelete, args);
}

export async function kvList(args: {
  scopeId: string;
  prefix?: string;
  category?: string;
  limit?: number;
}) {
  return await query(PATHS.kvStore.kvList, args);
}
