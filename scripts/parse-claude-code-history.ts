#!/usr/bin/env npx tsx

import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Parse Claude Code session history into Engram-compatible facts.
 *
 * Usage: npx tsx scripts/parse-claude-code-history.ts [path-to-jsonl] [--dry-run]
 */

export interface ParsedFact {
  content: string;
  factType: "preference" | "decision" | "correction" | "pattern" | "note";
  importance: number; // 0.0-1.0
  entityHints: string[]; // entity names mentioned
  source: string; // session file path
  timestamp: number; // ISO timestamp as ms since epoch
}

interface SessionMessage {
  role: string;
  content: string;
  timestamp: number;
}

/**
 * Parse one JSONL line, return parsed message or null if invalid
 */
export function parseSessionLine(
  line: string
): SessionMessage | null {
  try {
    const parsed = JSON.parse(line);

    // Expect structure: { type, message: { role, content }, timestamp }
    if (!parsed.message || !parsed.timestamp) {
      return null;
    }

    const { role, content } = parsed.message;
    if (!role || !content || typeof content !== "string") {
      return null;
    }

    // Parse ISO-8601 timestamp to ms
    const timestamp = new Date(parsed.timestamp).getTime();
    if (isNaN(timestamp)) {
      return null;
    }

    return { role, content, timestamp };
  } catch {
    return null;
  }
}

/**
 * Extract keywords from text (lowercased, alpha only)
 */
function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
  return new Set(words);
}

/**
 * Jaccard similarity between two text chunks (word-level)
 */
function jaccardSimilarity(text1: string, text2: string): number {
  const words1 = extractKeywords(text1);
  const words2 = extractKeywords(text2);

  if (words1.size === 0 && words2.size === 0) return 1.0;
  if (words1.size === 0 || words2.size === 0) return 0.0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Classify message content by type and importance
 */
function classifyMessage(
  content: string
): { factType: ParsedFact["factType"]; importance: number } {
  const lower = content.toLowerCase();

  // Corrections: strong negative indicators or "actually"/"no"
  if (
    lower.includes("actually,") ||
    lower.includes("no, i") ||
    lower.includes("don't do that") ||
    lower.includes("don't do this") ||
    lower.includes("never do that") ||
    lower.includes("that's wrong") ||
    lower.includes("scratch that") ||
    lower.includes("revert")
  ) {
    return { factType: "correction", importance: 0.9 };
  }

  // Preferences: personal style/methodology
  if (
    lower.includes("i prefer") ||
    lower.includes("i like") ||
    lower.includes("always use") ||
    lower.includes("always do") ||
    lower.includes("never use") ||
    lower.includes("never do") ||
    lower.includes("i want") ||
    lower.includes("my preference") ||
    lower.includes("i find it") ||
    lower.includes("works best")
  ) {
    return { factType: "preference", importance: 0.8 };
  }

  // Decisions: forward-looking choices
  if (
    lower.includes("let's go with") ||
    lower.includes("we'll use") ||
    lower.includes("decided to") ||
    lower.includes("i've decided") ||
    lower.includes("let's use") ||
    lower.includes("let's implement") ||
    lower.includes("i'll use") ||
    lower.includes("we decided") ||
    lower.includes("choose") ||
    lower.includes("go with")
  ) {
    return { factType: "decision", importance: 0.7 };
  }

  // Default: note
  return { factType: "note", importance: 0.5 };
}

/**
 * Extract entities mentioned in text (capitalized words)
 */
function extractEntityHints(content: string): string[] {
  // Simple heuristic: capitalized words (likely proper nouns/entities)
  const matches = content.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]*)*\b/g) || [];
  // Deduplicate while preserving order
  return [...new Set(matches)].slice(0, 5); // Max 5 entities per fact
}

/**
 * Walk through messages, apply heuristics, extract facts.
 * Only extracts from user messages.
 */
