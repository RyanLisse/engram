/**
 * Observer/Reflector prompt templates — adapted from Mastra's Observational Memory.
 *
 * These prompts drive the LLM compression pipeline:
 * - Observer: compresses raw observations into dense priority-tagged summaries
 * - Reflector: condenses accumulated summaries with escalating compression
 * - Assertion classifier: fast heuristic for assertion/question/neutral
 *
 * NOTE: The Convex action at convex/actions/observer.ts has its own inline copy
 * of the observer prompt. Changes here must be manually synced there.
 */

/**
 * The 9 structured extraction categories for observer output.
 * Based on Mastra's observational memory research.
 */
export const OBSERVATION_CATEGORIES = {
  PREF:  "Preferences — user likes/dislikes, style preferences, tool preferences",
  PROJ:  "Projects — active work, codebases, repos, deployments",
  TECH:  "Technical — stack choices, configurations, versions, APIs",
  DEC:   "Decisions — choices made with rationale, trade-offs evaluated",
  REL:   "Relationships — people, teams, organizations, collaborators",
  EVENT: "Events — meetings, deadlines, milestones, releases",
  EMO:   "Emotions — frustration, excitement, concerns, morale",
  LEARN: "Learning — new concepts, corrections, insights, discoveries",
  STATE: "State Changes — X changed from A to B, migrations, updates",
} as const;

export type ObservationCategory = keyof typeof OBSERVATION_CATEGORIES | "OTHER";

interface ObserverPromptInput {
  observations: Array<{ content: string; timestamp: number; observationTier?: string }>;
  previousSummary?: string;
  compressionLevel: number; // 0-3
}

interface ReflectorPromptInput {
  summaries: Array<{ content: string; timestamp: number }>;
  compressionLevel: number; // 0-3
}

const COMPRESSION_GUIDANCE: Record<number, string> = {
  0: "Preserve all meaningful details. Use concise sentences. Target 60% compression ratio.",
  1: "Merge related observations. Drop redundant details. Target 40% of input length.",
  2: "Aggressive compression. Keep only state changes, decisions, and key insights. Target 25% of input length.",
  3: "Maximum density. Extract only the essential state snapshot. Target 15% of input length.",
};

/**
 * Build the Observer prompt that compresses raw observations into a dense log.
 *
 * Produces emoji-prioritized output:
 * - 🔴 Critical: incidents, failures, security events
 * - 🟡 Notable: decisions, risks, blockers
 * - 🟢 Background: routine observations, context
 */
export function buildObserverPrompt(input: ObserverPromptInput): string {
  const { observations, previousSummary, compressionLevel } = input;

  const obsBlock = observations
    .map((o, i) => {
      const date = new Date(o.timestamp).toISOString().slice(0, 19);
      const tier = o.observationTier ? ` [${o.observationTier}]` : "";
      return `[${i + 1}] ${date}${tier}: ${o.content}`;
    })
    .join("\n");

  const previousBlock = previousSummary
    ? `\n<previous_summary>\n${previousSummary}\n</previous_summary>\n`
    : "";

  const categoryBlock = Object.entries(OBSERVATION_CATEGORIES)
    .map(([code, desc]) => `- **${code}** — ${desc}`)
    .join("\n");

  return `You are the Observer in a memory compression pipeline. Your job is to compress raw observations into a dense, structured observation log.

## Rules
1. Use priority emojis: 🔴 critical, 🟡 notable, 🟢 background
2. Track state changes explicitly: "X changed from A to B"
3. Distinguish assertions (facts stated) from questions (uncertainties raised)
4. Preserve temporal ordering — most recent observations carry more weight
5. Never invent information not present in the observations
6. ${COMPRESSION_GUIDANCE[compressionLevel] ?? COMPRESSION_GUIDANCE[0]}

## Categories
Each observation MUST be tagged with one of these category codes:
${categoryBlock}
- **OTHER** — observations that don't fit any category above

## Format
Output a single dense observation log. Each line should be:
<emoji> [CATEGORY] <compressed observation>

Where CATEGORY is one of: PREF, PROJ, TECH, DEC, REL, EVENT, EMO, LEARN, STATE, OTHER.

Group related observations. Merge duplicates. Drop noise.
${previousBlock}
<observations>
${obsBlock}
</observations>

Produce the compressed observation log now. Output ONLY the log, no preamble.`;
}

/**
 * Build the Reflector prompt that condenses accumulated summaries.
 * Operates at a higher level than Observer — merges summary-level content.
 */
export function buildReflectorPrompt(input: ReflectorPromptInput): string {
  const { summaries, compressionLevel } = input;

  const summaryBlock = summaries
    .map((s, i) => {
      const date = new Date(s.timestamp).toISOString().slice(0, 19);
      return `[Summary ${i + 1}] ${date}:\n${s.content}`;
    })
    .join("\n\n");

  return `You are the Reflector in a memory compression pipeline. You receive observation summaries (already compressed once) and must produce an even denser digest.

## Rules
1. Maintain priority emojis: 🔴 critical, 🟡 notable, 🟢 background
2. Merge themes across summaries — combine related items
3. Resolve contradictions: newer observations supersede older ones
4. Track cumulative state: "As of latest, X is Y"
5. Drop observations that are no longer relevant given newer context
6. ${COMPRESSION_GUIDANCE[compressionLevel] ?? COMPRESSION_GUIDANCE[2]}

## Format
Output a single observation digest. This is the agent's compressed memory of all observations to date.
Use the same emoji format. Group by theme rather than chronology.

<summaries>
${summaryBlock}
</summaries>

Produce the compressed observation digest now. Output ONLY the digest, no preamble.`;
}

