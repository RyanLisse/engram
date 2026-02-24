/**
 * Event Bus — Internal pub/sub for real-time event propagation.
 *
 * Bridges Convex polling → internal EventEmitter → SSE/notification push.
 * Replaces watermark-based polling with push semantics within the server process.
 *
 * Demand-driven polling: only polls Convex when there are active listeners.
 * Adaptive backoff: backs off exponentially when idle, resets when events flow.
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
  private static readonly MIN_INTERVAL_MS = 2_000;
  private static readonly MAX_INTERVAL_MS = 120_000;
  private static readonly BACKOFF_MULTIPLIER = 2;

  private pollTimeout: NodeJS.Timeout | null = null;
  private pollGeneration = 0;
  private baseIntervalMs = 5_000;
  private currentIntervalMs = 5_000;
  private lastEventTime = 0;
  private watermark = 0;
  private pollFn: ((watermark: number) => Promise<EngramEvent[]>) | null = null;
  private totalPollsSaved = 0;

  /**
   * Register the poll function but don't start polling yet.
   * Polling only begins when the first listener attaches (demand-driven).
   */
  startPolling(
    pollFn: (watermark: number) => Promise<EngramEvent[]>,
    intervalMs = 5_000
  ) {
    this.pollFn = pollFn;
    this.watermark = Date.now();
    this.baseIntervalMs = Math.max(intervalMs, EngramEventBus.MIN_INTERVAL_MS);
    this.currentIntervalMs = this.baseIntervalMs;

    // Don't schedule yet — wait for first listener (demand-driven)
    console.error(`[event-bus] Registered poll function (demand-driven, base: ${this.baseIntervalMs}ms)`);
  }

  /**
   * Signal that a consumer exists and polling should be active.
   * Called by subscription-manager when first subscription is created.
   */
  ensurePolling() {
    if (this.pollTimeout || !this.pollFn) return;
    this.schedulePoll();
    console.error("[event-bus] Demand-driven polling activated (listener attached)");
  }

  /**
   * Signal that no consumers remain. Stops polling to save Convex calls.
   * Called by subscription-manager when last subscription is removed.
   */
  pauseIfIdle() {
    if (!this.hasActiveListeners() && this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
      console.error("[event-bus] Polling paused (no active listeners)");
    }
  }

  private hasActiveListeners(): boolean {
    // Check if anyone is listening to events (beyond default internal listeners)
    return this.listenerCount("event") > 0;
  }

  private schedulePoll() {
    const generation = ++this.pollGeneration;
    this.pollTimeout = setTimeout(async () => {
      // Skip the Convex call entirely if nobody is listening
      if (!this.hasActiveListeners()) {
        this.totalPollsSaved++;
        // Still schedule next check but at max backoff
        this.currentIntervalMs = EngramEventBus.MAX_INTERVAL_MS;
        if (this.pollTimeout !== null && generation === this.pollGeneration) {
          this.schedulePoll();
        }
        return;
      }

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
        // Back off on errors too
        this.currentIntervalMs = Math.min(
          this.currentIntervalMs * EngramEventBus.BACKOFF_MULTIPLIER,
          EngramEventBus.MAX_INTERVAL_MS
        );
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
    pollsSaved: number;
    isPolling: boolean;
    hasListeners: boolean;
  } {
    return {
      currentIntervalMs: this.currentIntervalMs,
      lastEventTime: this.lastEventTime,
      baseIntervalMs: this.baseIntervalMs,
      pollsSaved: this.totalPollsSaved,
      isPolling: this.pollTimeout !== null,
      hasListeners: this.hasActiveListeners(),
    };
  }
}

// Singleton
export const eventBus = new EngramEventBus();
