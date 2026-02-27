import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { PATHS } from "../lib/convex-paths.js";

async function resolveScopeId(scopeId: string | undefined, agentId: string) {
  if (!scopeId) {
    const privateScope = await convex.getScopeByName(`private-${agentId}`);
    return privateScope?._id;
  }
  if (scopeId.startsWith("j")) return scopeId;
  const scope = await convex.getScopeByName(scopeId);
  return scope?._id;
}

export const deleteEpisodeSchema = z.object({
  episodeId: z.string(),
});

export async function deleteEpisode(
  input: z.infer<typeof deleteEpisodeSchema>,
  agentId: string,
) {
  return await convex.deleteEpisode({ episodeId: input.episodeId, agentId });
}

export const deleteSubspaceSchema = z.object({
  subspaceId: z.string().optional(),
  name: z.string().optional(),
  scopeId: z.string().optional(),
});

export async function deleteSubspace(
  input: z.infer<typeof deleteSubspaceSchema>,
  agentId: string,
) {
  let subspaceId = input.subspaceId;
  if (!subspaceId && input.name) {
    const resolvedScopeId = await resolveScopeId(input.scopeId, agentId);
    const subspaces = await convex.query(PATHS.subspaces.listSubspaces, {
      scopeId: resolvedScopeId,
      agentId,
      limit: 200,
    });
    const match = (subspaces ?? []).find((item: any) => item?.name === input.name);
    subspaceId = match?._id;
  }

  if (!subspaceId) {
    return { isError: true, message: "Provide subspaceId or name (with optional scopeId)." };
  }

  return await convex.deleteSubspace({ subspaceId });
}

export const blockDeleteSchema = z.object({
  blockId: z.string().optional(),
  label: z.string().optional(),
  scopeId: z.string().optional(),
});

export async function blockDelete(
  input: z.infer<typeof blockDeleteSchema>,
  agentId: string,
) {
  const resolvedScopeId = await resolveScopeId(input.scopeId, agentId);
  return await convex.blockDelete({
    blockId: input.blockId,
    label: input.label,
    scopeId: resolvedScopeId,
    agentId,
  });
}

export const updateThemeSchema = z.object({
  themeId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  factIds: z.array(z.string()).optional(),
  entityIds: z.array(z.string()).optional(),
  importance: z.number().optional(),
});

export async function updateTheme(input: z.infer<typeof updateThemeSchema>) {
  return await convex.updateTheme(input);
}

export const updateAgentSchema = z.object({
  agentId: z.string().optional(),
  name: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  defaultScope: z.string().optional(),
  telos: z.string().optional(),
  settings: z.any().optional(),
});

export async function updateAgent(
  input: z.infer<typeof updateAgentSchema>,
  agentId: string,
) {
  return await convex.updateAgent({
    agentId: input.agentId ?? agentId,
    name: input.name,
    capabilities: input.capabilities,
    defaultScope: input.defaultScope,
    telos: input.telos,
    settings: input.settings,
  });
}
