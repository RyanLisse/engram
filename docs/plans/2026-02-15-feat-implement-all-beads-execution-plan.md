---
title: Execute All Beads - Agent-Native Refactoring Implementation
type: feat
date: 2026-02-15
status: active
total_beads: 16
phases: 3
estimated_days: 35
swarm_agents: 12
---

# Execute All Beads - Agent-Native Refactoring Implementation

## Executive Summary

Execute 16 beads across 3 phases to transform Engram from workflow-style tools to agent-native architecture. Uses swarm parallelization with 12 concurrent agents to complete in ~7 days (vs. 35 days sequential).

**Beads Overview:**
- **Phase 1 (5 beads)**: Configuration foundation - extract hardcoded values to database
- **Phase 2 (4 beads)**: Tool primitization - decompose 11 workflow tools into 25+ primitives
- **Phase 3 (4 beads)**: Real-time & identity - event log + agent context injection
- **Phase Epics (3)**: Tracking containers for each phase

**Swarm Strategy**: Maximize parallelization within dependency constraints. Wave-based execution with validation gates.

---

## Problem Statement

**Current**: 16 beads created but not implemented. Dependencies mapped but execution strategy unclear.

**Challenge**: 35-day sequential timeline is too slow. Need concurrent execution without breaking dependencies.

**Solution**: Swarm-based execution with 3 waves of parallel agents, validation gates between waves.

---

## Proposed Solution

### Execution Model: Wave-Based Swarm

```
Wave 1 (Day 1-2): Foundation
├─ Agent 1: engram-26p (config schema)
├─ Agent 2: engram-6v6 (DELETE mutations)
└─ Agent 3: engram-17d (config resolver) ← waits for 26p

Wave 2 (Day 3-4): Configuration Integration
├─ Agent 4: engram-jsf (migration script) ← waits for 17d
├─ Agent 5: engram-46p (refactor enrichment) ← waits for jsf
└─ Validation Gate: Verify all configs extracted, no hardcoded values remain

Wave 3 (Day 5-7): Tool Primitization
├─ Agent 6: engram-dt4 (decompose memory_recall)
├─ Agent 7: engram-95y (decompose memory_get_context)
├─ Agent 8: engram-vgb (decompose memory_summarize/prune)
└─ Agent 9: engram-1vx (backwards compat wrappers) ← waits for 6-8

Wave 4 (Day 8-9): Real-Time Foundation
├─ Agent 10: engram-qcu (memory_events table)
├─ Agent 11: engram-25m (agent identity tool) ← parallel to 10
└─ Validation Gate: Schema deployed, no data loss

Wave 5 (Day 10-11): Event Propagation
├─ Agent 12: engram-34c (event polling tool) ← waits for 10
├─ Agent 13: engram-tsn (emit events) ← waits for 10
└─ Final Validation: End-to-end event flow working

Wave 6 (Day 12): Epics & Documentation
├─ Close all 3 phase epics
├─ Update CHANGELOG.md
└─ Create migration guide
```

**Total Duration**: 12 days (vs. 35 sequential)
**Parallelization Factor**: 2.9x speedup
**Agent Peak**: 4 concurrent agents (Wave 3)

---

## Technical Approach

### Phase 1: Configuration Foundation (Waves 1-2)

#### Wave 1 (Parallel Start)

**Agent 1: engram-26p - Create Config Schema Tables**
```typescript
// convex/schema.ts additions
system_config: defineTable({
  key: v.string(),
  value: v.union(v.string(), v.number(), v.boolean(), v.object({})),
  category: v.string(),
  description: v.string(),
  version: v.number(),
  updatedAt: v.number(),
  updatedBy: v.string(),
})
  .index("by_category", ["category"])
  .index("by_key", ["key"])

memory_policies: defineTable({
  scopeId: v.id("memory_scopes"),
  policyKey: v.string(),
  policyValue: v.union(v.string(), v.number(), v.boolean()),
  priority: v.number(),
  createdBy: v.string(),
  createdAt: v.number(),
})
  .index("by_scope_key", ["scopeId", "policyKey"])
```

