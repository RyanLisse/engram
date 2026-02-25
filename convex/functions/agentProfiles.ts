import { v } from "convex/values";
import { mutation, internalQuery } from "../_generated/server";

type LearnArgs = {
  agentId: string;
  scopeId: any;
  usedFactIds: any[];
};

function normalize(weights: number[]): number[] {
  const sum = weights.reduce((accumulator, value) => accumulator + value, 0);
  if (sum <= 1e-12) {
    if (weights.length === 0) return [];
    const uniform = 1 / weights.length;
    return weights.map(() => uniform);
  }
  return weights.map((weight) => weight / sum);
}

function dot(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += left[index] * right[index];
  }
  return sum;
}

function computeCoefficients(embedding: number[], principalVectors: number[][], k: number): number[] {
  const coefficients: number[] = [];
  const effectiveK = Math.min(k, principalVectors.length);
  for (let axis = 0; axis < effectiveK; axis += 1) {
    coefficients.push(dot(principalVectors[axis], embedding));
  }
  return coefficients;
}

export async function learnAgentProfileHelper(
  ctx: any,
  args: LearnArgs
): Promise<{ learned: boolean; reason?: string; profileId?: any; axisWeights?: number[]; learnedFrom?: number }> {
  if (args.usedFactIds.length === 0) {
    return { learned: false, reason: "No used facts provided" };
  }

  const subspace = await ctx.db
    .query("knowledge_subspaces")
    .withIndex("by_scope", (q: any) => q.eq("scopeId", args.scopeId))
    .first();

  if (!subspace) {
    return { learned: false, reason: "No subspace for scope" };
  }

  const principalVectors = subspace.principalVectors ?? [];
  const k = subspace.k ?? principalVectors.length;
  if (k <= 0) {
    return { learned: false, reason: "Subspace has no principal vectors" };
  }

  const coefficientRows: number[][] = [];
  for (const usedFactId of args.usedFactIds) {
    const fact = await ctx.db.get(usedFactId);
    if (!fact || fact.scopeId !== args.scopeId) continue;

    const compact = fact.compactEmbedding;
    if (compact && compact.length > 0) {
      coefficientRows.push(compact);
      continue;
    }

    if (fact.embedding && fact.embedding.length > 0 && principalVectors.length > 0) {
      coefficientRows.push(computeCoefficients(fact.embedding, principalVectors, k));
    }
  }

  if (coefficientRows.length === 0) {
    return { learned: false, reason: "No coefficient vectors available" };
  }

  const axisWeights = new Array(k).fill(0);
  for (let axis = 0; axis < k; axis += 1) {
    let total = 0;
    for (const coefficients of coefficientRows) {
      total += Math.abs(coefficients[axis] ?? 0);
    }
    axisWeights[axis] = total / coefficientRows.length;
  }
  const normalized = normalize(axisWeights);

  const existing = await ctx.db
    .query("agent_knowledge_profiles")
    .withIndex("by_agent_scope", (q: any) =>
      q.eq("agentId", args.agentId).eq("scopeId", args.scopeId)
    )
    .first();

  if (existing) {
    const oldWeights = existing.axisWeights ?? [];
    const blended = normalize(
      normalized.map((weight, index) => {
        const oldWeight = oldWeights[index] ?? 0;
        return 0.7 * oldWeight + 0.3 * weight;
      })
    );

    await ctx.db.patch(existing._id, {
      subspaceId: subspace._id,
      axisWeights: blended,
      learnedFrom: (existing.learnedFrom ?? 0) + 1,
      updatedAt: Date.now(),
    });

    return {
      learned: true,
      profileId: existing._id,
      axisWeights: blended,
      learnedFrom: (existing.learnedFrom ?? 0) + 1,
    };
  }

  const profileId = await ctx.db.insert("agent_knowledge_profiles", {
    agentId: args.agentId,
    scopeId: args.scopeId,
    subspaceId: subspace._id,
    axisWeights: normalized,
    learnedFrom: 1,
    updatedAt: Date.now(),
  });

  return { learned: true, profileId, axisWeights: normalized, learnedFrom: 1 };
}

export const learnAgentProfile = mutation({
  args: {
    agentId: v.string(),
    scopeId: v.id("memory_scopes"),
    usedFactIds: v.array(v.id("facts")),
  },
  handler: async (ctx, args) => {
    return await learnAgentProfileHelper(ctx, args);
  },
});

export const getByAgentScopeInternal = internalQuery({
  args: {
    agentId: v.string(),
    scopeId: v.id("memory_scopes"),
  },
  handler: async (ctx, { agentId, scopeId }) => {
    return await ctx.db
      .query("agent_knowledge_profiles")
      .withIndex("by_agent_scope", (q) => q.eq("agentId", agentId).eq("scopeId", scopeId))
      .first();
  },
});
