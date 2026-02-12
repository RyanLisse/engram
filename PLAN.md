# Engram — Build Plan

Unified multi-agent memory system. Local-first, Convex-synced, agent-native.

**Updated:** 2026-02-11 | **Research sync:** Feb 2026 papers + competitive landscape

---

## Vision

Every OpenClaw agent shares one brain. Store facts, recall context, build knowledge — across agents, devices, and sessions. No more context rot. No more forgotten corrections. No more knowledge silos between agents.

**Differentiators (validated by Feb 2026 research):**
- Multi-agent-first with scope-based access control (vs Mem0/EverMind single-agent focus)
- Multimodal memory via Cohere Embed 4 (text + images + code)
- Hierarchical memory with consolidation (facts → themes → knowledge)
- Multi-graph retrieval (semantic + temporal + causal + entity)
- Cloud + local hybrid (Convex + LanceDB) with offline support

---

## Architecture

### Core Components

```
engram/
├── convex/                  # Convex backend
│   ├── schema.ts            # 10 tables (was 7 + 3 new)
│   ├── functions/
│   │   ├── facts.ts         # CRUD + search + vector search
│   │   ├── entities.ts      # CRUD + relationship graph
│   │   ├── conversations.ts # Threading + handoffs
│   │   ├── sessions.ts      # Agent session tracking
│   │   ├── agents.ts        # Agent registry + capabilities
│   │   ├── scopes.ts        # Memory scope management
│   │   ├── signals.ts       # Feedback signals (ratings + sentiment)
│   │   ├── themes.ts        # Thematic fact clusters
│   │   └── sync.ts          # Sync log for local LanceDB
│   ├── actions/
│   │   ├── embed.ts         # Generate embeddings (Cohere Embed 4)
│   │   ├── extract.ts       # Entity extraction (cheap model)
│   │   ├── synthesize.ts    # Merge similar facts (SimpleMem pattern)
│   │   ├── compress.ts      # Semantic lossless compression
│   │   ├── summarize.ts     # Conversation summarization
│   │   └── importance.ts    # Importance scoring + outcome tracking
│   └── crons/
│       ├── decay.ts         # Daily differential decay (by fact type)
│       ├── forget.ts        # Daily active forgetting (forgetScore)
│       ├── compact.ts       # Daily conversation compaction
│       ├── consolidate.ts   # Weekly fact consolidation → themes
│       ├── rerank.ts        # Weekly importance recalculation
│       ├── rules.ts         # Monthly steering rule extraction
│       └── cleanup.ts       # Garbage collect expired scopes
│
├── mcp-server/              # MCP server (TypeScript)
│   ├── src/
│   │   ├── index.ts         # Server entry point
│   │   ├── tools/
│   │   │   ├── store-fact.ts
│   │   │   ├── recall.ts
│   │   │   ├── search.ts
│   │   │   ├── link-entity.ts
│   │   │   ├── get-context.ts
│   │   │   ├── observe.ts
│   │   │   ├── register-agent.ts
│   │   │   ├── query-raw.ts
│   │   │   ├── record-signal.ts     # NEW: feedback/rating capture
│   │   │   ├── record-feedback.ts   # NEW: recall usefulness tracking
│   │   │   ├── summarize.ts         # NEW: topic consolidation
│   │   │   └── prune.ts             # NEW: agent-initiated cleanup
│   │   └── lib/
│   │       ├── convex-client.ts
│   │       ├── lance-sync.ts
│   │       └── embeddings.ts        # Cohere Embed 4 client
│   └── package.json
│
├── skill/                   # OpenClaw skill package
│   ├── SKILL.md
│   └── install.sh
│
└── scripts/
    ├── migrate.ts           # Import from MemoryLance / JSON
    └── seed.ts              # Seed initial entities
```

---

## Convex Schema (10 Tables)

