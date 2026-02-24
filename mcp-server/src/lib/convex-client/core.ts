/**
 * Convex HTTP Client — Core foundation
 *
 * Singleton client, query/mutate/action helpers, and shared types.
 * Domain modules import these to call Convex functions.
 */

import { ConvexHttpClient } from "convex/browser";

export { PATHS } from "../convex-paths.js";

let client: ConvexHttpClient | null = null;

// Helper type for Convex function results
export type ConvexResult<T> = T | { isError: true; message: string };

/**
 * Get or create the singleton Convex client
 */
export function getConvexClient(): ConvexHttpClient {
  if (!client) {
    const url = process.env.CONVEX_URL;
    if (!url) {
      throw new Error("CONVEX_URL environment variable is required");
    }
    client = new ConvexHttpClient(url);
    console.error(`[convex-client] Connected to ${url}`);
  }
  return client;
}

/**
 * Call a Convex query function
 */
export async function query<T = any>(functionPath: string, args: Record<string, any> = {}): Promise<T> {
  const client = getConvexClient();
  return await client.query(functionPath as any, args);
}

/**
 * Call a Convex mutation function
 */
export async function mutate<T = any>(functionPath: string, args: Record<string, any> = {}): Promise<T> {
  const client = getConvexClient();
  return await client.mutation(functionPath as any, args);
}

/**
 * Call a Convex action function
 */
export async function action<T = any>(functionPath: string, args: Record<string, any> = {}): Promise<T> {
  const client = getConvexClient();
  return await client.action(functionPath as any, args);
}
