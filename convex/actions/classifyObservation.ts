"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

function classify(content: string): {
  observationTier: "critical" | "notable" | "background";
  importanceTier: "structural" | "potential" | "contextual";
  confidence: number;
} {
  const lower = content.toLowerCase();
  if (/\b(outage|incident|failure|security|breach|urgent|critical)\b/.test(lower)) {
    return { observationTier: "critical", importanceTier: "structural", confidence: 0.9 };
  }
  if (/\b(decision|blocked|risk|warning|important|action)\b/.test(lower)) {
    return { observationTier: "notable", importanceTier: "potential", confidence: 0.78 };
  }
  return { observationTier: "background", importanceTier: "contextual", confidence: 0.7 };
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
      ...result,
    };
  },
});