### `facts` (enhanced from research)
```typescript
defineTable({
  content: v.string(),
  factualSummary: v.optional(v.string()),     // Compressed representation (SimpleMem)
  timestamp: v.number(),
  updatedAt: v.optional(v.number()),          // Track modifications for sync
  source: v.string(),
  entityIds: v.array(v.string()),
  relevanceScore: v.float64(),
  accessedCount: v.number(),
  importanceScore: v.float64(),
  outcomeScore: v.optional(v.float64()),      // MemRL: learned utility from outcomes
  createdBy: v.string(),                      // agent ID
  contributingAgents: v.optional(v.array(v.string())), // Collaborative Memory provenance
  conversationId: v.optional(v.id("conversations")),
  scopeId: v.id("memory_scopes"),
  tags: v.array(v.string()),
  factType: v.string(),                       // decision|observation|plan|error|insight|correction|steering_rule|learning|session_summary
  embedding: v.optional(v.array(v.float64())),

  // Lifecycle (SimpleMem + ALMA)
  lifecycleState: v.optional(v.string()),     // active|dormant|merged|archived|pruned
  mergedInto: v.optional(v.id("facts")),      // pointer if merged into consolidated fact
  consolidatedFrom: v.optional(v.array(v.id("facts"))), // originals this consolidated
  supersededBy: v.optional(v.id("facts")),    // newer fact that replaced this
  forgetScore: v.optional(v.float64()),       // 0.0=keep, 1.0=forget (ALMA)

  // Emotional memory (GIZIN)
  emotionalContext: v.optional(v.string()),    // frustrated|proud|embarrassed|surprised|confident
  emotionalWeight: v.optional(v.float64()),   // 0.0-1.0, affects decay resistance

  // Multi-graph links (MAGMA)
  temporalLinks: v.optional(v.array(v.object({
    targetFactId: v.id("facts"),
    relation: v.string(),                     // before|after|during|caused_by|led_to
    confidence: v.float64(),
  }))),
})
  .index("by_scope", ["scopeId", "timestamp"])
  .index("by_agent", ["createdBy", "timestamp"])
  .index("by_type", ["factType", "timestamp"])
  .index("by_importance", ["importanceScore"])
  .index("by_lifecycle", ["lifecycleState", "timestamp"])
  .searchIndex("search_content", { searchField: "content", filterFields: ["scopeId", "factType", "createdBy"] })
  .vectorIndex("vector_search", { vectorField: "embedding", dimensions: 1024, filterFields: ["scopeId"] })
```

### `entities`
```typescript
defineTable({
  entityId: v.string(),             // "entity-ryan", "entity-briefly"
  name: v.string(),
  type: v.string(),                 // person|project|company|concept|tool
  firstSeen: v.number(),
  lastSeen: v.number(),
  metadata: v.any(),                // flexible key-value
  relationships: v.array(v.object({
    targetId: v.string(),
    relationType: v.string(),       // created_by|depends_on|works_with|part_of|related_to
    since: v.optional(v.string()),
  })),
  importanceScore: v.float64(),
  accessCount: v.number(),
  createdBy: v.string(),
})
  .index("by_entity_id", ["entityId"])
  .index("by_type", ["type"])
  .index("by_importance", ["importanceScore"])
  .searchIndex("search_name", { searchField: "name" })
```

### `conversations`
```typescript
defineTable({
  sessionId: v.id("sessions"),
  participants: v.array(v.string()),  // agent IDs
  threadFacts: v.array(v.id("facts")),
  contextSummary: v.string(),
  importance: v.float64(),
  tags: v.array(v.string()),
  handoffs: v.array(v.object({
    fromAgent: v.string(),
    toAgent: v.string(),
    timestamp: v.number(),
    contextSummary: v.string(),
  })),
})
  .index("by_session", ["sessionId"])
  .index("by_importance", ["importance"])
```

### `sessions`
```typescript
defineTable({
  agentId: v.string(),
  startTime: v.number(),
  lastActivity: v.number(),
  conversationIds: v.array(v.id("conversations")),
  factCount: v.number(),
  contextSummary: v.string(),
  parentSession: v.optional(v.id("sessions")),
  nodeId: v.optional(v.string()),   // OpenClaw node
})
  .index("by_agent", ["agentId", "startTime"])
  .index("by_node", ["nodeId"])
```

