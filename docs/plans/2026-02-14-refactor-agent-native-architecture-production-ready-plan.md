---
title: Agent-Native Architecture Refactoring + Production Cleanup
type: refactor
date: 2026-02-14
priority: critical
estimated_effort: 4-7 weeks
---

# Agent-Native Architecture Refactoring + Production Cleanup

## Overview

**Executive Summary:** Transform Engram from a functional multi-agent memory system (48% agent-native score) into a fully agent-native, production-ready platform (target: 90%+ score). This comprehensive refactoring addresses 5 critical architecture gaps identified in the agent-native audit, plus production hardening and documentation overhaul.

**Scope:**
1. **Tool Primitization** - Decompose 11 workflow tools into atomic primitives (39% → 90%+)
2. **Configuration Extraction** - Move hardcoded policies to database (0% → 80%+ prompt-native)
3. **Real-Time Propagation** - Add reactive update mechanisms (15% → 75%+ UI integration)
4. **Agent Identity Context** - Inject agent metadata into prompts (50% → 90%+ context injection)
5. **Action Parity** - Add 13 missing CRUD tools (48% → 85%+ parity)
6. **Production Hardening** - Update docs, remove redundant files, security audit, performance optimization

**Why Now:**
- Audit revealed systematic gaps preventing true agent autonomy
- Existing architecture is 80% correct but missing critical composition layer
- Production deployment requires hardening and documentation
- Multi-agent coordination patterns (from Feb 12 brainstorm) depend on these foundations

**Impact:**
- Agents compose primitives with judgment (vs executing workflows)
- Behavior changes via prompts/config (vs code edits)
- Real-time cross-agent awareness (vs 30s polling lag)
- Full CRUD autonomy (agents = users in capability)
- Production-grade reliability and observability

---

## Problem Statement

### Current State (from Agent-Native Audit)

**Overall Agent-Native Score: 48%**

| Principle | Score | Status | Critical Issue |
|-----------|-------|--------|----------------|
| Action Parity | 47/98 (48%) | ⚠️ | 23 user actions lack agent equivalents (scope mgmt, conversations, sessions) |
| Tools as Primitives | 7/18 (39%) | ❌ | 11 tools encode business logic (memory_recall, get_context, summarize, prune) |
| Context Injection | 11/22 (50%) | ⚠️ | Agents don't receive own capabilities, telos, scope policies |
| Shared Workspace | 11/12 (92%) | ✅ | Excellent - users and agents work on identical data |
| CRUD Completeness | 8/11 (73%) | ⚠️ | 7 entities missing DELETE, 2 missing UPDATE |
| UI Integration | 2/13 (15%) | ❌ | No WebSocket/SSE, enrichment completion invisible, 5-30s vault lag |
| Capability Discovery | 4.5/7 (64%) | ⚠️ | No onboarding, no suggested prompts, tool descriptions technical |
| Prompt-Native Features | 0/14 (0%) | ❌ | All behavior hardcoded (importance weights, decay rates, thresholds) |

### Core Issues

**1. Workflow Tools Prevent Composition**
- `memory_recall` decides strategy (hybrid/vector/text), merges, ranks, bumps access → 5 operations bundled
- `memory_get_context` orchestrates 10+ sub-operations → agents can't compose custom context
- `memory_prune` embeds filtering logic (age + importance + access) → inflexible

**2. Code-Defined Behavior Blocks Customization**
- Importance formula: `decision: 0.8, error: 0.7` → hardcoded in TypeScript
- Decay rates: `decision: 0.998, observation: 0.99` → requires code change
- Classification rules: regex patterns for "critical/notable/background" → domain-specific impossible

**3. Silent Actions Create Laggy UX**
- Enrichment pipeline runs async but completion invisible → agents see stale facts
- Vault sync lags 5-30s → users edit markdown, agents query old data
- Notifications created but no push → 30s polling delay

**4. Agents Operate Blind**
- No visibility into own capabilities, telos, permitted scopes
- Can't discover what other agents exist or what they do
- No guidance on when to store vs observe, when to prune, etc.

**5. Limited Autonomy**
- Can't create scopes or manage membership → admin-only
- Can't create conversations or thread facts → system-only
- Can't manually archive facts or boost relevance → cron-only

### Why This Matters

**User Impact:**
- Agents feel "dumb" when they can't explain why they ranked facts a certain way
- Customization requires hiring a developer to edit TypeScript
- Cross-agent coordination limited by polling latency

**Developer Impact:**
- New features require MCP tool code changes (slow iteration)
- Behavior tuning blocked by deploy cycle
- Testing requires hardcoded weights, can't A/B test

**Business Impact:**
- Can't offer per-user or per-scope memory policies (SaaS blocker)
- Multi-agent orchestration unreliable (coordination latency)
- Production deployment risky (no hardening, gaps in docs)

---

## Proposed Solution

### Architecture Vision

**Agent-Native Principles Applied:**

1. **Parity** - Every user capability has agent equivalent
2. **Primitives** - Tools enable capabilities, don't encode workflows
3. **Composition** - Agents orchestrate primitives via prompts
4. **Prompt-Native** - Behavior defined in config/prompts, not code
5. **Real-Time** - State changes propagate immediately to consuming apps
6. **Context-Rich** - Agents know their identity, constraints, available resources

### Solution Overview

**Phase 1: Foundations (Week 1-2)**
- Extract configs to `system_config` and `memory_policies` tables
- Add agent self-context to `memory_get_context`
- Create USAGE_EXAMPLES.md with suggested prompts
- Add DELETE operations for 7 entities
- Document all existing tools in API-REFERENCE.md

