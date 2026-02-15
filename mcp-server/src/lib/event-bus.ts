/**
 * Event Bus — Internal pub/sub for real-time event propagation.
 *
 * Bridges Convex polling → internal EventEmitter → SSE/notification push.
 * Replaces watermark-based polling with push semantics within the server process.
 */

import { EventEmitter } from "node:events";

export interface EngramEvent {
  type: string;
  agentId: string;
  scopeId?: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export type EventHandler = (event: EngramEvent) => void;

class EngramEventBus extends EventEmitter {
  private pollingInterval: NodeJS.Timeout | null = null;
  private watermark = 0;
  private pollFn: ((watermark: number) => Promise<EngramEvent[]>) | null = null;

  /**
   * Start background polling from Convex and emit events on the bus.
   * Falls back gracefully if Convex is unavailable.
   */
  startPolling(
    pollFn: (watermark: number) => Promise<EngramEvent[]>,
    intervalMs = 2000
  ) {
    if (this.pollingInterval) return;
    this.pollFn = pollFn;
    this.watermark = Date.now();

    this.pollingInterval = setInterval(async () => {
      try {
        const events = await this.pollFn!(this.watermark);
        for (const event of events) {
          this.watermark = Math.max(this.watermark, event.timestamp + 1);
          this.emit("event", event);
          this.emit(`event:${event.type}`, event);
          if (event.scopeId) {
            this.emit(`scope:${event.scopeId}`, event);
          }
          this.emit(`agent:${event.agentId}`, event);
        }
      } catch (error) {
        console.error("[event-bus] Poll error:", error);
      }
    }, intervalMs);

    console.error(`[event-bus] Started polling (interval: ${intervalMs}ms)`);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.error("[event-bus] Stopped polling");
    }
  }

  /** Manually publish an event (e.g., from webhook handler) */
  publish(event: EngramEvent) {
    this.emit("event", event);
    this.emit(`event:${event.type}`, event);
    if (event.scopeId) this.emit(`scope:${event.scopeId}`, event);
    this.emit(`agent:${event.agentId}`, event);
  }

  /** Get current watermark for external consumers */
  getWatermark(): number {
    return this.watermark;
  }
}

// Singleton
export const eventBus = new EngramEventBus();
