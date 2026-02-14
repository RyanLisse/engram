---
title: "feat: Multi-Agent Integration Patterns"
type: feat
date: 2026-02-12
---

# Multi-Agent Integration Patterns

## Overview

Add a hybrid multi-agent integration layer to Engram enabling seamless memory sharing across a layered agent topology (inner personal circle + outer project/team ring). Four components: shared scope layering, handoff protocol, smart routing via enrichment pipeline, and cross-agent deduplication.

**Brainstorm:** `docs/brainstorms/2026-02-12-multi-agent-integration-patterns.md`

## Problem Statement

Currently each Engram agent operates in isolation with its own private scope. When switching between agents (Indy in Claude Code -> mobile assistant -> background researcher), context is lost. Agents don't know what other agents know, store redundant facts about the same topics, and can't seamlessly continue each other's work.

## Proposed Solution

Hybrid approach combining:
1. **Shared scopes** for persistent cross-agent knowledge (the base layer)
2. **Handoff protocol** via session summary facts for session continuity
3. **Smart routing** via enrichment pipeline for cross-agent awareness
4. **Cross-agent dedup** cron for preventing redundancy

## Technical Approach

### Architecture

```
Inner Circle (personal agents)
  Indy ──┐
  Mobile ─┼── shared-personal scope (full R/W) + private scopes
  Researcher ──┘     │
                     │ cross-scope recall (existing)
                     ▼
              ┌─────────────┐
              │   Convex     │
              │  (facts,     │ ◄── enrichment pipeline
              │   scopes,    │     embed → extract → score → ROUTE (new)
              │   agents,    │
              │   notifs)    │
              └─────────────┘
                     ▲
                     │ project-scoped access
  TeamAgent1 ──┐    │
  TeamAgent2 ──┼────┘
  CIBot ───────┘
Outer Ring (project/team agents)
```

**Updated enrichment pipeline:**
```
store_fact → immediate response (<50ms)
     │
     ▼ (async, never blocks agent)
  embed (Cohere Embed 4, 1024-dim)
     → importance scoring (multi-factor)
     → smart routing (NEW: match against agent capabilities)
     → notification write (NEW: notify relevant agents)
```

### Implementation Phases

#### Phase 1: Shared Scopes + Handoff Protocol

**Goal:** Inner circle agents share a common memory layer and can hand off session context.

**Schema Changes:**

`convex/schema.ts` — Add to `agents` table:
```typescript
isInnerCircle: v.optional(v.boolean()),        // Auto-join shared-personal scope
capabilityEmbedding: v.optional(v.array(v.float64())), // Pre-computed for routing (Phase 2)
```

No changes to `facts` or `memory_scopes` tables — existing schema supports everything.

**Convex Backend Changes:**

1. `convex/functions/agents.ts` — Extend `register` mutation:
   - If `isInnerCircle: true`, auto-add agent to `shared-personal` scope members
   - Create `shared-personal` scope on first inner-circle registration if not exists
   - Scope config: `readPolicy: "members"`, `writePolicy: "members"`, `adminPolicy: "creator"`

2. `convex/functions/facts.ts` — Add `getRecentHandoffs` query:
   ```typescript
   // Query session_summary facts from other agents in permitted scopes
   // Filter: factType === "session_summary", createdBy !== currentAgent, last 7 days
   // Sort by timestamp desc, limit 5
   ```

3. `convex/functions/scopes.ts` — Add `adminPolicy` field handling:
   - Extend `addMember` mutation to check admin policy
   - `"creator"`: only first member (creator) can add/remove
   - `"members"`: any member can add/remove

**MCP Server Changes:**

4. `mcp-server/src/tools/register-agent.ts` — Pass `isInnerCircle` flag to Convex mutation

5. `mcp-server/src/tools/get-context.ts` — Extend response:
   - After gathering facts/entities/themes, also fetch `getRecentHandoffs`
   - Return `recentHandoffs: [{ conversationId, fromAgent, summary, timestamp }]`

6. **New tool:** `mcp-server/src/tools/end-session.ts` — `memory_end_session`:
   ```typescript
   // Input: { conversationId?, summary: string }
   // Action: Store session_summary fact in shared scope
   // Action: Call addHandoff mutation on conversation (if conversationId provided)
   // Return: { factId, handoffRecorded: boolean }
   ```