**Phase 2: Core Refactoring (Week 3-5)**
- Decompose 11 workflow tools into 25+ primitives
- Add 13 missing CRUD tools for parity
- Implement event log table for propagation
- Add WebSocket wrapper (optional) or enhanced polling
- Update all tool descriptions for discoverability

**Phase 3: Production Hardening (Week 6-7)**
- Security audit (input validation, rate limiting, error boundaries)
- Performance optimization (LanceDB indexing, caching)
- Documentation overhaul (install guide, API reference, troubleshooting)
- Remove redundant files (dead code, unused configs)
- CI/CD pipeline (linting, type checking, tests)
- Monitoring and observability (health checks, metrics)

---

## Technical Approach

### 1. Configuration Extraction (Prompt-Native Features)

**Goal:** Move from 0% to 80%+ prompt-native by extracting hardcoded values to database.

#### New Schema Tables

**`system_config` Table:**
```typescript
// convex/schema.ts
system_config: defineTable({
  key: v.string(),          // "default_recall_limit", "decay_rate_observation"
  value: v.union(           // Polymorphic value
    v.string(),
    v.number(),
    v.boolean(),
    v.object({ ... })       // Complex configs (ranking formula)
  ),
  category: v.string(),     // "tool_defaults", "importance_weights", "decay_rates", "routing"
  description: v.string(),  // Human-readable explanation
  version: v.number(),      // Config versioning for rollback
  updatedAt: v.number(),
  updatedBy: v.string(),    // Agent or admin who changed it
})
  .index("by_category", ["category"])
  .index("by_key", ["key"])
```

**`memory_policies` Table (Scope-Specific Overrides):**
```typescript
memory_policies: defineTable({
  scopeId: v.id("memory_scopes"),
  policyKey: v.string(),    // "decay_rate_decision", "importance_boost_insight"
  policyValue: v.union(v.string(), v.number(), v.boolean()),
  priority: v.number(),     // Higher = override system_config
  createdBy: v.string(),
  createdAt: v.number(),
})
  .index("by_scope_key", ["scopeId", "policyKey"])
```

#### Migration Strategy

**Values to Extract:**

| Current Location | Value | New Location |
|------------------|-------|--------------|
| `mcp-server/src/tools/recall.ts:15` | `limit: 10` | `system_config("default_recall_limit")` |
| `mcp-server/src/tools/get-context.ts:14` | `tokenBudget: 4000` | `system_config("default_token_budget")` |
| `mcp-server/src/tools/prune.ts:10` | `olderThanDays: 90` | `system_config("prune_age_threshold_days")` |
| `convex/actions/importance.ts:24-34` | `factTypeScores: {...}` | `system_config("importance_weights")` as JSON object |
| `convex/crons/decay.ts:8-18` | `decayRates: {...}` | `system_config("decay_rates")` as JSON object |
| `convex/crons/forget.ts:42-94` | Forget threshold: `0.7` | `system_config("forget_archive_threshold")` |
| `mcp-server/src/lib/ranking.ts` | Ranking formula weights | `system_config("ranking_formula")` as JSON |
| `convex/actions/classify.ts:7-20` | Classification regexes | `system_config("observation_classification_rules")` as JSON |

**Seed Migration Script:**
```typescript
// convex/migrations/001_seed_system_config.ts
import { internalMutation } from "./_generated/server";

export const seedSystemConfig = internalMutation({
  handler: async (ctx) => {
    // Extract all hardcoded values to system_config
    await ctx.db.insert("system_config", {
      key: "importance_weights",
      value: {
        decision: 0.8,
        error: 0.7,
        insight: 0.75,
        correction: 0.7,
        steering_rule: 0.85,
        plan: 0.65,
        observation: 0.5,
        note: 0.4,
      },
      category: "importance",
      description: "Fact type → importance score multiplier",
      version: 1,
      updatedAt: Date.now(),
      updatedBy: "system_migration",
    });

    // ... repeat for all configs
  },
});
```

**Config Resolution Pattern:**
```typescript
// convex/lib/config-resolver.ts
export async function getConfig(
  ctx: QueryCtx | MutationCtx,
  key: string,
  scopeId?: Id<"memory_scopes">
): Promise<any> {
  // 1. Check scope policy (highest priority)
  if (scopeId) {
    const policy = await ctx.db
      .query("memory_policies")
      .withIndex("by_scope_key", (q) =>
        q.eq("scopeId", scopeId).eq("policyKey", key))
      .first();
    if (policy) return policy.policyValue;
  }

  // 2. Check system config
  const config = await ctx.db
    .query("system_config")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (config) return config.value;

  // 3. Hardcoded fallback (for backwards compatibility)
  return HARDCODED_DEFAULTS[key];
}
```

**New Admin Tools:**
```typescript
// MCP tools for config management
memory_get_config({ key, scopeId? })
memory_set_config({ key, value, category, description })
memory_set_scope_policy({ scopeId, policyKey, policyValue })
memory_list_configs({ category? })
```

---

### 2. Tool Decomposition (Primitives)

**Goal:** Move from 39% to 90%+ primitives by splitting workflow tools.

#### Tools to Decompose

**A. `memory_recall` (Current: 157 lines, 5 operations bundled)**

**Current Workflow:**
```typescript
memory_recall(query, strategy="hybrid", limit=10, scopeIds, ...) {
  1. Route by strategy (vector-only | text-only | hybrid)
  2. Query vault index for boosting
  3. Merge results from multiple sources
  4. Rank candidates (tier + importance)
  5. Bump access count
  6. Record recall for feedback
  return { facts, recallId }
}
```

