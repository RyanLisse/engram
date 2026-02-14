"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { generateEmbedding } from "./embed";

export const embedAgentCapabilities = action({
  args: { agentId: v.string() },
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.runQuery(api.functions.agents.getByAgentId, { agentId });
    if (!agent) return { embedded: false, reason: "agent_not_found" };

    const payload = [
      `name:${agent.name}`,
      `capabilities:${(agent.capabilities ?? []).join(", ")}`,
      `telos:${agent.telos ?? ""}`,
    ].join("\n");

    const embedding = await generateEmbedding(payload);
    await ctx.runMutation(api.functions.agents.updateCapabilityEmbedding, {
      agentId: agent._id,
      capabilityEmbedding: embedding,
    });

    return { embedded: true };
  },
});
