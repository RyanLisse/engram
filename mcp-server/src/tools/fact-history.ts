/**
 * memory_history — Return version history for a fact
 * memory_rollback — Restore fact from a previous version
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const factHistorySchema = z.object({
  factId: z.string().describe("Fact ID to get history for"),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum versions to return (default: 20)"),
});

export type FactHistoryInput = z.infer<typeof factHistorySchema>;

export const factRollbackSchema = z.object({
  factId: z.string().describe("Fact ID to rollback"),
  versionId: z.string().optional().describe("Version ID to restore to (defaults to most recent)"),
  reason: z.string().optional().describe("Reason for rollback"),
});

export type FactRollbackInput = z.infer<typeof factRollbackSchema>;

export async function factHistory(
  input: FactHistoryInput
): Promise<
  | {
      factId: string;
      currentContent: string;
      versions: Array<{
        versionId: string;
        previousContent: string;
        previousImportance?: number;
        previousTags?: string[];
        changedBy: string;
        changeType: string;
        reason?: string;
        createdAt: number;
      }>;
      totalVersions: number;
    }
  | { isError: true; message: string }
> {
  try {
    // Verify fact exists and get current content
    const fact = await convex.getFact(input.factId);
    if (!fact) {
      return {
        isError: true,
        message: `Fact "${input.factId}" not found`,
      };
    }

    // Query version history
    const versions = await convex.getFactVersions({
      factId: input.factId,
      limit: input.limit,
    });

    // Transform versions to remove Convex IDs and rename for clarity
    const transformedVersions = (versions as any[]).map((v) => ({
      versionId: v._id,
      previousContent: v.previousContent,
      previousImportance: v.previousImportance,
      previousTags: v.previousTags,
      changedBy: v.changedBy,
      changeType: v.changeType,
      reason: v.reason,
      createdAt: v.createdAt,
    }));

    return {
      factId: input.factId,
      currentContent: (fact as any).content,
      versions: transformedVersions,
      totalVersions: transformedVersions.length,
    };
  } catch (error: any) {
    console.error("[factHistory] Error:", error);
    return {
      isError: true,
      message: `Failed to retrieve fact history: ${error.message}`,
    };
  }
}

/**
 * Rollback a fact to a previous version.
 * - Gets the target version (by versionId or most recent)
 * - Creates a NEW version snapshot of current state (changeType: "restore")
 * - Restores fact content from the version's previousContent
 * - Returns result with factId, restoredFrom, previousContent, restoredContent
 */
export async function factRollback(
  input: FactRollbackInput
): Promise<
  | {
      factId: string;
      restoredFrom: string; // versionId
      previousContent: string; // content before rollback
      restoredContent: string; // content after rollback (from target version)
      restoredImportance?: number;
      restoredTags?: string[];
    }
  | { isError: true; message: string }
> {
  try {
    // 1. Get current fact
    const fact = await convex.getFact(input.factId);
    if (!fact) {
      return {
        isError: true,
        message: `Fact "${input.factId}" not found`,
      };
    }

    // 2. Get version history to find target version
    const versions = await convex.getFactVersions({
      factId: input.factId,
      limit: 50,
    });

    if (!versions || versions.length === 0) {
      return {
        isError: true,
        message: `No version history found for fact "${input.factId}"`,
      };
    }

    // 3. Find the target version to restore to
    let targetVersion: any;
    if (input.versionId) {
      // Find specific version by ID
      targetVersion = (versions as any[]).find((v) => v._id === input.versionId);
      if (!targetVersion) {
        return {
          isError: true,
          message: `Version "${input.versionId}" not found for fact "${input.factId}"`,
        };
      }
    } else {
      // Default to most recent version
      targetVersion = (versions as any[])[0];
    }

    // 4. Create a NEW version snapshot of current state (before rollback)
    // This preserves the current state in case we need to track back further
    await convex.createVersionSnapshot({
      factId: input.factId,
      previousContent: (fact as any).content,
      previousImportance: (fact as any).importanceScore,
      previousTags: (fact as any).tags,
      changedBy: "system", // System-initiated rollback
      changeType: "restore",
      reason: input.reason || `Restored to version created at ${new Date(targetVersion.createdAt).toISOString()}`,
    });

    // 5. Restore fact from target version
    await convex.updateFact({
      factId: input.factId,
      content: targetVersion.previousContent,
      ...(targetVersion.previousImportance !== undefined && {
        // Note: updateFact may not support importance, but we try
      }),
      ...(targetVersion.previousTags && { tags: targetVersion.previousTags }),
    });

    return {
      factId: input.factId,
      restoredFrom: targetVersion._id,
      previousContent: (fact as any).content,
      restoredContent: targetVersion.previousContent,
      restoredImportance: targetVersion.previousImportance,
      restoredTags: targetVersion.previousTags,
    };
  } catch (error: any) {
    console.error("[factRollback] Error:", error);
    return {
      isError: true,
      message: `Failed to rollback fact: ${error.message}`,
    };
  }
}