### `agents` (enhanced)
```typescript
defineTable({
  agentId: v.string(),              // "indy", "coder-1", "ml-worker"
  name: v.string(),
  nodeId: v.optional(v.string()),
  capabilities: v.array(v.string()),
  lastSeen: v.number(),
  factCount: v.number(),
  defaultScope: v.string(),         // "private"|"team"|"public"
  telos: v.optional(v.string()),    // Purpose/goal (PAI: "Ship code faster")
  settings: v.optional(v.any()),    // agent-specific memory config
})
  .index("by_agent_id", ["agentId"])
```

### `memory_scopes` (enhanced)
```typescript
defineTable({
  name: v.string(),                 // "project-briefly", "team-ml", "global"
  description: v.string(),
  members: v.array(v.string()),     // agent IDs
  readPolicy: v.string(),           // "members"|"all"
  writePolicy: v.string(),          // "members"|"creator"|"all"
  retentionDays: v.optional(v.number()),

  // Task-specific policies (ALMA)
  memoryPolicy: v.optional(v.object({
    maxFacts: v.optional(v.number()),
    decayRate: v.optional(v.float64()),           // scope-specific (0.95-0.99)
    prioritizeTypes: v.optional(v.array(v.string())),
    autoForget: v.optional(v.boolean()),
    compressionStrategy: v.optional(v.string()),   // summarize|prune|merge
    compactionThresholdBytes: v.optional(v.number()),
  })),

  // ISC for projects (PAI)
  idealStateCriteria: v.optional(v.array(v.object({
    criterion: v.string(),
    status: v.string(),             // pending|met|failed
    evidence: v.optional(v.string()),
  }))),
})
  .index("by_name", ["name"])
```

### `signals` (NEW — PAI feedback loop)
```typescript
defineTable({
  factId: v.optional(v.id("facts")),
  sessionId: v.optional(v.id("sessions")),
  agentId: v.string(),
  signalType: v.string(),           // explicit_rating|implicit_sentiment|failure
  value: v.number(),                // 1-10 for ratings, -1.0 to 1.0 for sentiment
  comment: v.optional(v.string()),
  confidence: v.optional(v.float64()),
  context: v.optional(v.string()),
  timestamp: v.number(),
})
  .index("by_fact", ["factId", "timestamp"])
  .index("by_agent", ["agentId", "timestamp"])
  .index("by_type", ["signalType", "timestamp"])
```

### `themes` (NEW — EverMemOS MemScenes)
```typescript
defineTable({
  name: v.string(),
  description: v.string(),
  factIds: v.array(v.id("facts")),
  entityIds: v.array(v.id("entities")),
  scopeId: v.id("memory_scopes"),
  importance: v.float64(),
  lastUpdated: v.number(),
  embedding: v.optional(v.array(v.float64())),
})
  .index("by_scope", ["scopeId"])
  .index("by_importance", ["importance"])
  .vectorIndex("theme_search", { vectorField: "embedding", dimensions: 1024, filterFields: ["scopeId"] })
```

### `sync_log`
```typescript
defineTable({
  nodeId: v.string(),
  lastSyncTimestamp: v.number(),
  factsSynced: v.number(),
  status: v.string(),               // ok|error|syncing
})
  .index("by_node", ["nodeId"])
```

---

## MCP Tools (12 Primitives)

### Core Tools (Original 8)

#### 1. `memory_store_fact`
Store an atomic fact with scope, entities, and tags.
```
Input:  { content, source?, entityIds?, tags?, factType?, scopeId?, emotionalContext? }
Output: { factId, importanceScore }
Side-effect: Triggers async enrichment (embedding, entity extraction, synthesis, importance)
```

#### 2. `memory_recall`
Semantic search across permitted scopes. The primary retrieval tool.
```
Input:  { query, limit?, scopeId?, factType?, minImportance?, searchStrategy? }
Output: { facts: [{ id, content, importance, relevance, source, entities }], recallId }
Side-effect: Bumps accessedCount, returns recallId for feedback tracking
```
**searchStrategy**: "semantic" (default) | "fulltext" | "temporal" | "hybrid"

