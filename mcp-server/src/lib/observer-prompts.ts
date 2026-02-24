/**
 * Observer/Reflector prompt templates — adapted from Mastra's Observational Memory.
 *
 * These prompts drive the LLM compression pipeline:
 * - Observer: compresses raw observations into dense priority-tagged summaries
 * - Reflector: condenses accumulated summaries with escalating compression
 * - Assertion classifier: fast heuristic for assertion/question/neutral
 */

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

  return `You are the Observer in a memory compression pipeline. Your job is to compress raw observations into a dense, structured observation log.

## Rules
1. Use priority emojis: 🔴 critical, 🟡 notable, 🟢 background
2. Track state changes explicitly: "X changed from A to B"
3. Distinguish assertions (facts stated) from questions (uncertainties raised)
4. Preserve temporal ordering — most recent observations carry more weight
5. Never invent information not present in the observations
6. ${COMPRESSION_GUIDANCE[compressionLevel] ?? COMPRESSION_GUIDANCE[0]}

## Format
Output a single dense observation log. Each line should be:
<emoji> <category>: <compressed observation>

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