**Success Criteria:**
- [ ] Schema deploys without errors
- [ ] Zero existing records invalidated
- [ ] Indices created successfully
- [ ] Query performance <5ms for config lookups

**Blocks**: engram-17d (config resolver needs schema)

---

**Agent 2: engram-6v6 - Add DELETE Mutations (Parallel to Agent 1)**
```typescript
// convex/functions/entities.ts
export const deleteEntity = mutation({
  args: { entityId: v.string() },
  handler: async (ctx, { entityId }) => {
    const entity = await ctx.db
      .query("entities")
      .withIndex("by_entity_id", q => q.eq("entityId", entityId))
      .first();

    if (!entity) throw new Error("Entity not found");

    await ctx.db.patch(entity._id, {
      lifecycleState: "archived",
      archivedAt: Date.now(),
    });

    return { success: true, entityId };
  },
});

// Similar for: scopes, conversations, sessions, themes
```

**Success Criteria:**
- [ ] 7 DELETE mutations implemented (entities, scopes, conversations, sessions, themes, signals, recall_feedback)
- [ ] Soft delete via lifecycleState
- [ ] MCP tools exposed: memory_delete_entity, etc.
- [ ] Unit tests pass

**Independent**: Can run concurrently with all other Wave 1 work

---

**Agent 3: engram-17d - Implement Config Resolver (Waits for Agent 1)**

Starts after Agent 1 completes schema deployment.

```typescript
// convex/lib/config-resolver.ts
export async function resolveConfig(
  ctx: QueryCtx | MutationCtx,
  key: string,
  scopeId?: Id<"memory_scopes">,
  defaultValue?: any
): Promise<any> {
  // 1. Check scope policy (highest priority)
  if (scopeId) {
    const policy = await ctx.db
      .query("memory_policies")
      .withIndex("by_scope_key", q =>
        q.eq("scopeId", scopeId).eq("policyKey", key)
      )
      .first();
    if (policy) return policy.policyValue;
  }

  // 2. Check system config
  const config = await ctx.db
    .query("system_config")
    .withIndex("by_key", q => q.eq("key", key))
    .first();
  if (config) return config.value;

  // 3. Fallback to hardcoded default
  return defaultValue;
}

// Add caching layer
const configCache = new Map<string, { value: any; expiry: number }>();
```

**Success Criteria:**
- [ ] Config resolver library functional
- [ ] Caching layer reduces query load (<1ms p99)
- [ ] Priority resolution works: scope > system > fallback
- [ ] Integration tests pass

**Blocks**: engram-jsf (migration needs resolver)

---

#### Wave 2 (Sequential Chain)

**Agent 4: engram-jsf - Create Migration Script (Waits for Agent 3)**

```typescript
// convex/migrations/001_seed_system_config.ts
export default internalMutation({
  handler: async (ctx) => {
    // Extract from importance.ts
    const importanceWeights = {
      decision: 0.8,
      error: 0.7,
      insight: 0.75,
      // ... all fact types
    };

    for (const [factType, weight] of Object.entries(importanceWeights)) {
      await ctx.db.insert("system_config", {
        key: `importance_weight_${factType}`,
        value: weight,
        category: "importance_weights",
        description: `Weight for ${factType}-type facts`,
        version: 1,
        updatedAt: Date.now(),
        updatedBy: "system",
      });
    }

    // Repeat for decay rates, forget threshold, ranking weights
  },
});
```

**Success Criteria:**
- [ ] All 20+ config keys seeded
- [ ] Validation: No hardcoded constants remain
- [ ] Migration runs idempotently (safe to re-run)
- [ ] Rollback plan documented

**Blocks**: engram-46p (enrichment refactor needs migrated configs)

---

**Agent 5: engram-46p - Refactor Enrichment to Use Config (Waits for Agent 4)**

```typescript
// convex/actions/importance.ts (BEFORE)
const factTypeScores = {
  decision: 0.8,
  error: 0.7,
  // ... hardcoded
};

// AFTER
export const calculateImportance = internalAction({
  handler: async (ctx, { factId, scopeId }) => {
    const fact = await ctx.runQuery(internal.facts.getFact, { factId });

    // Query config instead of hardcode
    const baseWeight = await ctx.runQuery(
      internal.config.resolveConfig,
      { key: `importance_weight_${fact.factType}`, scopeId, defaultValue: 0.5 }
    );

    // ... rest of scoring logic
  }
});
```

