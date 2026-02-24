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

export type ContextStrategy = "full" | "compact" | "offload";

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

/**
 * Auto-detect the best context loading strategy based on result size vs budget.
 *
 * - full:    Results fit comfortably (<70% of budget) — return everything
 * - compact: Results exceed budget but are manageable (<2x) — use summaries for low-importance facts
 * - offload: Results far exceed budget (>2x) — aggressive filtering, only high-importance facts
 */
export function detectStrategy(
  estimatedTokens: number,
  tokenBudget: number,
): ContextStrategy {
  if (estimatedTokens < tokenBudget * 0.7) return "full";
  if (estimatedTokens < tokenBudget * 2) return "compact";
  return "offload";
}

export async function loadBudgetAwareContext(input: BudgetContextInput): Promise<{
  facts: BudgetedFact[];
  usedTokens: number;
  tokenBudget: number;
  strategy: ContextStrategy;
}> {
  const results = await convex.searchFacts({
    query: input.query,
    limit: input.maxFacts ?? 50,
    scopeIds: input.scopeId ? [input.scopeId] : undefined,
  });

  const intent = detectQueryIntent(input.query);

  // Estimate total result size to choose strategy
  const totalEstimatedTokens = results.reduce(
    (sum: number, f: any) => sum + estimateTokens(f.content ?? ""),
    0
  );
  const strategy = detectStrategy(totalEstimatedTokens, input.tokenBudget);

  const sorted = [...results].sort((a: any, b: any) => {
    // Observation digests and summaries get highest priority (compressed context)
    const factTypeWeight = (ft?: string) =>
      ft === "observation_digest" ? 5 : ft === "observation_summary" ? 4 : 0;
    const byFactType = factTypeWeight(b.factType) - factTypeWeight(a.factType);
    if (byFactType !== 0) return byFactType;

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

    const content = fact.content ?? "";
    let estimatedTok = estimateTokens(content);

    // Strategy: compact — use factualSummary for low-importance facts to save tokens
    if (strategy === "compact" && fact.importanceScore < 0.5 && fact.factualSummary) {
      const summaryTokens = estimateTokens(fact.factualSummary);
      if (summaryTokens < estimatedTok * 0.6) {
        // Use compressed summary instead of full content
        const compactFact = { ...fact, content: fact.factualSummary, _compacted: true };
        estimatedTok = summaryTokens;
        if (usedTokens + estimatedTok > input.tokenBudget) continue;
        facts.push({
          fact: compactFact,
          estimatedTokens: estimatedTok,
          inclusionReason: getInclusionReason(fact) + " (compacted)",
        });
        usedTokens += estimatedTok;
        continue;
      }
    }

    // Strategy: offload — skip low-importance facts entirely
    if (strategy === "offload" && fact.importanceScore < 0.4) continue;

    if (usedTokens + estimatedTok > input.tokenBudget) continue;
    facts.push({
      fact,
      estimatedTokens: estimatedTok,
      inclusionReason: getInclusionReason(fact),
    });
    usedTokens += estimatedTok;
  }

  return {
    facts,
    usedTokens,
    tokenBudget: input.tokenBudget,
    strategy,
  };
}

const TIER_EMOJI: Record<string, string> = {
  critical: "\u{1F534}",
  notable: "\u{1F7E1}",
  background: "\u{1F7E2}",
};
const DEFAULT_EMOJI = "\u26AA";

/**
 * Format an array of facts as date-grouped observation blocks with emoji prefixes.
 *
 * Output example:
 *   Date: Feb 18, 2026
 *   * 🔴 (14:30) User decided to migrate DB [decision]
 *   * 🟡 (14:35) Agent ran migration script [observation]
 */
export function formatFactsAsObservationBlocks(facts: any[]): string {
  if (!facts || facts.length === 0) return "";

  // Build entries with parsed dates
  const entries = facts.map((f: any) => {
    const ts = f.timestamp ? new Date(f.timestamp) : f._creationTime ? new Date(f._creationTime) : null;
    return { fact: f, date: ts };
  }).filter((e) => e.date !== null) as Array<{ fact: any; date: Date }>;

  // Sort by date ascending
  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Group by calendar date
  const groups = new Map<string, Array<{ fact: any; date: Date }>>();
  for (const entry of entries) {
    const dayKey = entry.date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    if (!groups.has(dayKey)) groups.set(dayKey, []);
    groups.get(dayKey)!.push(entry);
  }

  const lines: string[] = [];
  for (const [dayLabel, dayEntries] of groups) {
    lines.push(`Date: ${dayLabel}`);
    for (const { fact, date } of dayEntries) {
      const emoji = TIER_EMOJI[fact.observationTier as string] ?? DEFAULT_EMOJI;
      const time = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
      let content = (fact.content ?? "").replace(/\n/g, " ");
      if (content.length > 200) content = content.slice(0, 197) + "...";
      const factType = fact.factType ? ` [${fact.factType}]` : "";
      const refDate = fact.referencedDate
        ? ` -> references ${new Date(fact.referencedDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`
        : "";
      lines.push(`* ${emoji} (${time}) ${content}${factType}${refDate}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