export function extractFacts(
  messages: SessionMessage[]
): ParsedFact[] {
  const facts: ParsedFact[] = [];

  for (const msg of messages) {
    // Only process user messages
    if (msg.role !== "user") {
      continue;
    }

    // Skip tool call messages, system messages, very short messages
    if (
      msg.content.includes("function_calls") ||
      msg.content.startsWith("[") ||
      msg.content.length < 10
    ) {
      continue;
    }

    // Skip messages that are pure questions without assertions
    const contentLower = msg.content.toLowerCase();
    const isJustQuestion =
      contentLower.match(/^\?/) ||
      (contentLower.endsWith("?") &&
        !contentLower.includes(".") &&
        !contentLower.includes(","));

    if (isJustQuestion && !contentLower.match(/i\s+(think|want|prefer|like)/)) {
      continue;
    }

    const { factType, importance } = classifyMessage(msg.content);

    // Only extract if it's not a generic note, or if it's important
    if (factType === "note" && importance < 0.5) {
      continue;
    }

    const entities = extractEntityHints(msg.content);

    facts.push({
      content: msg.content.slice(0, 500), // Truncate very long messages
      factType,
      importance,
      entityHints: entities,
      source: "", // Will be set by caller
      timestamp: msg.timestamp,
    });
  }

  return facts;
}

/**
 * Remove near-duplicates by Jaccard similarity (threshold 0.7)
 */
export function deduplicateFacts(
  facts: ParsedFact[]
): ParsedFact[] {
  if (facts.length <= 1) {
    return facts;
  }

  const result: ParsedFact[] = [];
  const threshold = 0.7;

  for (const fact of facts) {
    // Check if this fact is similar to any already in result
    const isDuplicate = result.some(
      existing => jaccardSimilarity(fact.content, existing.content) >= threshold
    );

    if (!isDuplicate) {
      result.push(fact);
    }
  }

  return result;
}

/**
 * Detect repeated patterns (same instruction 2+ times)
 */
function detectPatterns(facts: ParsedFact[]): ParsedFact[] {
  const contentCounts = new Map<string, number>();

  // Count occurrences
  for (const fact of facts) {
    const key = fact.content.slice(0, 50); // Use first 50 chars as key
    contentCounts.set(key, (contentCounts.get(key) || 0) + 1);
  }

  // Upgrade repeated facts to patterns
  return facts.map(fact => {
    const key = fact.content.slice(0, 50);
    if ((contentCounts.get(key) || 0) >= 2) {
      return {
        ...fact,
        factType: "pattern",
        importance: Math.max(fact.importance, 0.85),
      };
    }
    return fact;
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: npx tsx scripts/parse-claude-code-history.ts <path-to-jsonl> [--dry-run]");
    process.exit(1);
  }

  const filePath = resolve(args[0]);
  const dryRun = args.includes("--dry-run");

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err);
    process.exit(1);
  }

  const lines = content.split("\n").filter(line => line.trim());
  const messages: SessionMessage[] = [];
  let parseErrors = 0;

  // Parse all lines
  for (const line of lines) {
    const msg = parseSessionLine(line);
    if (msg) {
      messages.push(msg);
    } else {
      parseErrors++;
    }
  }

  // Extract facts
  let facts = extractFacts(messages);

  // Detect patterns (repeated instructions)
  facts = detectPatterns(facts);

  // Deduplicate
  facts = deduplicateFacts(facts);

  // Set source path
  facts = facts.map(f => ({ ...f, source: filePath }));

  // Sort by timestamp descending (newest first)
  facts.sort((a, b) => b.timestamp - a.timestamp);

  if (dryRun) {
    // Human-readable output
    console.log(`\n📄 Claude Code History Parser Results`);
    console.log(`${"=".repeat(50)}`);
    console.log(`File: ${filePath}`);
    console.log(`Total lines parsed: ${lines.length}`);
    console.log(`Valid messages: ${messages.length}`);
    console.log(`Parse errors: ${parseErrors}`);
    console.log(`Extracted facts: ${facts.length}`);
    console.log(`${"=".repeat(50)}\n`);

    for (const fact of facts) {
      const timestamp = new Date(fact.timestamp).toISOString();
      console.log(`📌 [${fact.factType.toUpperCase()}] (${fact.importance.toFixed(1)})`);
      console.log(`   Content: ${fact.content.slice(0, 80)}${fact.content.length > 80 ? "..." : ""}`);
      if (fact.entityHints.length > 0) {
        console.log(`   Entities: ${fact.entityHints.join(", ")}`);
      }
      console.log(`   Timestamp: ${timestamp}\n`);
    }
  } else {
    // JSON output
    console.log(JSON.stringify(facts, null, 2));
  }
}

// Only run main() if this is the direct entry point (not imported as a module)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