**Files to Modify:**
- `convex/actions/importance.ts`
- `convex/crons/decay.ts`
- `convex/crons/forget.ts`
- `mcp-server/src/lib/ranking.ts`

**Success Criteria:**
- [ ] Zero hardcoded weights/rates/thresholds remain
- [ ] All enrichment uses resolveConfig()
- [ ] Behavior unchanged (same outputs given same configs)
- [ ] Performance <5% regression

**Validation Gate**: Run full test suite, verify no functional regressions

---

### Phase 2: Tool Primitization (Wave 3)

#### Wave 3 (Maximum Parallelization)

**Agent 6: engram-dt4 - Decompose memory_recall**

Split into 4 primitives:

```typescript
// NEW: mcp-server/src/tools/vector-search.ts
export const vectorSearchTool = tool({
  name: "memory_vector_search",
  description: "Semantic vector search using Cohere embeddings",
  inputSchema: z.object({
    query: z.string(),
    scopeIds: z.array(z.string()).optional(),
    limit: z.number().default(10),
  }),
  handler: async ({ query, scopeIds, limit }) => {
    const embedding = await generateEmbedding(query);
    const results = await query("functions/facts:vectorSearch", {
      embedding,
      scopeIds,
      limit,
    });
    return { facts: results, searchType: "vector" };
  },
});

// NEW: mcp-server/src/tools/text-search.ts
// NEW: mcp-server/src/tools/bump-access.ts
// NEW: mcp-server/src/tools/record-recall.ts

// MODIFIED: mcp-server/src/tools/recall.ts (becomes wrapper)
export const recallTool = tool({
  name: "memory_recall",
  description: "[DEPRECATED] Use primitives instead",
  handler: async (args) => {
    // Compose primitives
    const vectorResults = await vectorSearchTool.handler({...});
    const textResults = await textSearchTool.handler({...});
    // ... merge, rank, bump, record
    return {
      facts: ranked,
      recallId,
      _deprecated: true,
      _migrateToNew primitives
    };
  },
});
```

**Success Criteria:**
- [ ] 4 new primitives functional
- [ ] Old memory_recall wrapper maintains compatibility
- [ ] New Convex functions: vectorSearch, textSearch, bumpAccess, recordRecall
- [ ] MCP Inspector tests pass

**Parallel to**: Agents 7-8

---

**Agent 7: engram-95y - Decompose memory_get_context (Parallel to Agent 6)**

Split into 6+ primitives:

- `memory_search_facts`
- `memory_search_entities`
- `memory_search_themes`
- `memory_get_handoffs`
- `memory_get_notifications`
- `memory_mark_notifications_read`

**Success Criteria:**
- [ ] 6 new primitives functional
- [ ] Old memory_get_context wrapper maintains compatibility
- [ ] Token budgeting moved to agent logic (removed from tool)
- [ ] Profile-based filtering removed (agents decide)

**Parallel to**: Agents 6, 8

---

**Agent 8: engram-vgb - Decompose memory_summarize/prune (Parallel to Agents 6-7)**

Split into primitives:

- `memory_list_stale_facts`
- `memory_mark_facts_merged`
- `memory_mark_facts_pruned`

**Success Criteria:**
- [ ] 3 new primitives functional
- [ ] Agent applies filtering logic (not tool)
- [ ] Backwards compat wrappers maintain behavior

**Parallel to**: Agents 6-7

---

**Agent 9: engram-1vx - Add Backwards Compatibility Wrappers (Waits for Agents 6-8)**

Ensure old API works by composing new primitives.

**Success Criteria:**
- [ ] All 11 old tools remain functional
- [ ] Deprecation warnings added to responses
- [ ] Migration guide written with before/after examples
- [ ] Zero breaking changes for existing integrations

**Validation Gate**: Run integration tests with old API, verify 100% compatibility

---

### Phase 3: Real-Time & Identity (Waves 4-5)

#### Wave 4 (Parallel Start)

