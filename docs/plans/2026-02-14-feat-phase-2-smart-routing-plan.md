---
title: "feat: Phase 2 - Smart Routing via Enrichment Pipeline"
type: feat
date: 2026-02-14
parent: 2026-02-12-feat-multi-agent-integration-patterns-plan.md
---

# Phase 2: Smart Routing via Enrichment Pipeline

## Overview

Extend the enrichment pipeline to automatically notify relevant agents when high-importance facts are stored, based on content-capability matching via embeddings.

**Parent Plan:** `2026-02-12-feat-multi-agent-integration-patterns-plan.md` (Phase 2)

## Goals

1. Auto-notify relevant agents about facts matching their capabilities
2. Enable cross-agent discovery without polling
3. Non-blocking notifications (fire-and-forget)
4. 30-day notification expiry to prevent bloat

## Technical Approach

### Architecture

```
store_fact → immediate response (<50ms)
     │
     ▼ (async, never blocks agent)
  embed (Cohere Embed 4, 1024-dim)
     → importance scoring (multi-factor)
     → smart routing (NEW: match against agent capabilities)
     → notification write (NEW: notify relevant agents)
```

### Notification Flow

1. Agent stores fact → enrichment pipeline runs
2. After importance scoring, route.routeToAgents fires
3. Routing computes similarity(fact.embedding, agent.capabilityEmbedding)
4. Agents with similarity > 0.3 AND fact importance > 0.5 get notified
5. Notifications appear in next memory_get_context call

## Implementation Checklist

### Schema Changes

- [x] Add `notifications` table (Task #12)
  ```typescript
  notifications: defineTable({
    agentId: v.string(),
    factId: v.id("facts"),
    reason: v.string(),
    read: v.boolean(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_agent", ["agentId", "read", "createdAt"])
    .index("by_fact", ["factId"])
    .index("by_expiry", ["expiresAt"])
  ```

### Convex Backend

- [ ] `convex/actions/embedAgentCapabilities.ts` (Task #13)
  - Concatenate agent.capabilities + agent.telos
  - Embed via Cohere Embed 4 (1024-dim)
  - Store in agents.capabilityEmbedding
  - Called on registration and capability updates

- [ ] `convex/actions/route.ts` (Task #14)
  - Get fact + embedding + scopeId
  - Get all registered agents (exclude fact creator)
  - Filter: agent has read access to fact's scope
  - Filter: agent has capabilityEmbedding
  - Compute cosine similarity for each
  - Filter: similarity > 0.3 AND fact.importanceScore > 0.5
  - Create notification for each qualifying agent

- [ ] Extend `convex/actions/enrich.ts` (Task #15)
  - After importance scoring, schedule route.routeToAgents
  - Fire-and-forget (failure doesn't break enrichment)

- [ ] `convex/functions/notifications.ts` (Task #16)
  - `getUnreadByAgent(agentId, limit)` query
  - `markRead(notificationId)` mutation
  - `markAllRead(agentId)` mutation
  - `deleteExpired()` internal mutation for cron

- [ ] Update `convex/functions/agents.ts` register (Task #18)
  - After registration, call embedAgentCapabilities action

### MCP Server

- [ ] Extend `mcp-server/src/tools/get-context.ts` (Task #17)
  - Fetch unread notifications via getUnreadByAgent
  - Include in response (max 10)
  - Auto-mark returned notifications as read

- [ ] Update `mcp-server/src/lib/convex-client.ts` (Task #20)
  - Add getUnreadNotifications(agentId, limit)
  - Add markNotificationRead(notificationId)
  - Add markAllNotificationsRead(agentId)

### Crons

- [ ] Add to `convex/crons.ts` (Task #19)
  ```typescript
  crons.daily("notif_cleanup", { hourUTC: 1, minuteUTC: 30 },
    internal.crons.cleanup.cleanExpiredNotifications)
  ```

- [ ] `convex/crons/cleanup.ts` cleanExpiredNotifications
  - Delete notifications where expiresAt < now
  - Batch 500, self-schedule pattern

## Acceptance Criteria

- [ ] Agent registration triggers capability embedding
- [ ] Enrichment pipeline calls routing after importance scoring
- [ ] Routing only notifies agents with read access to fact's scope
- [ ] Routing skips fact creator (no self-notification)
- [ ] Routing applies importance threshold (> 0.5)
- [ ] get_context returns unread notifications
- [ ] Expired notifications cleaned by daily cron
- [ ] Routing failure does not break enrichment pipeline

## Performance Requirements

- [ ] Fact storage remains < 50ms (routing is async)
- [ ] Routing adds < 2s to enrichment pipeline per fact
- [ ] Notification table cleaned daily (30-day expiry)

## Testing

Run after implementation:

```bash
# Test capability embedding
npx convex run functions/agents:register --agentId test-agent --name "Test Agent" --capabilities '["research", "coding"]' --telos "Test agent for routing" --isInnerCircle false

# Verify capabilityEmbedding is populated
npx convex run functions/agents:getByAgentId --agentId test-agent

# Store high-importance fact
npx convex run functions/facts:storeFact --content "Research about TypeScript performance" --factType decision --scopeId <scope-id> --createdBy indy

# Check notifications (after enrichment completes ~5s)
# Use MCP: memory_get_context with topic "performance"
# Should include notification from routing
```

## Rollback Plan

If routing causes issues:
1. Comment out routing call in enrich.ts
2. Redeploy Convex functions
3. Notifications stop being created
4. Existing notifications expire naturally

## Related Files

- Parent: `docs/plans/2026-02-12-feat-multi-agent-integration-patterns-plan.md`
- Schema: `convex/schema.ts`
- Enrichment: `convex/actions/enrich.ts`
- Existing crons: `convex/crons/decay.ts`, `convex/crons/consolidate.ts`
