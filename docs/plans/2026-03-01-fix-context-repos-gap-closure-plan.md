---
title: "Close Remaining Context Repositories Gaps"
type: "fix"
date: "2026-03-01"
status: "completed"
owner: "codex"
tags:
  - context-repos
  - progressive-disclosure
  - reflection
  - bootstrap
  - qa-retrieval
---

# Close Remaining Context Repositories Gaps

## Goal

Close the remaining implementation gaps between `PLAN-CONTEXT-REPOS.md` and the current `master` branch without reworking the large parts that are already present.

## Completion Notes

Implemented on `master` on March 1, 2026:

- `summary` normalization now behaves as `summary` → `factualSummary` → truncated content for disclosure surfaces
- `memory_reflect` filtering parameters now affect the actual reflection input set
- `scripts/bootstrap-from-sessions.ts` now supports direct ingest with provenance tagging and idempotent dedup keys
- QA retrieval now has an explicit deterministic upgrade path for high-value facts, benchmark coverage, explicit fused weighting, and chain provenance

This is not a greenfield feature plan. Most of the roadmap already exists in production code. The remaining work is primarily consistency and completion:

1. Normalize `summary` vs `factualSummary`
2. Make `memory_reflect` parameters actually influence backend behavior
3. Turn session bootstrap from export-only into ingest-capable flow
4. Decide and implement the next maturity step for QA-pair generation/retrieval

## Why This Plan Exists

The current codebase already includes:

- Progressive disclosure primitives: `memory_get_manifest`, pin/unpin, system prompt manifest injection
- Version history: `fact_versions`, history/rollback tooling, dashboard timeline
- Sleep-time background jobs: reflection cron, observer sweep, action recommendations
- QA-aware retrieval primitives: QA fields, QA search, chain recall
- Filesystem mirror primitives: vault export/import/list/reconcile
- Defragmentation tooling: cron + manual `memory_defrag`

However, several important edges are still incomplete or inconsistent:

- The manifest and pinning UX uses `summary`, while enrichment writes `factualSummary`
- `memory_reflect` accepts `depth`, `timeWindow`, and `focusEntities`, but backend reflection currently ignores the parameters
- `scripts/bootstrap-from-sessions.ts` extracts facts but does not ingest them into Engram
- QA generation is heuristic-only; plan intent suggests a more deliberate retrieval-quality layer

These are not cosmetic gaps. They create behavioral mismatch between API contract, backend behavior, and user expectations.

## Non-Goals

- Do not redesign the entire context-repositories architecture
- Do not replace existing progressive disclosure, version history, or vault systems wholesale
- Do not rewrite reflection/observer from scratch
- Do not introduce broad schema churn unless strictly required to normalize behavior

## Current State Summary

### Already Implemented

- `convex/schema.ts` contains `pinned`, `summary`, QA fields, and `fact_versions`
- `mcp-server/src/tools/manifest.ts` exists
- `mcp-server/src/tools/pin-fact.ts` exists
- `mcp-server/src/tools/system-prompt-builder.ts` includes pinned + manifest sections
- `convex/crons/reflection.ts` and `convex/crons.ts` include a sleep-time reflection sweep
- `mcp-server/src/tools/fact-history.ts` and dashboard version timeline exist
- `scripts/bootstrap-from-sessions.ts` exists
- `mcp-server/src/tools/chain-recall.ts` and QA-aware recall paths exist

### Known Gaps

1. **Progressive disclosure summary mismatch**
   - Enrichment writes `factualSummary`
   - Manifest and pinning read `summary`
   - Result: many facts never show their intended one-line disclosure text

2. **Reflect API contract mismatch**
   - Tool accepts filtering knobs
   - Backend returns them cosmetically
   - Actual reflection logic still processes all summaries in scope

3. **Bootstrap flow incomplete**
   - Session parser exists
   - No first-class ingestion path from parsed facts into stored Engram facts

4. **QA maturity gap**
   - Heuristic QA is present
   - Need an explicit decision and implementation for whether heuristic-only is sufficient or whether LLM/upgrade paths are required

## Workstreams

## Workstream 1: Normalize Progressive Disclosure Summary Fields

### Problem

The codebase currently has two semantically overlapping summary concepts:

- `summary`: intended for manifest/frontmatter/tiered disclosure
- `factualSummary`: existing compressed representation also used in other pipelines

Right now enrichment populates `factualSummary`, while manifest logic expects `summary`. This creates partial feature failure even though all primitives exist.

### Decision

Use a clear split:

- `summary` = UX-facing 1-line progressive disclosure string
- `factualSummary` = compact semantic/compressed representation for retrieval and storage efficiency

