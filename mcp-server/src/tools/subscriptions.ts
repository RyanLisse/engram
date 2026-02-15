/**
 * Subscription tools — MCP tools for managing real-time event subscriptions.
 *
 * memory_subscribe        — Subscribe to event types/scopes
 * memory_unsubscribe      — Remove a subscription
 * memory_list_subscriptions — List active subscriptions
 */

import { z } from "zod";
import { subscriptionManager } from "../lib/subscription-manager.js";
import { eventBus } from "../lib/event-bus.js";

// In-memory buffer for events per subscription (agents poll this)
const eventBuffers = new Map<string, Array<{ event: any; receivedAt: number }>>();
const MAX_BUFFER_SIZE = 100;

// ── memory_subscribe ────────────────────────────────

export const subscribeSchema = z.object({
  eventTypes: z.array(z.string()).optional().describe("Event types to subscribe to (e.g., fact_stored, recall, signal_recorded)"),
  scopeIds: z.array(z.string()).optional().describe("Scope IDs to watch"),
  bufferSize: z.number().optional().default(50).describe("Max events to buffer before oldest are dropped"),
});

export async function subscribe(
  input: z.infer<typeof subscribeSchema>,
  agentId: string
) {
  const subId = subscriptionManager.subscribe(
    agentId,
    { eventTypes: input.eventTypes, scopeIds: input.scopeIds },
    (event) => {
      let buffer = eventBuffers.get(subId);
      if (!buffer) {
        buffer = [];
        eventBuffers.set(subId, buffer);
      }
      buffer.push({ event, receivedAt: Date.now() });
      if (buffer.length > (input.bufferSize ?? MAX_BUFFER_SIZE)) {
        buffer.shift();
      }
    }
  );

  return {
    subscriptionId: subId,
    agentId,
    eventTypes: input.eventTypes ?? ["*"],
    scopeIds: input.scopeIds ?? ["*"],
    status: "active",
  };
}

// ── memory_unsubscribe ──────────────────────────────

export const unsubscribeSchema = z.object({
  subscriptionId: z.string().describe("Subscription ID to remove"),
});

export async function unsubscribe(input: z.infer<typeof unsubscribeSchema>) {
  const removed = subscriptionManager.unsubscribe(input.subscriptionId);
  eventBuffers.delete(input.subscriptionId);
  return {
    subscriptionId: input.subscriptionId,
    removed,
  };
}

// ── memory_list_subscriptions ───────────────────────

export const listSubscriptionsSchema = z.object({
  agentId: z.string().optional().describe("Filter by agent ID"),
});

export async function listSubscriptions(
  input: z.infer<typeof listSubscriptionsSchema>,
  currentAgentId: string
) {
  const agentId = input.agentId ?? currentAgentId;
  const subs = subscriptionManager.listSubscriptions(agentId);
  const stats = subscriptionManager.getStats();

  return {
    subscriptions: subs.map((s) => ({
      ...s,
      bufferedEvents: eventBuffers.get(s.id)?.length ?? 0,
    })),
    stats,
    watermark: eventBus.getWatermark(),
  };
}

// ── memory_poll_subscription ────────────────────────

export const pollSubscriptionSchema = z.object({
  subscriptionId: z.string().describe("Subscription ID to poll events from"),
  limit: z.number().optional().default(20).describe("Max events to return"),
  flush: z.boolean().optional().default(true).describe("Clear returned events from buffer"),
});

export async function pollSubscription(input: z.infer<typeof pollSubscriptionSchema>) {
  const buffer = eventBuffers.get(input.subscriptionId);
  if (!buffer) {
    return { events: [], count: 0, subscriptionId: input.subscriptionId };
  }

  const events = buffer.slice(0, input.limit);
  if (input.flush) {
    buffer.splice(0, input.limit);
  }

  return {
    events: events.map((e) => e.event),
    count: events.length,
    remaining: buffer.length,
    subscriptionId: input.subscriptionId,
  };
}
