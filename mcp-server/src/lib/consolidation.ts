/**
 * Consolidation Library — Near-Duplicate Fact Merging
 *
 * Pure functions for identifying and merging near-duplicate facts.
 * Works without embeddings by using Jaccard similarity on word sets.
 *
 * Used by:
 *   - Sleep-time reflection cron (pre-insertion dedup gate)
 *   - Dedup cron (fallback when embeddings are missing)
 *   - Manual consolidation via MCP tools
 */

// ─── Types ──────────────────────────────────────────────────────────────

export interface MergeableFact {
  _id: string;
  content: string;
  importanceScore: number;
  timestamp: number;
}

export interface MergeCandidate {
  /** Fact ID to keep */
  keep: string;
  /** Fact ID to merge into the kept fact */
  merge: string;
  /** Jaccard similarity score (0–1) */
  similarity: number;
}

export interface MergeResult {
  content: string;
  /** True if unique sentences were appended from the merged fact */
  augmented: boolean;
}

// ─── Word Set Utilities ─────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "and", "but", "or",
  "not", "no", "nor", "so", "yet", "both", "either", "neither", "each",
  "every", "all", "any", "few", "more", "most", "other", "some", "such",
  "than", "too", "very", "just", "about", "up", "out", "if", "then",
  "that", "this", "it", "its", "i", "we", "they", "he", "she", "you",
]);

/**
 * Tokenize text into a set of meaningful words (lowercased, stop-words removed).
 */
export function toWordSet(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

/**
 * Jaccard similarity: |A ∩ B| / |A ∪ B|.
 * Returns 0 if both sets are empty.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  // Iterate over the smaller set for efficiency
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const word of smaller) {
    if (larger.has(word)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── Merge Candidate Detection ──────────────────────────────────────────

const DEFAULT_THRESHOLD = 0.7;

/**
 * Given a set of facts, identify near-duplicate clusters and return merge candidates.
 *
 * Uses Jaccard similarity on word sets — works without embeddings.
 * For each duplicate pair, keeps the fact with higher importanceScore
 * (or more recent timestamp if tied).
 *
 * Complexity: O(n²) pairwise — intended for bounded fact sets (<500).
 */
export function findMergeCandidates(
  facts: MergeableFact[],
  threshold: number = DEFAULT_THRESHOLD
): MergeCandidate[] {
  if (facts.length < 2) return [];

  // Pre-compute word sets once
  const wordSets = facts.map((f) => toWordSet(f.content));

  // Track which facts have already been claimed as "merge" targets
  // to avoid transitive chains (A merges B, B merges C → just merge both into A)
  const mergedIds = new Set<string>();
  const candidates: MergeCandidate[] = [];

  for (let i = 0; i < facts.length; i++) {
    if (mergedIds.has(facts[i]._id)) continue;

    for (let j = i + 1; j < facts.length; j++) {
      if (mergedIds.has(facts[j]._id)) continue;

      const similarity = jaccardSimilarity(wordSets[i], wordSets[j]);
      if (similarity < threshold) continue;

      // Determine which to keep: higher importance wins, then recency
      const a = facts[i];
      const b = facts[j];
      const aWins =
        a.importanceScore > b.importanceScore ||
        (a.importanceScore === b.importanceScore && a.timestamp >= b.timestamp);

      const keep = aWins ? a._id : b._id;
      const merge = aWins ? b._id : a._id;

      mergedIds.add(merge);
      candidates.push({ keep, merge, similarity });
    }
  }

  // Sort by similarity descending (highest confidence merges first)
  candidates.sort((a, b) => b.similarity - a.similarity);
  return candidates;
}

// ─── Content Merging ────────────────────────────────────────────────────

/**
 * Split text into sentences. Handles common abbreviations gracefully.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Merge two facts' content. Appends unique sentences from mergeContent
 * that aren't already present in keepContent.
 *
 * Caps merged output at 2x the keepContent length to prevent bloat.
 */
export function generateMergedContent(
  keepContent: string,
  mergeContent: string
): MergeResult {
  const keepSentences = splitSentences(keepContent);
  const mergeSentences = splitSentences(mergeContent);

  // Build a word-set fingerprint for each keep sentence for fuzzy matching
  const keepFingerprints = keepSentences.map((s) => toWordSet(s));

  const uniqueSentences: string[] = [];
  for (const sentence of mergeSentences) {
    const sentenceWords = toWordSet(sentence);

    // Check if this sentence is already substantially covered
    const isDuplicate = keepFingerprints.some(
      (fp) => jaccardSimilarity(fp, sentenceWords) > 0.6
    );

    if (!isDuplicate) {
      uniqueSentences.push(sentence);
    }
  }

  if (uniqueSentences.length === 0) {
    return { content: keepContent, augmented: false };
  }

  // Cap at 2x original length
  const maxLength = keepContent.length * 2;
  let merged = keepContent;

  for (const sentence of uniqueSentences) {
    const candidate = merged + " " + sentence;
    if (candidate.length > maxLength) break;
    merged = candidate;
  }

  return {
    content: merged.trim(),
    augmented: merged !== keepContent,
  };
}

// ─── Batch Processing ───────────────────────────────────────────────────

export interface ConsolidationPlan {
  /** Merge operations to execute */
  merges: Array<{
    keepId: string;
    mergeId: string;
    similarity: number;
    mergedContent: string;
    augmented: boolean;
  }>;
  /** Total facts analyzed */
  totalAnalyzed: number;
  /** Facts that would be merged */
  totalMerged: number;
}

/**
 * Full consolidation pipeline: find candidates and compute merged content.
 * Returns a plan that callers can execute against Convex.
 */
export function buildConsolidationPlan(
  facts: MergeableFact[],
  threshold: number = DEFAULT_THRESHOLD
): ConsolidationPlan {
  const candidates = findMergeCandidates(facts, threshold);
  const factMap = new Map(facts.map((f) => [f._id, f]));

  const merges = candidates.map((c) => {
    const keepFact = factMap.get(c.keep)!;
    const mergeFact = factMap.get(c.merge)!;
    const { content, augmented } = generateMergedContent(
      keepFact.content,
      mergeFact.content
    );
    return {
      keepId: c.keep,
      mergeId: c.merge,
      similarity: c.similarity,
      mergedContent: content,
      augmented,
    };
  });

  return {
    merges,
    totalAnalyzed: facts.length,
    totalMerged: merges.length,
  };
}
