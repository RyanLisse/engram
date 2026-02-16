#!/usr/bin/env tsx
// @ts-nocheck
import { readFileSync } from "fs";
import { join } from "path";

const gradeScore: Record<string, number> = {
  A: 9,
  "A-": 8,
  "B+": 7,
  B: 6,
  "B-": 5,
  "C+": 4,
  C: 3,
  D: 2,
  F: 1,
};

const ROOT = process.cwd();
const dashboardPath = join(ROOT, "docs", "QUALITY-DASHBOARD.md");
const baselinePath = join(ROOT, "docs", "QUALITY-BASELINE.json");

const dashboard = readFileSync(dashboardPath, "utf8");
const currentGrade = dashboard.match(/\*\*Current Grade\*\*: (.+)/)?.[1]?.trim() ?? "F";

let baselineGrade = "B+";
try {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as { grade?: string };
  baselineGrade = baseline.grade ?? baselineGrade;
} catch {
  // default baseline
}

const currentScore = gradeScore[currentGrade] ?? 0;
const baselineScore = gradeScore[baselineGrade] ?? 0;

if (currentScore < baselineScore) {
  console.error(
    `[quality-regression] Grade regressed: ${currentGrade} < ${baselineGrade}. Update code quality or baseline.`
  );
  process.exit(1);
}

console.log(
  JSON.stringify({ ok: true, currentGrade, baselineGrade, message: "No quality regression detected" })
);
