---
title: Refactor MCP Tools to Agent-Native Architecture
type: refactor
date: 2026-02-14
status: planned
audit_score: 48%
phases: 3
estimated_effort: 35 days
breaking_changes: true
---

# Refactor MCP Tools to Agent-Native Architecture

## Executive Summary

Engram's MCP server currently scores **48% on agent-native architecture principles**. This refactoring transforms the system from workflow-style tools to atomic primitives, enabling true agent composition and emergent capabilities.

**Current State**: 11 workflow tools that bundle business logic (memory_recall, memory_get_context, memory_summarize, etc.)

**Target State**: 25+ atomic primitives that agents compose via prompts

**Impact**: Agents shift from executing predefined workflows to exercising judgment with granular tools.

---

## Problem Statement

### 1. Tools Are Workflows, Not Primitives (39% Score)

**Current Anti-Pattern:**
```typescript
// memory_recall bundles 5 operations
memory_recall(query, strategy="hybrid") {
  // 1. Route by strategy (vector-only, text-only, hybrid)
  // 2. Query vault index for boosting
  // 3. Merge results from multiple sources
  // 4. Rank candidates (tier + importance)
  // 5. Bump access count
  // 6. Record recall for feedback
}
```

**Problem**: Agents execute hardcoded workflows instead of composing primitives with judgment.

**Impact**: Cannot build custom retrieval strategies without code changes.

---

### 2. Everything Is Code-Defined (0% Prompt-Native)

**Current Anti-Pattern:**
```typescript
// convex/actions/importance.ts:24
const factTypeScores = {
  decision: 0.8,
  error: 0.7,
  insight: 0.75,
  // ...hardcoded weights
};

// convex/crons/decay.ts:8
const decayRates = {
  decision: 0.998,
  observation: 0.99,
  // ...hardcoded rates
};
```

**Problem**: Changing behavior requires TypeScript edits and redeployment.

**Impact**: Cannot tune memory policies per agent or project without code changes.

---

### 3. No Real-Time Propagation (15% Score)

**Current Anti-Pattern:**
- Agents poll for notifications every 30 seconds
- Vault sync lags 5-30 seconds
- Enrichment completion invisible to agents
- No WebSocket/SSE mechanisms

**Problem**: Agent experience feels laggy with "silent actions" where state changes but UIs don't update.

**Impact**: Poor user experience, wasted API calls from unnecessary polling.

---

### 4. Missing Agent Identity Context (50% Score)

**Current Gap**: Agents don't receive:
- Their own capabilities, telos, or purpose
- Scope policies (retention, compression rules)
- Memory lifecycle transparency (active vs dormant facts)
- System health (sync status, embedding latency)

**Problem**: Agents operate blind to their identity and constraints.

**Impact**: Cannot provide context-aware responses or optimize behavior.

---

### 5. Action Parity Gaps (48% Score)

**Current Gap**: 23 user actions have no agent equivalent:
- Scope management (add/remove members)
- Conversation threading (create conversations, add facts)
- Session management (create sessions)
- Theme creation
- Lifecycle management (archive facts manually)
- Notification creation

**Problem**: Agents can't do what users can, limiting autonomy.

**Impact**: Manual intervention required for operations agents should handle.

---

## Proposed Solution

### Architecture Overview

Transform Engram from workflow-orchestration to primitive-composition:

```
BEFORE (Workflow Tools):
Agent → memory_recall(hybrid) → [5 hardcoded operations] → Result

AFTER (Primitive Composition):
Agent → memory_vector_search() → [results]
     → memory_text_search() → [results]
     → [Agent merges with custom logic]
     → memory_bump_access() → [ack]
     → memory_record_recall() → [recallId]
```

---

## Technical Approach

### Phase 1: Foundation (Days 1-12)

#### 1.1 Configuration Extraction

**New Convex Tables:**

```typescript
// convex/schema.ts
system_config: defineTable({
  key: v.string(),          // "decay_rate_decision", "importance_weight_error"
  value: v.union(v.string(), v.number(), v.boolean(), v.object({})),
  category: v.string(),     // "decay_rates", "importance_weights", "thresholds"
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
  priority: v.number(),     // Higher = override system_config
  createdBy: v.string(),
  createdAt: v.number(),
})
  .index("by_scope_key", ["scopeId", "policyKey"])
```

**Configuration Resolver:**

```typescript
// convex/lib/config-resolver.ts
export async function resolveConfig(
  ctx: MutationCtx,
  key: string,
  scopeId?: Id<"memory_scopes">,
  defaultValue?: any
): Promise<any> {
  // 1. Check scope policy (highest priority)
  if (scopeId) {
    const policy = await ctx.db
      .query("memory_policies")
      .withIndex("by_scope_key", q => q.eq("scopeId", scopeId).eq("policyKey", key))
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
```

