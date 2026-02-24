/**
 * Events & Notifications (3) + Config Management (4) + Real-Time Subscriptions (4) entries.
 */

import type { ToolEntry } from "./types.js";

import {
  getConfig, getConfigSchema,
  listConfigs, listConfigsSchema,
  pollEvents, pollEventsSchema,
  setConfig, setConfigSchema,
  setScopePolicy, setScopePolicySchema,
} from "../../tools/admin-primitives.js";

import {
  getNotifications, getNotificationsSchema,
  markNotificationsRead, markNotificationsReadSchema,
} from "../../tools/primitive-retrieval.js";

import {
  subscribe, subscribeSchema,
  unsubscribe, unsubscribeSchema,
  listSubscriptions, listSubscriptionsSchema,
  pollSubscription, pollSubscriptionSchema,
} from "../../tools/subscriptions.js";

export const entries: readonly ToolEntry[] = [
  // ── Events & Notifications ────────────────────────
  {
    tool: {
      name: "memory_poll_events",
      description: "Poll memory event stream with watermark support for near-real-time state awareness.",
      inputSchema: { type: "object", properties: { watermark: { type: "number" }, agentId: { type: "string" }, scopeId: { type: "string" }, limit: { type: "number" } } },
    },
    zodSchema: pollEventsSchema,
    handler: (args, agentId) => pollEvents(args, agentId),
  },
  {
    tool: {
      name: "memory_get_notifications",
      description: "Get unread notifications for current agent.",
      inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    },
    zodSchema: getNotificationsSchema,
    handler: (args, agentId) => getNotifications(args, agentId),
  },
  {
    tool: {
      name: "memory_mark_notifications_read",
      description: "Mark notifications as read.",
      inputSchema: { type: "object", properties: { notificationIds: { type: "array", items: { type: "string" } } }, required: ["notificationIds"] },
    },
    zodSchema: markNotificationsReadSchema,
    handler: (args) => markNotificationsRead(args),
  },

  // ── Config Management (Prompt-Native) ─────────────
  {
    tool: {
      name: "memory_get_config",
      description: "Get system config value by key. All weights, rates, thresholds tunable without code changes.",
      inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
    },
    zodSchema: getConfigSchema,
    handler: (args) => getConfig(args),
  },
  {
    tool: {
      name: "memory_list_configs",
      description: "List all system configs, optionally by category.",
      inputSchema: { type: "object", properties: { category: { type: "string" } } },
    },
    zodSchema: listConfigsSchema,
    handler: (args) => listConfigs(args),
  },
  {
    tool: {
      name: "memory_set_config",
      description: "Set a system config value.",
      inputSchema: { type: "object", properties: { key: { type: "string" }, value: {}, category: { type: "string" }, description: { type: "string" } }, required: ["key", "value", "category", "description"] },
    },
    zodSchema: setConfigSchema,
    handler: (args, agentId) => setConfig(args, agentId),
  },
  {
    tool: {
      name: "memory_set_scope_policy",
      description: "Set a scope-specific policy override.",
      inputSchema: { type: "object", properties: { scopeId: { type: "string" }, policyKey: { type: "string" }, policyValue: {}, priority: { type: "number" } }, required: ["scopeId", "policyKey", "policyValue"] },
    },
    zodSchema: setScopePolicySchema,
    handler: (args, agentId) => setScopePolicy(args, agentId),
  },

  // ── Real-Time Subscriptions ─────────────────────────
  {
    tool: {
      name: "memory_subscribe",
      description: "Subscribe to real-time events. Returns subscriptionId for polling or SSE streaming.",
      inputSchema: {
        type: "object",
        properties: {
          eventTypes: { type: "array", items: { type: "string" }, description: "Event types to watch (e.g., fact_stored, recall, signal_recorded)" },
          scopeIds: { type: "array", items: { type: "string" }, description: "Scope IDs to watch" },
          bufferSize: { type: "number", description: "Max events to buffer (default: 50)" },
        },
      },
    },
    zodSchema: subscribeSchema,
    handler: (args, agentId) => subscribe(args, agentId),
  },
  {
    tool: {
      name: "memory_unsubscribe",
      description: "Remove a real-time event subscription.",
      inputSchema: {
        type: "object",
        properties: {
          subscriptionId: { type: "string", description: "Subscription ID to remove" },
        },
        required: ["subscriptionId"],
      },
    },
    zodSchema: unsubscribeSchema,
    handler: (args) => unsubscribe(args),
  },
  {
    tool: {
      name: "memory_list_subscriptions",
      description: "List active event subscriptions and their buffered event counts.",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Filter by agent ID" },
        },
      },
    },
    zodSchema: listSubscriptionsSchema,
    handler: (args, agentId) => listSubscriptions(args, agentId),
  },
  {
    tool: {
      name: "memory_poll_subscription",
      description: "Poll buffered events from a subscription. Use memory_subscribe first to create one.",
      inputSchema: {
        type: "object",
        properties: {
          subscriptionId: { type: "string", description: "Subscription ID to poll" },
          limit: { type: "number", description: "Max events to return (default: 20)" },
          flush: { type: "boolean", description: "Clear returned events from buffer (default: true)" },
        },
        required: ["subscriptionId"],
      },
    },
    zodSchema: pollSubscriptionSchema,
    handler: (args) => pollSubscription(args),
  },
];
