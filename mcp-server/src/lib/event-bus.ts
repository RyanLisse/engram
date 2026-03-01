/**
 * Event Bus — Internal pub/sub for real-time event propagation.
 *
 * Bridges Convex polling → internal EventEmitter → SSE/notification push.
 * Replaces watermark-based polling with push semantics within the server process.
 *
 * Adaptive polling: backs off exponentially when idle, resets when events flow.
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
  private static readonly MIN_INTERVAL_MS = 500;
  private static readonly MAX_INTERVAL_MS = 30_000;
  private static readonly BACKOFF_MULTIPLIER = 2;

  private pollTimeout: NodeJS.Timeout | null = null;
  private pollGeneration = 0;
  private baseIntervalMs = 2000;
  private currentIntervalMs = 2000;
  private lastEventTime = 0;
  private watermark = 0;
  private pollFn: ((watermark: number) => Promise<EngramEvent[]>) | null = null;

  /**
   * Start background polling from Convex and emit events on the bus.
   * Falls back gracefully if Convex is unavailable.
   * Uses adaptive setTimeout chain: backs off when idle, resets on activity.
   */
  startPolling(
    pollFn: (watermark: number) => Promise<EngramEvent[]>,
    intervalMs = 2000
  ) {
    if (this.pollTimeout) return;
    this.pollFn = pollFn;
    this.watermark = Date.now();
    this.baseIntervalMs = Math.max(intervalMs, EngramEventBus.MIN_INTERVAL_MS);
    this.currentIntervalMs = this.baseIntervalMs;

    this.schedulePoll();

    console.error(`[event-bus] Started polling (base interval: ${this.baseIntervalMs}ms)`);
  }

  private schedulePoll() {
    const generation = ++this.pollGeneration;
    this.pollTimeout = setTimeout(async () => {
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

        if (events.length > 0) {
          this.currentIntervalMs = this.baseIntervalMs;
          this.lastEventTime = Date.now();
        } else {
          this.currentIntervalMs = Math.min(
            this.currentIntervalMs * EngramEventBus.BACKOFF_MULTIPLIER,
            EngramEventBus.MAX_INTERVAL_MS
          );
        }
      } catch (error) {
        console.error("[event-bus] Poll error:", error);
      }

      // Schedule next poll only if this generation is still current
      // (prevents double-scheduling when publish() reschedules mid-poll)
      if (this.pollTimeout !== null && generation === this.pollGeneration) {
        this.schedulePoll();
      }
    }, this.currentIntervalMs);
  }

  stopPolling() {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
      console.error("[event-bus] Stopped polling");
    }
  }

  /** Manually publish an event (e.g., from webhook handler) */
  publish(event: EngramEvent) {
    this.emit("event", event);
    this.emit(`event:${event.type}`, event);
    if (event.scopeId) this.emit(`scope:${event.scopeId}`, event);
    this.emit(`agent:${event.agentId}`, event);

    // Reset backoff — events are flowing, poll more aggressively
    this.currentIntervalMs = this.baseIntervalMs;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.schedulePoll();
    }
  }

  /** Get current watermark for external consumers */
  getWatermark(): number {
    return this.watermark;
  }

  /** Get adaptive polling statistics for monitoring/debugging */
  getPollingStats(): {
    currentIntervalMs: number;
    lastEventTime: number;
    baseIntervalMs: number;
  } {
    return {
      currentIntervalMs: this.currentIntervalMs,
      lastEventTime: this.lastEventTime,
      baseIntervalMs: this.baseIntervalMs,
    };
  }
}

// Singleton
export const eventBus = new EngramEventBus();
