/**
 * Convex HTTP Client — Barrel re-export
 *
 * Preserves backward compatibility: `import * as convex from "../lib/convex-client.js"`
 * resolves to this index.ts via directory import.
 */

export * from "./core.js";
export * from "./facts.js";
export * from "./entities.js";
export * from "./agents-scopes.js";
export * from "./signals-config.js";
export * from "./kv-store.js";
export * from "./episodes.js";
export * from "./events.js";