**Decomposed Primitives:**
```typescript
// New primitive tools
memory_vector_search(embedding, scopeIds, limit)
  → Returns: [{ factId, _score, fact }]

memory_text_search(query, scopeIds, filters, limit)
  → Returns: [{ factId, lexicalScore, fact }]

memory_bump_access(factIds)
  → Side effect: increment accessCount

memory_record_recall(factIds, query)
  → Returns: { recallId } for feedback tracking

// Keep memory_recall as optional convenience wrapper
memory_recall(query, ...) {
  // Orchestration: vector_search + text_search + ranking
  // Agents can bypass this and compose primitives directly
}
```

**B. `memory_get_context` (Current: 191 lines, 10+ operations)**

**Decomposed Primitives:**
```typescript
memory_get_observations(scopeIds, tier, limit, minImportance)
memory_get_entities(topic, scopeIds, limit)
memory_get_themes(scopeIds, limit)
memory_get_handoffs(agentId, scopeIds, limit, maxAgeDays)
memory_get_notifications(agentId, limit)
memory_mark_notifications_read(notificationIds)
memory_get_vault_notes(topic, limit)
memory_get_graph_neighbors(entityIds, depth)

// Keep memory_get_context as orchestrator with token budgeting
```

**C. `memory_summarize` (Hardcoded consolidation logic)**

**Decomposed:**
```typescript
memory_list_facts(scopeId, filters, limit)  // Get candidates
// Agent creates summary (prompt-driven)
memory_store_fact({ content: summary, factType: "summary", relatedFacts: [...] })
memory_mark_facts_merged(factIds, into: summaryFactId)
```

**D. `memory_prune` (Hardcoded filtering)**

**Decomposed:**
```typescript
memory_list_stale_facts(scopeId, olderThanDays, maxImportance, maxAccessCount)
  → Returns: candidate factIds
// Agent applies custom filtering logic
memory_mark_facts_pruned(factIds, reason)
```

#### Implementation Pattern

**Maintain Backwards Compatibility:**
```typescript
// mcp-server/src/tools/recall.ts

// Old API (deprecated but functional)
export async function memoryRecall(input, agentId) {
  console.warn("[engram] memory_recall is deprecated. Use memory_vector_search + memory_text_search for composition.");

  // Call new primitives under the hood
  const vectorResults = await memoryVectorSearch({...}, agentId);
  const textResults = await memoryTextSearch({...}, agentId);
  // Merge, rank, return
}

// New primitives
export async function memoryVectorSearch(input, agentId) { ... }
export async function memoryTextSearch(input, agentId) { ... }
```

**Estimated Impact:**
- 18 existing tools → 40+ primitives
- Agents can compose custom recall strategies
- No breaking changes (old tools remain as wrappers)

---

### 3. Real-Time Propagation (UI Integration)

**Goal:** Move from 15% to 75%+ immediate propagation.

#### Approach: Hybrid (Enhanced Polling + Event Log)

**Phase 1: Event Log Table (Foundation)**

```typescript
// convex/schema.ts
memory_events: defineTable({
  eventType: v.string(),    // "fact_created", "fact_enriched", "notification_created"
  payload: v.object({...}), // Event-specific data
  agentId: v.string(),      // Relevant agent
  scopeId: v.id("memory_scopes"),
  factId: v.optional(v.id("facts")),
  timestamp: v.number(),
  watermark: v.number(),    // Monotonic sequence for polling
})
  .index("by_agent_watermark", ["agentId", "watermark"])
  .index("by_scope_watermark", ["scopeId", "watermark"])
  .index("by_timestamp", ["timestamp"])
```

**Emit Events from Mutations:**
```typescript
// convex/functions/facts.ts
export const storeFact = mutation({
  handler: async (ctx, args) => {
    const factId = await ctx.db.insert("facts", {...});

    // Emit event
    await ctx.db.insert("memory_events", {
      eventType: "fact_created",
      payload: { factId, content: args.content, scopeId: args.scopeId },
      agentId: args.createdBy,
      scopeId: args.scopeId,
      factId,
      timestamp: Date.now(),
      watermark: await getNextWatermark(ctx),
    });

    return { factId };
  },
});
```

**New MCP Tool: Polling Primitive**
```typescript
memory_poll_events({
  agentId,
  sinceWatermark,
  eventTypes?: ["fact_created", "fact_enriched", "notification_created"],
  limit: 100
})
  → Returns: { events: [...], latestWatermark, hasMore }
```

**Agent Polling Pattern:**
```typescript
// Agent-side (or MCP client wrapper)
let watermark = 0;

setInterval(async () => {
  const { events, latestWatermark } = await memory_poll_events({
    agentId: "indy",
    sinceWatermark: watermark,
    limit: 50,
  });

  for (const event of events) {
    console.log(`[event] ${event.eventType}:`, event.payload);
    // Handle event (update local cache, trigger re-fetch, etc.)
  }

  watermark = latestWatermark;
}, 5000); // Poll every 5s (down from 30s)
```

**Phase 2: WebSocket Transport (Optional Future)**

```typescript
// mcp-server/src/transports/websocket.ts
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 3001 });

wss.on("connection", (ws, req) => {
  const agentId = req.headers["x-agent-id"];

  // Subscribe to Convex changes (requires ConvexClient, not HttpClient)
  const unsubscribe = convexClient.subscribe(
    api.functions.events.watchAgent,
    { agentId },
    (events) => {
      ws.send(JSON.stringify({ type: "events", events }));
    }
  );

  ws.on("close", () => unsubscribe());
});
```

**Estimated Impact:**
- Polling interval: 30s → 5s
- Enrichment visibility: none → real-time event stream
- Vault sync lag: 5-30s → unchanged (file watcher limitation)
- Breaking changes: none (additive)

---

### 4. Agent Identity Context (Context Injection)

**Goal:** Move from 50% to 90%+ context injection by providing agent self-awareness.

#### Schema Extensions

