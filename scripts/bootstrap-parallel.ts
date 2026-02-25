#!/usr/bin/env npx tsx

import { promises as fs } from "fs";
import { resolve } from "path";
import { globSync } from "glob";
import {
  extractFacts,
  parseSessionLine,
  deduplicateFacts,
  type ParsedFact,
} from "./parse-claude-code-history.js";

/**
 * Result summary from bootstrap processing
 */
export interface BootstrapResult {
  totalFiles: number;
  totalFactsExtracted: number;
  factsAfterDedup: number;
  byType: Record<string, number>;
  processingTimeMs: number;
}

/**
 * Process files in batches with concurrency limit
 *
 * @param files - Array of file paths to process
 * @param concurrency - Number of files to process in parallel (default: 4)
 * @returns Array of all extracted facts (pre-dedup)
 */
export async function processFilesBatch(
  files: string[],
  concurrency: number
): Promise<ParsedFact[]> {
  if (files.length === 0) {
    return [];
  }

  const allFacts: ParsedFact[] = [];
  const queue = [...files];
  let activePromises = 0;
  let queueIndex = 0;

  /**
   * Simple semaphore pattern using a recursive function
   */
  const processNext = async (): Promise<void> => {
    if (queueIndex >= queue.length) {
      // Wait for remaining active promises
      return;
    }

    activePromises++;
    const filePath = queue[queueIndex];
    queueIndex++;

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      // Parse all lines
      const messages = [];
      for (const line of lines) {
        const msg = parseSessionLine(line);
        if (msg) {
          messages.push(msg);
        }
      }

      // Extract facts
      let facts = extractFacts(messages);

      // Deduplicate within this file
      facts = deduplicateFacts(facts);

      // Set source path
      facts = facts.map((f) => ({ ...f, source: filePath }));

      allFacts.push(...facts);
    } catch (err) {
      console.error(`Error processing file ${filePath}:`, err);
    } finally {
      activePromises--;
    }

    // Process next file if we haven't hit concurrency limit
    if (activePromises < concurrency && queueIndex < queue.length) {
      await processNext();
    }
  };

  // Start initial batch of concurrent operations
  const initialPromises = [];
  for (let i = 0; i < Math.min(concurrency, files.length); i++) {
    initialPromises.push(processNext());
  }

  // Wait for all initial promises
  await Promise.all(initialPromises);

  // Process remaining files
  while (queueIndex < queue.length) {
    await processNext();
  }

  return allFacts;
}

/**
 * Deduplicate facts across all files, keeping earliest timestamp for duplicates
 *
 * @param allFacts - All facts extracted from all files
 * @returns Deduplicated facts with earliest timestamp preserved
 */
export function crossFileDedup(allFacts: ParsedFact[]): ParsedFact[] {
  if (allFacts.length <= 1) {
    return allFacts;
  }

  const result: ParsedFact[] = [];
  const threshold = 0.7; // Jaccard similarity threshold
  const contentMap = new Map<string, ParsedFact>();

  // Helper: extract keywords from text (lowercased, alpha only)
  function extractKeywords(text: string): Set<string> {
    const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
    return new Set(words);
  }

  // Helper: Jaccard similarity between two text chunks (word-level)
  function jaccardSimilarity(text1: string, text2: string): number {
    const words1 = extractKeywords(text1);
    const words2 = extractKeywords(text2);

    if (words1.size === 0 && words2.size === 0) return 1.0;
    if (words1.size === 0 || words2.size === 0) return 0.0;

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  // Process each fact
  for (const fact of allFacts) {
    let isDuplicate = false;
    let bestMatchKey: string | null = null;
    let bestMatchScore = 0;

    // Check similarity with existing facts
    for (const [key, existing] of contentMap) {
      const similarity = jaccardSimilarity(fact.content, key);

      if (similarity >= threshold) {
        isDuplicate = true;
        // Keep track of best match (highest similarity)
        if (similarity > bestMatchScore) {
          bestMatchScore = similarity;
          bestMatchKey = key;
        }
      }
    }

    if (!isDuplicate) {
      // Not a duplicate, add it
      contentMap.set(fact.content, fact);
    } else if (bestMatchKey) {
      // It's a duplicate, keep the one with earliest timestamp
      const existing = contentMap.get(bestMatchKey)!;
      if (fact.timestamp < existing.timestamp) {
        contentMap.delete(bestMatchKey);
        contentMap.set(fact.content, fact);
      }
    }
  }

  return Array.from(contentMap.values());
}

/**
 * Summarize bootstrap results
 *
 * @param facts - Final deduplicated facts
 * @returns Summary statistics
 */
export function summarizeResults(facts: ParsedFact[]): BootstrapResult {
  const startTime = Date.now();

  // Count unique sources
  const uniqueSources = new Set(facts.map((f) => f.source));

  // Count by type
  const byType: Record<string, number> = {};
  for (const fact of facts) {
    byType[fact.factType] = (byType[fact.factType] || 0) + 1;
  }

  const endTime = Date.now();

  return {
    totalFiles: uniqueSources.size,
    totalFactsExtracted: facts.length,
    factsAfterDedup: facts.length,
    byType,
    processingTimeMs: endTime - startTime,
  };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  let globPattern: string | null = null;
  let concurrency = 4;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--concurrency" && i + 1 < args.length) {
      concurrency = parseInt(args[i + 1], 10);
      if (isNaN(concurrency) || concurrency < 1) {
        console.error("Error: --concurrency must be a positive integer");
        process.exit(1);
      }
      i++;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (!args[i].startsWith("--")) {
      globPattern = args[i];
    }
  }

  if (!globPattern) {
    console.error(
      "Usage: npx tsx scripts/bootstrap-parallel.ts <glob-pattern> [--concurrency N] [--dry-run]"
    );
    console.error("Example: npx tsx scripts/bootstrap-parallel.ts \"~/.claude/projects/**/*.jsonl\" --concurrency 4");
    process.exit(1);
  }

  // Expand ~ to home directory
  const expandedPattern = globPattern.replace(/^~/, process.env.HOME || "~");

  // Find matching files
  const files = globSync(expandedPattern, { absolute: true });

  if (files.length === 0) {
    console.error(`No files found matching pattern: ${globPattern}`);
    process.exit(1);
  }

  const startTime = Date.now();

  // Process files
  const facts = await processFilesBatch(files, concurrency);

  // Deduplicate across files
  const deduplicated = crossFileDedup(facts);

  // Summarize
  const summary = summarizeResults(deduplicated);
  const totalTime = Date.now() - startTime;

  if (dryRun) {
    // Human-readable output
    console.log(`\n📄 Parallel Bootstrap Results`);
    console.log(`${"=".repeat(60)}`);
    console.log(`Files processed: ${files.length}`);
    console.log(`Concurrency: ${concurrency}`);
    console.log(`Facts extracted: ${facts.length}`);
    console.log(`After dedup: ${deduplicated.length}`);
    console.log(`Dedup reduction: ${(((facts.length - deduplicated.length) / facts.length) * 100).toFixed(1)}%`);
    console.log(`${"=".repeat(60)}\n`);
    console.log("By Type:");
    for (const [type, count] of Object.entries(summary.byType)) {
      console.log(`  ${type}: ${count}`);
    }
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Total processing time: ${totalTime}ms`);
    console.log(`${"=".repeat(60)}\n`);
  } else {
    // JSON output
    console.log(JSON.stringify(deduplicated, null, 2));
  }
}

// Only run main() if this is the direct entry point (not imported as a module)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
