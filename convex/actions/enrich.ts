"use node";

/**
 * Main enrichment pipeline orchestrator.
 * Runs asynchronously after a fact is stored.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { generateEmbedding } from "./embed";
import { calculateImportanceWithWeights } from "./importance";
import { extractReferencedDate } from "../lib/temporal";

/**
 * Heuristic QA-pair generation (Panini-inspired).
 * No LLM cost — uses factType + first entity/noun phrase to form the question.
 * qaConfidence = 0.6 to signal heuristic origin vs 0.9 for future LLM-generated pairs.
 */
export function generateHeuristicQA(
  content: string,
  factType: string,
  entityIds: string[],
): { qaQuestion: string; qaAnswer: string; qaEntities: string[]; qaConfidence: number } | null {
  const SUPPORTED_TYPES = new Set(["decision", "observation", "insight", "correction"]);
  if (!SUPPORTED_TYPES.has(factType)) return null;

  // Derive topic: prefer first entity label, fall back to first noun phrase
  const topic = extractTopic(content, entityIds);
  if (!topic) return null;

  const questionTemplates: Record<string, string> = {
    decision: `What was decided about ${topic}?`,
    observation: `What was observed about ${topic}?`,
    insight: `What insight was gained about ${topic}?`,
    correction: `What correction was made to ${topic}?`,
  };

  return {
    qaQuestion: questionTemplates[factType],
    qaAnswer: content,
    qaEntities: entityIds.slice(0, 5), // cap to avoid oversized arrays
    qaConfidence: 0.6,
  };
}

function shouldUpgradeQAPair(factType: string, importanceScore: number): boolean {
  return new Set(["decision", "correction", "insight"]).has(factType) && importanceScore >= 0.78;
}

function extractDetailFragment(content: string, topic: string): string | null {
  const normalizedTopicTokens = topic.toLowerCase().split(/\s+/).filter(Boolean);
  const cleanedWords = content
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  const loweredWords = cleanedWords.map((word) => word.toLowerCase());
  const topicStart = loweredWords.findIndex((word, index) =>
    normalizedTopicTokens.every((token, offset) => loweredWords[index + offset] === token)
  );
  const detailWords =
    topicStart >= 0
      ? cleanedWords.slice(topicStart + normalizedTopicTokens.length, topicStart + normalizedTopicTokens.length + 6)
      : cleanedWords.slice(0, 6);
  const stopwords = new Set(["the", "a", "an", "and", "or", "to", "for", "of", "we", "was", "is", "are"]);
  const detail = detailWords.filter((word) => !stopwords.has(word.toLowerCase())).join(" ").trim();
  return detail.length > 0 ? detail : null;
}

export function generateQAPair(
  content: string,
  factType: string,
  entityIds: string[],
  importanceScore: number,
): { qaQuestion: string; qaAnswer: string; qaEntities: string[]; qaConfidence: number } | null {
  const base = generateHeuristicQA(content, factType, entityIds);
  if (!base) return null;
  if (!shouldUpgradeQAPair(factType, importanceScore)) return base;

  const topic = extractTopic(content, entityIds);
  if (!topic) return base;
  const displayTopic = findDisplayTopic(content, topic) ?? topic;
  const detail = extractDetailFragment(content, topic);

  return {
    ...base,
    qaQuestion: detail
      ? `What was ${factType === "correction" ? "corrected" : factType === "insight" ? "learned" : "decided"} about ${displayTopic} regarding ${detail}?`
      : base.qaQuestion,
    qaConfidence: 0.82,
  };
}

/**
 * Extracts a short topic string for use in QA question templates.
 * Uses the first entity ID label if available, otherwise the first noun phrase
 * heuristic: capitalised word or first multi-word chunk before a verb.
 */
function extractTopic(content: string, entityIds: string[]): string | null {
  // Entity IDs are typically "entity-<name>" — extract readable label
  if (entityIds.length > 0) {
    const firstEntity = entityIds[0];
    const label = firstEntity.replace(/^entity-/, "").replace(/-/g, " ");
    if (label.trim().length > 0) return label.trim();
  }

  // Fallback: first capitalised word (proper noun heuristic)
  const capitalised = content.match(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)*)\b/);
  if (capitalised) return capitalised[1];

  // Last fallback: first 4 words of content (truncated subject)
  const words = content.trim().split(/\s+/).slice(0, 4).join(" ");
  return words.length > 0 ? words : null;
}

function findDisplayTopic(content: string, topic: string): string | null {
  const escaped = topic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const match = content.match(new RegExp(escaped, "i"));
  return match?.[0] ?? null;
}

/**
 * Generates a one-line summary for progressive disclosure.
 * Heuristic approach (no LLM):
 * 1. Strip markdown formatting
 * 2. Truncate to first sentence or 100 chars (whichever is shorter)
 * 3. If content starts with verb-like patterns, prefix with factType
 * 4. Add "..." if truncated
 */
