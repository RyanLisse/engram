#!/usr/bin/env tsx
// @ts-nocheck
import { ConvexHttpClient } from "convex/browser";

type Metrics = {
  startTime: number;
  endTime: number;
  linesChanged?: number;
  testsAdded?: number;
  violations?: string[];
  qualityGradeBefore?: string;
  qualityGradeAfter?: string;
  templateUsed?: string;
  patternsFollowed?: string[];
  patternsViolated?: string[];
  mergedAt?: number;
  reviewTime?: number;
  rollbackRequired?: boolean;
  wasHelpful?: boolean;
  reusedCount?: number;
};

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const url = process.env.CONVEX_URL;
  if (!url) throw new Error("CONVEX_URL is required");

  const agentId = getArg("--agent-id") ?? process.env.ENGRAM_AGENT_ID ?? "unknown";
  const taskType = getArg("--task-type") ?? "unknown";
  const success = (getArg("--success") ?? "true") === "true";
  const metricsRaw = getArg("--metrics") ?? "{}";
  const metrics = JSON.parse(metricsRaw) as Metrics;

  const client = new ConvexHttpClient(url);
  await client.mutation("functions/performance:record" as any, {
    agentId,
    taskType,
    startTime: metrics.startTime ?? Date.now(),
    endTime: metrics.endTime ?? Date.now(),
    success,
    linesChanged: metrics.linesChanged ?? 0,
    testsAdded: metrics.testsAdded ?? 0,
    violations: metrics.violations ?? [],
    qualityGradeBefore: metrics.qualityGradeBefore ?? "unknown",
    qualityGradeAfter: metrics.qualityGradeAfter ?? "unknown",
    templateUsed: metrics.templateUsed,
    patternsFollowed: metrics.patternsFollowed ?? [],
    patternsViolated: metrics.patternsViolated ?? [],
    mergedAt: metrics.mergedAt,
    reviewTime: metrics.reviewTime,
    rollbackRequired: metrics.rollbackRequired ?? false,
    wasHelpful: metrics.wasHelpful,
    reusedCount: metrics.reusedCount ?? 0,
  });

  console.log(JSON.stringify({ ok: true, agentId, taskType }));
}

main().catch((error) => {
  console.error(`[track-agent-performance] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