**Extend `agents` Table:**
```typescript
agents: defineTable({
  // Existing fields...
  agentId: v.string(),
  name: v.string(),
  capabilities: v.array(v.string()),
  telos: v.optional(v.string()),

  // NEW: Rich identity fields
  role: v.optional(v.string()),           // "researcher", "writer", "analyst"
  persona: v.optional(v.string()),        // Personality description
  specialization: v.optional(v.array(v.string())),  // ["python", "machine-learning"]
  preferredFactTypes: v.optional(v.array(v.string())),  // ["decision", "insight"]
  workingMemorySize: v.optional(v.number()),  // Token budget preference
  explorationBias: v.optional(v.float64()),  // 0=conservative, 1=exploratory

  // Metadata for introspection
  factCount: v.optional(v.number()),
  lastActiveAt: v.number(),
  totalRecalls: v.optional(v.number()),
  avgImportanceScore: v.optional(v.float64()),
})
```

#### New MCP Tools for Self-Introspection

```typescript
memory_get_agent_info({ agentId })
  → Returns: {
      agentId, name, capabilities, telos, role, persona,
      stats: { factCount, totalRecalls, avgImportance },
      permittedScopes: [{ scopeId, name, readPolicy, writePolicy }]
    }

memory_update_agent({
  agentId,
  capabilities?,
  telos?,
  role?,
  workingMemorySize?,
  explorationBias?
})
  → Updates agent profile (self-modification)
```

#### Context Injection in `memory_get_context`

**Enhanced Return Type:**
```typescript
memory_get_context({ topic, agentId, ... })
  → Returns: {
      // Existing fields
      facts, entities, themes, handoffs, notifications,

      // NEW: Agent identity context
      agentContext: {
        identity: {
          name: "Indy",
          role: "Research Assistant",
          telos: "Help Daniel explore and synthesize knowledge",
          capabilities: ["research", "analysis", "writing"],
        },
        scopeContext: {
          currentScope: "shared-personal",
          permittedScopes: ["private-indy", "shared-personal", "project-briefly"],
          scopePolicies: {
            "shared-personal": {
              readPolicy: "members",
              writePolicy: "members",
              retentionDays: 365,
              decayRate: 0.998,
            },
          },
        },
        systemGuidance: {
          whenToStore: "Store decisions, insights, corrections, and steering rules. Avoid duplicating existing knowledge.",
          whenToObserve: "Quick notes, low-confidence hypotheses, context that may not be important.",
          whenToPrune: "Facts older than 90 days with importance <0.3 and <3 accesses.",
          rankingStrategy: "Hybrid vector + text search weighted by importance and freshness.",
        },
        recentActivity: {
          factsStoredToday: 12,
          recallsToday: 34,
          topRetrievedTopics: ["agent architecture", "memory systems", "convex patterns"],
        },
      },
    }
```

**Prompt-Ready Format (Optional):**
```typescript
memory_get_system_prompt({ agentId, scopeId, profile })
  → Returns: string (formatted for LLM system prompt)

// Example output:
`# Your Identity
You are Indy, a Research Assistant specialized in knowledge synthesis.
Telos: Help Daniel explore and synthesize knowledge.
Capabilities: research, analysis, writing

# Memory Tools Available
- memory_store_fact: Store important knowledge
- memory_recall: Search your memory semantically
- memory_observe: Quick note without importance scoring
...

# Current Context
You are working in the shared-personal scope with 3 other agents.
Today you've stored 12 facts and recalled 34 times.
Top topics: agent architecture, memory systems, convex patterns.

# Memory Etiquette
- Store decisions, insights, and corrections
- Tag facts by type (decision, insight, observation)
- Use emotional context for high-confidence or uncertain facts
- Provide feedback on recalled facts (memory_record_signal)`
```

**Estimated Impact:**
- Agents know their own capabilities → better task routing
- Agents see scope policies → understand constraints
- Agents get usage guidance → consistent behavior
- Prompt-ready format → easy integration with LLM systems

---

### 5. Action Parity (CRUD Completeness)

**Goal:** Move from 48% to 85%+ parity by adding 13 missing CRUD tools.

#### Missing Tools Prioritized

**Tier 1: Core Agent Autonomy (5 tools)**

```typescript
1. memory_create_scope({
     name, description, members[], readPolicy, writePolicy, memoryPolicy
   })
   → Returns: { scopeId }

2. memory_update_scope({
     scopeId, description?, readPolicy?, writePolicy?, memoryPolicy?
   })
   → Returns: { updated: true }

3. memory_add_scope_member({ scopeId, agentId })
   → Adds agent to scope, updates permitted scopes

4. memory_remove_scope_member({ scopeId, agentId })
   → Removes agent, cleans up notifications

5. memory_list_scopes({ agentId?, includeMembers: boolean })
   → Returns: [{ scopeId, name, memberCount, yourRole }]
```

**Tier 2: Conversation & Session Management (4 tools)**

```typescript
6. memory_create_conversation({
     sessionId, participants[], contextSummary, tags
   })
   → Returns: { conversationId }

7. memory_add_fact_to_conversation({ conversationId, factId })
   → Threads fact into conversation

8. memory_list_conversations({ agentId?, sessionId?, limit })
   → Returns: [{ conversationId, participants, factCount, lastActivity }]

9. memory_create_session({ agentId, contextSummary, parentSessionId? })
   → Explicitly create session (vs auto-creation)
```

**Tier 3: Lifecycle Management (4 tools)**

```typescript
10. memory_update_fact({
      factId, content?, tags?, entityIds?, factType?, emotionalContext?
    })
    → Updates fact fields (vs creating new fact)

11. memory_archive_fact({ factId, reason })
    → Manual archive (vs cron-only)

12. memory_boost_relevance({ factId, delta })
    → Manually adjust importance/relevance

13. memory_create_theme({
      name, description, factIds[], entityIds[], scopeId, importance?
    })
    → Agent-driven theme creation
```

