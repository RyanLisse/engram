/**
 * Convex HTTP Client — Barrel re-export for backward compatibility
 *
 * All implementation lives in ./convex-client/ domain modules.
 * This file exists so `import * as convex from "./convex-client.js"` continues to work.
 */

export * from "./convex-client/core.js";
export * from "./convex-client/facts.js";
export * from "./convex-client/entities.js";
export * from "./convex-client/agents-scopes.js";
export * from "./convex-client/signals-config.js";
export * from "./convex-client/kv-store.js";
export * from "./convex-client/episodes.js";