If current heuristic generation only produces one short line, write it to both fields where appropriate until richer compression diverges them.

### Tasks

#### 1.1 Audit all `summary` and `factualSummary` reads/writes

Review at minimum:

- `convex/actions/enrich.ts`
- `convex/functions/facts.ts`
- `mcp-server/src/tools/manifest.ts`
- `mcp-server/src/tools/system-prompt-builder.ts`
- `mcp-server/src/lib/fact-summary.ts`
- `mcp-server/src/lib/vault-format.ts`
- `mcp-server/src/lib/budget-aware-loader.ts`

Document exactly which field each path should use.

#### 1.2 Update enrichment to populate `summary`

When enrichment generates the 1-line disclosure string, patch `summary`.

If preserving backward compatibility is simpler, also keep populating `factualSummary` until all read paths are explicit.

#### 1.3 Add fallback rules for old rows

Manifest and pinning code should use:

1. `summary`
2. `factualSummary`
3. truncated `content`

This avoids blank manifests for legacy facts.

#### 1.4 Backfill existing facts

Add a targeted backfill path for existing records missing `summary`:

- either one-off script
- or cron-safe incremental backfill action

Prefer incremental, idempotent behavior.

### Acceptance Criteria

- Newly enriched facts always get a usable `summary`
- Manifest output shows real 1-line summaries for new and old facts
- Pinned fact displays do not fall back to raw content unless no summary exists at all
- No existing retrieval paths regress

### Tests

- Unit: summary generation writes expected fields
- Unit: manifest fallback ordering
- Integration: `store_fact` -> enrich -> `memory_get_manifest`
- Integration: system prompt builder includes normalized summary behavior

## Workstream 2: Make `memory_reflect` Parameters Real

### Problem

`memory_reflect` exposes:

- `depth`
- `timeWindow`
- `focusEntities`

but backend reflection currently ignores those filters and simply returns them in the response. This is misleading behavior.

### Decision

Honor these parameters in the backend rather than removing them. The API is already good; the implementation needs to catch up.

### Tasks

#### 2.1 Define exact parameter semantics

- `shallow`: recent summaries only, no heavy merge/escalation behavior beyond lightweight digesting
- `standard`: current default behavior
- `deep`: wider history window and broader synthesis scope
- `timeWindowHours`: authoritative override for time filtering
- `focusEntities`: restrict input summaries/facts to records involving matching entities

#### 2.2 Thread parameters into Convex action boundaries

Update:

- `mcp-server/src/tools/observation-memory.ts`
- `mcp-server/src/lib/convex-client/...`
- `convex/actions/reflector.ts`

Parameters must affect the query inputs, not just response metadata.

#### 2.3 Add filtering queries

If current queries cannot support time/entity filtering, add explicit internal queries in Convex for:

- summaries by time window
- summaries filtered by entity membership or linked facts

Keep filters index-friendly where possible; degrade gracefully if exact entity filtering requires application-side filtering.

#### 2.4 Align cron reflection and manual reflection behavior

Clarify whether cron reflection remains broad/global while manual `memory_reflect` becomes targeted, or whether both share common filtering primitives.

Prefer shared primitives to avoid drift.

### Acceptance Criteria

- `memory_reflect depth=shallow` produces materially different input scope than `deep`
- `timeWindow` changes the candidate set
- `focusEntities` narrows candidate summaries/facts
- response metadata matches actual backend behavior

### Tests

- Unit: parameter-to-filter mapping
- Integration: same scope, different `timeWindow` -> different source counts
- Integration: `focusEntities` excludes unrelated data
- E2E: manual reflection reports prove the filter knobs are active

## Workstream 3: Complete History Bootstrap as an Ingestion Flow

### Problem

The bootstrap script parses session history and outputs JSON, but does not directly import parsed facts into Engram. That makes it a useful extraction utility, not a complete bootstrap workflow.

### Decision

Keep the extraction mode, but add a first-class ingest mode.

The tool should support:

- preview/dry-run
- extract-only JSON output
- direct ingest into a target scope

### Tasks

#### 3.1 Define bootstrap CLI modes

Support explicit modes:

- `--dry-run`
- `--json`
- `--ingest`
- `--scope <scope>`
- `--agent-id <agent>`

No hidden side effects.

#### 3.2 Implement ingestion path

For each parsed fact:

- resolve scope
- map parsed metadata to Engram fact shape
- deduplicate conservatively
- store via normal public mutation/tool path where possible

Do not bypass the normal enrichment/version/event flows unless unavoidable.

#### 3.3 Add provenance tagging

Bootstrap imports should be traceable:

- source file path
- import mode
- imported timestamp
- tags like `bootstrap`, `session-import`

