/**
 * generateFactSummary — Auto-generate a 1-line summary for a fact.
 *
 * Used by Progressive Disclosure: facts without an explicit `summary` field
 * get a generated one for display in manifests and pinned memory blocks.
 *
 * Rules:
 * 1. Strip markdown formatting (headers, bold, italic, code, bullets)
 * 2. Short content (≤50 chars after stripping) → return as-is
 * 3. Multi-sentence content → take first sentence only
 * 4. Truncate at 150 chars with "..."
 * 5. Apply factType prefix for non-observation types
 */

const FACT_TYPE_PREFIXES: Record<string, string> = {
  decision: "[decision]",
  error: "[error]",
  insight: "[insight]",
  correction: "[correction]",
  steering_rule: "[rule]",
  learning: "[learning]",
  session_summary: "[summary]",
  plan: "[plan]",
};

const MARKDOWN_STRIP_RE = /(\*{1,2}|_{1,2}|`{1,3}|#{1,6}\s*|>\s*|^\s*[-*+]\s+)/gm;

/**
 * Strip markdown formatting tokens from a string.
 * Removes headers, bold, italic, inline code, fences, blockquotes, and list bullets.
 */
export function stripMarkdown(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, "") // fenced code blocks
    .replace(/`([^`]+)`/g, "$1")   // inline code — keep text
    .replace(/#{1,6}\s*/gm, "")    // ATX headers
    .replace(/^\s*[-*+]\s+/gm, "") // unordered list bullets
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1") // bold / italic — keep text
    .replace(/(?<![a-zA-Z0-9])_{1,2}([^_]+)_{1,2}(?![a-zA-Z0-9])/g, "$1") // underscore bold/italic (not inside identifiers)
    .replace(/^\s*>\s*/gm, "")     // blockquotes
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // markdown links — keep text, strip URL
    .replace(/\n+/g, " ")          // collapse newlines to spaces
    .trim();
}

/**
 * Generate a concise 1-line summary from fact content and type.
 *
 * @param content  Raw fact content string
 * @param factType Optional factType for prefix generation
 * @returns        Single-line summary ≤ ~120 chars
 */
export function generateFactSummary(content: string, factType?: string): string {
  if (!content) return "";

  // 1. Strip markdown formatting
  const clean = stripMarkdown(content);

  // 2. Short content short-circuit (no sentence extraction needed)
  const SHORT = 50;
  if (clean.length <= SHORT) {
    const prefix = factType && FACT_TYPE_PREFIXES[factType];
    return prefix ? `${prefix} ${clean}` : clean;
  }

  // 3. Extract first sentence (split on ". " or ".\n" or end of string)
  const sentenceEnd = clean.search(/[.!?](\s|$)/);
  const firstSentence = sentenceEnd !== -1 ? clean.slice(0, sentenceEnd + 1) : clean;

  // 4. Truncate at 150 chars with "..."
  const MAX = 150;
  const snippet = firstSentence.length <= MAX ? firstSentence : `${firstSentence.slice(0, MAX)}...`;

  // 5. Apply factType prefix (skip for observation — it's the default)
  const prefix = factType && FACT_TYPE_PREFIXES[factType];
  return prefix ? `${prefix} ${snippet}` : snippet;
}