**Agent 10: engram-qcu - Create memory_events Table**

```typescript
// convex/schema.ts
memory_events: defineTable({
  eventType: v.string(),
  payload: v.object({
    factId: v.optional(v.id("facts")),
    agentId: v.optional(v.string()),
    scopeId: v.optional(v.id("memory_scopes")),
    changes: v.optional(v.any()),
  }),
  agentId: v.string(),
  scopeId: v.id("memory_scopes"),
  timestamp: v.number(),
  watermark: v.number(),
})
  .index("by_agent_watermark", ["agentId", "watermark"])
  .index("by_scope_watermark", ["scopeId", "watermark"])
```

**Success Criteria:**
- [ ] Schema deployed with zero downtime
- [ ] Indices support efficient watermark-based pagination
- [ ] TTL cron configured (delete events >7 days old)

**Blocks**: Agents 12-13 (polling and emission need table)

---

**Agent 11: engram-25m - Create Agent Identity Context Tool (Parallel to Agent 10)**

```typescript
// mcp-server/src/tools/get-agent-context.ts
export const getAgentContextTool = tool({
  name: "memory_get_agent_context",
  description: "Retrieve agent's identity, capabilities, and permitted scopes",
  inputSchema: z.object({ agentId: z.string() }),
  handler: async ({ agentId }) => {
    const agent = await query("functions/agents:getByAgentId", { agentId });
    const scopes = await query("functions/scopes:getPermitted", { agentId });

    return {
      identity: {
        agentId: agent.agentId,
        name: agent.name,
        telos: agent.telos,
        capabilities: agent.capabilities,
      },
      scopes: scopes.map(s => ({
        scopeId: s._id,
        name: s.name,
        readPolicy: s.readPolicy,
        writePolicy: s.writePolicy,
      })),
      systemHealth: {
        syncStatus: await query("functions/sync:getSyncStatus", {}),
      },
    };
  },
});
```

**Success Criteria:**
- [ ] Agent can retrieve own metadata
- [ ] Scope policies returned
- [ ] System health status included
- [ ] Used for system prompt generation

**Independent**: Can complete while Agent 10 works on events table

---

#### Wave 5 (Event Propagation)

**Agent 12: engram-34c - Implement Event Polling Tool (Waits for Agent 10)**

```typescript
// mcp-server/src/tools/poll-events.ts
export const pollEventsTool = tool({
  name: "memory_poll_events",
  description: "Poll for new memory events since last watermark",
  inputSchema: z.object({
    agentId: z.string(),
    lastWatermark: z.number().default(0),
    eventTypes: z.array(z.string()).optional(),
    limit: z.number().default(50),
  }),
  handler: async ({ agentId, lastWatermark, eventTypes, limit }) => {
    const events = await query("functions/events:pollByAgent", {
      agentId,
      afterWatermark: lastWatermark,
      eventTypes,
      limit,
    });

    return {
      events,
      latestWatermark: events.length > 0
        ? events[events.length - 1].watermark
        : lastWatermark,
      hasMore: events.length === limit,
    };
  },
});
```

**Success Criteria:**
- [ ] Watermark-based pagination works
- [ ] Event filtering by type functional
- [ ] Performance <100ms for 50 events
- [ ] Agents can poll every 5s without issues

**Parallel to**: Agent 13

---

**Agent 13: engram-tsn - Update Enrichment to Emit Events (Waits for Agent 10)**

```typescript
// convex/functions/facts.ts (MODIFIED)
export const storeFact = mutation({
  handler: async (ctx, args) => {
    const factId = await ctx.db.insert("facts", {...});

    // ADDED: Emit event
    await ctx.db.insert("memory_events", {
      eventType: "fact_created",
      payload: { factId, agentId: args.createdBy, scopeId: args.scopeId },
      agentId: args.createdBy,
      scopeId: args.scopeId,
      timestamp: Date.now(),
      watermark: await getNextWatermark(ctx),
    });

    return { factId };
  },
});

// Helper for monotonic watermark
async function getNextWatermark(ctx: MutationCtx): Promise<number> {
  const lastEvent = await ctx.db
    .query("memory_events")
    .order("desc")
    .first();
  return (lastEvent?.watermark || 0) + 1;
}
```