#### 3. `memory_search`
Full-text + structured filters. For precise lookups.
```
Input:  { text?, tags?, factType?, agentId?, dateRange?, scopeId? }
Output: { facts: [...] }
```

#### 4. `memory_link_entity`
Create or update an entity and its relationships.
```
Input:  { entityId, name, type, metadata?, relationships? }
Output: { entity, created: boolean }
```

#### 5. `memory_get_context`
Warm start tool. Returns everything relevant for a topic/project.
```
Input:  { topic, maxTokens?, maxFacts?, includeSessions?, includeEntities?, includeThemes? }
Output: { facts: [...], entities: [...], themes: [...], recentSessions: [...], steeringRules: [...], summary: string }
```
**Token-aware injection** (SimpleMem): When `maxTokens` is set, fills budget with highest-importance facts first.

#### 6. `memory_observe`
Passive, fire-and-forget observation storage. Low-ceremony.
```
Input:  { observation, emotionalContext? }
Output: { ack: true }
Side-effect: Async enrichment (entity extraction, embedding, synthesis, importance)
```

#### 7. `memory_register_agent`
Agent self-registers on first interaction.
```
Input:  { agentId, name, capabilities?, defaultScope?, telos? }
Output: { agent, scopes: [...available] }
Side-effect: Creates private scope, returns permitted scopes
```

#### 8. `memory_query_raw`
Escape hatch for emergent use. Direct Convex query access (read-only).
```
Input:  { table, filter?, sort?, limit? }
Output: { results: [...] }
```

### New Tools (from research)

#### 9. `memory_record_signal` (PAI feedback loop)
Record explicit ratings or implicit sentiment on facts.
```
Input:  { factId?, signalType, value, comment?, context? }
Output: { signalId }
Side-effect: Low ratings (1-3) auto-store full context as correction facts
```

#### 10. `memory_record_feedback` (ALMA recall usefulness)
Post-recall feedback: which recalled facts were actually helpful.
```
Input:  { recallId, usedFactIds: string[], unusedFactIds?: string[] }
Output: { ack: true }
Side-effect: Updates outcome scores, feeds into importance recalculation
```

#### 11. `memory_summarize` (AgeMem SUMMARY)
Consolidate facts on a topic into a summary fact.
```
Input:  { topic, scopeId?, maxFacts? }
Output: { summaryFactId, consolidatedCount }
Side-effect: Creates summary fact, marks originals as consolidated
```

#### 12. `memory_prune` (AgeMem FILTER)
Agent-initiated cleanup of stale or irrelevant facts.
```
Input:  { scopeId?, olderThanDays?, maxForgetScore?, dryRun? }
Output: { prunedCount, prunedFactIds }
Side-effect: Marks facts as pruned (never true deletes)
```

---

## Async Enrichment Pipeline (Enhanced from SimpleMem)

When a fact is stored (via `store_fact` or `observe`):

```
1. Store raw fact immediately (< 50ms)
   ↓
2. Semantic compression: resolve coreferences, extract standalone fact (SimpleMem stage 1)
   ↓
3. Generate embedding (Cohere Embed 4, ~200ms, 1024-dim)
   ↓
4. Synthesis check: find similar existing facts (cosine > 0.85)
   → If match: merge into existing fact instead of storing duplicate (SimpleMem stage 2)
   → If no match: continue
   ↓
5. Extract entities + relationships from content (cheap model, ~500ms)
   ↓
6. Extract temporal/causal links to other facts (MAGMA pattern)
   ↓
7. Calculate importance score (multi-factor formula + emotional weight)
   ↓
8. Update fact with all enrichment results
   ↓
9. Sync log: mark as pending sync for all registered nodes
```

Agent never waits for steps 2-9. Step 1 returns immediately.

**Enrichment failure handling**: Facts get `enrichmentStatus: pending|enriching|enriched|failed`. Failed facts retry with exponential backoff. Daily backfill cron catches any remaining failures (not 18h gap — retry every 30 minutes for first 6 hours).

---

## Scheduled Functions (Crons)

