---
title: "feat: Complete Remaining Letta Context Repository Beads"
type: feat
date: 2026-02-25
status: ready
beads: engram-7g0, engram-7eb, engram-uw7, engram-g3o, engram-1vt, engram-wxn, engram-1ob, engram-w3u
---

# Complete Remaining Letta Context Repository Beads

## Overview

Finish the final 8 open beads from the Letta Context Repository implementation. 200/208 beads are closed. Phases 1-5 are fully implemented with 1168 tests passing. The remaining work falls into three clusters: bootstrap e2e tests, a dashboard component, and Phase 6 filesystem mirror completion.

**Critical finding from research:** Phase 6 infrastructure already exists in the codebase. The vault-writer, vault-format (YAML frontmatter), vault-reconciler (three-way merge), vault-sync daemon (chokidar file watcher), and vault-indexer are all implemented. The beads are about **verification and hardening**, not greenfield development.

## Problem Statement / Motivation

The Letta Context Repository plan defined 6 phases. Phases 1-4 (P0/P1) and Phase 5 (P2) are implemented. Phase 6 Filesystem Mirror was originally P3 but the infrastructure was built during earlier vault integration work. The remaining beads need completion to close the entire initiative.

## Proposed Solution

Three parallel workstreams, each independent:

### Workstream A: Bootstrap E2E Tests (engram-7g0)

Write end-to-end tests that validate the full bootstrap pipeline: session file parsing, fact extraction, deduplication, and parallel orchestration.

**Files to create:**
- `mcp-server/test/e2e-bootstrap-pipeline.test.ts`

**Test cases:**
- Parse Claude Code JSONL session → extract facts → verify types and counts
- Parse OpenClaw JSON session → extract facts → verify types
- Cross-file deduplication removes near-duplicates (Jaccard 0.7)
- Parallel orchestrator processes N files with concurrency limit
- CLI `resolveBootstrapPath` for both sources
- Empty session file → graceful empty result
- Malformed session file → skip with error, process rest

**Mocking pattern:** Follow `e2e-reflection-pipeline.test.ts` — mock at filesystem boundary (`fs.readFile`), test real logic.

**Imports:**
- `scripts/parse-claude-code-history.ts`: `parseSessionLine`, `extractFacts`, `deduplicateFacts`
- `scripts/bootstrap-parallel.ts`: `processFilesBatch`, `crossFileDedup`, `summarizeResults`
- `scripts/bootstrap-from-sessions.ts`: `findSessionFiles`, `parseOpenClawSession`

### Workstream B: Dashboard Version Timeline (engram-7eb)

Create a React component showing fact version history using the `fact_versions` Convex table.

**Files to create:**
- `dashboard/src/app/components/VersionTimeline.tsx`

**Component spec:**
```tsx
interface VersionTimelineProps {
  factId: string;
  versions: Array<{
    _id: string;
    changeType: string;
    previousContent: string;
    previousImportance: number;
    previousTags: string[];
    changedBy: string;
    timestamp: number;
  }>;
}
```

**Features:**
- Vertical timeline with newest-first ordering
- Each entry shows: changeType badge, timestamp, changedBy agent, content diff preview
- Expandable detail view for full previousContent
- Color coding: `update` → blue, `rollback` → amber, `archive` → gray
- Responsive layout, uses existing Tailwind from dashboard

**Integration:** Add to the main dashboard page as a detail panel when a fact is selected.

### Workstream C: Phase 6 Filesystem Mirror — Verify & Harden (engram-uw7, engram-g3o, engram-1vt, engram-wxn)

**Key finding:** Most Phase 6 functionality already exists:

| Bead | Feature | Existing Code | Gap |
|------|---------|---------------|-----|
| engram-uw7 | Markdown export with YAML | `vault-writer.ts` + `vault-format.ts` | Already implemented. Verify coverage. |
| engram-g3o | File watcher two-way sync | `vault-sync.ts` daemon + chokidar | Already implemented. Verify reconciliation. |
| engram-1vt | Git auto-init + auto-commit | None | **New work.** |
| engram-wxn | Filesystem mirror tests | None | **New work.** |

#### engram-1vt: Git Integration

**File to create:** `mcp-server/src/lib/vault-git.ts`

```typescript
export interface VaultGitOptions {
  vaultRoot: string;
  autoCommit: boolean;
  commitPrefix?: string;
}

export async function ensureGitRepo(vaultRoot: string): Promise<boolean>
// If no .git dir, run `git init` + initial commit

export async function autoCommitChanges(opts: VaultGitOptions): Promise<{ committed: boolean; sha?: string }>
// Stage all *.md changes, commit with timestamp message
// Skip if no changes (git status --porcelain is empty)
// Commit message: "[engram] Sync {N} facts at {ISO timestamp}"

export async function getLastSyncCommit(vaultRoot: string): Promise<string | undefined>
// Return SHA of most recent [engram] commit for rollback reference
```

