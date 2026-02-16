#!/usr/bin/env tsx
// @ts-nocheck
import { execSync } from "child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

type Severity = "critical" | "high" | "medium" | "low";

type ValidationReport = {
  grade: string;
  summary: Record<Severity | "total" | "filesAffected" | "totalFiles", number>;
  violations: Array<{ principle: string; severity: Severity; file: string; message: string }>;
  durationMs: number;
};

const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, "docs");
mkdirSync(DOCS_DIR, { recursive: true });

function runValidationJson(): string {
  try {
    return execSync("npx tsx scripts/validate-golden-principles.ts --json", {
      cwd: ROOT,
      encoding: "utf8",
    });
  } catch (error: any) {
    // Validator exits 1 when non-critical violations exist; still parse stdout JSON.
    if (error?.stdout) return String(error.stdout);
    throw error;
  }
}

// Parse validation output with robust JSON boundary detection
function parseValidationReport(): ValidationReport {
  const rawOutput = runValidationJson().trim();

  // Find JSON object boundaries (first '{' to matching '}')
  const jsonStart = rawOutput.indexOf('{');
  if (jsonStart === -1) {
    throw new Error(
      `No JSON object found in validation output. Output:\n${rawOutput.slice(0, 200)}`
    );
  }

  // Extract from first '{' to end, then try to parse
  const jsonCandidate = rawOutput.slice(jsonStart);

  try {
    const parsed = JSON.parse(jsonCandidate) as ValidationReport;

    // Validate required fields
    if (!parsed.grade || !parsed.summary || !Array.isArray(parsed.violations)) {
      throw new Error(
        `Invalid ValidationReport structure: missing required fields (grade, summary, or violations)`
      );
    }

    return parsed;
  } catch (parseError: any) {
    // Try to find the last complete JSON object if parsing failed
    let lastValidJson = -1;
    let braceCount = 0;

    for (let i = jsonStart; i < rawOutput.length; i++) {
      if (rawOutput[i] === '{') braceCount++;
      if (rawOutput[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          lastValidJson = i + 1;
          break;
        }
      }
    }

    if (lastValidJson > jsonStart) {
      try {
        const trimmedJson = rawOutput.slice(jsonStart, lastValidJson);
        const parsed = JSON.parse(trimmedJson) as ValidationReport;

        if (!parsed.grade || !parsed.summary || !Array.isArray(parsed.violations)) {
          throw new Error(
            `Invalid ValidationReport structure: missing required fields (grade, summary, or violations)`
          );
        }

        return parsed;
      } catch (retryError: any) {
        throw new Error(
          `Failed to parse validation output as JSON.\nOriginal error: ${parseError.message}\nRetry error: ${retryError.message}\nOutput preview:\n${rawOutput.slice(0, 500)}`
        );
      }
    }

    throw new Error(
      `Failed to parse validation output as JSON: ${parseError.message}\nOutput preview:\n${rawOutput.slice(0, 500)}`
    );
  }
}

const report = parseValidationReport();

const today = new Date();
const date = today.toISOString().split("T")[0];
const weeklyReportPath = join(DOCS_DIR, `QUALITY-REPORT-${date}.md`);
const dashboardPath = join(DOCS_DIR, "QUALITY-DASHBOARD.md");

const grouped = report.violations.reduce<Record<string, number>>((acc, v) => {
  acc[v.principle] = (acc[v.principle] ?? 0) + 1;
  return acc;
}, {});

const topViolations = Object.entries(grouped)
  .sort((a, b) => b[1] - a[1])
  .map(([principle, count]) => `- ${principle}: ${count}`)
  .join("\n");

const weeklyMd = `# Engram Code Quality Report\n\n**Generated**: ${today.toISOString()}\n**Overall Grade**: ${report.grade}\n**Files Checked**: ${report.summary.totalFiles}\n\n## Summary\n\n- Critical: ${report.summary.critical}\n- High: ${report.summary.high}\n- Medium: ${report.summary.medium}\n- Low: ${report.summary.low}\n- Total violations: ${report.summary.total}\n\n## Top Violations\n\n${topViolations || "- None"}\n`;

writeFileSync(weeklyReportPath, weeklyMd, "utf8");

const reportFiles = readdirSync(DOCS_DIR)
  .filter((f: string) => /^QUALITY-REPORT-\d{4}-\d{2}-\d{2}\.md$/.test(f))
  .sort()
  .reverse()
  .slice(0, 8);

const recent = reportFiles
  .map((f: string) => {
    const content = readFileSync(join(DOCS_DIR, f), "utf8");
    const g = content.match(/\*\*Overall Grade\*\*: (.+)/)?.[1] ?? "unknown";
    return `- ${f.replace("QUALITY-REPORT-", "").replace(".md", "")}: ${g}`;
  })
  .join("\n");

const dashboardMd = `# Engram Quality Dashboard\n\n**Last Updated**: ${today.toISOString()}\n**Current Grade**: ${report.grade}\n\n## Current Snapshot\n\n| Severity | Count |\n|---|---:|\n| Critical | ${report.summary.critical} |\n| High | ${report.summary.high} |\n| Medium | ${report.summary.medium} |\n| Low | ${report.summary.low} |\n| Total | ${report.summary.total} |\n\n## Recent Trend\n\n${recent || "- No reports yet"}\n\n## References\n\n- \`scripts/validate-golden-principles.ts\`\n- \`scripts/generate-quality-report.ts\`\n`;

writeFileSync(dashboardPath, dashboardMd, "utf8");
console.log(JSON.stringify({ weeklyReportPath, dashboardPath, grade: report.grade }));