**Migration Script:**

```typescript
// convex/migrations/001_seed_system_config.ts
export default internalMutation({
  handler: async (ctx) => {
    // Extract from importance.ts
    await ctx.db.insert("system_config", {
      key: "importance_weight_decision",
      value: 0.8,
      category: "importance_weights",
      description: "Weight for decision-type facts",
      version: 1,
      updatedAt: Date.now(),
      updatedBy: "system",
    });

    // Extract from decay.ts
    await ctx.db.insert("system_config", {
      key: "decay_rate_decision",
      value: 0.998,
      category: "decay_rates",
      description: "Daily decay multiplier for decisions",
      version: 1,
      updatedAt: Date.now(),
      updatedBy: "system",
    });

    // Extract from forget.ts
    await ctx.db.insert("system_config", {
      key: "forget_threshold",
      value: 0.7,
      category: "thresholds",
      description: "Archive facts when forgetScore exceeds this",
      version: 1,
      updatedAt: Date.now(),
      updatedBy: "system",
    });

    // ... all other configs
  },
});
```

**Files to Modify:**
- `/Users/cortex-air/Tools/engram/convex/actions/importance.ts:24-34` → Call `resolveConfig("importance_weight_*")`
- `/Users/cortex-air/Tools/engram/convex/crons/decay.ts:8-18` → Call `resolveConfig("decay_rate_*")`
- `/Users/cortex-air/Tools/engram/convex/crons/forget.ts:42-94` → Call `resolveConfig("forget_threshold")`
- `/Users/cortex-air/Tools/engram/mcp-server/src/lib/ranking.ts:40-45` → Call `resolveConfig("ranking_weights")`

#### 1.2 Add DELETE Operations for 7 Entities

**New Convex Mutations:**

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

    // Soft delete via lifecycle state (or hard delete)
    await ctx.db.patch(entity._id, {
      lifecycleState: "archived",
      archivedAt: Date.now(),
    });

    return { success: true, entityId };
  },
});

// Similar for conversations, scopes, sessions, themes
```

**New MCP Tools:**
- `memory_delete_entity`
- `memory_delete_scope`
- `memory_delete_conversation`
- `memory_delete_session`
- `memory_delete_theme`

---

### Phase 2: Tool Primitization (Days 13-24)

#### 2.1 Tool Decomposition Matrix

| Workflow Tool | Primitives | Rationale |
|---------------|------------|-----------|
| **memory_recall** | `memory_vector_search`, `memory_text_search`, `memory_bump_access`, `memory_record_recall` | Split search strategies, let agents merge results |
| **memory_get_context** | `memory_search_facts`, `memory_search_entities`, `memory_search_themes`, `memory_get_handoffs`, `memory_get_notifications`, `memory_mark_notifications_read` | Decompose 10+ operations into separate tools |
| **memory_summarize** | `memory_search_facts`, `memory_store_fact`, `memory_mark_facts_merged` | Agents create summaries, tools handle CRUD |
| **memory_prune** | `memory_list_stale_facts`, `memory_mark_facts_pruned` | Agents apply filtering logic, tools handle state updates |
| **memory_register_agent** | `memory_create_scope`, `memory_register_agent_core`, `memory_embed_capabilities` | Separate scope creation from agent registration |
| **memory_observe** | `memory_store_fact` | Already primitive-ish, just remove auto-classification |
| **vault_sync** | `memory_export_facts_to_vault`, `memory_import_vault_to_facts` | Bidirectional sync as separate operations |
| **checkpoint** | `memory_query_facts`, filesystem ops (agent handles) | Remove filesystem coupling |
| **end_session** | `memory_store_fact`, `memory_record_handoff` | Separate fact storage from handoff tracking |
| **memory_record_feedback** | `memory_record_recall_usage`, `memory_record_signal` | Split usage tracking from signal emission |

**Total Primitives**: 25+ new tools (18 existing → 36 total after decomposition + 7 deletes)

#### 2.2 Primitive Implementation Pattern

**Example: Decomposing memory_recall**

```typescript
// mcp-server/src/tools/vector-search.ts (NEW)
export const vectorSearchTool = tool({
  name: "memory_vector_search",
  description: "Semantic vector search using Cohere embeddings",
  inputSchema: z.object({
    query: z.string().describe("Natural language search query"),
    embedding: z.array(z.number()).optional().describe("Pre-computed 1024-dim embedding"),
    scopeIds: z.array(z.string()).optional(),
    limit: z.number().default(10),
  }),
  handler: async ({ query, embedding, scopeIds, limit }) => {
    // Generate embedding if not provided
    const queryEmbedding = embedding || await generateEmbedding(query);

    // Call Convex vector search primitive
    const results = await mutate("functions/facts:vectorSearch", {
      embedding: queryEmbedding,
      scopeIds,
      limit,
    });

    return { facts: results, searchType: "vector" };
  },
});