**Integration point:** Call `autoCommitChanges` at the end of `VaultSyncDaemon.syncOnce()`.

#### engram-wxn: Filesystem Mirror Tests

**File to create:** `mcp-server/test/e2e-filesystem-mirror.test.ts`

**Test cases:**
- Vault export: fact → markdown file with correct YAML frontmatter
- Vault import: markdown file → fact in Convex
- Round-trip: export → edit file → reconcile → verify DB updated
- Conflict detection: concurrent edit → conflict file generated
- File watcher: chokidar event → reconciliation triggered
- Git auto-init: empty vault dir → `.git` created
- Git auto-commit: after sync → commit with N facts in message
- YAML frontmatter fields: id, source, factType, timestamp, tags, entityIds all round-trip

## Acceptance Criteria

### Functional Requirements

- [ ] `e2e-bootstrap-pipeline.test.ts` — 10+ tests covering full pipeline
- [ ] `VersionTimeline.tsx` — renders version history with timeline UI
- [ ] `vault-git.ts` — auto-init and auto-commit on vault sync
- [ ] `e2e-filesystem-mirror.test.ts` — 12+ tests for export/import/sync/git
- [ ] All existing 1168 tests continue to pass
- [ ] engram-uw7 verified: vault-writer + vault-format cover the requirement
- [ ] engram-g3o verified: vault-sync daemon + chokidar cover the requirement

### Quality Gates

- [ ] `npx vitest run` — all tests pass
- [ ] No regressions in existing vault-format.test.ts or vault tests
- [ ] Dashboard component renders without errors

## Dependencies & Prerequisites

- `fact_versions` table (Convex schema) — already implemented in Wave 1
- `vault-writer.ts`, `vault-format.ts`, `vault-reconciler.ts` — already exist
- `vault-sync.ts` daemon with chokidar — already exists
- Bootstrap scripts — implemented in Wave 5

## Implementation Phases

### Phase 1: Parallel Verification + New Tests (Can start immediately)

All three workstreams run in parallel:

| Agent | Task | Bead | Model |
|-------|------|------|-------|
| Agent 1 (Sonnet) | Bootstrap e2e tests | engram-7g0 | Complex test logic |
| Agent 2 (Haiku) | Dashboard timeline | engram-7eb | UI component |
| Agent 3 (Sonnet) | Git integration + FS tests | engram-1vt, engram-wxn | New code + tests |

### Phase 2: Verify & Close (After tests pass)

1. Verify engram-uw7 (markdown export) covered by existing `vault-writer.ts` → close
2. Verify engram-g3o (file watcher) covered by existing `vault-sync.ts` → close
3. Close parent beads: engram-1ob (Phase 6 feature), engram-w3u (Phase 6 epic)

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Vault modules have bugs not caught by existing tests | Low | Medium | New e2e tests will expose them |
| Git auto-commit in vault dir conflicts with user's git workflow | Medium | Medium | Make `autoCommit` opt-in via config |
| Dashboard SSE connection fails in test | Low | Low | Mock SSE in component tests |

## References

### Internal References
- Vault integration plan: `docs/specs/VAULT_INTEGRATION_PLAN.md`
- Vault writer: `mcp-server/src/lib/vault-writer.ts`
- Vault format: `mcp-server/src/lib/vault-format.ts`
- Vault reconciler: `mcp-server/src/lib/vault-reconciler.ts`
- Vault sync daemon: `mcp-server/src/daemons/vault-sync.ts`
- Vault indexer: `mcp-server/src/lib/vault-indexer.ts`
- Bootstrap scripts: `scripts/parse-claude-code-history.ts`, `scripts/bootstrap-parallel.ts`, `scripts/bootstrap-from-sessions.ts`
- E2E test pattern: `mcp-server/test/e2e-reflection-pipeline.test.ts`
- Dashboard page: `dashboard/src/app/page.tsx`
- Fact versions schema: `convex/schema.ts` (fact_versions table)

### Architectural Constraints
- Convex cannot write to local filesystem — all file ops must happen in MCP daemon
- Field-level three-way merge for conflict resolution (HUMAN_FIELDS vs MACHINE_FIELDS)
- Chokidar file watcher has ~30s max lag — acceptable for memory system eventual consistency
