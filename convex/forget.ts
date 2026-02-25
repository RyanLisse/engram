/**
 * Forget criteria helpers for ALMA active forgetting pipeline.
 *
 * These helpers keep forget selection logic centralized for cron usage.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FORGET_SCORE_THRESHOLD = 0.8;
const MAX_ACCESS_COUNT = 2;

function buildActiveEpisodeFactSet(episodes: Array<{ factIds: unknown[] }>) {
  const activeEpisodeFactIds = new Set<string>();
  for (const episode of episodes) {
    for (const factId of episode.factIds) {
      activeEpisodeFactIds.add(String(factId));
    }
  }
  return activeEpisodeFactIds;
}

export async function identifyForgetCandidates(
  ctx: any,
  options?: { now?: number; limit?: number },
) {
  const now = options?.now ?? Date.now();
  const limit = options?.limit ?? 500;

  const [facts, episodes] = await Promise.all([
    ctx.db
      .query("facts")
      .withIndex("by_lifecycle", (q: any) => q.eq("lifecycleState", "active"))
      .take(limit),
    ctx.db
      .query("episodes")
      .filter((q: any) => q.eq(q.field("endTime"), undefined))
      .take(200),
  ]);

  const activeEpisodeFactIds = buildActiveEpisodeFactSet(episodes);

  return facts.filter((fact: any) => {
    const forgetScore = fact.forgetScore ?? 0;
    const ageMs = now - fact.timestamp;
    const hasTemporalLinks = (fact.temporalLinks?.length ?? 0) > 0;
    const inActiveEpisode = activeEpisodeFactIds.has(String(fact._id));

    return (
      forgetScore > FORGET_SCORE_THRESHOLD &&
      fact.accessedCount < MAX_ACCESS_COUNT &&
      ageMs > THIRTY_DAYS_MS &&
      !hasTemporalLinks &&
      !inActiveEpisode
    );
  });
}

export async function identifySuperseded(
  ctx: any,
  options?: { limit?: number },
) {
  const limit = options?.limit ?? 500;

  const facts = await ctx.db
    .query("facts")
    .withIndex("by_lifecycle", (q: any) => q.eq("lifecycleState", "active"))
    .take(limit);

  return facts.filter((fact: any) => Boolean(fact.supersededBy));
}
