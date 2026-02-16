#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Golden Principles Validator
 *
 * Scans Engram codebase for violations of golden principles.
 * Returns quality grade (A-F) per file + list of violations.
 *
 * Usage:
 *   npx tsx scripts/validate-golden-principles.ts
 *   npx tsx scripts/validate-golden-principles.ts --fix  # Auto-fix violations
 *   npx tsx scripts/validate-golden-principles.ts --json # JSON output
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();

// Canonical validator mapping (keep in sync with GOLDEN_PRINCIPLES.md)
// GP-002: Type-safe Convex paths
// GP-003: Tool file legibility limits
// GP-004: No stdout logging in MCP server
// GP-005: Structured stderr logging
// GP-007: Remove debug/TODO cron logs
// GP-008: AGENTS.md size constraint
// GP-009: Required docs exist
// GP-010: Required pattern docs exist
// GP-011: Tool parameter limits
// GP-013: Compact JSON responses (no pretty-print)

// ─── Types ───────────────────────────────────────────────────────────────────

interface Violation {
  principle: string;
  severity: "critical" | "high" | "medium" | "low";
  file: string;
  line?: number;
  message: string;
  fix?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function walkTs(dir: string, ignore: string[] = []): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      const rel = relative(ROOT, full);
      if (ignore.some((i) => rel.includes(i))) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) out.push(rel);
    }
  }
  walk(abs);
  return out;
}

function readLines(relPath: string): string[] {
  try {
    return readFileSync(join(ROOT, relPath), "utf-8").split("\n");
  } catch {
    return [];
  }
}

// ─── Validators ──────────────────────────────────────────────────────────────

function checkStdoutLogging(): Violation[] {
  const violations: Violation[] = [];
  // GP-004: MCP server must not write to stdout (breaks stdio transport)
  for (const file of walkTs("mcp-server/src")) {
    const lines = readLines(file);
    lines.forEach((line, idx) => {
      if (line.includes("console.log") && !line.trim().startsWith("//")) {
        violations.push({
          principle: "GP-004",
          severity: "critical",
          file,
          line: idx + 1,
          message: "MCP server must not write to stdout (breaks stdio transport)",
          fix: "Replace console.log with console.error",
        });
      }
    });
  }
  return violations;
}

function checkPrettyPrintJson(): Violation[] {
  const violations: Violation[] = [];
  // GP-013: JSON responses must be compact (no pretty-print)
  for (const file of walkTs("mcp-server/src")) {
    const lines = readLines(file);
    lines.forEach((line, idx) => {
      if (line.match(/JSON\.stringify\([^)]+,\s*null\s*,\s*2\s*\)/) && !line.trim().startsWith("//")) {
        violations.push({
          principle: "GP-013",
          severity: "high",
          file,
          line: idx + 1,
          message: "Pretty-printed JSON wastes ~30% tokens in MCP responses",
          fix: "Use JSON.stringify(data) without formatting args",
        });
      }
    });
  }
  return violations;
}

function checkToolFileSize(): Violation[] {
  const violations: Violation[] = [];
  // GP-003: Tool files should stay under 200 lines (multi-handler primitives are expected)
  for (const file of walkTs("mcp-server/src/tools")) {
    const lines = readLines(file);
    if (lines.length > 200) {
      violations.push({
        principle: "GP-003",
        severity: "medium",
        file,
        message: `Tool file is ${lines.length} lines (guideline: ≤200). Consider splitting.`,
      });
    }
  }
  return violations;
}