// mcp-server/src/tools/text-search.ts (NEW)
export const textSearchTool = tool({
  name: "memory_text_search",
  description: "Full-text search with structured filters",
  inputSchema: z.object({
    query: z.string(),
    scopeIds: z.array(z.string()).optional(),
    filters: z.object({
      factType: z.string().optional(),
      minImportance: z.number().optional(),
      tags: z.array(z.string()).optional(),
      dateRange: z.object({
        start: z.number().optional(),
        end: z.number().optional(),
      }).optional(),
    }).optional(),
    limit: z.number().default(10),
  }),
  handler: async ({ query, scopeIds, filters, limit }) => {
    const results = await mutate("functions/facts:textSearch", {
      query,
      scopeIds,
      filters,
      limit,
    });

    return { facts: results, searchType: "text" };
  },
});

// mcp-server/src/tools/bump-access.ts (NEW)
export const bumpAccessTool = tool({
  name: "memory_bump_access",
  description: "Increment access count for facts (signals usefulness)",
  inputSchema: z.object({
    factIds: z.array(z.string()),
  }),
  handler: async ({ factIds }) => {
    await mutate("functions/facts:bumpAccess", { factIds });
    return { updated: factIds.length };
  },
});

// mcp-server/src/tools/record-recall.ts (NEW)
export const recordRecallTool = tool({
  name: "memory_record_recall",
  description: "Track recall session for ALMA feedback loop",
  inputSchema: z.object({
    factIds: z.array(z.string()),
    query: z.string(),
  }),
  handler: async ({ factIds, query }) => {
    const recallId = await mutate("functions/recallFeedback:recordRecall", {
      factIds,
      query,
      timestamp: Date.now(),
    });

    return { recallId, trackedFacts: factIds.length };
  },
});
```

**Backwards Compatibility Wrapper:**

```typescript
// mcp-server/src/tools/recall.ts (MODIFIED - becomes wrapper)
export const recallTool = tool({
  name: "memory_recall",
  description: "[DEPRECATED] Use memory_vector_search + memory_text_search instead. This wrapper will be removed in v3.0.",
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().default(10),
    scopeId: z.string().optional(),
    searchStrategy: z.enum(["vector-only", "text-only", "hybrid"]).default("hybrid"),
  }),
  handler: async ({ query, limit, scopeId, searchStrategy }) => {
    // Compose primitives
    let facts = [];

    if (searchStrategy === "vector-only" || searchStrategy === "hybrid") {
      const vectorResults = await vectorSearchTool.handler({ query, limit, scopeIds: scopeId ? [scopeId] : undefined });
      facts.push(...vectorResults.facts);
    }

    if (searchStrategy === "text-only" || searchStrategy === "hybrid") {
      const textResults = await textSearchTool.handler({ query, limit, scopeIds: scopeId ? [scopeId] : undefined });
      facts.push(...textResults.facts);
    }

    // Deduplicate and rank (legacy behavior)
    const ranked = rankCandidates(query, facts);

    // Bump access counts (side effect)
    await bumpAccessTool.handler({ factIds: ranked.map(f => f._id) });

    // Record recall for feedback
    const { recallId } = await recordRecallTool.handler({ factIds: ranked.map(f => f._id), query });

    return {
      facts: ranked.slice(0, limit),
      recallId,
      _deprecated: true,
      _migrateToM: "Use memory_vector_search + memory_text_search for custom composition",
    };
  },
});
```

#### 2.3 New Convex Functions (String-Based Paths)

**Critical Pattern** (from `/Users/cortex-air/Tools/engram/docs/solutions/integration-issues/convex-string-paths-mcp-server-20260212.md`):

```typescript
// mcp-server/src/lib/convex-client.ts (MODIFIED)
export async function vectorSearch(args: {...}) {
  return await mutate("functions/facts:vectorSearch" as any, args);
}

export async function textSearch(args: {...}) {
  return await mutate("functions/facts:textSearch" as any, args);
}

export async function bumpAccess(args: {...}) {
  return await mutate("functions/facts:bumpAccess" as any, args);
}

// Isolated `as any` cast here only - type safety at call sites
```

**New Convex Functions to Add:**

```typescript
// convex/functions/facts.ts (ADDITIONS)
export const vectorSearch = query({
  args: {
    embedding: v.array(v.number()),
    scopeIds: v.optional(v.array(v.string())),
    limit: v.number(),
  },
  handler: async (ctx, { embedding, scopeIds, limit }) => {
    // Use Convex vector index
    const results = await ctx.db
      .query("facts")
      .withSearchIndex("by_embedding", q =>
        q.search("embedding", embedding).filter(q =>
          scopeIds ? q.in("scopeId", scopeIds) : q
        )
      )
      .take(limit);

    return results;
  },
});

