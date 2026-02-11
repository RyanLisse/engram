# Engram — Build Plan

Unified multi-agent memory system. Local-first, Convex-synced, agent-native.

---

## Vision

Every OpenClaw agent shares one brain. Store facts, recall context, build knowledge — across agents, devices, and sessions. No more context rot. No more forgotten corrections. No more knowledge silos between agents.

---

## Architecture

### Core Components

```
engram/
├── convex/                  # Convex backend
│   ├── schema.ts            # Tables: facts, entities, conversations, sessions, agents, memory_scopes, sync_log
│   ├── functions/
│   │   ├── facts.ts         # CRUD + search + vector search
│   │   ├── entities.ts      # CRUD + relationship graph
│   │   ├── conversations.ts # Threading + handoffs
│   │   ├── sessions.ts      # Agent session tracking
│   │   ├── agents.ts        # Agent registry + capabilities
│   │   ├── scopes.ts        # Memory scope management
│   │   └── sync.ts          # Sync log for local LanceDB
│   ├── actions/
│   │   ├── embed.ts         # Generate embeddings (OpenAI)
│   │   ├── extract.ts       # Entity extraction (cheap model)
│   │   ├── summarize.ts     # Conversation summarization
│   │   └── importance.ts    # Importance scoring
│   └── crons/
│       ├── decay.ts         # Daily relevance decay
│       ├── rerank.ts        # Weekly importance recalculation
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
│   │   │   └── query-raw.ts
│   │   └── lib/
│   │       ├── convex-client.ts
│   │       ├── lance-sync.ts
│   │       └── embeddings.ts
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

## Convex Schema

### `facts`
```typescript
defineTable({
  content: v.string(),
  timestamp: v.number(),
  source: v.string(),
  entityIds: v.array(v.string()),
  relevanceScore: v.float64(),
  accessedCount: v.number(),
  importanceScore: v.float64(),
  createdBy: v.string(),           // agent ID
  conversationId: v.optional(v.id("conversations")),
  scopeId: v.id("memory_scopes"),
  tags: v.array(v.string()),
  factType: v.string(),            // decision|observation|plan|error|insight
  embedding: v.optional(v.array(v.float64())),
})
  .index("by_scope", ["scopeId", "timestamp"])
  .index("by_agent", ["createdBy", "timestamp"])
  .index("by_type", ["factType", "timestamp"])
  .index("by_importance", ["importanceScore"])
  .index("by_entity", ["entityIds"])
  .searchIndex("search_content", { searchField: "content", filterFields: ["scopeId", "factType", "createdBy"] })
  .vectorIndex("vector_search", { vectorField: "embedding", dimensions: 1536, filterFields: ["scopeId"] })
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
    relationType: v.string(),       // "created_by", "depends_on", "works_with"
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

### `agents`
```typescript
defineTable({
  agentId: v.string(),              // "indy", "coder-1", "ml-worker"
  name: v.string(),
  nodeId: v.optional(v.string()),
  capabilities: v.array(v.string()),
  lastSeen: v.number(),
  factCount: v.number(),
  defaultScope: v.string(),         // "private"|"team"|"public"
  settings: v.optional(v.any()),    // agent-specific memory config
})
  .index("by_agent_id", ["agentId"])
```

### `memory_scopes`
```typescript
defineTable({
  name: v.string(),                 // "project-briefly", "team-ml", "global"
  description: v.string(),
  members: v.array(v.string()),     // agent IDs
  readPolicy: v.string(),           // "members"|"all"|"none"
  writePolicy: v.string(),          // "members"|"creator"|"all"
  retentionDays: v.optional(v.number()),
})
  .index("by_name", ["name"])
```

### `sync_log`
```typescript
defineTable({
  nodeId: v.string(),
  lastSyncTimestamp: v.number(),
  factsSynced: v.number(),
  status: v.string(),               // "ok"|"error"|"syncing"
})
  .index("by_node", ["nodeId"])
```

---

## MCP Tools (8 Primitives)

### 1. `memory_store_fact`
Store an atomic fact with scope, entities, and tags.
```
Input:  { content, source?, entityIds?, tags?, factType?, scopeId? }
Output: { factId, importanceScore }
Side-effect: Triggers async embedding + entity extraction
```

### 2. `memory_recall`
Semantic search across permitted scopes. The primary retrieval tool.
```
Input:  { query, limit?, scopeId?, factType?, minImportance? }
Output: { facts: [{ id, content, importance, relevance, source, entities }] }
Side-effect: Bumps accessedCount on returned facts
```

### 3. `memory_search`
Full-text + structured filters. For precise lookups.
```
Input:  { text?, tags?, factType?, agentId?, dateRange?, scopeId? }
Output: { facts: [...] }
```

### 4. `memory_link_entity`
Create or update an entity and its relationships.
```
Input:  { entityId, name, type, metadata?, relationships? }
Output: { entity, created: boolean }
```

### 5. `memory_get_context`
Warm start tool. Returns everything relevant for a topic/project.
```
Input:  { topic, maxFacts?, includeSessions?, includeEntities? }
Output: { facts: [...], entities: [...], recentSessions: [...], summary: string }
```