### Daily: Differential Relevance Decay
```typescript
// Decay rate varies by fact type (ALMA + PAI):
// decisions: 0.998^days (slow decay — decisions matter long)
// errors/corrections: 0.995^days, floor 0.5 (errors must persist)
// observations: 0.99^days (standard)
// notes: 0.985^days (fast decay — low importance)
// Emotional weight further resists decay: multiply by (1 + emotionalWeight * 0.5)
```

### Daily: Active Forgetting
```typescript
// Compute forgetScore based on:
// - Superseded by newer fact on same topic? → +0.3
// - Low recall feedback (recalled but never used)? → +0.2
// - Low importance + low access + old? → +0.2
// - Contradicts higher-importance fact? → +0.3
// Archive (not delete) facts with forgetScore > 0.7
```

### Daily: Conversation Compaction (Letta pattern)
```typescript
// Review conversations > compactionThresholdBytes
// Summarize message clusters into consolidated facts
// Pin high-importance facts (never compact)
```

### Weekly: Fact Consolidation → Themes
```typescript
// Group related facts by shared entities + embedding similarity (> 0.80)
// Generate summary themes (EverMemOS MemScenes)
// Store in themes table with embedding for theme-level search
// Mark originals: lifecycleState = "merged"
```

### Weekly: Importance Recalculation
```typescript
// Recompute entity PageRank based on current relationship graph
// Factor in signals/feedback scores (outcome_score from MemRL)
// Update fact importance incorporating learned utility
```

### Monthly: Steering Rule Extraction (PAI)
```typescript
// Analyze facts with low feedback scores (corrections, errors)
// Pattern detection: "When doing X, mistakes happen"
// Create factType: "steering_rule" facts
// Auto-inject into warm starts
```

### Daily: Garbage Collection
```typescript
// Archive facts in expired scopes (retentionDays exceeded) — move to archive
// Clean old sync_log entries (> 30 days)
// Never true-delete facts (always archive for provenance)
```

---

## Build Phases

### Phase 1: Foundation ✅
- [x] `npx create-convex` project setup
- [x] Schema definition (all 10 tables including signals, themes)
- [x] Basic CRUD mutations and queries for all tables
- [x] Full-text search index on facts
- [x] Seed script with existing entities from memory.md
- [x] **Write permission enforcement** on storeFact (check scope writePolicy)

### Phase 2: MCP Server ✅
- [x] TypeScript MCP server scaffold (`@modelcontextprotocol/sdk` v1.x)
- [x] Implement all 12 tools
- [x] Convex HTTP client integration (string-based function paths)
- [x] Agent identity management (env var + register tool)
- [x] OpenClaw skill package (SKILL.md)
- [x] Verified with reloaderoo: all 12 tools listed + store/recall end-to-end

### Phase 3: Async Enrichment ✅
- [x] Cohere Embed 4 embedding action (1024-dim, `embed-v4.0`)
- [ ] Semantic compression step (coreference resolution) — deferred to v2
- [ ] Synthesis step (merge similar facts, cosine > 0.85) — deferred to v2
- [ ] Entity extraction action (GPT-4o-mini) — deferred to v2
- [ ] Temporal/causal link extraction — deferred to v2
- [x] Multi-factor importance scoring (with emotional weight)
- [x] Vector search index on facts + themes (1024-dim)
- [x] Wire enrichment pipeline to store_fact + observe (scheduler.runAfter)

### Phase 4: Multi-Agent ✅
- [x] Agent registration flow with private scope creation
- [x] Memory scopes CRUD + per-scope memory policies
- [x] **Multi-scope recall**: search all permitted scopes, merge results
- [x] Scope management: create shared scopes, add/remove members
- [x] Conversation handoff tracking
- [x] Signal recording + feedback tracking

### Phase 5: Local Sync ✅
- [x] LanceDB sync daemon (TypeScript, async API)
- [x] Scope-aware sync (only sync facts agent has access to)
- [x] Pull new/updated facts from Convex since last sync
- [x] Use `mergeInsert` for atomic upserts into LanceDB
- [x] Local vector search fallback
- [x] Sync log tracking + catch-up mechanism

