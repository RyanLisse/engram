/**
 * Active Forgetting Criteria (ALMA)
 *
 * Pure functions that evaluate whether a fact should be forgotten, archived,
 * or compressed. Used by both the forget-pipeline cron and the memory_forget tool.
 *
 * Design: All criteria are pure predicates — no side effects, no DB calls.
 * The caller provides the fact record and any context needed for evaluation.
 */

export interface FactForForgetEval {
  forgetScore?: number;
  accessedCount: number;
  timestamp: number;
  temporalLinks?: Array<{ targetFactId: string; relation: string; confidence: number }>;
  lifecycleState: string;
  supersededBy?: string;
  confidence?: number;
  observationTier?: string;
  updatedAt?: number;
}

export interface ForgetDecision {
  shouldForget: boolean;
  reason: string;
}

// ── Constants ─────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FORGET_SCORE_THRESHOLD = 0.8;
const MIN_ACCESS_COUNT = 2;

// ── Active episode membership check ───────────────────

/**
 * Check whether a fact is part of an active episode.
 * The caller provides the list of active episode factId sets.
 */
export function isInActiveEpisode(
  factId: string,
  activeEpisodeFactIds: Set<string>,
): boolean {
  return activeEpisodeFactIds.has(factId);
}

// ── Core criteria ─────────────────────────────────────

/**
 * Should this fact be forgotten (archived)?
 *
 * Criteria (ALL must be true):
 * - forgetScore > 0.8
 * - accessedCount < 2
 * - age > 30 days
 * - no temporal links
 * - not in any active episode
 */
export function shouldForget(
  fact: FactForForgetEval,
  activeEpisodeFactIds: Set<string>,
  factId: string,
): ForgetDecision {
  if (fact.lifecycleState !== "active") {
    return { shouldForget: false, reason: "not active" };
  }

  const now = Date.now();
  const ageMs = now - fact.timestamp;

  if ((fact.forgetScore ?? 0) <= FORGET_SCORE_THRESHOLD) {
    return { shouldForget: false, reason: `forgetScore ${fact.forgetScore ?? 0} <= ${FORGET_SCORE_THRESHOLD}` };
  }

  if (fact.accessedCount >= MIN_ACCESS_COUNT) {
    return { shouldForget: false, reason: `accessedCount ${fact.accessedCount} >= ${MIN_ACCESS_COUNT}` };
  }

  if (ageMs < THIRTY_DAYS_MS) {
    return { shouldForget: false, reason: "younger than 30 days" };
  }

  if (fact.temporalLinks && fact.temporalLinks.length > 0) {
    return { shouldForget: false, reason: "has temporal links" };
  }

  if (isInActiveEpisode(factId, activeEpisodeFactIds)) {
    return { shouldForget: false, reason: "in active episode" };
  }

  return { shouldForget: true, reason: "high forgetScore, low access, old, no links, no active episode" };
}

/**
 * Should this fact be archived because it's been superseded?
 *
 * Criteria:
 * - supersededBy is set (a newer fact replaced this one)
 * - The newer fact has higher confidence (caller provides this)
 */
export function shouldArchiveSuperseded(
  fact: FactForForgetEval,
  newerFactConfidence?: number,
): ForgetDecision {
  if (fact.lifecycleState !== "active") {
    return { shouldForget: false, reason: "not active" };
  }

  if (!fact.supersededBy) {
    return { shouldForget: false, reason: "not superseded" };
  }

  const factConfidence = fact.confidence ?? 0.5;
  const newerConfidence = newerFactConfidence ?? 0.5;

  if (newerConfidence > factConfidence) {
    return { shouldForget: true, reason: `superseded by fact with higher confidence (${newerConfidence} > ${factConfidence})` };
  }

  return { shouldForget: false, reason: `superseding fact confidence not higher (${newerConfidence} <= ${factConfidence})` };
}

/**
 * Should this background observation be compressed?
 *
 * Criteria:
 * - observationTier === "background"
 * - Never accessed (accessedCount === 0) in 7 days
 */
export function shouldCompressBackground(fact: FactForForgetEval): ForgetDecision {
  if (fact.lifecycleState !== "active") {
    return { shouldForget: false, reason: "not active" };
  }

  if (fact.observationTier !== "background") {
    return { shouldForget: false, reason: "not background tier" };
  }

  if (fact.accessedCount > 0) {
    return { shouldForget: false, reason: `accessed ${fact.accessedCount} times` };
  }

  const now = Date.now();
  const ageMs = now - fact.timestamp;

  if (ageMs < SEVEN_DAYS_MS) {
    return { shouldForget: false, reason: "younger than 7 days" };
  }

  return { shouldForget: true, reason: "background observation, never accessed, older than 7 days" };
}
