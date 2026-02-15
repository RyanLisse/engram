#!/usr/bin/env tsx
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

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function findTsFiles(dir: string, pattern?: RegExp, ignore?: string[]): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignore?.some(i => fullPath.includes(i))) {
          files.push(...findTsFiles(fullPath, pattern, ignore));
        }
      } else if (entry.name.endsWith('.ts')) {
        if (!pattern || pattern.test(fullPath)) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return files;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Violation {
  principle: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line?: number;
  message: string;
  fix?: string;
}

interface ValidationResult {
  violations: Violation[];
  grade: string;
  summary: {
    totalFiles: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GP-004: Check for console.log in MCP server
 */
async function checkStdoutLogging(): Promise<Violation[]> {
  const violations: Violation[] = [];

  try {
    const files = findTsFiles('mcp-server/src');

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        if (line.includes('console.log') && !line.trim().startsWith('//')) {
          violations.push({
            principle: 'GP-004',
            severity: 'critical',
            file,
            line: idx + 1,
            message: 'MCP server must not write to stdout',
            fix: 'Replace console.log with console.error'
          });
        }
      });
    }
  } catch (err) {
    console.error('[validate] Error checking stdout logging:', err);
  }

  return violations;
}

/**
 * GP-003: Check for oversized tools (>100 lines)
 */
async function checkToolSize(): Promise<Violation[]> {
  const violations: Violation[] = [];

  try {
    const allFiles = findTsFiles('mcp-server/src/tools', undefined, ['__tests__']);
    const files = allFiles.filter(f => !f.endsWith('index.ts'));

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n').length;

      if (lines > 100) {
        violations.push({
          principle: 'GP-003',
          severity: 'high',
          file,
          message: `Tool file is ${lines} lines (exceeds 100-line guideline). Consider splitting into atomic primitives.`
        });
      }
    }
  } catch (err) {
    console.error('[validate] Error checking tool size:', err);
  }

  return violations;
}

/**
 * GP-005: Check for unstructured logging
 */
