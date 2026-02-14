"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { api } from "../_generated/api";

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const routeToAgents = internalAction({
  args: {
    factId: v.id("facts"),
  },
  handler: async (ctx, { factId }) => {
    const fact = await ctx.runQuery(internal.functions.facts.getFactInternal, { factId });
    if (!fact?.embedding || fact.importanceScore <= 0.5) {
      return { routed: 0 };
    }

    const agents = await ctx.runQuery(api.functions.agents.list, { limit: 200 });
    let routed = 0;
    for (const agent of agents) {
      if (!agent.capabilityEmbedding || agent.agentId === fact.createdBy) continue;
      const similarity = cosineSimilarity(fact.embedding, agent.capabilityEmbedding);
      if (similarity <= 0.3) continue;
      await ctx.runMutation(internal.functions.notifications.create, {
        agentId: agent.agentId,
        factId,
        reason: `relevance:${similarity.toFixed(3)}`,
      });
      routed += 1;
    }

    return { routed };
  },
});
