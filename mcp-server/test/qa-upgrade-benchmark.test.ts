import { describe, expect, test } from "vitest";
import { generateHeuristicQA, generateQAPair } from "../src/lib/enrich-qa.js";

const CASES = [
  {
    query: "What package manager do we use for TypeScript projects?",
    content: "We use bun as the JavaScript runtime and package manager for all TypeScript projects.",
    factType: "decision",
    entityIds: ["entity-bun", "entity-typescript"],
    importance: 0.92,
  },
  {
    query: "What correction was made to authentication?",
    content: "The authentication flow was fixed to use bcrypt hashing consistently.",
    factType: "correction",
    entityIds: ["entity-authentication", "entity-bcrypt"],
    importance: 0.88,
  },
  {
    query: "What was observed about cache warming?",
    content: "Cache warming completed successfully after the deploy finished.",
    factType: "observation",
    entityIds: ["entity-cache"],
    importance: 0.45,
  },
] as const;

function overlapScore(query: string, question: string): number {
  const queryTokens = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
  const questionTokens = new Set(question.toLowerCase().split(/\W+/).filter(Boolean));
  let overlap = 0;
  for (const token of queryTokens) {
    if (questionTokens.has(token)) overlap++;
  }
  return overlap;
}

describe("QA upgrade benchmark slice", () => {
  test("upgraded QA questions are at least as query-aligned as baseline heuristics", () => {
    let baselineTotal = 0;
    let upgradedTotal = 0;

    for (const testCase of CASES) {
      const baseline = generateHeuristicQA(
        testCase.content,
        testCase.factType,
        [...testCase.entityIds]
      );
      const upgraded = generateQAPair(
        testCase.content,
        testCase.factType,
        [...testCase.entityIds],
        testCase.importance
      );

      baselineTotal += overlapScore(testCase.query, baseline?.qaQuestion ?? "");
      upgradedTotal += overlapScore(testCase.query, upgraded?.qaQuestion ?? "");
    }

    expect(upgradedTotal).toBeGreaterThanOrEqual(baselineTotal);
  });
});
