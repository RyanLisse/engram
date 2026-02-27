/**
 * Engram HTTP/SSE Client — Connects Obsidian to the Engram SSE server.
 *
 * Endpoints consumed (from mcp-server/src/lib/sse-server.ts):
 *   GET  /health                  — Health check (ok, watermark, uptime, subscriptions)
 *   GET  /events/:agentId         — SSE event stream for an agent
 *   POST /webhook/event           — Inject events (used for store_fact, recall proxy)
 *   POST /webhook/vault-sync      — Trigger vault sync
 */

import { requestUrl, type RequestUrlResponse } from "obsidian";

export interface EngramClientConfig {
  sseUrl: string;
  agentId: string;
}

export interface EngramHealth {
  ok: boolean;
  watermark?: number;
  totalSubscriptions?: number;
  totalListeners?: number;
  uptime?: number;
}

export interface EngramEvent {
  type: string;
  agentId: string;
  scopeId?: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export type EventCallback = (event: EngramEvent) => void;

/**
 * HTTP + SSE client for the Engram SSE server.
 *
 * Uses Obsidian's `requestUrl` for HTTP calls (works on mobile and avoids CORS).
 * Uses native EventSource for SSE streaming (browser API, available in Obsidian).
 */
export class EngramClient {
  private config: EngramClientConfig;
  private eventSource: EventSource | null = null;
  private _isConnected = false;

  constructor(config: EngramClientConfig) {
    this.config = config;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  get agentId(): string {
    return this.config.agentId;
  }

  get sseUrl(): string {
    return this.config.sseUrl;
  }

  updateConfig(config: Partial<EngramClientConfig>): void {
    if (config.sseUrl !== undefined) this.config.sseUrl = config.sseUrl;
    if (config.agentId !== undefined) this.config.agentId = config.agentId;
  }

  /**
   * Health check — GET /health
   *
   * Returns server health including watermark, uptime, subscription counts.
   */
  async health(): Promise<EngramHealth> {
    try {
      const res: RequestUrlResponse = await requestUrl({
        url: `${this.config.sseUrl}/health`,
        method: "GET",
      });
      return res.json as EngramHealth;
    } catch {
      return { ok: false };
    }
  }

  /**
   * Inject an event via webhook — POST /webhook/event
   *
   * This is the general-purpose event injection endpoint.
   * Can be used to proxy store_fact, recall, or custom events.
   */
  async postEvent(event: {
    type: string;
    agentId?: string;
    scopeId?: string;
    payload?: Record<string, unknown>;
  }): Promise<{ ok: boolean; event?: EngramEvent }> {
    try {
      const res = await requestUrl({
        url: `${this.config.sseUrl}/webhook/event`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: event.type,
          agentId: event.agentId ?? this.config.agentId,
          scopeId: event.scopeId,
          payload: event.payload ?? {},
        }),
      });
      return res.json as { ok: boolean; event?: EngramEvent };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Trigger vault sync — POST /webhook/vault-sync
   */
  async triggerVaultSync(): Promise<{ ok: boolean }> {
    try {
      const res = await requestUrl({
        url: `${this.config.sseUrl}/webhook/vault-sync`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      return res.json as { ok: boolean };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Connect to SSE event stream — GET /events/:agentId
   *
   * Listens for typed events: fact_stored, recall, signal_recorded, etc.
   * Also receives the generic onmessage for connection/keepalive events.
   */
  connectEventStream(onEvent: EventCallback): void {
    this.disconnect();

    const url = `${this.config.sseUrl}/events/${this.config.agentId}`;

    try {
      this.eventSource = new EventSource(url);
    } catch {
      this._isConnected = false;
      return;
    }

    this.eventSource.onopen = () => {
      this._isConnected = true;
    };

    this.eventSource.onerror = () => {
      this._isConnected = false;
    };

    // Generic message handler (connection events, untyped events)
    this.eventSource.onmessage = (e: MessageEvent) => {
      try {
        const event: EngramEvent = JSON.parse(e.data);
        onEvent(event);
      } catch {
        // Ignore malformed messages (e.g., keepalive comments)
      }
    };

    // Typed event handlers — mirrors the event types from sse-server.ts
    const eventTypes = [
      "fact_stored",
      "fact.stored",
      "recall",
      "recall_completed",
      "signal_recorded",
      "session_ended",
      "vault_sync_completed",
      "webhook",
    ];

    for (const type of eventTypes) {
      this.eventSource.addEventListener(type, (e: Event) => {
        try {
          const messageEvent = e as MessageEvent;
          const event: EngramEvent = JSON.parse(messageEvent.data);
          onEvent(event);
        } catch {
          // Ignore parse errors
        }
      });
    }
  }

  /**
   * Disconnect from SSE event stream.
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this._isConnected = false;
  }
}