#### Implementation Checklist

- [ ] Add Convex mutations in `convex/functions/` for each operation
- [ ] Add MCP tool handlers in `mcp-server/src/tools/` following existing pattern
- [ ] Add Zod schemas for input validation
- [ ] Add typed wrappers in `mcp-server/src/lib/convex-client.ts`
- [ ] Update `mcp-server/src/index.ts` tool registration
- [ ] Write tests for each new tool
- [ ] Update API reference documentation

**Estimated Impact:**
- Agent autonomy: 48% → 85% (13 new tools)
- Scope self-management: admin-only → agent-driven
- Conversation tracking: invisible → explicit
- Lifecycle control: cron-only → agent-driven

---

### 6. Production Hardening

**Goal:** Production-ready deployment with security, performance, observability, and complete documentation.

#### Security Audit

**Input Validation:**
- [ ] Add length limits to all string inputs (content <10MB, tags <100 chars, name <256)
- [ ] Validate scopeId format (prevent SQL injection via string-based paths)
- [ ] Sanitize user-provided config values (prevent code injection)
- [ ] Add CORS headers for web clients (if exposing HTTP endpoint)
- [ ] Rate limiting per agent (100 req/min per tool)

**Authentication & Authorization:**
- [ ] Verify ENGRAM_AGENT_ID matches Convex agent record
- [ ] Add API key authentication for MCP server (optional)
- [ ] Enforce scope access checks in every Convex function
- [ ] Add audit log for admin operations (config changes, scope deletion)

**Error Handling:**
- [ ] Wrap all Convex calls in try-catch with structured errors
- [ ] Never expose stack traces to MCP clients (log to stderr only)
- [ ] Add circuit breaker for external APIs (Cohere embedding)
- [ ] Graceful degradation when enrichment fails (store fact anyway)

#### Performance Optimization

**LanceDB Indexing:**
- [ ] Add HNSW-SQ vector index when >20K facts (currently brute-force)
- [ ] Add BTree indexes on `scopeId`, `factType`, `createdAt`
- [ ] Batch `mergeInsert` operations (500 facts at a time)
- [ ] Compress embeddings to float16 (reduce storage by 50%)

**Convex Query Optimization:**
- [ ] Use `withIndex()` on all queries (avoid table scans)
- [ ] Batch mutations (single transaction vs N separate)
- [ ] Cache config reads in MCP server memory (refresh hourly)
- [ ] Paginate large result sets (cursor-based, not offset)

**Caching Strategy:**
- [ ] Cache agent metadata in MCP server (refresh on registration change)
- [ ] Cache system_config in memory (invalidate on update)
- [ ] Add Redis layer for high-frequency reads (optional future)

#### Observability

**Health Checks:**
```typescript
// mcp-server/src/health.ts
export async function healthCheck() {
  return {
    status: "healthy",
    convex: await pingConvex(),
    lancedb: await pingLanceDB(),
    cohere: await pingCohere(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  };
}

// Expose via HTTP endpoint
// GET http://localhost:3000/health
```

**Structured Logging:**
```typescript
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: { target: "pino-pretty" }, // stderr only
});

logger.info({ agentId, factId, duration: 45 }, "Fact stored");
logger.error({ agentId, error: err.message }, "Enrichment failed");
```

**Metrics Tracking:**
- [ ] Prometheus metrics endpoint (requests, latency, errors)
- [ ] Track enrichment pipeline lag (time from store to embedding)
- [ ] Monitor vault sync lag (file edit to Convex update)
- [ ] Alert on high error rates (>5% of requests)

#### Documentation Overhaul

**Files to Update/Create:**

1. **`README.md`** - High-level overview, quick start, links
2. **`docs/INSTALLATION.md`** - Detailed setup guide (Convex, Cohere, Obsidian)
3. **`docs/API-REFERENCE.md`** - All 40+ MCP tools with examples
4. **`docs/CONFIGURATION.md`** - system_config keys, memory_policies
5. **`docs/ARCHITECTURE.md`** - System design, data flow diagrams
6. **`docs/TROUBLESHOOTING.md`** - Common issues, debugging tips
7. **`docs/USAGE-EXAMPLES.md`** - Real agent scenarios with prompts
8. **`PAI-INTEGRATION.md`** - OpenClaw/PAI integration guide
9. **`CONTRIBUTING.md`** - Development setup, PR guidelines
10. **`CHANGELOG.md`** - Version history

**API Reference Format:**
```markdown
## memory_store_fact

**Description:** Store atomic fact with async enrichment pipeline.

**Input:**
- `content` (string, required): The fact content
- `source` (string, optional): Where this came from
- `factType` (string, optional): decision|insight|observation|...
- `tags` (string[], optional): Tags for categorization
- `scopeId` (string, optional): Target scope (defaults to agent's private)

**Output:**
- `factId` (string): Convex document ID
- `importanceScore` (number): Computed importance (0-1)

**Example:**
\`\`\`typescript
const result = await memory_store_fact({
  content: "Use Cohere Embed 4 for 1024-dim multimodal embeddings",
  factType: "decision",
  tags: ["architecture", "embeddings"],
  emotionalContext: "confident",
});
// { factId: "j...", importanceScore: 0.82 }
\`\`\`

**See Also:** memory_observe, memory_recall
```

#### Cleanup Tasks

**Redundant Files to Remove:**
```bash
# Find and remove unused files
rm -rf mcp-server/src/old/
rm mcp-server/src/tools/legacy-*.ts
rm docs/drafts/
rm convex/migrations/obsolete/
```

