import { describe, test, expect, vi, beforeEach } from "vitest";

const {
  mockGetFact,
  mockGetFactVersions,
  mockUpdateFact,
  mockCreateVersionSnapshot,
} = vi.hoisted(() => ({
  mockGetFact: vi.fn(),
  mockGetFactVersions: vi.fn(),
  mockUpdateFact: vi.fn(),
  mockCreateVersionSnapshot: vi.fn(),
}));

vi.mock("../src/lib/convex-client.js", () => ({
  getFact: mockGetFact,
  getFactVersions: mockGetFactVersions,
  updateFact: mockUpdateFact,
  createVersionSnapshot: mockCreateVersionSnapshot,
}));

import { factHistory, factRollback } from "../src/tools/fact-history.js";

describe("Version History Tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("factHistory - Version History Query", () => {
    test("returns empty versions for new fact with no mutations", async () => {
      mockGetFact.mockResolvedValue({
        _id: "fact_new",
        content: "Brand new fact",
        lifecycleState: "active",
      });
      mockGetFactVersions.mockResolvedValue([]);

      const result = await factHistory({ factId: "fact_new", limit: 20 });

      expect(result).toEqual({
        factId: "fact_new",
        currentContent: "Brand new fact",
        versions: [],
        totalVersions: 0,
      });
    });

    test("returns versions newest-first with all required fields", async () => {
      const now = Date.now();
      mockGetFact.mockResolvedValue({
        _id: "fact_123",
        content: "Updated content v3",
        lifecycleState: "active",
      });
      mockGetFactVersions.mockResolvedValue([
        {
          _id: "version_3",
          previousContent: "Content v2",
          previousImportance: 0.7,
          previousTags: ["tag2"],
          changedBy: "agent-2",
          changeType: "update",
          reason: "Corrected mistake",
          createdAt: now,
        },
        {
          _id: "version_2",
          previousContent: "Content v1",
          previousImportance: 0.6,
          previousTags: ["tag1"],
          changedBy: "agent-1",
          changeType: "update",
          reason: "Initial refinement",
          createdAt: now - 1000,
        },
      ]);

      const result = await factHistory({ factId: "fact_123", limit: 20 });

      expect(result).toEqual({
        factId: "fact_123",
        currentContent: "Updated content v3",
        versions: [
          {
            versionId: "version_3",
            previousContent: "Content v2",
            previousImportance: 0.7,
            previousTags: ["tag2"],
            changedBy: "agent-2",
            changeType: "update",
            reason: "Corrected mistake",
            createdAt: now,
          },
          {
            versionId: "version_2",
            previousContent: "Content v1",
            previousImportance: 0.6,
            previousTags: ["tag1"],
            changedBy: "agent-1",
            changeType: "update",
            reason: "Initial refinement",
            createdAt: now - 1000,
          },
        ],
        totalVersions: 2,
      });
    });

    test("respects limit parameter", async () => {
      mockGetFact.mockResolvedValue({
        _id: "fact_large",
        content: "Current",
        lifecycleState: "active",
      });
      mockGetFactVersions.mockResolvedValue([
        { _id: "v1", previousContent: "c1", changedBy: "a1", changeType: "update", createdAt: 100 },
        { _id: "v2", previousContent: "c2", changedBy: "a1", changeType: "update", createdAt: 99 },
      ]);

      const result = await factHistory({ factId: "fact_large", limit: 5 });

      expect(mockGetFactVersions).toHaveBeenCalledWith({
        factId: "fact_large",
        limit: 5,
      });
      expect(result).not.toEqual({ isError: true });
    });

    test("returns error when fact not found", async () => {
      mockGetFact.mockResolvedValue(null);

      const result = await factHistory({ factId: "nonexistent", limit: 20 });

      expect(result).toEqual({
        isError: true,
        message: 'Fact "nonexistent" not found',
      });
    });

    test("handles various changeTypes in version history", async () => {
      mockGetFact.mockResolvedValue({
        _id: "fact_complex",
        content: "Current after restore",
        lifecycleState: "active",
      });
      mockGetFactVersions.mockResolvedValue([
        {
          _id: "v_restore",
          previousContent: "Before restore",
          changedBy: "system",
          changeType: "restore",
          reason: "Rolled back to clean state",
          createdAt: Date.now(),
        },
        {
          _id: "v_archive",
          previousContent: "Before archive",
          changedBy: "agent-1",
          changeType: "archive",
          reason: "Fact became obsolete",
          createdAt: Date.now() - 10000,
        },
        {
          _id: "v_merge",
          previousContent: "Before merge",
          changedBy: "agent-2",
          changeType: "merge",
          reason: "Consolidated with fact_other",
          createdAt: Date.now() - 20000,
        },
        {
          _id: "v_update",
          previousContent: "Original content",
          changedBy: "agent-1",
          changeType: "update",
          reason: "Initial refinement",
          createdAt: Date.now() - 30000,
        },
      ]);

      const result = await factHistory({ factId: "fact_complex" });

      expect(result).not.toEqual({ isError: true });
      const versions = (result as any).versions;
      expect(versions).toHaveLength(4);
      expect(versions.map((v: any) => v.changeType)).toEqual([
        "restore",
        "archive",
        "merge",
        "update",
      ]);
    });

    test("captures reason field when provided", async () => {
      mockGetFact.mockResolvedValue({
        _id: "fact_reason",
        content: "Updated content",
        lifecycleState: "active",
      });
      mockGetFactVersions.mockResolvedValue([
        {
          _id: "v1",
          previousContent: "Old",
          changedBy: "agent-1",
          changeType: "update",
          reason: "Security vulnerability fixed in dependency",
          createdAt: Date.now(),
        },
      ]);

      const result = await factHistory({ factId: "fact_reason" });

      expect((result as any).versions[0].reason).toBe(
        "Security vulnerability fixed in dependency"
      );
    });

    test("handles versions without reason field", async () => {
      mockGetFact.mockResolvedValue({
        _id: "fact_no_reason",
        content: "Updated",
        lifecycleState: "active",
      });
      mockGetFactVersions.mockResolvedValue([
        {
          _id: "v1",
          previousContent: "Old",
          changedBy: "agent-1",
          changeType: "update",
          createdAt: Date.now(),
        },
      ]);

      const result = await factHistory({ factId: "fact_no_reason" });

      expect((result as any).versions[0].reason).toBeUndefined();
    });
  });

  describe("factRollback - Version Rollback", () => {
    test("restores fact to most recent version when versionId not specified", async () => {
      const now = Date.now();
      mockGetFact.mockResolvedValue({
        _id: "fact_restore",
        content: "Current wrong content",
        importanceScore: 0.5,
        tags: ["wrong"],
        lifecycleState: "active",
      });
      mockGetFactVersions.mockResolvedValue([
        {
          _id: "version_good",
          previousContent: "Good old content",
          previousImportance: 0.8,
          previousTags: ["correct"],
          changedBy: "agent-1",
          changeType: "update",
          createdAt: now - 5000,
        },
      ]);
      mockCreateVersionSnapshot.mockResolvedValue({ _id: "version_rollback_snapshot" });
      mockUpdateFact.mockResolvedValue({ updated: true });

      const result = await factRollback({
        factId: "fact_restore",
        reason: "Undo accidental change",
      });

      expect(mockCreateVersionSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          factId: "fact_restore",
          previousContent: "Current wrong content",
          previousImportance: 0.5,
          previousTags: ["wrong"],
          changedBy: "system",
          changeType: "restore",
          reason: "Undo accidental change",
        })
      );
      expect(mockUpdateFact).toHaveBeenCalledWith(
        expect.objectContaining({
          factId: "fact_restore",
          content: "Good old content",
          tags: ["correct"],
        })
      );
      expect(result).toEqual({
        factId: "fact_restore",
        restoredFrom: "version_good",
        previousContent: "Current wrong content",
        restoredContent: "Good old content",
        restoredImportance: 0.8,
        restoredTags: ["correct"],
      });
    });

    test("restores to specific version by versionId", async () => {
      const now = Date.now();
      mockGetFact.mockResolvedValue({
        _id: "fact_specific",
        content: "v4 content",
        importanceScore: 0.4,
        lifecycleState: "active",
      });
      mockGetFactVersions.mockResolvedValue([
        {
          _id: "v4",
          previousContent: "v3 content",
          changedBy: "agent-1",
          changeType: "update",
          createdAt: now,
        },
        {
          _id: "v3",
          previousContent: "v2 content",
          changedBy: "agent-1",
          changeType: "update",
          createdAt: now - 1000,
        },
        {
          _id: "v2",
          previousContent: "v1 content",
          previousImportance: 0.9,
          changedBy: "agent-1",
          changeType: "update",
          createdAt: now - 2000,
        },
      ]);
      mockCreateVersionSnapshot.mockResolvedValue({ _id: "rollback_v2" });
      mockUpdateFact.mockResolvedValue({ updated: true });

      const result = await factRollback({
        factId: "fact_specific",
        versionId: "v2",
      });

      expect(mockUpdateFact).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "v1 content",
        })
      );
      expect((result as any).restoredContent).toBe("v1 content");
    });

    test("creates a restore version entry after rollback", async () => {
      mockGetFact.mockResolvedValue({
        _id: "fact_create_snapshot",
        content: "Current",
        importanceScore: 0.5,
        tags: ["old"],
        lifecycleState: "active",
      });
      mockGetFactVersions.mockResolvedValue([
        {
          _id: "v_prev",
          previousContent: "Previous",
          previousImportance: 0.8,
          previousTags: ["new"],
          createdAt: Date.now() - 5000,
          changedBy: "agent-1",
          changeType: "update",
        },
      ]);
      mockCreateVersionSnapshot.mockResolvedValue({ _id: "v_restore_snap" });
      mockUpdateFact.mockResolvedValue({ updated: true });

      await factRollback({ factId: "fact_create_snapshot" });

      expect(mockCreateVersionSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          changeType: "restore",
          previousContent: "Current",
          previousImportance: 0.5,
          previousTags: ["old"],
        })
      );
    });

    test("returns error when fact not found", async () => {
      mockGetFact.mockResolvedValue(null);

      const result = await factRollback({ factId: "nonexistent" });

      expect(result).toEqual({
        isError: true,
        message: 'Fact "nonexistent" not found',
      });
    });

    test("returns error when no version history exists", async () => {
      mockGetFact.mockResolvedValue({
        _id: "fact_new",
        content: "New fact",
        lifecycleState: "active",
      });
      mockGetFactVersions.mockResolvedValue([]);

      const result = await factRollback({ factId: "fact_new" });

      expect(result).toEqual({
        isError: true,
        message: 'No version history found for fact "fact_new"',
      });
    });

    test("returns error when specified versionId not found", async () => {
      mockGetFact.mockResolvedValue({
        _id: "fact_bad_version",
        content: "Current",
        lifecycleState: "active",
      });
      mockGetFactVersions.mockResolvedValue([
        {
          _id: "v1",
          previousContent: "Old",
          changedBy: "agent-1",
          changeType: "update",
          createdAt: Date.now(),
        },
      ]);

      const result = await factRollback({
        factId: "fact_bad_version",
        versionId: "nonexistent_version",
      });

      expect(result).toEqual({
        isError: true,
        message: 'Version "nonexistent_version" not found for fact "fact_bad_version"',
      });
    });

    test("includes default reason when none provided", async () => {
      mockGetFact.mockResolvedValue({
        _id: "fact_default_reason",
        content: "Current",
        lifecycleState: "active",
      });
      const targetTime = new Date("2025-01-15T10:30:00Z").getTime();
      mockGetFactVersions.mockResolvedValue([
        {
          _id: "v_target",
          previousContent: "Old",
          changedBy: "agent-1",
          changeType: "update",
          createdAt: targetTime,
        },
      ]);
      mockCreateVersionSnapshot.mockResolvedValue({ _id: "snap" });
      mockUpdateFact.mockResolvedValue({ updated: true });

      await factRollback({ factId: "fact_default_reason" });

      expect(mockCreateVersionSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: expect.stringContaining("Restored to version created at"),
        })
      );
    });

    test("restores importance and tags when available", async () => {
      mockGetFact.mockResolvedValue({
        _id: "fact_full_restore",
        content: "New",
        importanceScore: 0.3,
        tags: ["temp"],
        lifecycleState: "active",
      });
      mockGetFactVersions.mockResolvedValue([
        {
          _id: "v_full",
          previousContent: "Old content",
          previousImportance: 0.95,
          previousTags: ["important", "verified"],
          changedBy: "agent-1",
          changeType: "update",
          createdAt: Date.now(),
        },
      ]);
      mockCreateVersionSnapshot.mockResolvedValue({ _id: "snap" });
      mockUpdateFact.mockResolvedValue({ updated: true });

      const result = await factRollback({ factId: "fact_full_restore" });

      expect(mockUpdateFact).toHaveBeenCalledWith(
        expect.objectContaining({
          factId: "fact_full_restore",
          content: "Old content",
          tags: ["important", "verified"],
        })
      );
      expect((result as any).restoredImportance).toBe(0.95);
      expect((result as any).restoredTags).toEqual(["important", "verified"]);
    });
  });

  describe("Audit Trail Completeness", () => {
    test("preserves complete audit trail after update→update→archive→restore", async () => {
      const timeline = [
        {
          _id: "v_restore",
          previousContent: "Before restore (v2)",
          changedBy: "system",
          changeType: "restore",
          reason: "Undid archival",
          createdAt: Date.now(),
        },
        {
          _id: "v_archive",
          previousContent: "Before archive (v2)",
          changedBy: "agent-2",
          changeType: "archive",
          reason: "Became obsolete",
          createdAt: Date.now() - 10000,
        },
        {
          _id: "v_update2",
          previousContent: "Before second update (v1)",
          previousImportance: 0.6,
          changedBy: "agent-1",
          changeType: "update",
          reason: "Second refinement",
          createdAt: Date.now() - 20000,
        },
        {
          _id: "v_update1",
          previousContent: "Original (v0)",
          previousImportance: 0.5,
          changedBy: "agent-1",
          changeType: "update",
          reason: "Initial refinement",
          createdAt: Date.now() - 30000,
        },
      ];

      mockGetFact.mockResolvedValue({
        _id: "fact_audit",
        content: "After restore",
        lifecycleState: "active",
      });
      mockGetFactVersions.mockResolvedValue(timeline);

      const result = await factHistory({ factId: "fact_audit" });

      expect((result as any).totalVersions).toBe(4);
      expect((result as any).versions.map((v: any) => v.changeType)).toEqual([
        "restore",
        "archive",
        "update",
        "update",
      ]);
      expect((result as any).versions.map((v: any) => v.changedBy)).toEqual([
        "system",
        "agent-2",
        "agent-1",
        "agent-1",
      ]);
    });
  });

  describe("Error Handling", () => {
    test("handles convex client errors gracefully", async () => {
      mockGetFact.mockRejectedValue(new Error("Convex connection failed"));

      const result = await factHistory({ factId: "fact_error" });

      expect(result).toEqual({
        isError: true,
        message: expect.stringContaining("Failed to retrieve fact history"),
      });
    });

    test("handles rollback with convex client errors", async () => {
      mockGetFact.mockRejectedValue(new Error("Network timeout"));

      const result = await factRollback({ factId: "fact_rollback_error" });

      expect(result).toEqual({
        isError: true,
        message: expect.stringContaining("Failed to rollback fact"),
      });
    });
  });
});
