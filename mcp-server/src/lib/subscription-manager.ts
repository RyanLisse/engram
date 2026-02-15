/**
 * Subscription Manager — Tracks agent event subscriptions and dispatches.
 *
 * Agents subscribe to event types/scopes via MCP tools.
 * The manager listens to the event bus and routes events to subscribers.
 */

import { eventBus, type EngramEvent, type EventHandler } from "./event-bus.js";

export interface Subscription {
  id: string;
  agentId: string;
  eventTypes?: string[];
  scopeIds?: string[];
  createdAt: number;
}

export type SubscriptionCallback = (event: EngramEvent) => void;

class SubscriptionManager {
  private subscriptions = new Map<string, Subscription>();
  private callbacks = new Map<string, SubscriptionCallback>();
  private listeners = new Map<string, EventHandler>();
  private idCounter = 0;

  /**
   * Create a subscription. Returns subscription ID.
   */
  subscribe(
    agentId: string,
    options: { eventTypes?: string[]; scopeIds?: string[] },
    callback: SubscriptionCallback
  ): string {
    const id = `sub_${++this.idCounter}_${Date.now()}`;
    const subscription: Subscription = {
      id,
      agentId,
      eventTypes: options.eventTypes,
      scopeIds: options.scopeIds,
      createdAt: Date.now(),
    };

    this.subscriptions.set(id, subscription);
    this.callbacks.set(id, callback);

    // Register event bus listener
    const handler: EventHandler = (event) => {
      if (!this.matchesSubscription(event, subscription)) return;
      callback(event);
    };

    this.listeners.set(id, handler);
    eventBus.on("event", handler);

    console.error(`[subscriptions] Created ${id} for agent ${agentId}`);
    return id;
  }

  /**
   * Remove a subscription.
   */
  unsubscribe(subscriptionId: string): boolean {
    const listener = this.listeners.get(subscriptionId);
    if (listener) {
      eventBus.off("event", listener);
    }
    this.listeners.delete(subscriptionId);
    this.callbacks.delete(subscriptionId);
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Remove all subscriptions for an agent.
   */
  unsubscribeAll(agentId: string): number {
    let count = 0;
    for (const [id, sub] of this.subscriptions) {
      if (sub.agentId === agentId) {
        this.unsubscribe(id);
        count++;
      }
    }
    return count;
  }

  /**
   * List active subscriptions for an agent.
   */
  listSubscriptions(agentId?: string): Subscription[] {
    const subs = [...this.subscriptions.values()];
    return agentId ? subs.filter((s) => s.agentId === agentId) : subs;
  }

  /**
   * Get subscription count.
   */
  getStats() {
    return {
      totalSubscriptions: this.subscriptions.size,
      totalListeners: this.listeners.size,
    };
  }

  private matchesSubscription(event: EngramEvent, sub: Subscription): boolean {
    // Agent filter — always match the subscribing agent's events
    if (event.agentId !== sub.agentId) {
      // Unless scope-based subscription includes the event's scope
      if (!sub.scopeIds || !event.scopeId || !sub.scopeIds.includes(event.scopeId)) {
        return false;
      }
    }

    // Event type filter
    if (sub.eventTypes && sub.eventTypes.length > 0) {
      if (!sub.eventTypes.includes(event.type)) return false;
    }

    // Scope filter
    if (sub.scopeIds && sub.scopeIds.length > 0 && event.scopeId) {
      if (!sub.scopeIds.includes(event.scopeId)) return false;
    }

    return true;
  }
}

// Singleton
export const subscriptionManager = new SubscriptionManager();