7. `mcp-server/src/lib/convex-client.ts` — Add typed wrappers:
   - `getRecentHandoffs(agentId, scopeIds, limit)`

8. `mcp-server/src/index.ts` — Register new `memory_end_session` tool

**Seed Script:**

9. `convex/functions/seed.ts` — Add `shared-personal` scope creation:
   ```typescript
   // Create shared-personal scope with initial members
   // members: ["indy"] (others join via registration with isInnerCircle)
   // readPolicy: "members", writePolicy: "members"
   ```

**Tests:**
- [ ] Agent with `isInnerCircle: true` auto-joins shared-personal scope
- [ ] Agent A stores fact in shared-personal, Agent B can recall it
- [ ] Agent A cannot recall from Agent B's private scope
- [ ] `memory_end_session` writes session_summary fact to shared scope
- [ ] `memory_get_context` includes recent handoffs from other agents
- [ ] Only scope creator can add members (adminPolicy: "creator")
- [ ] Session summaries decay at standard rate (0.99)

---

#### Phase 2: Smart Routing via Enrichment Pipeline

**Goal:** After enriching a fact, automatically notify relevant agents based on content-capability matching.

**Schema Changes:**

`convex/schema.ts` — Add `notifications` table:
```typescript
notifications: defineTable({
  agentId: v.string(),         // Target agent
  factId: v.id("facts"),       // The relevant fact
  reason: v.string(),          // Why this agent was notified
  read: v.boolean(),           // Has agent seen it
  createdAt: v.number(),
  expiresAt: v.number(),       // createdAt + 30 days
})
  .index("by_agent", ["agentId", "read", "createdAt"])
  .index("by_fact", ["factId"])
  .index("by_expiry", ["expiresAt"])
```

**Convex Backend Changes:**

1. `convex/actions/embedAgentCapabilities.ts` — New action:
   - Concatenate agent capabilities + telos into text
   - Embed via Cohere Embed 4
   - Store in `agents.capabilityEmbedding`
   - Called on agent registration and capability updates

2. `convex/actions/route.ts` — New action:
   ```typescript
   // Input: factId
   // 1. Get fact + its embedding + its scopeId
   // 2. Get all registered agents (exclude fact creator)
   // 3. Filter: agent has read access to fact's scope
   // 4. Filter: agent has capabilityEmbedding
   // 5. Compute cosine similarity(fact.embedding, agent.capabilityEmbedding)
   // 6. Filter: similarity > 0.3 AND fact.importanceScore > 0.5
   // 7. Create notification for each qualifying agent
   ```

