"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

function classify(content: string): {
  observationTier: "critical" | "notable" | "background";
  importanceTier: "structural" | "potential" | "contextual";
  confidence: number;
  assertionType: "assertion" | "question" | "neutral";
  stateChanges: Array<{ subject: string; from: string; to: string }>;
} {
  const lower = content.toLowerCase();
  const trimmed = content.trim();

  // Tier classification (existing)
  let observationTier: "critical" | "notable" | "background" = "background";
  let importanceTier: "structural" | "potential" | "contextual" = "contextual";
  let confidence = 0.7;

  if (/\b(outage|incident|failure|security|breach|urgent|critical)\b/.test(lower)) {
    observationTier = "critical";
    importanceTier = "structural";
    confidence = 0.9;
  } else if (/\b(decision|blocked|risk|warning|important|action)\b/.test(lower)) {
    observationTier = "notable";
    importanceTier = "potential";
    confidence = 0.78;
  }

  // Assertion/question detection
  let assertionType: "assertion" | "question" | "neutral" = "neutral";
  if (trimmed.endsWith("?") || /^(what|when|where|why|how|who|which|is|are|was|were|do|does|did|can|could|should|would)\b/i.test(trimmed)) {
    assertionType = "question";
  } else if (/\b(decided|chose|selected|changed|switched|updated|set|configured|deployed|released|fixed|resolved|confirmed|approved|rejected)\b/i.test(lower)) {
    assertionType = "assertion";
  }

  // State change extraction
  const stateChanges: Array<{ subject: string; from: string; to: string }> = [];
  const patterns = [
    /(\w[\w\s]*?)\s+changed\s+from\s+["']?(.+?)["']?\s+to\s+["']?(.+?)["']?(?:\.|$)/gi,
    /switched\s+(\w[\w\s]*?)\s+from\s+["']?(.+?)["']?\s+to\s+["']?(.+?)["']?(?:\.|$)/gi,
    /updated\s+(\w[\w\s]*?)\s+from\s+["']?(.+?)["']?\s+to\s+["']?(.+?)["']?(?:\.|$)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      stateChanges.push({
        subject: match[1].trim(),
        from: match[2].trim(),
        to: match[3].trim(),
      });
    }
  }

  return { observationTier, importanceTier, confidence, assertionType, stateChanges };
}

export const classifyObservation = internalAction({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    const fact = await ctx.runQuery(internal.functions.facts.getFactInternal, { factId });
    if (!fact) return { classified: false, reason: "missing_fact" };

    const result = classify(fact.content);
    await ctx.runMutation(internal.functions.facts.updateObservationFields, {
      factId,
      observationTier: result.observationTier,
      importanceTier: result.importanceTier,
      confidence: result.confidence,
    });

    if (result.observationTier === "background") {
      await ctx.runAction(internal.actions.compressBackground.compressBackground, { factId });
    }

    return {
      classified: true,
      observationTier: result.observationTier,
      importanceTier: result.importanceTier,
      confidence: result.confidence,
      assertionType: result.assertionType,
      stateChanges: result.stateChanges,
    };
  },
});
