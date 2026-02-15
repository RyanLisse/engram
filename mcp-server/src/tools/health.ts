import * as convex from "../lib/convex-client.js";
import { metrics } from "../lib/metrics.js";

export async function health() {
  const now = Date.now();
  const events = await convex.pollEvents({
    agentId: process.env.ENGRAM_AGENT_ID ?? "mcp-server",
    limit: 1,
  });
  const latest = events?.events?.[0]?.createdAt;
  const snapshot = metrics.getSnapshot();
  return {
    ok: true,
    now,
    latestEventAt: latest ?? null,
    eventLagMs: latest ? now - latest : null,
    metrics: {
      uptimeMs: snapshot.uptimeMs,
      totalCalls: snapshot.totalCalls,
      totalErrors: snapshot.totalErrors,
      errorRate: snapshot.totalCalls > 0
        ? +(snapshot.totalErrors / snapshot.totalCalls).toFixed(3)
        : 0,
      slowTools: snapshot.slowTools,
      topTools: metrics.getTopTools(5),
    },
  };
}