### Phase 6: Crons + Polish ✅
- [x] All 7 cron jobs configured (decay, forget, compact, consolidate, rerank, rules, cleanup)
- [x] Convex codegen + deploy verified
- [x] MCP server tsc --noEmit clean
- [ ] Import entities.json → Convex (with entity dedup) — deferred to migration phase
- [ ] Import facts_schema.json → Convex (with rate limiting) — deferred to migration phase
- [ ] Performance benchmarks (< 300ms recall target) — deferred to production

---

## Success Metrics

1. **Zero knowledge loss** — Ask about a correction from 2 weeks ago, get it
2. **Sub-300ms recall** — Semantic search returns in < 300ms
3. **Multi-agent sharing** — Agent B finds Agent A's discoveries automatically
4. **Cross-device** — Same memory on Mac Mini, MacBook Air, MacBook Pro
5. **Self-improving** — Memory quality improves with use (signals, outcome tracking, consolidation)
6. **Memory consolidation** — Related facts automatically merge into themes over time
7. **Emotional anchoring** — Corrections with emotional context resist decay and surface in warm starts

---

## Tech Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend | Convex | Realtime, native vector search, scheduled functions, free tier |
| Embeddings | **Cohere Embed 4** (1024-dim) | Multimodal (text + images + code), state-of-art quality, replaces OpenAI |
| MCP SDK | `@modelcontextprotocol/sdk` v1.x | Build now, prepare for v2 (Q1 2026). Use stdio transport |
| Entity extraction | GPT-4o-mini | $0.04/1K facts, works in Convex V8 isolates |
| Local vector DB | LanceDB `@lancedb/lancedb` (async API) | Sub-10ms, offline support, `mergeInsert` upserts, multi-vector support |
| HTTP client | `ConvexHttpClient` | Stateless HTTP, no WebSocket overhead |
| Enrichment | Single `internalAction` per fact with status tracking | Sequential pipeline with retry via `@convex-dev/action-retrier` |
| Access control | Scope-based (not per-fact ACLs) | Cleaner, validated by GIZIN + PAI research |
| Memory lifecycle | 5-state machine (active → dormant → merged → archived → pruned) | Merge before delete (SimpleMem + ALMA) |
| Decay | Differential by fact type + emotional weight | Decisions/corrections decay slowly, notes fast |

## Resolved Questions

| Question | Decision | Source |
|----------|----------|--------|
| Embedding model | Cohere Embed 4 (1024-dim, multimodal) | User decision |
| Entity extraction | GPT-4o-mini (cheap, good enough for v1) | PAI + Letta confirm |
| Vector search | Convex native + LanceDB local | SimpleMem validates, sufficient for scale |
| LanceDB necessity | Yes — offline + sub-10ms for local agents | Validated by Mem0 OpenMemory doing same |
| Conversation boundary | Time gap > 30min + explicit markers + agent heartbeat | PAI + GIZIN confirm |
| Multi-scope recall | Search all permitted scopes, merge + re-rank results | SpecFlow critical gap |
| Auth model | `CONVEX_DEPLOY_KEY` for prod; single-user, trust-boundary at MCP server | SpecFlow Q1 |
| Offline writes | v1: writes require Convex connectivity; v2: local queue + sync | SpecFlow Q4 |
| Scope creation | Seed script + `memory_register_agent` auto-creates private; shared scopes via admin | SpecFlow Q3 |

---

## Research Foundation

All research informing this architecture lives in `docs/research/`:

| Document | Key Insight |
|----------|-------------|
| [SimpleMem](docs/research/simplemem-cross-session.md) | SOTA cross-session memory, semantic compression, multi-view indexing |
| [Letta Deep Dive](docs/research/letta-deep-dive.md) | 3-tier memory, memory blocks, conversation compaction |
| [PAI v2.4](docs/research/pai-daniel-miessler.md) | Signal system, steering rules, Telos, 3-tier memory |
| [ALMA Meta-Memory](docs/research/alma-meta-memory.md) | Selective forgetting, task-specific policies |
| [Field Observations](docs/research/field-observations.md) | GIZIN (31 agents), emotional memory, identity from persistence |
| [Feb 2026 Research](docs/research-2026-02-agent-memory.md) | EverMemOS, MAGMA, AgeMem, MemRL, LightMem, Collaborative Memory |