3. `convex/actions/enrich.ts` — Extend pipeline:
   - After importance scoring, schedule `route.routeToAgents({ factId })`
   - Routing is fire-and-forget (failure doesn't affect enrichment)

4. `convex/functions/notifications.ts` — New CRUD:
   - `getUnreadByAgent(agentId, limit)` — For get_context piggyback
   - `markRead(notificationId)` — For acknowledgment
   - `markAllRead(agentId)` — Batch acknowledgment
   - `deleteExpired()` — For cleanup cron

**MCP Server Changes:**

5. `mcp-server/src/tools/get-context.ts` — Extend response:
   - After fetching handoffs, also fetch `getUnreadByAgent`
   - Return `notifications: [{ factId, reason, createdAt }]` (max 10)
   - Auto-mark returned notifications as read

6. `mcp-server/src/tools/register-agent.ts` — Trigger capability embedding:
   - After registration, call `embedAgentCapabilities` action

7. `mcp-server/src/lib/convex-client.ts` — Add typed wrappers:
   - `getUnreadNotifications(agentId, limit)`
   - `markNotificationRead(notificationId)`
   - `markAllNotificationsRead(agentId)`

**Cron Addition:**

8. `convex/crons.ts` — Add notification cleanup:
   ```typescript
   // Daily at 1:30 UTC — Clean expired notifications
   crons.daily("notif_cleanup", { hourUTC: 1, minuteUTC: 30 },
     internal.crons.cleanup.cleanExpiredNotifications)
   ```

9. `convex/crons/cleanup.ts` — Add `cleanExpiredNotifications`:
   - Delete notifications where `expiresAt < now`
   - Batch 500, self-schedule pattern

**Tests:**
- [ ] Agent registration triggers capability embedding
- [ ] Enrichment pipeline calls routing after importance scoring
- [ ] Routing only notifies agents with read access to fact's scope
- [ ] Routing skips fact creator (no self-notification)
- [ ] Routing applies importance threshold (> 0.5)
- [ ] get_context returns unread notifications
- [ ] Expired notifications cleaned by cron
- [ ] Routing failure does not break enrichment pipeline

---

#### Phase 3: Cross-Agent Deduplication

**Goal:** Detect and merge semantically identical facts from different agents in shared scopes.

**Schema Changes:**

`convex/schema.ts` — Add to `facts` table:
```typescript
mergedContent: v.optional(v.string()), // Content from merged-away fact
```

Add to `memory_scopes` table (inside existing `memoryPolicy` object):
```typescript
dedupThreshold: v.optional(v.float64()), // Cosine similarity threshold (default 0.88)
```

**Convex Backend Changes:**

1. `convex/crons/dedup.ts` — New cron implementation:
   ```typescript
   // 1. Get shared scopes (readPolicy !== "members" || members.length > 1)
   // 2. For each scope, get active facts with embeddings from last 48 hours
   //    (only recent facts — older ones already deduped or divergent)
   // 3. For each pair of facts from DIFFERENT agents:
   //    a. Compute cosine similarity
   //    b. If > threshold (scope.memoryPolicy.dedupThreshold || 0.88):
   //       - Keep fact with higher (importance * 0.7 + accessedCount * 0.3)
   //       - Store loser's content in winner's mergedContent field
   //       - Set winner's contributingAgents = union of both
   //       - Union tags, entityIds
   //       - Mark loser: lifecycleState="merged", mergedInto=winner._id
   //       - Set winner: consolidatedFrom = [...existing, loser._id]
   // 4. Batch 500, self-schedule pattern
   ```

2. `convex/crons.ts` — Add dedup cron:
   ```typescript
   // Daily at 2:30 UTC — Cross-agent deduplication
   crons.daily("dedup", { hourUTC: 2, minuteUTC: 30 },
     internal.crons.dedup.runDedup)
   ```

**Safety Guards:**
- Only dedup facts from DIFFERENT agents (same-agent facts preserve context)
- Only dedup facts in shared scopes (private scope facts are agent's own)
- Only dedup facts WITH embeddings (skip un-enriched facts)
- Only dedup facts from last 48 hours (incremental, not all-pairs)
- Idempotency: skip facts already in "merged" lifecycle state

**Tests:**
- [ ] Two similar facts from different agents in shared scope get merged
- [ ] Surviving fact has `contributingAgents` from both agents
- [ ] Loser's content preserved in `mergedContent`
- [ ] Facts from same agent NOT deduped
- [ ] Facts in private scopes NOT deduped
- [ ] Facts without embeddings skipped
- [ ] Merged facts still searchable (lifecycle filter includes "merged" for search)

---

#### Phase 4: Scope Management + Security Hardening

**Goal:** Proper admin controls for scope membership and security audit of all cross-agent flows.

**Schema Changes:**

`convex/schema.ts` — Add to `memory_scopes` table:
```typescript
adminPolicy: v.optional(v.string()), // "creator" | "members" | "admin_only"
```

**Convex Backend Changes:**

1. `convex/functions/scopes.ts` — Extend `addMember` and `removeMember`:
   - Check `adminPolicy` before allowing membership changes
   - On `removeMember`: clean up notifications for facts in that scope

2. `convex/functions/scopes.ts` — Add `getByName` public query:
   - Expose scope lookup by name (currently only internal)

**Security Audit Checklist:**
- [ ] Routing action checks `readPolicy` before notifying (Phase 2 R4)
- [ ] Notifications cannot leak fact content (only factId + reason)
- [ ] Outer ring agents cannot access shared-personal scope
- [ ] Admin policy prevents unauthorized scope membership changes
- [ ] Session summaries in shared scope follow standard scope permissions
- [ ] Dedup cron only operates within shared scopes

## Alternative Approaches Considered

| Approach | Why Rejected |
|----------|-------------|
| Event-Driven Memory Bus | Over-engineered for current scale. MCP stdio doesn't support server-push. |
| Memory Broker Layer | New service to maintain. Single point of failure. |
| Per-fact ACLs | Too granular. Scope-based is simpler and sufficient. |
| Real-time WebSocket notifications | MCP transport is stdio. Push not feasible without agent-side server. |

## Acceptance Criteria

### Functional Requirements

- [ ] Inner circle agents share facts via `shared-personal` scope
- [ ] `memory_end_session` tool writes handoff summary to shared scope
- [ ] `memory_get_context` surfaces recent handoffs from other agents
- [ ] Enrichment pipeline routes high-importance facts to relevant agents
- [ ] Notifications appear in `memory_get_context` response
- [ ] Cross-agent duplicate facts merged daily with provenance tracking
- [ ] Scope admin policy controls membership changes

### Non-Functional Requirements

- [ ] Fact storage remains < 50ms (routing is async)
- [ ] Routing adds < 2s to enrichment pipeline per fact
- [ ] Dedup cron completes within 5 minutes for 10K facts
- [ ] Notification table cleaned daily (30-day expiry)

### Quality Gates

- [ ] All Convex functions have matching typed wrappers in convex-client.ts
- [ ] Server-side scope filtering on all cross-agent queries (SCOPE-SAFETY-SPEC)
- [ ] No client-side scope filtering
- [ ] Routing checks read access before notifying

## Success Metrics

1. **Handoff continuity:** Agent B's first response after handoff references Agent A's context
2. **Discovery:** Agent receives notification about relevant fact from another agent within enrichment cycle
3. **Dedup:** Redundant facts across agents reduced by > 50% in shared scopes
4. **No privacy leaks:** Zero cross-scope information leakage in testing

## Dependencies & Prerequisites

- Cohere Embed 4 API access (existing — used for fact embeddings)
- Convex backend deployed (existing — Phases 1-6 complete)
- At least 2 agents registered for testing (Indy + test agent)

## Risk Analysis & Mitigation

| Risk | Mitigation |
|------|-----------|
| Routing bottleneck (N agents * M facts) | Only route facts with importance > 0.5. Cache agent embeddings. |
| Dedup false positives (merging different facts) | Conservative threshold (0.88). Only cross-agent. Only shared scopes. |
| Notification spam | Importance threshold + 30-day expiry + max 10 per get_context |
| Scope escalation | Admin policy on scopes. Server-side permission checks. |
| Enrichment pipeline failure cascade | Routing is fire-and-forget. Failure logged but doesn't block embedding. |

## Files to Create/Modify

### New Files
- `convex/actions/route.ts` — Smart routing action
- `convex/actions/embedAgentCapabilities.ts` — Agent capability embedding
- `convex/crons/dedup.ts` — Cross-agent dedup cron
- `convex/functions/notifications.ts` — Notification CRUD
- `mcp-server/src/tools/end-session.ts` — Session handoff tool

### Modified Files
- `convex/schema.ts` — Add notifications table, extend agents + facts + scopes
- `convex/functions/agents.ts` — Inner circle auto-join, capability embedding trigger
- `convex/functions/facts.ts` — Add getRecentHandoffs query
- `convex/functions/scopes.ts` — Admin policy, cleanup on member removal
- `convex/actions/enrich.ts` — Wire routing into pipeline
- `convex/crons.ts` — Add dedup + notification cleanup crons
- `convex/crons/cleanup.ts` — Add expired notification cleanup
- `mcp-server/src/index.ts` — Register memory_end_session tool
- `mcp-server/src/tools/register-agent.ts` — Pass isInnerCircle, trigger capability embedding
- `mcp-server/src/tools/get-context.ts` — Surface handoffs + notifications
- `mcp-server/src/lib/convex-client.ts` — Add typed wrappers for new functions

## References & Research

### Internal References
- Brainstorm: `docs/brainstorms/2026-02-12-multi-agent-integration-patterns.md`
- Scope safety: `docs/plans/SCOPE-SAFETY-SPEC.md`
- Schema: `convex/schema.ts`
- Enrichment pipeline: `convex/actions/enrich.ts`
- Existing cron patterns: `convex/crons/decay.ts`, `convex/crons/consolidate.ts`
- Convex client pattern: `mcp-server/src/lib/convex-client.ts`
- Field observations (GIZIN): `docs/research/field-observations.md`
- Letta patterns: `docs/research/letta-patterns-for-engram.md`

### Research Insights Applied
- **SCOPE-SAFETY-SPEC:** All queries use server-side scope filtering
- **GIZIN field observations:** Emotional context preserved through merges
- **Letta shared blocks:** Added admin policy to prevent last-write-wins issues
- **Existing patterns:** Async enrichment, batch cron with self-scheduling, string-based Convex paths