async function checkStructuredLogging(): Promise<Violation[]> {
  const violations: Violation[] = [];

  try {
    const files = findTsFiles('mcp-server/src');

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        // Check for console.error without [component] prefix
        const errorMatch = line.match(/console\.error\(['"`]([^'"`]+)['"`]/);
        if (errorMatch && !errorMatch[1].startsWith('[')) {
          violations.push({
            principle: 'GP-005',
            severity: 'medium',
            file,
            line: idx + 1,
            message: 'Log message missing [component] prefix',
            fix: `Add component prefix: console.error('[component] ${errorMatch[1]}')`
          });
        }
      });
    }
  } catch (err) {
    console.error('[validate] Error checking structured logging:', err);
  }

  return violations;
}

/**
 * GP-002: Check for string literal Convex paths
 */
async function checkConvexPaths(): Promise<Violation[]> {
  const violations: Violation[] = [];

  try {
    const files = findTsFiles('mcp-server/src').filter(
      f => !f.endsWith('convex-paths.ts')
    );

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        // Check for string literal API paths
        const apiMatch = line.match(/['"](api\.[a-zA-Z.]+)['"]/);
        if (apiMatch && !line.includes('PATHS')) {
          violations.push({
            principle: 'GP-002',
            severity: 'high',
            file,
            line: idx + 1,
            message: `String literal Convex path: ${apiMatch[1]}`,
            fix: 'Use type-safe constant from convex-paths.ts'
          });
        }
      });
    }
  } catch (err) {
    console.error('[validate] Error checking Convex paths:', err);
  }

  return violations;
}

/**
 * GP-011: Check for missing tests
 */
async function checkTestCoverage(): Promise<Violation[]> {
  const violations: Violation[] = [];

  try {
    // Extract tool names from tool-registry.ts
    const registryPath = 'mcp-server/src/lib/tool-registry.ts';
    const registryContent = readFileSync(registryPath, 'utf-8');
    const toolMatches = registryContent.match(/name:\s*["']memory_([a-z_]+)["']/g);

    if (!toolMatches) {
      console.error('[validate] Could not extract tool names from registry');
      return violations;
    }

    const tools = toolMatches.map(m => m.match(/["']memory_([a-z_]+)["']/)?.[1]).filter(Boolean);

    for (const tool of tools) {
      const testFile = `mcp-server/src/tools/__tests__/${tool}.test.ts`;
      try {
        readFileSync(testFile);
      } catch {
        violations.push({
          principle: 'GP-011',
          severity: 'high',
          file: `mcp-server/src/tools/${tool}.ts`,
          message: `Missing test file: ${testFile}`,
          fix: 'Create unit test using template'
        });
      }
    }
  } catch (err) {
    console.error('[validate] Error checking test coverage:', err);
  }

  return violations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Grading System
// ─────────────────────────────────────────────────────────────────────────────

function calculateGrade(violations: Violation[]): string {
  const critical = violations.filter(v => v.severity === 'critical').length;
  const high = violations.filter(v => v.severity === 'high').length;
  const medium = violations.filter(v => v.severity === 'medium').length;

  if (critical >= 2) return 'F';
  if (critical === 1) return 'D';
  if (high >= 6) return 'D';
  if (high >= 3) return 'C';
  if (high >= 1 || medium >= 5) return 'B';
  if (medium >= 1) return 'A-';
  return 'A';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.error('[validate] Running golden principles validation...\n');

  const startTime = Date.now();

  // Run all validation checks in parallel
  const [
    stdoutViolations,
    toolSizeViolations,
    loggingViolations,
    pathViolations,
    testViolations
  ] = await Promise.all([
    checkStdoutLogging(),
    checkToolSize(),
    checkStructuredLogging(),
    checkConvexPaths(),
    checkTestCoverage()
  ]);

  // Combine all violations
  const allViolations = [
    ...stdoutViolations,
    ...toolSizeViolations,
    ...loggingViolations,
    ...pathViolations,
    ...testViolations
  ];

  // Calculate summary
  const summary = {
    totalFiles: new Set(allViolations.map(v => v.file)).size,
    critical: allViolations.filter(v => v.severity === 'critical').length,
    high: allViolations.filter(v => v.severity === 'high').length,
    medium: allViolations.filter(v => v.severity === 'medium').length,
    low: allViolations.filter(v => v.severity === 'low').length
  };

  const grade = calculateGrade(allViolations);

  const result: ValidationResult = {
    violations: allViolations,
    grade,
    summary
  };

  const duration = Date.now() - startTime;

  // Output results
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error(`\n${'='.repeat(70)}`);
    console.error('VALIDATION RESULTS');
    console.error('='.repeat(70));
    console.error(`Overall Grade: ${grade}`);
    console.error(`Duration: ${duration}ms`);
    console.error(`\nSummary:`);
    console.error(`  Files checked: ${summary.totalFiles}`);
    console.error(`  Critical violations: ${summary.critical}`);
    console.error(`  High violations: ${summary.high}`);
    console.error(`  Medium violations: ${summary.medium}`);
    console.error(`  Low violations: ${summary.low}`);

    if (allViolations.length > 0) {
      console.error(`\nViolations by Principle:\n`);

      const byPrinciple = allViolations.reduce((acc, v) => {
        if (!acc[v.principle]) acc[v.principle] = [];
        acc[v.principle].push(v);
        return acc;
      }, {} as Record<string, Violation[]>);

      for (const [principle, violations] of Object.entries(byPrinciple)) {
        console.error(`${principle}: ${violations.length} violation(s)`);
        violations.forEach(v => {
          const location = v.line ? `${v.file}:${v.line}` : v.file;
          console.error(`  ${v.severity.toUpperCase()}: ${location}`);
          console.error(`    ${v.message}`);
          if (v.fix) {
            console.error(`    Fix: ${v.fix}`);
          }
        });
        console.error('');
      }
    } else {
      console.error(`\n✅ No violations found!`);
    }

    console.error('='.repeat(70));
  }

  // Exit with error code if violations found
  process.exit(allViolations.length > 0 ? 1 : 0);
}

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('[validate] Fatal error:', err);
    process.exit(1);
  });
}

export { main as validateGoldenPrinciples };