### 6. `memory_observe`
Passive, fire-and-forget observation storage. Low-ceremony.
```
Input:  { observation }
Output: { ack: true }
Side-effect: Async enrichment (entity extraction, embedding, importance)
```

### 7. `memory_register_agent`
Agent self-registers on first interaction.
```
Input:  { agentId, name, capabilities?, defaultScope? }
Output: { agent, scopes: [...available] }
```

### 8. `memory_query_raw`
Escape hatch for emergent use. Direct Convex query access.
```
Input:  { table, filter?, sort?, limit? }
Output: { results: [...] }
```

---

## Async Enrichment Pipeline

When a fact is stored (via `store_fact` or `observe`):

```
1. Store raw fact immediately (< 50ms)
   ↓
2. Convex action: generate embedding (OpenAI, ~200ms)
   ↓
3. Convex action: extract entities from content (cheap model, ~500ms)
   ↓
4. Convex action: calculate importance score (rule-based, ~10ms)
   ↓
5. Convex mutation: update fact with embedding + entities + score
   ↓
6. Sync log: mark as pending sync for all registered nodes
```

Agent never waits for steps 2-6. Step 1 returns immediately.

---

## Scheduled Functions (Crons)

### Daily: Relevance Decay
```typescript
// For every fact older than 7 days:
// relevanceScore = relevanceScore * 0.99
// Floor at 0.1
```

### Weekly: Importance Recalculation
```typescript
// Recompute entity PageRank based on current relationship graph
// Update fact importance based on linked entities
```

### Daily: Garbage Collection
```typescript
// Delete facts in expired scopes (retentionDays exceeded)
// Archive conversations older than 90 days (move to cold storage)
```

---

## Build Phases

### Phase 1: Foundation (Week 1)
- [ ] `npx create-convex` project setup
- [ ] Schema definition (all 7 tables)
- [ ] Basic CRUD mutations and queries for facts + entities
- [ ] Full-text search index on facts
- [ ] Seed script with existing entities from memory.md

### Phase 2: MCP Server (Week 1-2)
- [ ] TypeScript MCP server scaffold
- [ ] Implement 8 tools
- [ ] Convex HTTP client integration
- [ ] OpenClaw skill package (SKILL.md)
- [ ] Test with single agent (Indy)

### Phase 3: Async Enrichment (Week 2)
- [ ] OpenAI embedding action
- [ ] Entity extraction action (GLM or similar cheap model)
- [ ] Importance scoring action (port from MemoryLance ImportanceCalculator)
- [ ] Vector search index on facts
- [ ] Wire enrichment pipeline to store_fact + observe

### Phase 4: Multi-Agent (Week 2-3)
- [ ] Agent registration flow
- [ ] Memory scopes CRUD
- [ ] Scope-aware queries (filter by permitted scopes)
- [ ] Conversation handoff tracking
- [ ] Test with 2+ agents sharing memory

### Phase 5: Local Sync (Week 3)
- [ ] LanceDB sync daemon (TypeScript)
- [ ] Pull new facts from Convex since last sync
- [ ] Generate local embeddings
- [ ] Local vector search fallback
- [ ] Sync log tracking

### Phase 6: Migration + Polish (Week 3-4)
- [ ] Import entities.json → Convex
- [ ] Import facts_schema.json → Convex
- [ ] Import daily logs → conversations
- [ ] Web UI for browsing memory (optional, Convex dashboard may suffice)
- [ ] Performance benchmarks (< 300ms recall target)

---

## Success Metrics

1. **Zero knowledge loss** — Ask about a correction from 2 weeks ago, get it
2. **Sub-300ms recall** — Semantic search returns in < 300ms
3. **Multi-agent sharing** — Agent B finds Agent A's discoveries automatically
4. **Cross-device** — Same memory on Mac Mini, MacBook Air, MacBook Pro
5. **Self-improving** — Memory quality improves with use (access boosting, decay)

---

## Open Questions

1. **Embedding model** — OpenAI `text-embedding-3-small` (cheap, good) vs local Nomic (free, slower)?
2. **Entity extraction model** — GLM-4.5-air (free) vs dedicated NER model?
3. **Convex vector search** — Native vector index vs external (Pinecone, etc.)?
   - Leaning native: Convex added vector search, keeps stack simple
4. **LanceDB necessity** — If Convex vector search is fast enough, do we still need local LanceDB?
   - Keep for offline/low-latency scenarios, but maybe not critical path
5. **Conversation boundary** — How to detect "new conversation" vs continuation?
   - Option: Time gap > 30min = new conversation
   - Option: Agent explicitly marks boundaries

---

## Tech Decisions (Locked)

- **Backend:** Convex (realtime, scheduled functions, vector search, free tier)
- **MCP Server:** TypeScript (native Convex client, no bridging)
- **Skill:** OpenClaw skill package for zero-config agent integration
- **Importance Scoring:** Port MemoryLance's multi-factor formula
- **Access Control:** Scope-based (not per-fact sharedWith — cleaner)