**Files to Modify:**
- `convex/functions/facts.ts` (storeFact, updateFact, deleteFact)
- `convex/actions/enrich.ts` (enrichFact completion)
- `convex/functions/entities.ts` (linkEntity)

**Success Criteria:**
- [ ] All fact mutations emit events
- [ ] Enrichment completion emits events
- [ ] Entity changes emit events
- [ ] Watermark sequence never gaps

**Parallel to**: Agent 12

---

**Final Validation Gate:**
- [ ] End-to-end event flow: storeFact → event emitted → agent polls → receives event
- [ ] Latency <5s from mutation to agent notification
- [ ] No duplicate events
- [ ] No missed events (watermark gaps)

---

### Wave 6: Completion (Day 12)

**Close Phase Epics:**
- `engram-ai3`: Phase 1 complete (all config extracted, DELETE ops live)
- `engram-c48`: Phase 2 complete (all tools primitized, wrappers functional)
- `engram-1le`: Phase 3 complete (events flowing, agents aware)

**Documentation:**
- [ ] Update CHANGELOG.md with v2.0 breaking changes
- [ ] Create MIGRATION-GUIDE.md with before/after examples
- [ ] Update README.md with new primitive tools list
- [ ] Document configuration schema in CONFIG-SCHEMA.md

---

## Alternative Approaches Considered

### 1. Sequential Execution (Rejected)

**Rationale**: Follow dependency chain strictly, one bead at a time

**Rejected Because**:
- 35 days is too slow
- Wastes idle agent capacity
- Many beads have no blocking dependencies

---

### 2. Full Parallelization (Rejected)

**Rationale**: Launch all 16 agents simultaneously

**Rejected Because**:
- Violates dependencies (e.g., config resolver needs schema)
- Integration conflicts (multiple agents modifying same files)
- Merge conflicts inevitable
- Testing nightmare (which agent broke what?)

---

### 3. Phase-Based Parallelization (CHOSEN)

**Rationale**: Wave-based execution respecting dependencies, max parallelization within waves

**Advantages**:
- 2.9x speedup vs. sequential
- Respects all dependencies
- Validation gates prevent cascading failures
- Manageable integration conflicts (max 4 agents per wave)

---

## Acceptance Criteria

### Functional Requirements

#### Phase 1: Configuration
- [ ] `system_config` table with 20+ config keys
- [ ] `memory_policies` table supports scope overrides
- [ ] Config resolver: scope > system > fallback priority
- [ ] DELETE mutations for 7 entities (soft delete)
- [ ] Zero hardcoded constants remain in codebase

#### Phase 2: Primitization
- [ ] 25+ primitive tools implemented
- [ ] 11 workflow tools decomposed
- [ ] Backwards compatibility wrappers functional
- [ ] Deprecation warnings in old tool responses
- [ ] Migration guide with before/after examples

#### Phase 3: Real-Time & Identity
- [ ] `memory_events` table tracks all mutations
- [ ] Event polling tool supports watermark pagination
- [ ] Agent identity context tool returns metadata + scopes
- [ ] All mutations emit events
- [ ] End-to-end latency <5s

### Non-Functional Requirements

#### Performance
- [ ] Primitive tools <50ms p99 (store, bump)
- [ ] Search primitives <100ms p99 (vector, text)
- [ ] Config lookups <1ms p99 (cached)
- [ ] Event polling supports 200 req/s sustained

#### Reliability
- [ ] Backwards compat wrappers tested against production data
- [ ] Zero data loss during schema migrations
- [ ] Event watermarks never gap
- [ ] Configuration changes are atomic

#### Security
- [ ] Agent identity verified
- [ ] Configuration changes audited
- [ ] Scope policies enforced
- [ ] Event filtering prevents cross-scope leakage

### Quality Gates

- [ ] **80% test coverage** on new code
- [ ] **Zero breaking changes** with compat wrappers
- [ ] **<5% latency regression** vs. workflow tools
- [ ] **100% config extraction** (no hardcoded values)
- [ ] **All 16 beads closed** via `bd close`

---

## Success Metrics

