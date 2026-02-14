import * as convex from "../lib/convex-client.js";

export async function health() {
  const now = Date.now();
  const events = await convex.pollEvents({
    agentId: process.env.ENGRAM_AGENT_ID ?? "mcp-server",
    limit: 1,
  });
  const latest = events?.events?.[0]?.createdAt;
  return {
    ok: true,
    now,
    latestEventAt: latest ?? null,
    eventLagMs: latest ? now - latest : null,
  };
}
