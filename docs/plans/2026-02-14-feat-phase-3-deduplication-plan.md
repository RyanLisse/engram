---
title: "feat: Phase 3 - Cross-Agent Deduplication"
type: feat
date: 2026-02-14
parent: 2026-02-12-feat-multi-agent-integration-patterns-plan.md
---

# Phase 3: Cross-Agent Deduplication

## Overview

Detect and merge semantically identical facts from different agents in shared scopes, preserving provenance and preventing memory bloat.

**Parent Plan:** `2026-02-12-feat-multi-agent-integration-patterns-plan.md` (Phase 3)

## Goals

1. Reduce redundant facts across agents in shared scopes
2. Preserve provenance via contributingAgents and mergedContent
3. Only dedup facts from DIFFERENT agents
4. Run incrementally (last 48 hours) to avoid O(n²) all-pairs comparison

## Problem Statement

When multiple inner circle agents work on related topics, they create duplicate facts:
- Agent A: "Engram uses Convex for cloud backend"
- Agent B: "Engram's backend is Convex with vector search"

These are semantically identical but stored separately, wasting space and splitting context.

## Technical Approach

### Deduplication Logic

```
Daily cron (2:30 UTC):
1. Get shared scopes (readPolicy !== "members" || members.length > 1)
2. For each scope:
   - Get active facts WITH embeddings from last 48 hours
   - For each pair of facts from DIFFERENT agents:
     a. Compute cosine similarity
     b. If > threshold (scope.dedupThreshold || 0.88):
        - Keep fact with higher (importance * 0.7 + accessedCount * 0.3)
        - Store loser's content in winner's mergedContent
        - Set winner's contributingAgents = union of both
        - Union tags, entityIds
        - Mark loser: lifecycleState="merged", mergedInto=winner._id
        - Set winner: consolidatedFrom = [...existing, loser._id]
3. Batch 500, self-schedule pattern
```

### Safety Guards

- Only dedup facts from DIFFERENT agents (same-agent facts preserve context)
- Only dedup facts in shared scopes (private scope facts are agent's own)
- Only dedup facts WITH embeddings (skip un-enriched facts)
- Only dedup facts from last 48 hours (incremental, not all-pairs)
- Idempotency: skip facts already in "merged" lifecycle state

## Implementation Checklist

### Schema Changes

- [ ] Add `mergedContent` field to facts table (Task #22)
  ```typescript
  mergedContent: v.optional(v.string())
  ```

- [ ] Add `dedupThreshold` to scope memoryPolicy (Task #23)
  ```typescript
  memoryPolicy: v.optional(
    v.object({
      // ... existing fields
      dedupThreshold: v.optional(v.float64()), // default 0.88
    })
  )
  ```

### Convex Backend

- [ ] Create `convex/crons/dedup.ts` (Task #24)
  - runDedup internal mutation
  - Get shared scopes
  - For each scope, get recent facts (48 hours)
  - Compare pairs from different agents
  - Merge if similarity > threshold
  - Batch 500, self-schedule

- [ ] Add to `convex/crons.ts` (Task #25)
  ```typescript
  crons.daily("dedup", { hourUTC: 2, minuteUTC: 30 },
    internal.crons.dedup.runDedup)
  ```

## Acceptance Criteria

- [ ] Two similar facts from different agents in shared scope get merged
- [ ] Surviving fact has `contributingAgents` from both agents
- [ ] Loser's content preserved in `mergedContent`
- [ ] Facts from same agent NOT deduped
- [ ] Facts in private scopes NOT deduped
- [ ] Facts without embeddings skipped
- [ ] Merged facts still searchable (lifecycle filter includes "merged" for search)

## Performance Requirements

- [ ] Dedup cron completes within 5 minutes for 10K facts
- [ ] Only processes facts from last 48 hours (incremental)
- [ ] Batches of 500 with self-scheduling

## Testing

```bash
# Setup: Register two inner circle agents
npx convex run functions/agents:register --agentId agent-a --name "Agent A" --isInnerCircle true
npx convex run functions/agents:register --agentId agent-b --name "Agent B" --isInnerCircle true

# Both agents store similar facts
npx convex run functions/facts:storeFact --content "Engram uses Convex as cloud backend" --createdBy agent-a --scopeId <shared-personal-id>
npx convex run functions/facts:storeFact --content "Engram's backend is Convex for cloud storage" --createdBy agent-b --scopeId <shared-personal-id>

# Wait for enrichment (embeddings needed)
sleep 10

# Run dedup manually
npx convex run crons/dedup:runDedup

# Verify merge
# - One fact should have lifecycleState="merged"
# - Other should have contributingAgents=["agent-a", "agent-b"]
# - mergedContent should contain loser's content
```

## Edge Cases

### High Similarity but Different Meaning

**Threshold too low** → False positives (merging different facts)
**Solution:** Conservative threshold (0.88) + only cross-agent dedup

### Agents Iterating on Facts

**Problem:** Agent A creates fact, Agent B refines → get merged even though B's version is better
**Solution:** Already handled — we keep the fact with higher score (importance * 0.7 + accessCount * 0.3)

### Rapid Fact Creation

**Problem:** Two agents create identical facts within seconds
**Solution:** 48-hour window catches these, dedup runs daily

## Rollback Plan

If dedup causes issues:
1. Disable cron in convex/crons.ts
2. Redeploy
3. No new merges occur
4. Existing merged facts remain (no true deletion)

## Related Files

- Parent: `docs/plans/2026-02-12-feat-multi-agent-integration-patterns-plan.md`
- Schema: `convex/schema.ts`
- Existing crons: `convex/crons/decay.ts`, `convex/crons/consolidate.ts`
- Lifecycle states: `convex/functions/facts.ts`