**Code Quality:**
- [ ] Run ESLint and fix all warnings
- [ ] Run Prettier to format all TypeScript
- [ ] Remove commented-out code blocks
- [ ] Update all TODO comments with GitHub issues
- [ ] Remove console.log statements (use structured logging)

**Dependency Cleanup:**
- [ ] Audit package.json for unused dependencies
- [ ] Update all dependencies to latest stable versions
- [ ] Remove deprecated Convex APIs (if any)
- [ ] Consolidate duplicate utility functions

---

## Implementation Phases

### Phase 1: Quick Wins (Week 1-2) - 10 days

**Goal:** Low-effort, high-impact changes that don't require breaking changes.

#### Week 1: Configuration & Context

**Day 1-2: Schema Additions**
- [ ] Add `system_config` table to `convex/schema.ts`
- [ ] Add `memory_policies` table
- [ ] Add `memory_events` table
- [ ] Add identity fields to `agents` table
- [ ] Deploy schema changes (zero downtime)

**Day 3-4: Config Migration**
- [ ] Write migration script `001_seed_system_config.ts`
- [ ] Extract all hardcoded values to seed data
- [ ] Create `convex/lib/config-resolver.ts` utility
- [ ] Update `convex/actions/importance.ts` to use config
- [ ] Update `convex/crons/decay.ts` to use config

**Day 5: Agent Self-Context**
- [ ] Extend `memory_get_context` return type with `agentContext`
- [ ] Add `memory_get_agent_info` MCP tool
- [ ] Add `memory_get_system_prompt` MCP tool (optional)
- [ ] Test with sample agent

#### Week 2: Documentation & Discoverability

**Day 6-7: Documentation**
- [ ] Create `docs/USAGE-EXAMPLES.md` with 10 scenarios
- [ ] Create `docs/API-REFERENCE.md` (document all 18 existing tools)
- [ ] Update `README.md` with clearer quick start
- [ ] Add suggested prompts to GETTING-STARTED.md

**Day 8-9: DELETE Operations**
- [ ] Add `deleteEntity` mutation in `convex/functions/entities.ts`
- [ ] Add `deleteScope` mutation with cascade/prevent logic
- [ ] Add `deleteConversation` mutation
- [ ] Add `deleteSession` mutation
- [ ] Add MCP tool wrappers for each

**Day 10: Testing & Validation**
- [ ] Manual testing of all Phase 1 changes
- [ ] Update tests for new tools
- [ ] Deploy to staging (if available)
- [ ] Document any issues found

**Deliverables:**
- ✅ Config extraction complete (0% → 40% prompt-native)
- ✅ Agent self-context available
- ✅ DELETE operations added (73% → 78% CRUD completeness)
- ✅ Documentation improved (64% → 75% capability discovery)

---

### Phase 2: Core Refactoring (Week 3-5) - 15 days

**Goal:** Major architectural changes to achieve agent-native compliance.

#### Week 3: Tool Decomposition

**Day 11-12: Recall Primitives**
- [ ] Create `memory_vector_search` tool
- [ ] Create `memory_text_search` tool
- [ ] Create `memory_bump_access` tool
- [ ] Create `memory_record_recall` tool
- [ ] Update `memory_recall` to call primitives (backwards compat)

**Day 13-14: Context Primitives**
- [ ] Create `memory_get_observations` tool
- [ ] Create `memory_get_entities` tool
- [ ] Create `memory_get_themes` tool
- [ ] Create `memory_get_handoffs` tool
- [ ] Create `memory_get_notifications` + `memory_mark_notifications_read`
- [ ] Update `memory_get_context` to orchestrate primitives

**Day 15: Lifecycle Primitives**
- [ ] Create `memory_list_facts` tool (with filters)
- [ ] Create `memory_list_stale_facts` tool
- [ ] Create `memory_mark_facts_merged` tool
- [ ] Update `memory_summarize` and `memory_prune` to use primitives

#### Week 4: Action Parity

**Day 16-17: Scope Management Tools**
- [ ] Implement `memory_create_scope` (mutation + MCP tool)
- [ ] Implement `memory_update_scope`
- [ ] Implement `memory_add_scope_member`
- [ ] Implement `memory_remove_scope_member`
- [ ] Implement `memory_list_scopes`

**Day 18-19: Conversation & Session Tools**
- [ ] Implement `memory_create_conversation`
- [ ] Implement `memory_add_fact_to_conversation`
- [ ] Implement `memory_list_conversations`
- [ ] Implement `memory_create_session`

**Day 20: Lifecycle Management Tools**
- [ ] Implement `memory_update_fact`
- [ ] Implement `memory_archive_fact`
- [ ] Implement `memory_boost_relevance`
- [ ] Implement `memory_create_theme`

#### Week 5: Real-Time Propagation

**Day 21-22: Event Log System**
- [ ] Add event emission to `storeFact` mutation
- [ ] Add event emission to enrichment actions
- [ ] Add event emission to notification creation
- [ ] Create `memory_poll_events` MCP tool

**Day 23-24: Enhanced Polling**
- [ ] Implement watermark-based polling
- [ ] Add client-side polling loop example
- [ ] Test latency (target: <5s propagation)
- [ ] Document polling best practices

**Day 25: Integration Testing**
- [ ] End-to-end test: agent stores fact → enrichment → another agent polls event
- [ ] Multi-agent coordination test
- [ ] Performance benchmarking (50 agents, 100K facts)
- [ ] Fix any issues found

**Deliverables:**
- ✅ 18 tools → 40+ primitives (39% → 90% primitives)
- ✅ 13 new CRUD tools (48% → 85% action parity)
- ✅ Event log + polling (15% → 60% UI integration)
- ✅ All core refactoring complete

---

### Phase 3: Production Hardening (Week 6-7) - 10 days

**Goal:** Production-ready deployment with security, performance, and observability.

#### Week 6: Security & Performance

