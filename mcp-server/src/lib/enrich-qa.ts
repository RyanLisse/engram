/**
 * Heuristic QA-pair generation (Panini-inspired).
 *
 * Extracted here so it can be imported by tests and by any MCP-side code
 * that needs to generate or validate QA representations without a Convex call.
 *
 * The Convex enrichment pipeline (`convex/actions/enrich.ts`) carries
 * an equivalent implementation for the cloud-side enrichment step.
 *
 * qaConfidence = 0.6 signals heuristic origin (vs 0.9 for LLM-generated).
 */

const SUPPORTED_QA_TYPES = new Set(["decision", "observation", "insight", "correction"]);

const QUESTION_TEMPLATES: Record<string, string> = {
  decision: "What was decided about",
  observation: "What was observed about",
  insight: "What insight was gained about",
  correction: "What correction was made to",
};

export interface QAPair {
  qaQuestion: string;
  qaAnswer: string;
  qaEntities: string[];
  qaConfidence: number;
}

/**
 * Generate a heuristic QA pair for a fact.
 * Returns null if the factType is not supported or no topic can be extracted.
 */
export function generateHeuristicQA(
  content: string,
  factType: string,
  entityIds: string[],
): QAPair | null {
  if (!SUPPORTED_QA_TYPES.has(factType)) return null;

  const topic = extractTopic(content, entityIds);
  if (!topic) return null;

  const template = QUESTION_TEMPLATES[factType];
  return {
    qaQuestion: `${template} ${topic}?`,
    qaAnswer: content,
    qaEntities: entityIds.slice(0, 5),
    qaConfidence: 0.6,
  };
}

/**
 * Extracts a short topic string for use in QA question templates.
 *
 * Priority order:
 *   1. Entity ID label ("entity-search-system" → "search system")
 *   2. First capitalised proper noun from content
 *   3. First 4 words of content (last resort)
 */
function extractTopic(content: string, entityIds: string[]): string | null {
  if (entityIds.length > 0) {
    const label = entityIds[0].replace(/^entity-/, "").replace(/-/g, " ").trim();
    if (label.length > 0) return label;
  }

  const capitalised = content.match(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)*)\b/);
  if (capitalised) return capitalised[1];

  const words = content.trim().split(/\s+/).slice(0, 4).join(" ");
  return words.length > 0 ? words : null;
}