export const textSearch = query({
  args: {
    query: v.string(),
    scopeIds: v.optional(v.array(v.string())),
    filters: v.optional(v.object({...})),
    limit: v.number(),
  },
  handler: async (ctx, { query, scopeIds, filters, limit }) => {
    // Full-text search with filters
    let q = ctx.db.query("facts");

    if (scopeIds) {
      q = q.filter(q => q.in("scopeId", scopeIds));
    }

    if (filters?.factType) {
      q = q.filter(q => q.eq("factType", filters.factType));
    }

    // ... apply other filters

    return await q.collect();
  },
});

export const bumpAccess = mutation({
  args: { factIds: v.array(v.id("facts")) },
  handler: async (ctx, { factIds }) => {
    for (const factId of factIds) {
      const fact = await ctx.db.get(factId);
      if (fact) {
        await ctx.db.patch(factId, {
          accessedCount: (fact.accessedCount || 0) + 1,
          lastAccessedAt: Date.now(),
        });
      }
    }
  },
});
```

---

### Phase 3: Real-Time & Agent Identity (Days 25-35)

#### 3.1 Event Log Table

```typescript
// convex/schema.ts (ADDITION)
memory_events: defineTable({
  eventType: v.string(),    // "fact_created", "fact_enriched", "notification_created"
  payload: v.object({
    factId: v.optional(v.id("facts")),
    agentId: v.optional(v.string()),
    scopeId: v.optional(v.id("memory_scopes")),
    changes: v.optional(v.any()),
  }),
  agentId: v.string(),
  scopeId: v.id("memory_scopes"),
  timestamp: v.number(),
  watermark: v.number(),    // Monotonic sequence for efficient polling
})
  .index("by_agent_watermark", ["agentId", "watermark"])
  .index("by_scope_watermark", ["scopeId", "watermark"])
  .index("by_timestamp", ["timestamp"])