**Day 26-27: Security Audit**
- [ ] Add input validation (length limits, format checks)
- [ ] Add rate limiting (100 req/min per agent)
- [ ] Implement circuit breaker for Cohere API
- [ ] Add CORS headers (if needed)
- [ ] Audit log for admin operations
- [ ] Security testing (injection attempts, boundary cases)

**Day 28-29: Performance Optimization**
- [ ] LanceDB: Add HNSW-SQ index (if >20K facts)
- [ ] LanceDB: Add BTree indexes
- [ ] Convex: Audit all queries for index usage
- [ ] Convex: Batch mutations where possible
- [ ] Cache config in MCP server memory
- [ ] Load testing (1000 req/min sustained)

**Day 30: Caching & Query Optimization**
- [ ] Implement config cache refresh
- [ ] Add cursor-based pagination for large results
- [ ] Profile slow queries and optimize
- [ ] Test query performance (<100ms p95)

#### Week 7: Documentation & Cleanup

**Day 31-32: Documentation Overhaul**
- [ ] Finalize API-REFERENCE.md (all 40+ tools)
- [ ] Write INSTALLATION.md (detailed setup)
- [ ] Write CONFIGURATION.md (all config keys)
- [ ] Update ARCHITECTURE.md (diagrams)
- [ ] Write TROUBLESHOOTING.md (common issues)

**Day 33-34: Code Cleanup**
- [ ] Remove redundant files (old/, drafts/, unused tools)
- [ ] Run ESLint + Prettier on all code
- [ ] Remove TODOs (convert to GitHub issues)
- [ ] Remove console.log (replace with structured logging)
- [ ] Update dependencies to latest stable

**Day 35: Observability & Deployment**
- [ ] Add health check endpoint
- [ ] Implement structured logging (pino)
- [ ] Add Prometheus metrics (optional)
- [ ] Write deployment guide (Docker, systemd)
- [ ] Final integration test suite
- [ ] Tag v2.0.0 release

**Deliverables:**
- ✅ Security hardening complete
- ✅ Performance optimized (<100ms queries, <5s propagation)
- ✅ Complete documentation (10 docs)
- ✅ Production-ready deployment

---

## Success Metrics

### Agent-Native Compliance

| Principle | Before | After | Target |
|-----------|--------|-------|--------|
| Action Parity | 48% | 85%+ | 80%+ |
| Tools as Primitives | 39% | 90%+ | 85%+ |
| Context Injection | 50% | 90%+ | 85%+ |
| Shared Workspace | 92% | 92% | 90%+ ✅ |
| CRUD Completeness | 73% | 95%+ | 90%+ |
| UI Integration | 15% | 75%+ | 70%+ |
| Capability Discovery | 64% | 85%+ | 80%+ |
| Prompt-Native Features | 0% | 80%+ | 75%+ |
| **Overall Score** | **48%** | **87%+** | **80%+** |

### Performance Benchmarks

- **Tool Response Time:** <50ms (unchanged, already good)
- **Query Latency:** <100ms p95 (from unbounded)
- **Enrichment Lag:** <3s from store to embed (from variable)
- **Propagation Latency:** <5s from event to poll (from 30s)
- **Vault Sync Lag:** <30s (file watcher limitation)

### Quality Gates

**Security:**
- [ ] No input validation gaps (100% coverage)
- [ ] Rate limiting enforced (100 req/min)
- [ ] All scope checks pass (no unauthorized access)
- [ ] Circuit breaker activates on API failures

**Performance:**
- [ ] All queries use indexes (0 table scans)
- [ ] Load test passes (1000 req/min sustained)
- [ ] Memory usage stable (<500MB for 100K facts)

**Documentation:**
- [ ] All tools documented with examples
- [ ] Installation guide tested by new user
- [ ] Troubleshooting covers 90% of support issues

**Code Quality:**
- [ ] ESLint passes (0 warnings)
- [ ] TypeScript strict mode enabled
- [ ] Test coverage >80% (unit + integration)
- [ ] Zero console.log in production code

---

## Migration Strategy

### Breaking Changes

**None.** All changes are backwards-compatible additions or opt-in features.

**Deprecated APIs:**
- `memory_recall` (still works, but composition via primitives recommended)
- `memory_get_context` (still works, new primitives available for custom composition)
- `memory_summarize` / `memory_prune` (still work, primitives available)

**Migration Timeline:**
- **v2.0** (This release): New primitives available, old tools work
- **v2.5** (6 months): Deprecation warnings in logs
- **v3.0** (12 months): Old workflow tools removed (breaking)

### Data Migrations

**Schema Changes:**
- All new tables (`system_config`, `memory_policies`, `memory_events`) → deployed day 1
- All new fields (agent identity) → optional, no migration needed
- Seed script populates system_config from hardcoded defaults

**No Data Loss:**
- Existing facts, entities, agents unchanged
- Old MCP clients continue working
- Graceful degradation if new features disabled

---

## Dependencies & Risks

### External Dependencies

- **Convex** - Backend platform (no breaking changes expected)
- **Cohere Embed 4** - Embeddings API (rate limits, $0.0001/1K tokens)
- **LanceDB** - Local cache (stable API)
- **MCP SDK** - Protocol (@modelcontextprotocol/sdk v1.x)

### Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Schema migration breaks existing clients | Low | High | All fields optional, backwards compatible |
| Config extraction introduces bugs | Medium | Medium | Extensive testing, fallback to hardcoded defaults |
| Tool decomposition confuses users | Medium | Low | Keep old tools as wrappers, clear migration guide |
| Performance regression on large datasets | Low | Medium | Load testing before production, rollback plan |
| WebSocket transport unreliable | Medium | Low | Defer to Phase 2, polling is sufficient |
| Documentation incomplete on launch | Medium | Low | Phased docs updates, community feedback |

