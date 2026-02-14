"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

function compress(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 280) return cleaned;
  return `${cleaned.slice(0, 277)}...`;
}

export const compressBackground = internalAction({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    const fact = await ctx.runQuery(internal.functions.facts.getFactInternal, { factId });
    if (!fact) return { compressed: false, reason: "missing_fact" };

    const compressedContent = compress(fact.content);
    if (compressedContent === fact.content) {
      await ctx.runMutation(internal.functions.facts.updateObservationFields, {
        factId,
        observationCompressed: false,
      });
      return { compressed: false, reason: "already_short" };
    }

    await ctx.runMutation(internal.functions.facts.updateObservationFields, {
      factId,
      content: compressedContent,
      observationCompressed: true,
      observationOriginalContent: fact.content,
    });

    return { compressed: true };
  },
});
