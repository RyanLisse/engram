import type { ToolEntry } from "./types.js";
import {
  addFactToConversation,
  addFactToConversationSchema,
  addHandoff,
  addHandoffSchema,
  createConversation,
  createConversationSchema,
  createScope,
  createScopeSchema,
  createSession,
  createSessionSchema,
  listScopePolicies,
  listScopePoliciesSchema,
} from "../../tools/scope-session-conversation.js";

export const entries: readonly ToolEntry[] = [
  {
    tool: {
      name: "memory_list_scope_policies",
      description: "List scope policy overrides for a scope (defaults to agent private scope).",
      inputSchema: {
        type: "object",
        properties: {
          scopeId: { type: "string", description: "Scope ID or name (defaults to private scope)." },
        },
      },
    },
    zodSchema: listScopePoliciesSchema,
    handler: (args, agentId) => listScopePolicies(args, agentId),
  },
  {
    tool: {
      name: "memory_create_scope",
      description: "Create a memory scope with members and read/write policies.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          members: { type: "array", items: { type: "string" } },
          readPolicy: { type: "string", enum: ["all", "members", "creator"] },
          writePolicy: { type: "string", enum: ["all", "members", "creator"] },
          retentionDays: { type: "number" },
        },
        required: ["name"],
      },
    },
    zodSchema: createScopeSchema,
    handler: (args, agentId) => createScope(args, agentId),
  },
  {
    tool: {
      name: "memory_create_session",
      description: "Create a session for the current agent.",
      inputSchema: {
        type: "object",
        properties: {
          contextSummary: { type: "string" },
          parentSession: { type: "string" },
          nodeId: { type: "string" },
        },
      },
    },
    zodSchema: createSessionSchema,
    handler: (args, agentId) => createSession(args, agentId),
  },
  {
    tool: {
      name: "memory_create_conversation",
      description: "Create a conversation thread linked to a session.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          participants: { type: "array", items: { type: "string" } },
          contextSummary: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          importance: { type: "number" },
        },
        required: ["sessionId"],
      },
    },
    zodSchema: createConversationSchema,
    handler: (args, agentId) => createConversation(args, agentId),
  },
  {
    tool: {
      name: "memory_add_fact_to_conversation",
      description: "Attach an existing fact to a conversation thread.",
      inputSchema: {
        type: "object",
        properties: {
          conversationId: { type: "string" },
          factId: { type: "string" },
        },
        required: ["conversationId", "factId"],
      },
    },
    zodSchema: addFactToConversationSchema,
    handler: (args) => addFactToConversation(args),
  },
  {
    tool: {
      name: "memory_add_handoff",
      description: "Append a handoff record to a conversation.",
      inputSchema: {
        type: "object",
        properties: {
          conversationId: { type: "string" },
          fromAgent: { type: "string" },
          toAgent: { type: "string" },
          contextSummary: { type: "string" },
        },
        required: ["conversationId", "toAgent", "contextSummary"],
      },
    },
    zodSchema: addHandoffSchema,
    handler: (args, agentId) => addHandoff(args, agentId),
  },
];
