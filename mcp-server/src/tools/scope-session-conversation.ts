import { z } from "zod";
import * as convex from "../lib/convex-client.js";

async function resolveScopeId(
  scopeId: string | undefined,
  agentId: string,
): Promise<string | null> {
  if (!scopeId) {
    const privateScope = await convex.getScopeByName(`private-${agentId}`);
    return privateScope?._id ?? null;
  }
  if (scopeId.startsWith("j")) return scopeId;
  const byName = await convex.getScopeByName(scopeId);
  return byName?._id ?? null;
}

export const listScopePoliciesSchema = z.object({
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent private scope)"),
});

export async function listScopePolicies(
  input: z.infer<typeof listScopePoliciesSchema>,
  agentId: string,
) {
  const resolved = await resolveScopeId(input.scopeId, agentId);
  if (!resolved) {
    return { isError: true, message: `Scope not found: ${input.scopeId ?? `private-${agentId}`}` };
  }
  return await convex.listScopePolicies(resolved);
}

export const createScopeSchema = z.object({
  name: z.string(),
  description: z.string().optional().default(""),
  members: z.array(z.string()).optional(),
  readPolicy: z.enum(["all", "members", "creator"]).optional().default("members"),
  writePolicy: z.enum(["all", "members", "creator"]).optional().default("members"),
  retentionDays: z.number().optional(),
});

export async function createScope(
  input: z.infer<typeof createScopeSchema>,
  agentId: string,
) {
  const members = Array.from(new Set([...(input.members ?? []), agentId]));
  const scopeId = await convex.createScope({
    name: input.name,
    description: input.description,
    members,
    readPolicy: input.readPolicy,
    writePolicy: input.writePolicy,
    retentionDays: input.retentionDays,
  });
  return { scopeId };
}

export const createSessionSchema = z.object({
  contextSummary: z.string().optional().default(""),
  parentSession: z.string().optional(),
  nodeId: z.string().optional(),
});

export async function createSession(
  input: z.infer<typeof createSessionSchema>,
  agentId: string,
) {
  const sessionId = await convex.createSession({
    agentId,
    contextSummary: input.contextSummary,
    parentSession: input.parentSession,
    nodeId: input.nodeId,
  });
  return { sessionId };
}

export const createConversationSchema = z.object({
  sessionId: z.string(),
  participants: z.array(z.string()).optional(),
  contextSummary: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  importance: z.number().optional(),
});

export async function createConversation(
  input: z.infer<typeof createConversationSchema>,
  agentId: string,
) {
  const participants = input.participants?.length ? input.participants : [agentId];
  const conversationId = await convex.createConversation({
    sessionId: input.sessionId,
    participants,
    contextSummary: input.contextSummary,
    tags: input.tags,
    importance: input.importance,
  });
  return { conversationId };
}

export const addFactToConversationSchema = z.object({
  conversationId: z.string(),
  factId: z.string(),
});

export async function addFactToConversation(
  input: z.infer<typeof addFactToConversationSchema>,
) {
  await convex.addFactToConversation(input);
  return { ok: true };
}

export const addHandoffSchema = z.object({
  conversationId: z.string(),
  fromAgent: z.string().optional(),
  toAgent: z.string(),
  contextSummary: z.string(),
});

export async function addHandoff(
  input: z.infer<typeof addHandoffSchema>,
  agentId: string,
) {
  await convex.addHandoff({
    conversationId: input.conversationId,
    fromAgent: input.fromAgent ?? agentId,
    toAgent: input.toAgent,
    contextSummary: input.contextSummary,
  });
  return { ok: true };
}