export function generateFactSummary(content: string, factType: string): string {
  if (!content || content.length === 0) return "";

  // Strip markdown formatting: bold, italic, code blocks, links
  let cleaned = content
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/\*(.+?)\*/g, "$1") // italic
    .replace(/__(.+?)__/g, "$1") // bold alt
    .replace(/_(.+?)_/g, "$1") // italic alt
    .replace(/`(.+?)`/g, "$1") // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // markdown links
    .replace(/#+\s+/g, ""); // heading markers

  // Extract first sentence (ends with . ! ? or line break)
  const sentenceMatch = cleaned.match(/([^.!?\n]+[.!?])/);
  const firstSentence = sentenceMatch ? sentenceMatch[1].trim() : cleaned;

  // Truncate to 100 characters
  let summary = firstSentence.length > 100
    ? firstSentence.substring(0, 100).trim() + "..."
    : firstSentence;

  // Check if content starts with verb-like patterns (e.g., "User prefers", "API endpoint was")
  // If so, prefix with factType for clarity
  const verbPatterns = /^(The\s+|A\s+)?([A-Z][a-z]+\s+)?([a-z]+s?|was|is|were|are|has|have|did|does)/i;
  if (
    verbPatterns.test(cleaned) &&
    !summary.toLowerCase().startsWith(factType.toLowerCase())
  ) {
    // Only prefix if factType provides useful context
    if (["decision", "error", "correction", "insight"].includes(factType)) {
      summary = `${factType.charAt(0).toUpperCase() + factType.slice(1)}: ${summary}`;
    }
  }

  return summary;
}

/**
 * Main enrichment pipeline - scheduled by storeFact mutation.
 * Runs steps sequentially:
 * 1. Get the fact
 * 2. Generate embedding (Cohere Embed 4)
 * 3. Calculate importance score
 * 4. Write enrichment results back
 *
 * Future phases will add:
 * - Semantic compression
 * - Synthesis check (find similar facts)
 * - Entity extraction
 */
export const enrichFact = internalAction({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    // 1. Get the fact using internal query
    const fact = await ctx.runQuery(
      internal.functions.facts.getFactInternal,
      { factId }
    );

    if (!fact) {
      console.error(`Fact not found: ${factId}`);
      return;
    }

    // 2. Skip if already enriched (idempotency check)
    if (fact.embedding && fact.embedding.length > 0) {
      console.log(`Fact ${factId} already enriched, skipping`);
      return;
    }

    // 3. Generate embedding via Cohere
    console.log(`Generating embedding for fact ${factId}`);
    const embedding = await generateEmbedding(fact.content);

    // 4. Calculate refined importance score
    const systemImportance = await ctx.runQuery(internal.functions.config.getConfig, {
      key: "importance_weights",
    });
    const weights =
      systemImportance && typeof systemImportance.value === "object"
        ? (systemImportance.value as Record<string, number>)
        : undefined;
    const importanceScore = calculateImportanceWithWeights(
      {
      factType: fact.factType,
      emotionalWeight: fact.emotionalWeight,
      entityIds: fact.entityIds,
      content: fact.content,
      },
      weights ?? {
        decision: 0.8,
        error: 0.7,
        insight: 0.75,
        correction: 0.7,
        steering_rule: 0.85,
        learning: 0.65,
        session_summary: 0.6,
        plan: 0.6,
        observation: 0.5,
      }
    );

    // 5. Pre-compute contradictions with existing facts in same scope
    await ctx.runMutation(internal.functions.facts.checkContradictions, {
      factId,
    });

    // 6. Temporal anchoring: extract referenced dates from content
    const referencedDate = extractReferencedDate(fact.content);
    if (referencedDate) {
      await ctx.runMutation(internal.functions.facts.patchFact, {
        factId,
        fields: { referencedDate },
      });
    }

    // 6b. QA-pair generation (Panini-inspired heuristic)
    const qa = generateQAPair(fact.content, fact.factType, fact.entityIds, importanceScore);
    if (qa) {
      await ctx.runMutation(internal.functions.facts.patchFact, {
        factId,
        fields: qa,
      });
    }

    // 6c. Summary auto-generation for progressive disclosure
    if (!fact.factualSummary || !fact.summary) {
      const summary = generateFactSummary(fact.content, fact.factType);
      if (summary) {
        if (!fact.summary) {
          await ctx.runMutation(internal.functions.facts.patchFact, {
            factId,
            fields: { summary },
          });
        }
        await ctx.runMutation(internal.functions.facts.updateEnrichment, {
          factId,
          factualSummary: fact.factualSummary ?? summary,
          summary: fact.summary ?? summary,
        });
      }
    }

    // 7. Write enrichment results back
    await ctx.runMutation(internal.functions.facts.updateEnrichment, {
      factId,
      embedding,
      importanceScore,
    });
    await ctx.runMutation(internal.functions.events.emit, {
      eventType: "fact.enriched",
      factId,
      scopeId: fact.scopeId,
      agentId: fact.createdBy,
      payload: { importanceScore },
    });

    // 8. Route fact notifications to relevant agents
    await ctx.scheduler.runAfter(0, internal.actions.route.routeToAgents, {
      factId,
    });

    const summary = generateFactSummary(fact.content, fact.factType);
    console.log(
      `Enriched fact ${factId}: embedding (${embedding.length}d), ` +
      `importance: ${importanceScore.toFixed(3)}` +
      (qa ? `, qa: "${qa.qaQuestion}"` : "") +
      (summary ? `, summary: "${summary.substring(0, 40)}..."` : "")
    );
  },
});