### Delivery Metrics

- **Timeline**: 12 days (vs. 35 sequential)
- **Speedup**: 2.9x via swarm parallelization
- **Agent Utilization**: 75% (9 agent-days / 12 days)
- **Merge Conflicts**: <5 total (wave-based coordination)

### System Metrics

- **Agent-Native Score**: 48% → 85%+ (37 point improvement)
- **Tool Primitive Ratio**: 39% → 90%+
- **Config Coverage**: 0% → 100% (all behaviors configurable)
- **Action Parity**: 48% → 85% (37 percentage points)

### Developer Experience

- **Migration Time**: <2 hours for typical agent
- **Onboarding Time**: <30 minutes for new developer
- **Debugging Time**: <10 minutes to diagnose enrichment failure

---

## Dependencies & Prerequisites

### Internal Dependencies

1. **Beads Created** ✅ (16 beads already exist with dependencies mapped)
2. **Refactoring Plan** ✅ (comprehensive plan at docs/plans/2026-02-14-refactor-mcp-tools-agent-native-architecture-plan.md)
3. **Agent-Native Audit** ✅ (48% baseline score established)

### External Dependencies

1. **Cohere Embed 4 API** - Already configured, rate limits sufficient
2. **Convex Cloud** - Production deployment ready
3. **LanceDB Sync Daemon** - Already running

### Blocking Issues

**None**. All prerequisites met. Ready to execute.

---

## Risk Analysis & Mitigation

### Risk 1: Wave Coordination Failures

**Severity**: Medium (P1)
**Likelihood**: Medium (30%)
**Impact**: Agents in same wave conflict on file edits

**Mitigation**:
- Clear file ownership per agent
- Validation gates between waves
- Agent 9 (wrappers) runs solo after decomposition wave

---

### Risk 2: Schema Migration Data Loss

**Severity**: High (P0)
**Likelihood**: Low (10%)
**Impact**: Existing facts/entities invalidated

**Mitigation**:
- All new fields optional
- Migration tested on production-like data
- Rollback plan: revert schema, restore from backup
- Agent 1 validates zero records invalidated

---

### Risk 3: Event Log Scalability

**Severity**: Medium (P1)
**Likelihood**: Medium (25%)
**Impact**: Events table grows unbounded, query degradation

**Mitigation**:
- TTL cron deletes events >7 days old
- Watermark-based pagination (efficient)
- Index by agent + watermark for fast polling
- Monitor table size, alert at 1M rows

---

### Risk 4: Backwards Compatibility Breaks

**Severity**: High (P0)
**Likelihood**: Low (15%)
**Impact**: Existing agents stop working

**Mitigation**:
- Agent 9 explicitly tests old API
- Integration test suite with legacy tool calls
- Deprecation warnings, not removal (v2.x coexistence)
- Rollback: revert MCP server to v1.9

---

## Resource Requirements

### Swarm Agents

- **Peak Concurrency**: 4 agents (Wave 3 - tool decomposition)
- **Total Agent-Days**: 9 (16 beads / 1.78 avg concurrency)
- **Agent Types**: Engineer (backend + MCP integration)

### Timeline

| Wave | Days | Agents | Beads |
|------|------|--------|-------|
| Wave 1 | 2 | 3 | 3 (schema, DELETE, resolver) |
| Wave 2 | 2 | 2 | 2 (migration, refactor enrichment) |
| Wave 3 | 3 | 4 | 4 (decompose tools + wrappers) |
| Wave 4 | 2 | 2 | 2 (events table, agent context) |
| Wave 5 | 2 | 2 | 2 (polling tool, emit events) |
| Wave 6 | 1 | 1 | 3 (close epics + docs) |
| **Total** | **12** | **9** | **16** |

---

## Future Considerations

### Phase 4: Advanced Features (Post-v2.0)

1. **WebSocket Transport** - True push-based event delivery (v2.5)
2. **Agent Capability Matching** - Smart routing via capability embeddings (v3.0)
3. **Multi-Tenant Isolation** - Separate deployments per tenant (v3.0)
4. **LLM-Based Classification** - Replace regex with LLM calls (v2.5)

---

## Documentation Plan