**Cross-cutting consensus:**
1. Memory is the moat — not model choice, not prompt engineering
2. Knowing what to forget > knowing what to store
3. Scaffolding > model intelligence
4. Emotional/sentiment signals matter
5. Multi-graph retrieval (semantic + temporal + causal + entity) is a major differentiator
6. Static importance formulas < learned utility from outcomes
7. Memory consolidation (facts → themes → knowledge) is SOTA

---

## Implementation Patterns (from tech-stack research)

Detailed patterns and code examples live in [`docs/research/tech-stack-best-practices.md`](docs/research/tech-stack-best-practices.md). Key patterns:

### Convex Patterns
- **Action orchestrates, mutation writes**: Enrichment pipeline uses `internalAction` for external APIs (Cohere, GPT-4o-mini), calls `internalMutation` to persist results atomically
- **Paginated cron processing**: Crons batch-process 500 records at a time via `ctx.scheduler.runAfter(0, ...)` for self-continuation
- **Action retry with `@convex-dev/action-retrier`**: Actions are at-most-once (no auto-retry); use action-retrier component for enrichment reliability
- **Batch mutations for migration**: Phase 6 imports should use single mutations with 100-500 record batches (not loop-of-mutations anti-pattern)
- **Idempotent actions**: Check if embedding/enrichment already exists before calling external APIs on retry

### MCP Server Patterns
- **stdio transport logging**: ALL logging to `stderr` (`console.error`), never `console.log` (corrupts JSON-RPC)
- **Error responses for LLM consumers**: Return `isError: true` with what/why/what-to-do guidance, not protocol-level errors
- **Circuit breaker**: Wrap Convex calls in circuit breaker (3 failures → 30s open → half-open retry) for resilience
- **MCP Resources**: Expose `engram://stats` resource for memory system health/stats (read-only)
- **MCP Prompts**: Register `warm-start` prompt template for topic-based context loading

### LanceDB Patterns
- **Index strategy**: Start without vector indexes (brute-force < 10ms for < 50K records). Create BTree indexes on `scopeId` and `factType` immediately. Add HNSW-SQ (cosine, m=16) only when local fact count exceeds ~20K rows
- **Sync daemon**: Module-level singleton, `mergeInsert` upserts every 30s, scope-aware (only sync permitted scopes)
- **Connection management**: Lazy singleton for both connection and table handles

### Schema Decision: Inline vs Split Embeddings
Current design: embeddings inline in `facts` table. Convex docs recommend splitting to a dedicated `fact_embeddings` table for vector search performance at scale. **Decision: Start inline (simpler), split if performance degrades.** The vector index works either way.

### Testing Strategy
- **MCP Inspector**: Interactive tool testing via `npx @modelcontextprotocol/inspector`
- **InMemoryTransport**: Unit tests use `InMemoryTransport.createLinkedPair()` for in-process client↔server testing
- **Convex testing**: Use Convex dashboard + `convex run` for function testing

---

## Competitive Landscape

| System | Approach | Engram Differentiator |
|--------|----------|-----------------------|
| **Supermemory** | Container-based access, profile mode (static + dynamic facts), hybrid search | Engram: scope-based with richer policies (retention, decay, compression), multi-graph retrieval, emotional anchoring |
| **Mem0** | OpenMemory, single-agent focus, vector + graph | Engram: multi-agent-first with scope ACLs, differential decay, theme consolidation |
| **Letta/MemGPT** | 3-tier (core/recall/archival), memory blocks | Engram: more fact types, signals/feedback loop, temporal/causal links |
| **EverMemOS/EverMind** | MemCell/MemScene hierarchy, SOTA LoCoMo benchmarks | Engram: local-first hybrid, MCP-native, multi-agent scope sharing |
| **LanceDB MemoryLance** | Local vector DB + Claude MCP | Engram: Convex cloud sync, enrichment pipeline, importance scoring, forgetting |