function checkStructuredLogging(): Violation[] {
  const violations: Violation[] = [];
  // GP-005: All console.error logs in MCP server should use [component] prefix
  for (const file of walkTs("mcp-server/src")) {
    const lines = readLines(file);
    lines.forEach((line, idx) => {
      const m = line.match(/console\.error\(\s*[`'"]((?!\[)[^`'"]*)[`'"]/);
      if (m && !line.trim().startsWith("//")) {
        violations.push({
          principle: "GP-005",
          severity: "medium",
          file,
          line: idx + 1,
          message: `Log missing [component] prefix: "${m[1].slice(0, 40)}..."`,
          fix: "Add [component] prefix for structured grep-ability",
        });
      }
    });
  }
  return violations;
}

function checkConvexStringPaths(): Violation[] {
  const violations: Violation[] = [];
  // GP-002: All Convex function paths should use PATHS constants
  for (const file of walkTs("mcp-server/src/lib", ["convex-paths.ts"])) {
    const lines = readLines(file);
    lines.forEach((line, idx) => {
      // Match string literals like "functions/facts:storeFact"
      const m = line.match(/["'](functions\/[a-zA-Z]+:[a-zA-Z]+)["']/);
      if (m && !line.trim().startsWith("//") && !line.includes("PATHS")) {
        violations.push({
          principle: "GP-002",
          severity: "high",
          file,
          line: idx + 1,
          message: `String literal Convex path: "${m[1]}"`,
          fix: "Use type-safe constant from convex-paths.ts",
        });
      }
    });
  }
  return violations;
}

function checkConvexConsoleLog(): Violation[] {
  const violations: Violation[] = [];
  // In Convex, console.log is fine for runtime but let's check for accidental debug logs
  // that should have been removed
  for (const file of walkTs("convex/crons")) {
    const lines = readLines(file);
    let hasDebugLog = false;
    lines.forEach((line) => {
      if (line.match(/console\.log\(.*debug/i) || line.match(/console\.log\(.*TODO/i)) {
        hasDebugLog = true;
      }
    });
    if (hasDebugLog) {
      violations.push({
        principle: "GP-007",
        severity: "low",
        file,
        message: "Debug/TODO console.log found in cron — remove before production",
      });
    }
  }
  return violations;
}

function checkDocumentation(): Violation[] {
  const violations: Violation[] = [];

  // GP-008: AGENTS.md must be under 150 lines (it's a map, not a manual)
  const agentsLines = readLines("AGENTS.md");
  if (agentsLines.length > 150) {
    violations.push({
      principle: "GP-008",
      severity: "medium",
      file: "AGENTS.md",
      message: `AGENTS.md is ${agentsLines.length} lines (max: 150). Keep it a lean navigation map.`,
    });
  }

  // GP-009: Required documentation files must exist
  const requiredDocs = [
    "docs/GOLDEN-PRINCIPLES.md",
    "AGENTS.md",
    "CLAUDE.md",
    "CRONS.md",
    "docs/API-REFERENCE.md",
  ];
  for (const doc of requiredDocs) {
    if (!existsSync(join(ROOT, doc))) {
      violations.push({
        principle: "GP-009",
        severity: "high",
        file: doc,
        message: `Required documentation file missing: ${doc}`,
      });
    }
  }

  // GP-010: Pattern docs should exist
  const requiredPatterns = [
    "docs/patterns/async-enrichment.md",
    "docs/patterns/scope-resolution.md",
    "docs/patterns/event-driven-hooks.md",
    "docs/patterns/depth-first-decomposition.md",
    "docs/patterns/task-templates.md",
  ];
  for (const pat of requiredPatterns) {
    if (!existsSync(join(ROOT, pat))) {
      violations.push({
        principle: "GP-010",
        severity: "low",
        file: pat,
        message: `Pattern doc missing: ${pat}`,
      });
    }
  }

  return violations;
}

function checkToolParameters(): Violation[] {
  const violations: Violation[] = [];
  const registryPath = "mcp-server/src/lib/tool-registry.ts";
  if (!existsSync(join(ROOT, registryPath))) return violations;
  const content = readFileSync(join(ROOT, registryPath), "utf-8");

  // Find tool definitions with their parameter counts
  const toolBlocks = content.split(/\n  \{[\s\n]*tool: \{/);
  for (let i = 1; i < toolBlocks.length; i++) {
    const block = toolBlocks[i];
    const nameMatch = block.match(/name:\s*["']([^"']+)["']/);
    if (!nameMatch) continue;
    const toolName = nameMatch[1];

    // Count only top-level properties by tracking brace depth
    const propsIdx = block.indexOf("properties: {");
    if (propsIdx === -1) continue;

    let depth = 0;
    let paramCount = 0;
    let started = false;
    const sub = block.slice(propsIdx + "properties: ".length);
    for (let ci = 0; ci < sub.length; ci++) {
      if (sub[ci] === "{") {
        depth++;
        if (depth === 1) started = true;
        if (depth === 2) paramCount++; // each top-level prop opens a { at depth 2
      } else if (sub[ci] === "}") {
        depth--;
        if (depth === 0 && started) break; // closed the properties object
      }
    }

    // Count required params
    const reqMatch = block.match(/required:\s*\[([^\]]*)\]/);
    const requiredCount = reqMatch ? (reqMatch[1].match(/["'][^"']+["']/g)?.length ?? 0) : 0;

    if (paramCount > 7) {
      violations.push({
        principle: "GP-011",
        severity: "high",
        file: registryPath,
        message: `${toolName}: ${paramCount} params (target: ≤7). Consider splitting.`,
      });
    }

    if (requiredCount > 3) {
      violations.push({
        principle: "GP-011",
        severity: "medium",
        file: registryPath,
        message: `${toolName}: ${requiredCount} required params. Agents prefer optional defaults.`,
      });
    }
  }

  return violations;
}

// ─── Grading ─────────────────────────────────────────────────────────────────

function grade(violations: Violation[]): string {
  const c = violations.filter((v) => v.severity === "critical").length;
  const h = violations.filter((v) => v.severity === "high").length;
  const m = violations.filter((v) => v.severity === "medium").length;
  const l = violations.filter((v) => v.severity === "low").length;

  const score = 100 - c * 20 - h * 5 - m * 2 - l * 0.5;
  if (score >= 95) return "A";
  if (score >= 90) return "A-";
  if (score >= 85) return "B+";
  if (score >= 80) return "B";
  if (score >= 75) return "B-";
  if (score >= 70) return "C+";
  if (score >= 65) return "C";
  if (score >= 55) return "D";
  return "F";
}

// ─── Main ────────────────────────────────────────────────────────────────────

const startMs = Date.now();
const allViolations: Violation[] = [
  ...checkStdoutLogging(),
  ...checkPrettyPrintJson(),
  ...checkToolFileSize(),
  ...checkStructuredLogging(),
  ...checkConvexStringPaths(),
  ...checkConvexConsoleLog(),
  ...checkDocumentation(),
  ...checkToolParameters(),
];

const summary = {
  critical: allViolations.filter((v) => v.severity === "critical").length,
  high: allViolations.filter((v) => v.severity === "high").length,
  medium: allViolations.filter((v) => v.severity === "medium").length,
  low: allViolations.filter((v) => v.severity === "low").length,
  total: allViolations.length,
  filesAffected: new Set(allViolations.map((v) => v.file)).size,
  totalFiles: walkTs("mcp-server/src").length + walkTs("convex").length,
};
const overallGrade = grade(allViolations);
const durationMs = Date.now() - startMs;

// ─── Output ──────────────────────────────────────────────────────────────────

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ grade: overallGrade, summary, violations: allViolations, durationMs }, null, 2));
} else {
  const out = console.log;
  out("=" .repeat(70));
  out("ENGRAM GOLDEN PRINCIPLES VALIDATION");
  out("=" .repeat(70));
  out(`Date:     ${new Date().toISOString()}`);
  out(`Grade:    ${overallGrade}`);
  out(`Duration: ${durationMs}ms`);
  out("");
  out("Summary:");
  out(`  Critical: ${summary.critical}`);
  out(`  High:     ${summary.high}`);
  out(`  Medium:   ${summary.medium}`);
  out(`  Low:      ${summary.low}`);
  out(`  Total:    ${summary.total} violations across ${summary.filesAffected} files`);
  out("");

  if (allViolations.length === 0) {
    out("No violations found!");
  } else {
    // Group by principle
    const byPrinciple: Record<string, Violation[]> = {};
    for (const v of allViolations) {
      (byPrinciple[v.principle] ??= []).push(v);
    }

    for (const [principle, violations] of Object.entries(byPrinciple).sort()) {
      out("-".repeat(70));
      out(`${principle}: ${violations.length} violation(s)`);
      out("-".repeat(70));
      for (const v of violations) {
        const loc = v.line ? `${v.file}:${v.line}` : v.file;
        out(`  [${v.severity.toUpperCase()}] ${loc}`);
        out(`    ${v.message}`);
        if (v.fix) out(`    Fix: ${v.fix}`);
      }
      out("");
    }
  }
  out("=" .repeat(70));
}

process.exit(summary.critical > 0 ? 2 : summary.total > 0 ? 1 : 0);