```

**Event Emission Pattern:**

```typescript
// convex/functions/facts.ts (MODIFIED)
export const storeFact = mutation({
  handler: async (ctx, args) => {
    // ... existing fact storage logic ...

    const factId = await ctx.db.insert("facts", {...});

    // Emit event
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

**New MCP Tool: Event Polling**

```typescript
// mcp-server/src/tools/poll-events.ts (NEW)
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
      latestWatermark: events.length > 0 ? events[events.length - 1].watermark : lastWatermark,
      hasMore: events.length === limit,
    };
  },
});
```

**Agent Usage Pattern:**

```typescript
// Agent polls every 5 seconds for new events
let lastWatermark = 0;

setInterval(async () => {
  const { events, latestWatermark } = await memory_poll_events({
    agentId: "indy",
    lastWatermark,
  });

  for (const event of events) {
    if (event.eventType === "fact_enriched") {
      // Fact embeddings are ready, can now recall
    }
    if (event.eventType === "notification_created") {
      // New notification for this agent
    }
  }

  lastWatermark = latestWatermark;
}, 5000);
```

#### 3.2 Agent Identity Context Injection

**New MCP Tool:**

```typescript
// mcp-server/src/tools/get-agent-context.ts (NEW)
export const getAgentContextTool = tool({
  name: "memory_get_agent_context",
  description: "Retrieve agent's own identity, capabilities, and permitted scopes",
  inputSchema: z.object({
    agentId: z.string(),
  }),
  handler: async ({ agentId }) => {
    const agent = await query("functions/agents:getByAgentId", { agentId });
    const scopes = await query("functions/scopes:getPermitted", { agentId });

    return {
      identity: {
        agentId: agent.agentId,
        name: agent.name,
        telos: agent.telos,
        capabilities: agent.capabilities,
        settings: agent.settings,
      },
      scopes: scopes.map(scope => ({
        scopeId: scope._id,
        name: scope.name,
        readPolicy: scope.readPolicy,
        writePolicy: scope.writePolicy,
        retentionDays: scope.memoryPolicy?.retentionDays,
      })),
      systemHealth: {
        syncStatus: await query("functions/sync:getSyncStatus", {}),
        embeddingQueueDepth: await query("functions/enrichment:getQueueDepth", {}),
      },
    };
  },
});
```

**Usage in System Prompt Generation:**

```typescript
// Agent builds system prompt on startup
const agentContext = await memory_get_agent_context({ agentId: "indy" });

const systemPrompt = `
# Your Identity
You are ${agentContext.identity.name} (${agentContext.identity.agentId}).
Your purpose (telos): ${agentContext.identity.telos}
Your capabilities: ${agentContext.identity.capabilities.join(", ")}

# Available Memory Tools
- memory_store_fact: Store atomic facts with enrichment
- memory_vector_search: Semantic search
- memory_text_search: Full-text search with filters
- memory_bump_access: Signal fact usefulness
- ... [list all 36 tools]

# Your Scopes
${agentContext.scopes.map(s => `
- ${s.name} (${s.readPolicy} read, ${s.writePolicy} write)
  Retention: ${s.retentionDays} days
`).join("\n")}

# Memory Etiquette
- Facts are atomic (one idea per fact)
- Tag by factType: decision|observation|plan|error|insight|correction
- Use emotionalContext for high-confidence or uncertain facts
- Call memory_record_signal after using a fact (feedback loop)
`;
```

---

## Alternative Approaches Considered

### 1. Keep Workflow Tools, Add Primitives Alongside

**Rationale**: Avoids breaking changes, agents choose their preferred API.

**Rejected Because**:
- Doubles maintenance burden (maintain both APIs)
- Confuses developers ("which should I use?")
- Workflow tools still encode business logic → doesn't solve core problem

---

### 2. Use WebSocket for Real-Time Events

**Rationale**: True push-based updates, lower latency than polling.

**Rejected Because**:
- Convex subscriptions work in Node.js runtime but MCP server is separate process (IPC complexity)
- Adds connection management overhead (reconnection, heartbeats)
- Polling every 5s is "good enough" for v1 (can add WebSocket in v2)

---

### 3. Extract All Business Logic to LLM Prompts

**Rationale**: Ultimate prompt-native architecture.

**Rejected Because**:
- Too radical for v1 (stability risk)
- Some logic is performance-critical (ranking formulas) → better in code
- Configuration tables are a good middle ground (tunable without full prompt dependence)

---

## Acceptance Criteria

### Functional Requirements

#### Phase 1: Configuration
- [ ] `system_config` table created with 20+ config keys
- [ ] `memory_policies` table supports scope-specific overrides
- [ ] Config resolver prioritizes: scope policy > system config > fallback
- [ ] Migration script seeds all hardcoded constants
- [ ] DELETE operations added for 7 entities (entities, scopes, conversations, sessions, themes, signals, recall_feedback)

#### Phase 2: Primitization
- [ ] 25+ primitive tools implemented
- [ ] All 11 workflow tools decomposed
- [ ] Backwards compatibility wrappers remain functional
- [ ] Deprecation warnings added to old tools
- [ ] Convex functions use string-based paths (no type imports)

#### Phase 3: Real-Time & Identity
- [ ] `memory_events` table tracks all state changes
- [ ] Event polling tool supports watermark-based incremental updates
- [ ] Agent identity context tool returns metadata + scopes + health
- [ ] Smart routing emits notifications after enrichment

### Non-Functional Requirements

#### Performance
- [ ] Primitive tools complete in <50ms p99 (store, bump)
- [ ] Search primitives complete in <100ms p99 (vector, text)
- [ ] Event polling supports 1000 agents polling every 5s (200 req/s sustained)
- [ ] Configuration lookups cached (1ms p99)

#### Reliability
- [ ] Backwards compatibility wrappers tested against production data
- [ ] Enrichment retry logic handles transient failures (3x exponential backoff)
- [ ] Event log handles 10k events/hour without performance degradation
- [ ] Configuration changes are atomic (no partial updates)

#### Security
- [ ] Agent identity verified via API key in MCP metadata
- [ ] Configuration changes audited (who, what, when)
- [ ] Scope policies enforced on all tool calls
- [ ] Event filtering prevents cross-scope leakage

#### Maintainability
- [ ] All primitives have unit tests
- [ ] Integration tests cover common workflows
- [ ] Migration guide with before/after examples
- [ ] DEPRECATED.md documents old tools with sunset timeline

### Quality Gates

- [ ] **80% test coverage** on new primitives
- [ ] **Zero breaking changes** for agents using backwards compatibility wrappers
- [ ] **<5% latency regression** compared to workflow tools
- [ ] **100% config extraction** (no remaining hardcoded constants)
- [ ] **Documentation complete** (API reference, migration guide, usage examples)

---

## Success Metrics

### Agent-Native Score Improvements

| Principle | Before | After | Target |
|-----------|--------|-------|--------|
| Tools as Primitives | 39% | 90%+ | 25+ primitives, <10% workflow tools |
| Prompt-Native Features | 0% | 70%+ | All weights/rates/thresholds configurable |
| Action Parity | 48% | 85%+ | 13 new tools added |
| Context Injection | 50% | 80%+ | Agent identity + system health injected |
| UI Integration | 15% | 60%+ | Event polling enables 5s update latency |

### Developer Experience

- [ ] **Migration Time**: <2 hours for typical agent integration
- [ ] **Onboarding Time**: <30 minutes for new developer to build first agent
- [ ] **Debugging Time**: <10 minutes to diagnose enrichment failure (vs. 60+ minutes today)

### System Health

- [ ] **API Latency**: p99 <100ms for all primitive tools
- [ ] **Event Lag**: <5 seconds from state change to agent notification
- [ ] **Config Deployment**: <1 minute to roll out policy change
- [ ] **Enrichment Success Rate**: >99% (with retry logic)

---

## Dependencies & Prerequisites

### Internal Dependencies

1. **Convex Schema Migration**
   - Add 3 new tables (system_config, memory_policies, memory_events)
   - Deploy schema changes before function updates
   - All new fields optional (zero-downtime migration)

2. **Config Resolver Library**
   - Must be implemented before modifying importance/decay/forget logic
   - Requires caching layer for performance

3. **String-Based Convex Paths**
   - Already implemented (see `/Users/cortex-air/Tools/engram/docs/solutions/integration-issues/convex-string-paths-mcp-server-20260212.md`)
   - All new primitives must follow this pattern

### External Dependencies

1. **Cohere Embed 4 API**
   - Dependency already exists
   - Ensure rate limits support increased embedding load (if agents call primitives more frequently)

2. **LanceDB Sync Daemon**
   - Must handle increased fact mutation rate
   - Consider increasing sync frequency from 30s to 10s

### Blocking Issues

1. **Resolve SpecFlow Gaps** (see SpecFlow analysis output)
   - [ ] Provide exact tool decomposition matrix
   - [ ] Define configuration validation rules
   - [ ] Specify backwards compatibility timeline
   - [ ] Document agent identity authentication

---

## Risk Analysis & Mitigation

### Risk 1: Breaking Changes in Production

**Severity**: High (P0)

**Likelihood**: Medium (50%)

**Impact**: Existing agents stop working, data loss risk

**Mitigation**:
- Maintain backwards compatibility wrappers for 6 months minimum
- Add deprecation warnings but don't remove old tools in v2.x
- Provide automated migration script
- Test against production data in staging environment
- Rollback plan: revert MCP server to v1.9, Convex functions unchanged (new tables remain but unused)

---

### Risk 2: Performance Regression

**Severity**: Medium (P1)

**Likelihood**: Medium (40%)

**Impact**: Agent latency increases, poor UX

**Mitigation**:
- Benchmark each primitive against workflow tool equivalent
- Add caching layer for config lookups (1ms p99)
- Use Convex vector indices (already exists)
- Load test with 1000 concurrent agents
- Abort if p99 latency degrades >5%

---

### Risk 3: Configuration Chaos

**Severity**: Medium (P1)

**Likelihood**: Low (20%)

**Impact**: Agents using incompatible configs, memory quality degrades

**Mitigation**:
- Validate config values before insert (ranges, types, interdependencies)
- Add config versioning for rollback
- Audit log for all config changes
- Alert on config changes that degrade recall quality (monitor recall feedback scores)

---

### Risk 4: Event Log Scalability

**Severity**: Medium (P1)

**Likelihood**: Medium (30%)

**Impact**: Event table grows unbounded, query performance degrades

**Mitigation**:
- TTL on events (delete after 7 days)
- Watermark-based pagination (efficient)
- Index by agent + watermark for fast polling
- Monitor event table size, alert at 1M rows
- Shard by scopeId if single table becomes bottleneck

---

### Risk 5: Incomplete Migration

**Severity**: Low (P2)

**Likelihood**: Medium (40%)

**Impact**: Some agents stuck on old API, maintenance burden

**Mitigation**:
- Clear deprecation timeline (announce 2026-03-01, remove 2026-09-01)
- Email all agent developers with migration guide
- Provide migration script for automated rewrite
- Dashboard showing which agents are using old tools
- Offer migration support (office hours, Slack channel)

---

## Resource Requirements

### Engineering Effort

| Phase | Days | Tasks |
|-------|------|-------|
| Phase 1: Foundation | 12 | Config tables, resolver, migration, DELETE ops |
| Phase 2: Primitization | 12 | 25+ primitives, wrappers, Convex functions, tests |
| Phase 3: Real-Time & Identity | 11 | Event log, polling tool, agent context, documentation |
| **Total** | **35 days** | |

**Team**: 2 engineers (1 backend, 1 MCP/integration)

---

### Infrastructure

- **Convex Costs**: Expect 20% increase in function executions (more granular tool calls)
- **Cohere API**: No increase (same embedding rate)
- **LanceDB Sync**: Increase sync frequency (10s vs. 30s)

---

## Future Considerations

### Phase 4: Advanced Features (Post-v2)

1. **WebSocket Transport** (v2.5)
   - True push-based event delivery
   - Requires IPC between Convex and MCP server

2. **Agent Capability Matching** (v3.0)
   - Smart routing based on capability embeddings
   - Route facts to agents with relevant skills

3. **Multi-Tenant Isolation** (v3.0)
   - Separate Convex deployments per tenant
   - Horizontal scaling for 10k+ agents

4. **LLM-Based Classification** (v2.5)
   - Replace regex patterns with LLM calls
   - Domain-specific observation tiering

---

## Documentation Plan

### Internal Docs

- [ ] **ARCHITECTURE.md** — Updated with primitization pattern
- [ ] **MIGRATION-GUIDE.md** — Before/after examples for all 11 workflow tools
- [ ] **API-REFERENCE.md** — Complete list of 36 primitives with examples
- [ ] **CONFIG-SCHEMA.md** — All config keys, valid ranges, defaults
- [ ] **DEPRECATED.md** — Old tools with sunset timeline

### External Docs

- [ ] **CHANGELOG.md** — v2.0 breaking changes, v2.5 deprecation warnings
- [ ] **USAGE-EXAMPLES.md** — Agent composition patterns with primitives
- [ ] **BEST-PRACTICES.md** — When to use which primitives

### Code Documentation

- [ ] All primitive tools have JSDoc with examples
- [ ] All Convex functions have inline comments
- [ ] Config resolver has usage guide in header

---

## References & Research

### Internal References

- **Agent-Native Audit**: [2026-02-14 audit results](#) — 48% overall score, 5 critical gaps
- **Existing Refactoring Plan**: `/Users/cortex-air/Tools/engram/docs/plans/2026-02-14-refactor-agent-native-architecture-production-ready-plan.md` (1323 lines)
- **Convex String Paths Pattern**: `/Users/cortex-air/Tools/engram/docs/solutions/integration-issues/convex-string-paths-mcp-server-20260212.md` — CRITICAL integration pattern
- **Architecture**: `/Users/cortex-air/Tools/engram/CLAUDE.md` — Project conventions
- **Repo Research**: Repository analysis agent output (file references, tool inventory)
- **SpecFlow Analysis**: Comprehensive flow analysis with 20 critical questions

### External References

- **Letta Memory Patterns**: `/Users/cortex-air/Tools/engram/docs/research/letta-patterns-for-engram.md` — Memory-as-tools pattern, conversation compaction
- **Multi-Agent Integration**: `/Users/cortex-air/Tools/engram/docs/brainstorms/2026-02-12-multi-agent-integration-patterns.md` — Handoff protocol, scope layering, smart routing

### Related Work

- **Original Build Plan**: `/Users/cortex-air/Tools/engram/PLAN.md` — Phases 1-6 complete
- **Institutional Learnings**: `/Users/cortex-air/Tools/engram/docs/INSTITUTIONAL_LEARNINGS.md` — Convex/MCP/LanceDB patterns

---

## Appendix A: Complete Tool Inventory

### 18 Existing Tools (v1.9)

1. memory_store_fact
2. memory_recall ← **DECOMPOSE**
3. memory_search
4. memory_link_entity
5. memory_get_context ← **DECOMPOSE**
6. memory_observe ← **SIMPLIFY**
7. memory_register_agent ← **DECOMPOSE**
8. memory_query_raw
9. memory_record_signal
10. memory_record_feedback ← **DECOMPOSE**
11. memory_summarize ← **DECOMPOSE**
12. memory_prune ← **DECOMPOSE**
13. memory_vault_sync ← **DECOMPOSE**
14. memory_query_vault
15. memory_export_graph
16. memory_checkpoint ← **DECOMPOSE**
17. memory_wake
18. memory_end_session ← **DECOMPOSE**

### 25+ New Primitives (v2.0)

**Search & Retrieval (4):**
1. memory_vector_search
2. memory_text_search
3. memory_bump_access
4. memory_record_recall

**Context Assembly (7):**
5. memory_search_facts
6. memory_search_entities
7. memory_search_themes
8. memory_get_handoffs
9. memory_get_notifications
10. memory_mark_notifications_read
11. memory_get_agent_context ← **NEW**

**CRUD (7):**
12. memory_delete_entity ← **NEW**
13. memory_delete_scope ← **NEW**
14. memory_delete_conversation ← **NEW**
15. memory_delete_session ← **NEW**
16. memory_delete_theme ← **NEW**
17. memory_mark_facts_merged
18. memory_mark_facts_pruned

**Agent & Scope Management (4):**
19. memory_create_scope ← **NEW**
20. memory_register_agent_core
21. memory_embed_capabilities
22. memory_record_handoff ← **NEW**

**Configuration (3):**
23. memory_get_config ← **NEW**
24. memory_update_config ← **NEW**
25. memory_list_configs ← **NEW**

**Event Streaming (2):**
26. memory_poll_events ← **NEW**
27. memory_get_enrichment_status ← **NEW**

**Vault Sync (2):**
28. memory_export_facts_to_vault
29. memory_import_vault_to_facts

**Total**: 36 tools (18 existing → 11 decomposed + 25 new primitives)

---

## Appendix B: Configuration Keys

### Importance Weights

```yaml
importance_weight_decision: 0.8
importance_weight_error: 0.7
importance_weight_insight: 0.75
importance_weight_correction: 0.7
importance_weight_steering_rule: 0.85
importance_weight_learning: 0.65
importance_weight_session_summary: 0.6
importance_weight_plan: 0.6
importance_weight_observation: 0.5
```

### Decay Rates

```yaml
decay_rate_decision: 0.998
decay_rate_error: 0.995
decay_rate_correction: 0.995
decay_rate_insight: 0.997
decay_rate_steering_rule: 0.999
decay_rate_learning: 0.996
decay_rate_session_summary: 0.99
decay_rate_plan: 0.995
decay_rate_observation: 0.99
```

### Thresholds

```yaml
forget_threshold: 0.7
consolidation_min_facts: 3
prune_age_days: 90
prune_max_importance: 0.3
prune_max_access_count: 3
```

### Ranking Weights

```yaml
ranking_weight_semantic: 0.45
ranking_weight_lexical: 0.15
ranking_weight_importance: 0.2
ranking_weight_freshness: 0.1
ranking_weight_outcome: 0.1
```

---

## Appendix C: Migration Examples

### Example 1: memory_recall Migration

**Before (v1.9):**
```typescript
const result = await memory_recall({
  query: "authentication decisions",
  strategy: "hybrid",
  limit: 10,
});

// result.facts = [...10 facts merged and ranked]
// result.recallId = "rec_123"
```

**After (v2.0 - Agent Composition):**
```typescript
// Agent decides search strategy
const vectorResults = await memory_vector_search({
  query: "authentication decisions",
  limit: 10,
});

const textResults = await memory_text_search({
  query: "authentication decisions",
  filters: { factType: "decision" },
  limit: 10,
});

// Agent merges and ranks with custom logic
const merged = deduplicateByFactId([...vectorResults.facts, ...textResults.facts]);
const ranked = sortByImportanceAndRelevance(merged, query);

// Agent signals usefulness
await memory_bump_access({ factIds: ranked.map(f => f._id) });

// Agent tracks recall for feedback
const { recallId } = await memory_record_recall({
  factIds: ranked.map(f => f._id),
  query,
});
```

### Example 2: memory_get_context Migration

**Before (v1.9):**
```typescript
const context = await memory_get_context({
  topic: "API rate limiting",
  profile: "planning",
  tokenBudget: 4000,
});

// context = { facts, entities, themes, handoffs, notifications, summary }
// All assembled server-side with hardcoded profile logic
```

**After (v2.0 - Agent Composition):**
```typescript
// Agent retrieves identity and scope context
const agentContext = await memory_get_agent_context({ agentId: "indy" });

// Agent searches for relevant facts
const facts = await memory_search_facts({
  topic: "API rate limiting",
  scopeIds: agentContext.scopes.map(s => s.scopeId),
  limit: 20,
});

// Agent searches for related entities
const entities = await memory_search_entities({
  query: "rate limiting service redis",
  limit: 5,
});

// Agent retrieves recent handoffs (if multi-agent)
const handoffs = await memory_get_handoffs({
  agentId: "indy",
  limit: 5,
});

// Agent assembles custom context with budget awareness
const context = {
  identity: agentContext.identity,
  facts: facts.slice(0, 15),  // Agent applies token budget
  entities,
  handoffs,
  summary: `Planning context for ${agentContext.identity.name}`,
};
```

---

## Next Steps

1. **Clarify SpecFlow Gaps** — Resolve 7 critical blockers (see SpecFlow analysis)
2. **Review Plan** — Get feedback from reviewers (DHH, Kieran, Simplicity, Security)
3. **Begin Phase 1** — Implement configuration tables and resolver
4. **Parallel Track** — Start primitive implementations while config extraction progresses

🗣️ Indy: Created comprehensive agent-native refactoring plan with three phases over thirty-five days, covering tool primitization and configuration extraction.