/**
 * Fast heuristic classifier for assertion/question/neutral.
 * No LLM needed — regex-based.
 */
export function classifyAssertion(content: string): "assertion" | "question" | "neutral" {
  const trimmed = content.trim();
  // Questions end with ? or start with interrogative words
  if (trimmed.endsWith("?")) return "question";
  if (/^(what|when|where|why|how|who|which|is|are|was|were|do|does|did|can|could|should|would)\b/i.test(trimmed)) {
    return "question";
  }
  // Assertions use decision verbs or state changes
  if (/\b(decided|chose|selected|changed|switched|updated|set|configured|deployed|released|fixed|resolved|confirmed|approved|rejected)\b/i.test(trimmed)) {
    return "assertion";
  }
  return "neutral";
}

/**
 * Extract state change patterns from observation content.
 * Returns array of { from, to, subject } objects.
 */
export function extractStateChanges(content: string): Array<{ subject: string; from: string; to: string }> {
  const patterns = [
    /(\w[\w\s]*?)\s+changed\s+from\s+["']?(.+?)["']?\s+to\s+["']?(.+?)["']?(?:\.|$)/gi,
    /switched\s+(\w[\w\s]*?)\s+from\s+["']?(.+?)["']?\s+to\s+["']?(.+?)["']?(?:\.|$)/gi,
    /updated\s+(\w[\w\s]*?)\s+from\s+["']?(.+?)["']?\s+to\s+["']?(.+?)["']?(?:\.|$)/gi,
  ];

  const changes: Array<{ subject: string; from: string; to: string }> = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      changes.push({
        subject: match[1].trim(),
        from: match[2].trim(),
        to: match[3].trim(),
      });
    }
  }
  return changes;
}

/**
 * Sanitize observation content before storage.
 * - Strip XML-like tags that could cause prompt injection
 * - Normalize consecutive whitespace
 * - Cap line length at 500 chars
 * - Trim leading/trailing whitespace
 */
export function sanitizeObservation(content: string): string {
  const XML_TAG_RE = /<\/?[a-zA-Z][\w-]*(?:\s[^>]*)?\s*>/g;

  // Split on triple-backtick fences to preserve code blocks
  const parts = content.split(/(```[\s\S]*?```)/);

  const sanitized = parts
    .map((part, i) => {
      // Odd indices are code blocks (captured groups) — leave them alone
      if (i % 2 === 1) return part;

      // Strip XML-like tags from non-code parts
      return part.replace(XML_TAG_RE, "");
    })
    .join("");

  return (
    sanitized
      // Normalize consecutive spaces/tabs (not newlines) to single space
      .replace(/[ \t]+/g, " ")
      // Normalize 3+ consecutive newlines to 2
      .replace(/\n{3,}/g, "\n\n")
      // Cap each line at 500 characters
      .split("\n")
      .map((line) => (line.length > 500 ? line.slice(0, 497) + "..." : line))
      .join("\n")
      .trim()
  );
}

/**
 * Compute a lightweight content fingerprint for an observation window.
 * Uses DJB2 hash of sorted, normalized content strings (timestamp-independent).
 * Returns hex string.
 */
export function computeObservationFingerprint(
  observations: Array<{ content: string; observationTier?: string }>
): string {
  const normalized = observations
    .map(o => `${o.observationTier ?? ""}:${o.content.trim()}`)
    .sort()
    .join("\n");

  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Detect degenerate repetition in an observation window.
 * Uses sliding window approach: extract overlapping windows from
 * concatenated observations and check for duplicate content.
 *
 * Returns { degenerate: boolean, overlapRatio: number, matchedWindows: number, totalWindows: number }
 */
export function detectDegenerateRepetition(
  observations: Array<{ content: string }>,
  previousSummary?: string,
  windowSize: number = 200,
  threshold: number = 0.4,
): { degenerate: boolean; overlapRatio: number; matchedWindows: number; totalWindows: number } {
  if (observations.length === 0) {
    return { degenerate: false, overlapRatio: 0, matchedWindows: 0, totalWindows: 0 };
  }

  const concatenated = observations.map(o => o.content).join("\n");

  // Not enough content to form even one window — not degenerate
  if (concatenated.length < windowSize) {
    return { degenerate: false, overlapRatio: 0, matchedWindows: 0, totalWindows: 0 };
  }

  let reference: string;
  let candidate: string;

  if (previousSummary) {
    // Compare current observations against the previous summary
    reference = previousSummary;
    candidate = concatenated;
  } else {
    // Split observations: first half as reference, second half as candidate
    const midpoint = Math.floor(concatenated.length / 2);
    reference = concatenated.slice(0, midpoint);
    candidate = concatenated.slice(midpoint);
  }

  // Extract sliding windows from candidate with 50% overlap (step = windowSize / 2)
  const step = Math.max(1, Math.floor(windowSize / 2));
  const windows: string[] = [];
  for (let i = 0; i <= candidate.length - windowSize; i += step) {
    windows.push(candidate.slice(i, i + windowSize));
  }

  if (windows.length === 0) {
    return { degenerate: false, overlapRatio: 0, matchedWindows: 0, totalWindows: 0 };
  }

  // Count how many candidate windows appear as exact substrings in the reference
  let matchedWindows = 0;
  for (const window of windows) {
    if (reference.includes(window)) {
      matchedWindows++;
    }
  }

  const overlapRatio = matchedWindows / windows.length;

  return {
    degenerate: overlapRatio > threshold,
    overlapRatio,
    matchedWindows,
    totalWindows: windows.length,
  };
}
