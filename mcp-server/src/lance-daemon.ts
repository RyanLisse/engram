#!/usr/bin/env node
/**
 * Standalone LanceDB sync daemon entry point.
 * Runs continuously, syncing facts from Convex to local LanceDB every 30s.
 */

import { LanceSyncDaemon } from "./lib/lance-sync.js";

const convexUrl = process.env.CONVEX_URL;
const agentId = process.env.ENGRAM_AGENT_ID ?? "openclaw";

if (!convexUrl) {
  console.error("[lance-daemon] ERROR: CONVEX_URL environment variable is required");
  process.exit(1);
}

const daemon = new LanceSyncDaemon({ convexUrl, agentId });

process.on("SIGINT", () => {
  console.error("[lance-daemon] Shutting down...");
  daemon.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("[lance-daemon] Shutting down...");
  daemon.stop();
  process.exit(0);
});

daemon.start().catch((err) => {
  console.error("[lance-daemon] Fatal error:", err);
  process.exit(1);
});