#### 3.4 Add resumability/idempotency

Avoid duplicate imports across repeated runs:

- content hash
- source path + timestamp marker
- or structured dedup before insert

### Acceptance Criteria

- dry-run shows what would be imported
- ingest mode stores facts into Engram without manual JSON piping
- repeated runs do not explode duplicates
- imported facts remain compatible with enrichment and recall flows

### Tests

- Unit: session parsing formats (`json`, `jsonl`)
- Integration: dry-run vs ingest behavior
- Integration: idempotent rerun
- E2E: bootstrap a sample session corpus into a test scope and verify recall

## Workstream 4: Raise QA-Pair Retrieval from “Present” to “Deliberate”

### Problem

QA fields, QA search, and chain recall exist, but generation is heuristic-only. The system needs a deliberate product decision about whether this is “good enough” or only a stopgap.

### Decision Needed

Choose one of these:

1. **Keep heuristic QA as baseline**
   - cheap
   - deterministic
   - improve ranking and templates only

2. **Hybrid QA generation**
   - heuristic immediately
   - optional async LLM upgrade for high-importance facts

3. **Full LLM QA generation**
   - most accurate
   - most expensive

Recommended: option 2.

### Tasks

#### 4.1 Instrument current QA quality

Before changing generation, create a benchmark slice:

- representative facts
- retrieval questions
- compare text-only, current QA, chain recall

Measure practical recall improvement, not just implementation completeness.

#### 4.2 Add upgrade path for high-value facts

For facts above an importance threshold or selected fact types:

- generate improved QA pair asynchronously
- preserve heuristic as fallback
- raise `qaConfidence` for upgraded rows

#### 4.3 Make retrieval weight explicit

Document and tune how `memory_recall` fuses:

- text results
- vector results
- QA results
- graph results

The retrieval stack already uses RRF. Make QA weighting intentional and testable.

#### 4.4 Tighten chain recall provenance

Ensure chain recall answers clearly indicate:

- which QA pair matched
- which linked facts were followed
- what confidence or certainty the answer has

### Acceptance Criteria

- benchmark exists and can be rerun
- QA path quality is measurable
- high-value facts can receive stronger QA pairs than low-value facts
- recall/chain recall outputs show clear provenance

### Tests

- Unit: upgraded QA pair persistence
- Benchmark: compare heuristic vs upgraded QA quality
- Integration: `memory_recall` uses QA path in fused ranking
- E2E: `memory_chain_recall` returns traceable multi-hop answers

## Workstream 5: Documentation and Contract Cleanup

### Problem

Several APIs now exist but either overstate behavior or drift from the original plan text.

### Tasks

#### 5.1 Update plan-adjacent docs

Refresh:

- `CLAUDE.md`
- relevant README/API references
- tool descriptions for manifest/reflect/bootstrap

#### 5.2 Document implemented-vs-planned differences

Record where Engram intentionally diverges from the original plan:

- heuristic QA vs LLM QA
- cron reflection vs OpenClaw reflection agent
- `summary` vs `factualSummary` semantics

### Acceptance Criteria

- docs no longer imply unimplemented reflect filtering
- docs correctly describe current summary semantics
- bootstrap documentation includes ingest mode

## Recommended Order

1. Workstream 1: summary normalization
2. Workstream 2: real reflect parameter behavior
3. Workstream 3: bootstrap ingest
4. Workstream 4: QA maturity uplift
5. Workstream 5: docs cleanup

This order reduces drift early, makes APIs honest, then improves ingestion and retrieval quality.

## Risks

- Summary normalization may accidentally blur `summary` and `factualSummary` unless semantics are made explicit first
- Reflect filtering can become slow if entity filtering is implemented naïvely
- Bootstrap ingest can create duplicate or low-quality facts without strong idempotency
- QA upgrades can add cost and pipeline latency if not gated by importance/type

## Verification Strategy

For each workstream:

- add unit coverage first where behavior is narrow and deterministic
- add integration coverage for Convex + MCP boundaries
- add one end-to-end scenario proving the user-visible flow

Required verification commands before claiming completion on any implementation slice:

```bash
cd mcp-server && npm run build
cd cli && npm run build
ENGRAM_DISABLE_EVENT_BUS=1 bash scripts/test-engram.sh
```

Add targeted test commands for any new benchmark or bootstrap suites introduced by this work.

## Deliverable Definition

This gap-closure effort is complete when:

- progressive disclosure fields behave consistently
- `memory_reflect` parameters are real, not decorative
- session bootstrap can ingest directly into Engram
- QA-pair behavior has an explicit and tested maturity model
- docs describe actual behavior, not roadmap intent
