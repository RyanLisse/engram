/**
 * SSE HTTP Server — Real-time event streaming alongside MCP stdio.
 *
 * Provides:
 *   GET /events/:agentId           — SSE stream of events for an agent
 *   GET /api/fact-history/:factId   — JSON fact version history (dashboard)
 *   POST /webhook/vault-sync        — Webhook endpoint to trigger vault export
 *   POST /webhook/event             — Webhook endpoint to inject events
 *   GET /health                    — Health check
 *
 * Started optionally via ENGRAM_SSE_PORT env var.
 */

import http from "node:http";
import { eventBus, type EngramEvent } from "./event-bus.js";
import { subscriptionManager } from "./subscription-manager.js";
import { VaultSyncDaemon } from "../daemons/vault-sync.js";
import { factHistory } from "../tools/fact-history.js";
import path from "node:path";

const DEFAULT_VAULT_ROOT = process.env.VAULT_ROOT || path.resolve(process.cwd(), "..", "vault");

let vaultDaemon: VaultSyncDaemon | null = null;

export function startSSEServer(port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // SSE event stream
    if (req.method === "GET" && url.pathname.startsWith("/events/")) {
      const agentId = url.pathname.split("/events/")[1];
      if (!agentId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Agent ID required" }));
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      // Send initial connection event
      res.write(`data: ${JSON.stringify({ type: "connected", agentId, timestamp: Date.now() })}\n\n`);

      // Listen for events for this agent
      const handler = (event: EngramEvent) => {
        if (!res.writable) return;
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      eventBus.on(`agent:${agentId}`, handler);
      eventBus.addPollingConsumer(`sse:${agentId}`);

      // Also listen to scope events if agent has subscriptions
      const subs = subscriptionManager.listSubscriptions(agentId);
      const scopeHandlers: Array<{ channel: string; handler: typeof handler }> = [];
      for (const sub of subs) {
        if (sub.scopeIds) {
          for (const scopeId of sub.scopeIds) {
            const scopeHandler = (event: EngramEvent) => {
              if (!res.writable) return;
              res.write(`event: ${event.type}\n`);
              res.write(`data: ${JSON.stringify(event)}\n\n`);
            };
            eventBus.on(`scope:${scopeId}`, scopeHandler);
            scopeHandlers.push({ channel: `scope:${scopeId}`, handler: scopeHandler });
          }
        }
      }

      // Keepalive ping every 30s
      const keepalive = setInterval(() => {
        if (res.writable) {
          res.write(`:keepalive ${Date.now()}\n\n`);
        }
      }, 30_000);

      // Cleanup on disconnect
      req.on("close", () => {
        clearInterval(keepalive);
        eventBus.off(`agent:${agentId}`, handler);
        eventBus.removePollingConsumer(`sse:${agentId}`);
        for (const sh of scopeHandlers) {
          eventBus.off(sh.channel, sh.handler);
        }
        console.error(`[sse] Client disconnected: ${agentId}`);
      });

      console.error(`[sse] Client connected: ${agentId}`);
      return;
    }

    // Webhook: trigger vault sync
    if (req.method === "POST" && url.pathname === "/webhook/vault-sync") {
      try {
        if (!vaultDaemon) {
          vaultDaemon = new VaultSyncDaemon({ vaultRoot: DEFAULT_VAULT_ROOT, maxPerRun: 200 });
        }
        const result = await vaultDaemon.syncOnce();
        eventBus.publish({
          type: "vault_sync_completed",
          agentId: "system",
          payload: result,
          timestamp: Date.now(),
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, ...result }));
      } catch (error: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // Webhook: inject event
    if (req.method === "POST" && url.pathname === "/webhook/event") {
      try {
        const body = await readBody(req);
        const event: EngramEvent = {
          type: body.type ?? "webhook",
          agentId: body.agentId ?? "system",
          scopeId: body.scopeId,
          payload: body.payload ?? body,
          timestamp: Date.now(),
        };
        eventBus.publish(event);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, event }));
      } catch (error: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // Health
    if (req.method === "GET" && url.pathname === "/health") {
      const stats = subscriptionManager.getStats();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        watermark: eventBus.getWatermark(),
        ...stats,
        uptime: process.uptime(),
      }));
      return;
    }

    // GET /api/fact-history/:factId — JSON fact version history for dashboard
    const factHistoryMatch = req.method === "GET" && url.pathname.match(/^\/api\/fact-history\/([^/]+)$/);
    if (factHistoryMatch) {
      const factId = decodeURIComponent(factHistoryMatch[1]);
      const limit = url.searchParams.get("limit");
      try {
        const result = await factHistory({
          factId,
          limit: limit ? parseInt(limit, 10) : 20,
        });
        if ("isError" in result && result.isError) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: result.message }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      }
      return;
    }

    // 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(port, () => {
    console.error(`[sse] SSE server listening on http://localhost:${port}`);
    console.error(`[sse] Endpoints: GET /events/:agentId, GET /api/fact-history/:factId, POST /webhook/vault-sync, POST /webhook/event, GET /health`);
  });

  return server;
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}