### Rollback Plan

**If critical bugs found:**
1. Revert schema changes (drop new tables)
2. Restore hardcoded config values
3. Remove new MCP tools from registration
4. Deploy previous version via Git tag
5. Post-mortem and fix in staging

**Monitoring for Rollback Triggers:**
- Error rate >5% sustained for 10 minutes
- Query latency >500ms p95
- Memory usage >1GB for MCP server
- Data integrity issues (facts missing/corrupted)

---

## References & Research

### Internal Documentation

**Codebase Analysis:**
- `/Users/cortex-air/Tools/engram/convex/schema.ts` - All table definitions
- `/Users/cortex-air/Tools/engram/mcp-server/src/index.ts` - MCP tool registration
- `/Users/cortex-air/Tools/engram/PLAN.md` - Original build plan with architecture decisions
- `/Users/cortex-air/Tools/engram/UNIMPLEMENTED.md` - Completed roadmap items

**Institutional Learnings:**
- `docs/INSTITUTIONAL_LEARNINGS.md` - Convex, MCP, LanceDB gotchas (431 lines)
- `docs/solutions/integration-issues/convex-string-paths-mcp-server-20260212.md` - String-based function paths pattern
- `docs/research/tech-stack-best-practices.md` - Convex + MCP + LanceDB patterns (1298 lines)
- `docs/research/field-observations.md` - Production multi-agent learnings from GIZIN (31 agents, 8+ months)

**Related Plans:**
- `docs/brainstorms/2026-02-12-multi-agent-integration-patterns.md` - Shared scopes, handoff protocol, smart routing
- `docs/plans/SCOPE-SAFETY-SPEC.md` - Multi-scope recall security
- `docs/specs/VAULT_INTEGRATION_PLAN.md` - Obsidian vault sync architecture

### Agent-Native Architecture References

**Audit Report:**
- Overall score: 48% agent-native compliance
- 8 principles evaluated with detailed findings
- Top 10 recommendations by impact

**Key Findings:**
1. 11/18 tools are workflows (not primitives)
2. 0/14 features are prompt-native (all hardcoded)
3. 23 user actions lack agent equivalents
4. No real-time propagation mechanism
5. Agents lack self-awareness context

### External Resources

**Agent-Native Principles:**
- Parity: Whatever user can do, agent can do
- Primitives: Tools enable capability, not behavior
- Composition: New features via prompts, not code
- Prompt-Native: Behavior defined in config/prompts
- Context-Rich: Agents know their identity and constraints

**Tech Stack Best Practices:**
- Convex: Actions for vector search, mutations retry automatically
- MCP: stdio transport, stderr-only logging
- LanceDB: Brute-force fast until >20K records
- Cohere Embed 4: 1024-dim multimodal embeddings

---

## Next Steps After Plan Approval

1. **Review & Refine** - Stakeholder feedback on priorities
2. **Create GitHub Issues** - One issue per deliverable (35+ issues)
3. **Set Up Project Board** - Kanban with Phase 1/2/3 columns
4. **Kick Off Phase 1** - Configuration extraction (Day 1)
5. **Daily Standups** - Progress updates, blocker resolution
6. **Weekly Demos** - Show incremental progress to stakeholders

**First PR:** `feat: add system_config and memory_policies tables`

**Estimated Completion:** March 30, 2026 (7 weeks from Feb 14)

---

## Appendix: Tool Inventory

### Current Tools (18)

1. `memory_store_fact`
2. `memory_recall`
3. `memory_search`
4. `memory_link_entity`
5. `memory_get_context`
6. `memory_observe`
7. `memory_register_agent`
8. `memory_query_raw`
9. `memory_record_signal`
10. `memory_record_feedback`
11. `memory_summarize`
12. `memory_prune`
13. `memory_end_session`
14. `vault_sync`
15. `query_vault`
16. `export_graph`
17. `checkpoint`
18. `wake`

### New Primitives (25+)

**Recall Decomposition:**
19. `memory_vector_search`
20. `memory_text_search`
21. `memory_bump_access`
22. `memory_record_recall`

**Context Decomposition:**
23. `memory_get_observations`
24. `memory_get_entities`
25. `memory_get_themes`
26. `memory_get_handoffs`
27. `memory_get_notifications`
28. `memory_mark_notifications_read`
29. `memory_get_vault_notes`
30. `memory_get_graph_neighbors`

**Lifecycle Primitives:**
31. `memory_list_facts`
32. `memory_list_stale_facts`
33. `memory_mark_facts_merged`

**Scope Management:**
34. `memory_create_scope`
35. `memory_update_scope`
36. `memory_add_scope_member`
37. `memory_remove_scope_member`
38. `memory_list_scopes`

**Conversation & Session:**
39. `memory_create_conversation`
40. `memory_add_fact_to_conversation`
41. `memory_list_conversations`
42. `memory_create_session`

**Fact Lifecycle:**
43. `memory_update_fact`
44. `memory_archive_fact`
45. `memory_boost_relevance`
46. `memory_create_theme`

**Config & Identity:**
47. `memory_get_config`
48. `memory_set_config`
49. `memory_set_scope_policy`
50. `memory_list_configs`
51. `memory_get_agent_info`
52. `memory_update_agent`
53. `memory_get_system_prompt`

**Real-Time:**
54. `memory_poll_events`

**Total:** 54 tools (18 existing + 36 new)

**Primitive Ratio:** 90%+ (50+ primitives, 4 orchestrators)

---

**Plan Status:** Ready for review and implementation
**Last Updated:** 2026-02-14
**Author:** Agent-Native Audit + Plan Workflow
**Estimated LOC:** ~8,000-12,000 (schema, tools, docs, tests)