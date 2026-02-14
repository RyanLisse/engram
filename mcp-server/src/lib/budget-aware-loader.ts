import * as convex from "./convex-client.js";

export interface BudgetContextInput {
  query: string;
  tokenBudget: number;
  scopeId?: string;
  maxFacts?: number;
}

export interface BudgetedFact {
  fact: any;
  estimatedTokens: number;
  inclusionReason: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function detectQueryIntent(query: string): "critical" | "balanced" | "background" {
  const lower = query.toLowerCase();
  if (/\b(urgent|incident|failure|critical)\b/.test(lower)) return "critical";
  if (/\b(history|context|background|summary)\b/.test(lower)) return "background";
  return "balanced";
}

export function getInclusionReason(fact: any): string {
  if (fact.observationTier === "critical") return "critical tier";
  if (fact.observationTier === "notable") return "notable tier";
  if (fact.importanceScore >= 0.8) return "high importance";
  return "semantic match";
}

export async function loadBudgetAwareContext(input: BudgetContextInput): Promise<{
  facts: BudgetedFact[];
  usedTokens: number;
  tokenBudget: number;
}> {
  const results = await convex.searchFacts({
    query: input.query,
    limit: input.maxFacts ?? 50,
    scopeIds: input.scopeId ? [input.scopeId] : undefined,
  });

  const intent = detectQueryIntent(input.query);
  const sorted = [...results].sort((a: any, b: any) => {
    const tierWeight = (tier?: string) =>
      tier === "critical" ? 3 : tier === "notable" ? 2 : tier === "background" ? 1 : 0;
    const byTier = tierWeight(b.observationTier) - tierWeight(a.observationTier);
    if (byTier !== 0) return byTier;
    return (b.importanceScore ?? 0) - (a.importanceScore ?? 0);
  });

  let usedTokens = 0;
  const facts: BudgetedFact[] = [];
  for (const fact of sorted) {
    if (intent === "critical" && fact.observationTier === "background") continue;
    const estimatedTokens = estimateTokens(fact.content ?? "");
    if (usedTokens + estimatedTokens > input.tokenBudget) continue;
    facts.push({
      fact,
      estimatedTokens,
      inclusionReason: getInclusionReason(fact),
    });
    usedTokens += estimatedTokens;
  }

  return {
    facts,
    usedTokens,
    tokenBudget: input.tokenBudget,
  };
}