### During Execution

- [ ] **Wave completion summaries** - Brief status after each wave
- [ ] **Blocker documentation** - Document any wave delays
- [ ] **Integration conflict log** - Track and resolve merge conflicts

### Post-Execution

- [ ] **CHANGELOG.md** - v2.0 breaking changes summary
- [ ] **MIGRATION-GUIDE.md** - Before/after examples for all 11 workflow tools
- [ ] **CONFIG-SCHEMA.md** - All configuration keys with descriptions
- [ ] **DEPRECATED.md** - Old tools with sunset timeline

---

## References & Research

### Internal References

- **Beads Workflow**: `.beads/issues.jsonl` - 16 beads with dependencies
- **Refactoring Plan**: `docs/plans/2026-02-14-refactor-mcp-tools-agent-native-architecture-plan.md`
- **Agent-Native Audit**: Previous conversation - 48% baseline score
- **Institutional Learnings**: `docs/INSTITUTIONAL_LEARNINGS.md` - Critical patterns
- **String-Based Paths**: `docs/solutions/integration-issues/convex-string-paths-mcp-server-20260212.md`

### External References

- **Convex Documentation**: Mutations, actions, scheduled functions
- **MCP SDK**: Tool registration, stdio transport
- **Cohere Embed 4**: 1024-dim embeddings API

---

## Appendix: Bead Dependency Graph

```
Phase 1 (Configuration Foundation)
┌─────────────┐
│ engram-26p  │ Config schema tables
│   (Day 1)   │
└──────┬──────┘
       │ blocks
       ↓
┌─────────────┐
│ engram-17d  │ Config resolver library
│ (Day 1-2)   │
└──────┬──────┘
       │ blocks
       ↓
┌─────────────┐
│ engram-jsf  │ Migration script
│   (Day 3)   │
└──────┬──────┘
       │ blocks
       ↓
┌─────────────┐
│ engram-46p  │ Refactor enrichment
│ (Day 3-4)   │
└──────┬──────┘
       │ blocks
       ↓
    [Phase 1 Complete]
       │ blocks
       ↓

Phase 2 (Tool Primitization)
┌───────────────────────────────────┐
│   engram-dt4   │   engram-95y     │   engram-vgb
│ Decompose      │ Decompose        │ Decompose
│ memory_recall  │ memory_get_ctx   │ summarize/prune
│   (Day 5-6)    │   (Day 5-6)      │   (Day 5-6)
└────────┬───────┴───────┬──────────┴───────┬────┘
         │               │                   │
         └───────────────┴───────────────────┘ all block
                         ↓
                  ┌─────────────┐
                  │ engram-1vx  │ Backwards compat
                  │   (Day 7)   │ wrappers
                  └──────┬──────┘
                         │ blocks
                         ↓
                     [Phase 2 Complete]
                         │ blocks
                         ↓

Phase 3 (Real-Time & Identity)
┌─────────────┐              ┌─────────────┐
│ engram-qcu  │              │ engram-25m  │
│ Events table│              │ Agent context
│ (Day 8-9)   │              │  (Day 8-9)  │
└──────┬──────┘              └─────────────┘
       │ blocks                (independent)
       ├────────────┬────────────┐
       ↓            ↓            ↓
┌─────────────┬─────────────┐
│ engram-34c  │ engram-tsn  │
│ Poll tool   │ Emit events │
│ (Day 10-11) │ (Day 10-11) │
└──────┬──────┴──────┬──────┘
       │             │ both block
       └──────┬──────┘
              ↓
          [Phase 3 Complete]
```

---

## Next Steps

1. **Launch Wave 1** - Spawn 3 agents for engram-26p, engram-6v6, engram-17d
2. **Monitor Progress** - Track agent completion via bd status
3. **Validation Gate 1** - Verify schema deployed, config resolver functional
4. **Launch Wave 2** - Spawn 2 agents for engram-jsf, engram-46p
5. **Continue through waves** - Execute remaining waves with validation gates

🚀 **Execute via**: `/workflows:work` with swarm mode enabled

🗣️ Indy: Execution plan created with six waves spanning twelve days using swarm parallelization for agent-native refactoring.
