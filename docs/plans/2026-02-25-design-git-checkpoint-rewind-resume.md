# Design: Git-Backed Checkpoint / Rewind / Resume for Engram

Date: 2026-02-25
Status: Draft for implementation planning
Owner: engram-ca0.4

## Problem

Engram has rich memory tools and lifecycle hooks, but lacks a first-class git-linked recovery model that lets users:
- rewind working tree state to prior AI checkpoints,
- resume exact session context after switching branches/machines,
- audit prompt/response evolution tied to code commits.

## Goals

1. Add deterministic checkpoints linked to user commits.
2. Preserve clean active branch history.
3. Support multi-session per branch and per worktree.
4. Provide safe rewind semantics (non-destructive commit history).
5. Keep sensitive content protected by best-effort redaction policy.

## Non-Goals (Phase 1)

- Full UI for checkpoint browsing.
- Cross-repo federation of checkpoints.
- Perfect secret detection guarantees.

## Proposed Architecture

### 1. Storage Model

- **Metadata branch:** `engram/checkpoints/v1`
- **Path layout (sharded):**
  - `<checkpoint_id[:2]>/<checkpoint_id[2:]>/metadata.json`
  - `<checkpoint_id[:2]>/<checkpoint_id[2:]>/sessions/<session_id>/...`
- **Checkpoint ID:** 12-char hex, immutable per condensed checkpoint.

### 2. Active Session State

Store transient per-session state in local workspace area (not main branch history), including:
- current base commit,
- incremental transcript offsets,
- touched file manifests,
- last condensed checkpoint id.

### 3. Commit Linkage

On user commit with new checkpointable content:
- append trailer: `Engram-Checkpoint: <checkpoint_id>`
- condense session artifacts to `engram/checkpoints/v1`
- optionally auto-push metadata branch (config-gated)

### 4. Rewind Semantics

`engram rewind <checkpoint>`:
- restore tracked file tree snapshot to selected checkpoint state,
- preserve pre-session untracked files that existed before first checkpoint,
- do not rewrite git commit history.

### 5. Resume Semantics

`engram resume <branch>`:
- checkout target branch,
- restore latest checkpointed session metadata,
- emit exact command hints for agent restart/resume.

## Security and Privacy

1. Redaction pass before writing to `engram/checkpoints/v1`.
2. Shadow/transient storage treated as local-only, never auto-pushed.
3. Explicit docs warning for public repos.
4. Config flag to disable checkpoint push (`push_checkpoints=false`).

## Config Model

- Project config: `.engram/settings.json`
- Local override: `.engram/settings.local.json`
- Effective precedence: local overrides project per field.

Candidate keys:
- `enabled`
- `strategy_options.push_checkpoints`
- `strategy_options.redaction.enabled`
- `strategy_options.summarize.enabled`

## Execution Plan

### Phase A — Foundation
- Add settings loader with project/local merge.
- Add checkpoint id generation + metadata schema.
- Add metadata branch writer/reader primitives.

### Phase B — Lifecycle Integration
- Capture session snapshots on lifecycle events.
- Add condensation on commit boundary.
- Add commit trailer insertion path.

### Phase C — User Commands
- `engram checkpoint list`
- `engram rewind [--list|<id>]`
- `engram resume <branch>`

### Phase D — Hardening
- Redaction pipeline,
- worktree/concurrent session tests,
- stale-state recovery (`engram doctor`).

## Risks and Mitigations

1. **Risk:** Rewind deletes important local files.
   - **Mitigation:** baseline inventory + allowlist preservation for pre-session untracked files.

2. **Risk:** Metadata branch divergence across remotes.
   - **Mitigation:** explicit fetch/push workflow and conflict-safe merge strategy.

3. **Risk:** Secret leakage in metadata.
   - **Mitigation:** layered redaction + public-repo warnings + opt-out flags.

## Verification Plan

1. Unit tests
- checkpoint id/path sharding
- settings precedence merge
- trailer parsing/insertion
- redaction filters

2. Integration tests
- multi-checkpoint session condensation
- rewind file correctness (including untracked preservation)
- resume branch/session restoration
- concurrent session interleaving

3. E2E tests
- Claude/OpenCode/OpenClaw flows create checkpoint-linked commits
- metadata branch inspection and restore correctness

## Open Questions

1. Should checkpoint condensation run in prepare-commit-msg or post-commit?
2. Should trailer insertion be automatic or opt-in per repo?
3. Should metadata branch commits include summarized text blobs by default or behind a feature flag?

## Next Beads (implementation split)

- Schema + settings layer
- Metadata branch git primitives
- Commit trailer integration
- Rewind engine
- Resume engine
- Redaction and security hardening
- Cross-agent E2E test suite
