import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const pollEventsSchema = z.object({
  watermark: z.number().optional(),
  agentId: z.string().optional(),
  scopeId: z.string().optional(),
  limit: z.number().optional().default(100),
});
export async function pollEvents(input: z.infer<typeof pollEventsSchema>, currentAgentId: string) {
  return await convex.pollEvents({
    watermark: input.watermark,
    agentId: input.agentId ?? currentAgentId,
    scopeId: input.scopeId,
    limit: input.limit,
  });
}

export const getConfigSchema = z.object({ key: z.string() });
export async function getConfig(input: z.infer<typeof getConfigSchema>) {
  return await convex.getConfig(input.key);
}

export const listConfigsSchema = z.object({ category: z.string().optional() });
export async function listConfigs(input: z.infer<typeof listConfigsSchema>) {
  return await convex.listConfigs(input.category);
}

export const setConfigSchema = z.object({
  key: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  category: z.string(),
  description: z.string(),
});
export async function setConfig(input: z.infer<typeof setConfigSchema>, agentId: string) {
  return await convex.setConfig({ ...input, updatedBy: agentId });
}

export const setScopePolicySchema = z.object({
  scopeId: z.string(),
  policyKey: z.string(),
  policyValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  priority: z.number().optional(),
});
export async function setScopePolicy(input: z.infer<typeof setScopePolicySchema>, agentId: string) {
  return await convex.setScopePolicy({ ...input, createdBy: agentId });
}

export const deleteEntitySchema = z.object({ entityId: z.string(), hardDelete: z.boolean().optional() });
export async function deleteEntity(input: z.infer<typeof deleteEntitySchema>) {
  return await convex.deleteEntity(input);
}

export const deleteScopeSchema = z.object({ scopeId: z.string(), hardDelete: z.boolean().optional(), force: z.boolean().optional() });
export async function deleteScope(input: z.infer<typeof deleteScopeSchema>) {
  return await convex.deleteScope(input);
}

export const deleteConversationSchema = z.object({ conversationId: z.string(), hardDelete: z.boolean().optional() });
export async function deleteConversation(input: z.infer<typeof deleteConversationSchema>) {
  return await convex.deleteConversation(input);
}

export const deleteSessionSchema = z.object({ sessionId: z.string(), hardDelete: z.boolean().optional() });
export async function deleteSession(input: z.infer<typeof deleteSessionSchema>) {
  return await convex.deleteSession(input);
}

export const deleteThemeSchema = z.object({ themeId: z.string(), hardDelete: z.boolean().optional() });
export async function deleteTheme(input: z.infer<typeof deleteThemeSchema>) {
  return await convex.deleteTheme(input);
}

export const updateFactSchema = z.object({
  factId: z.string(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  factType: z.string().optional(),
});
export async function updateFact(input: z.infer<typeof updateFactSchema>) {
  return await convex.updateFact(input);
}

export const archiveFactSchema = z.object({ factId: z.string() });
export async function archiveFact(input: z.infer<typeof archiveFactSchema>) {
  return await convex.archiveFactPublic(input.factId);
}

export const boostRelevanceSchema = z.object({ factId: z.string(), boost: z.number().optional() });
export async function boostRelevance(input: z.infer<typeof boostRelevanceSchema>) {
  return await convex.boostRelevance(input);
}

export const createThemeSchema = z.object({
  name: z.string(),
  description: z.string(),
  factIds: z.array(z.string()),
  entityIds: z.array(z.string()),
  scopeId: z.string(),
  importance: z.number().optional(),
});
export async function createTheme(input: z.infer<typeof createThemeSchema>) {
  return await convex.createTheme(input);
}

export const getAgentInfoSchema = z.object({ agentId: z.string().optional() });
export async function getAgentInfo(input: z.infer<typeof getAgentInfoSchema>, currentAgentId: string) {
  const agentId = input.agentId ?? currentAgentId;
  const agent = await convex.getAgentByAgentId(agentId);
  const scopes = await convex.getPermittedScopes(agentId);
  return { agent, scopes };
}

export const getAgentContextSchema = z.object({ agentId: z.string().optional() });
export async function getAgentContext(
  input: z.infer<typeof getAgentContextSchema>,
  currentAgentId: string
) {
  const agentId = input.agentId ?? currentAgentId;
  const agent = await convex.getAgentByAgentId(agentId);
  const scopes = await convex.getPermittedScopes(agentId);
  const scopesWithPolicies = await Promise.all(
    (scopes ?? []).map(async (scope: any) => ({
      ...scope,
      policies: await convex.listScopePolicies(scope._id),
    }))
  );
  const syncStatus = await convex.getSyncStatus(process.env.ENGRAM_NODE_ID ?? "default-node").catch(() => null);
  const queueDepth = (await convex.getUnmirroredFacts({ limit: 1000 }).catch(() => [])) as any[];

  return {
    agent: {
      agentId: agent?.agentId ?? agentId,
      name: agent?.name,
      telos: agent?.telos,
      capabilities: agent?.capabilities ?? [],
      settings: {
        defaultScope: agent?.defaultScope,
        isInnerCircle: Boolean(agent?.isInnerCircle),
      },
    },
    permittedScopes: scopesWithPolicies,
    systemHealth: {
      syncStatus,
      queueDepth: queueDepth.length,
    },
  };
}

export const getSystemPromptSchema = z.object({ agentId: z.string().optional() });
export async function getSystemPrompt(input: z.infer<typeof getSystemPromptSchema>, currentAgentId: string) {
  const info = await getAgentInfo({ agentId: input.agentId }, currentAgentId);
  const capabilities = info.agent?.capabilities ?? [];
  const telos = info.agent?.telos ?? "";
  const scopeNames = (info.scopes ?? []).map((s: any) => s.name).join(", ");
  return {
    prompt: `You are ${info.agent?.name ?? currentAgentId}. Telos: ${telos}. Capabilities: ${capabilities.join(", ")}. Permitted scopes: ${scopeNames}.`,
  };
}
