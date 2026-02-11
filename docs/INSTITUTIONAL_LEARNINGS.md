# Institutional Learnings: Engram Implementation

## Search Context
- **Feature/Task**: Building Engram — a unified multi-agent memory system with Convex backend (10 tables), MCP TypeScript server, and LanceDB local sync
- **Documentation sources**:
  - `/Volumes/Main SSD/Developer/engram/docs/research/tech-stack-best-practices.md` (1298 lines of verified patterns)
  - `/Volumes/Main SSD/Developer/engram/PLAN.md` (6-phase implementation plan)
- **Status**: Planning phase — no implementation code yet

---

## Critical Patterns to Apply (MUST READ)

### 1. **CRITICAL: MCP Server Logging Constraint**
**File**: `docs/research/tech-stack-best-practices.md`, lines 598-623

With stdio transport, `stdout` is reserved for JSON-RPC protocol messages. ANY output to stdout corrupts the protocol.

```typescript
// WRONG -- corrupts protocol
console.log("Debug info");

// CORRECT -- all logging to stderr
console.error("[engram] Debug info");
```

**Impact**: Critical for Phase 2 (MCP Server). Set up logging infrastructure on day 1.

---

### 2. **Convex Vector Search: Only Available in Actions**
**File**: `docs/research/tech-stack-best-practices.md`, lines 37-92

Vector search via `ctx.vectorSearch()` is **only available in actions**, not queries or mutations.

```typescript
// WRONG -- vector search in query
export const search = query({ handler: async (ctx) => {
  return await ctx.vectorSearch(...)  // ❌ Not available
}});

// CORRECT -- vector search in action
export const search = internalAction({ handler: async (ctx) => {
  return await ctx.vectorSearch(...)  // ✓ Available
}});
```

**Impact**: Phase 3 (Async Enrichment). All vector search must be in actions. Query results via mutations.

---

### 3. **Actions Do NOT Auto-Retry — Actions are At-Most-Once**
**File**: `docs/research/tech-stack-best-practices.md`, lines 360-432

Mutations automatically retry on transient errors. Actions execute exactly once. If the embedding API fails, the action fails.

**Solution**: Use the `ActionRetrier` component or manual retry logic with scheduled mutations.

```typescript
// Pattern: Use scheduled mutations for retryable actions
export const triggerEnrichment = internalMutation({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    const jobId = await ctx.scheduler.runAfter(
      0,
      internal.actions.embed.generateEmbedding,
      { factId },
    );
    // Schedule a checker to verify/retry later
  },
});
```

**Impact**: Phase 3 (Enrichment pipeline). Design all async actions as idempotent.

---

### 4. **Batch Inserts into Single Mutation, Not Multiple**
**File**: `docs/research/tech-stack-best-practices.md`, lines 303-358

Anti-pattern: Loop calling `ctx.runMutation()` for each fact — creates N separate transactions.

**Correct**: Single mutation with batch insert.

```typescript
// BAD -- N separate transactions
for (const fact of facts) {
  await ctx.runMutation(internal.facts.insertOne, fact);
}

// GOOD -- one atomic transaction
await ctx.runMutation(internal.facts.insertBatch, { facts });
```

**Impact**: Phase 6 (Migration) and Phase 1 (Seed). Batch imports or bulk operations.

---

### 5. **Dimensions MUST Match Embedding Model Output**
**File**: `docs/research/tech-stack-best-practices.md`, lines 86-91

In Convex vector index: `dimensions: 1024` for Cohere Embed 4.

```typescript
// From PLAN.md
.vectorIndex("vector_search", {
  vectorField: "embedding",
  dimensions: 1024,  // MUST match Cohere Embed 4 output
  filterFields: ["scopeId"]
})
```

**Impact**: Phase 3. Cohere Embed 4 outputs 1024-dim vectors (verified in PLAN.md as locked decision). Mismatch causes silent failures.

---

### 6. **ConvexHttpClient is Stateful — Use Singleton for Single-Agent**
**File**: `docs/research/tech-stack-best-practices.md`, lines 259-301

ConvexHttpClient holds credentials and queues mutations. For a multi-tenant server, create per-request clients. For Engram's single-agent MCP server, a module-level singleton is fine.

```typescript
// mcp-server/src/lib/convex-client.ts
const client = new ConvexHttpClient(process.env.CONVEX_URL!);
export async function recallFacts(query: string, scopeId: string) {
  return client.query(api.facts.search, { query, scopeId });
}
```

**Impact**: Phase 2 (MCP Server). Initialize once at startup.

---

### 7. **LanceDB Vector Search Performance: No Index Needed Under 50K Records**
**File**: `docs/research/tech-stack-best-practices.md`, lines 1146-1188

Brute-force search is < 10ms for < 50K records on modern hardware. Don't add vector indexes early.

| Record Count | Recommendation |
|-------------|----------------|
| < 10K | No vector index. Brute-force < 5ms |
| 10K - 50K | Optional. Brute-force still < 20ms |
| 50K+ | Create HNSW-SQ or IVF-PQ index |

**Action**: Create BTree indexes on `scopeId` and `factType` immediately (filter optimization). Defer HNSW-SQ until > 20K facts.

**Impact**: Phase 5 (Local Sync). Start simple, add indexes as data grows.

---

### 8. **LanceDB mergeInsert: Match on ID Column for Syncing**
**File**: `docs/research/tech-stack-best-practices.md`, lines 871-999

Use `mergeInsert("id")` to sync facts from Convex → LanceDB.

```typescript
await table
  .mergeInsert("id")              // Match on 'id' column
  .whenMatchedUpdateAll()          // Update existing rows
  .whenNotMatchedInsertAll()       // Insert new rows
  .execute(records);
```

**Impact**: Phase 5. Sync daemon pattern is documented and ready.

---

## Convex Schema Design Decisions

### Embedded vs Split Embeddings
**File**: `docs/research/tech-stack-best-practices.md`, lines 1267-1274

| Approach | Pros | Cons |
|----------|------|------|
| Embedded (PLAN.md current) | Simpler schema, one table | Larger documents slow non-vector queries |
| Split (Convex recommended) | Better vector search perf | Extra join step |

**Recommendation**: Start embedded (matches PLAN.md). Split if performance degrades at scale (> 50K facts).

**Note**: PLAN.md currently uses embedded embeddings. No immediate action needed.

---

## MCP TypeScript SDK: v1 vs v2

**File**: `docs/research/tech-stack-best-practices.md`, lines 441-471

| Feature | v1 (1.26.x) | v2 (split packages) |
|---------|------------|---------------------|
| Status | Stable, widely deployed | Newer, migration path available |
| Package | Single `@modelcontextprotocol/sdk` | `@modelcontextprotocol/server` + `@modelcontextprotocol/core` |
| Tool registration | `server.tool()` (variadic) | `server.registerTool()` (config object) |

**Recommendation for Engram**: Start with v1 for stability. Migration to v2 is straightforward if needed later.

---

## Cross-Stack Integration Flow

**File**: `docs/research/tech-stack-best-practices.md`, lines 1194-1251

```
Agent sends tool call
    |
    v
MCP Server (stdio transport)
    |
    ├── Fast path: LanceDB local search (< 10ms)
    |     [When: offline or cached embeddings available]
    |
    └── Standard path: Convex HTTP call
          |
          ├── Query/Mutation: ConvexHttpClient.query()/mutation()
          |     [store_fact, search, link_entity, register_agent]
          |
          └── Action: ConvexHttpClient.action()
                [Requires: vector search, external APIs]
```

**Pattern**: LanceDB is optional "offline cache." All primary operations go through Convex.

---

## Recommended Initialization Sequence

**File**: `docs/research/tech-stack-best-practices.md`, lines 1219-1251

```typescript
// mcp-server/src/index.ts
async function main() {
  // 1. Initialize Convex client
  const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

  // 2. Initialize LanceDB (optional, for local fallback)
  let lance: LanceSyncDaemon | null = null;
  if (process.env.LANCE_DB_PATH) {
    lance = new LanceSyncDaemon(convex, process.env.LANCE_DB_PATH);
    await lance.initialize();
    lance.startPolling(30000);
  }

  // 3. Create MCP server with all 12 tools
  const server = new McpServer({ name: "engram-memory", version: "1.0.0" });
  registerAllTools(server, convex, lance);

  // 4. Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[engram] Fatal error:", err);
  process.exit(1);
});
```

---

## Convex Actions Pattern: Embed + Mutation

**File**: `docs/research/tech-stack-best-practices.md`, lines 93-181

**Pattern: Action orchestrates external API, internal mutation writes result.**

```typescript
// actions/embed.ts -- Calls Cohere Embed 4
export const generateEmbedding = internalAction({
  args: { factId: v.id("facts"), content: v.string() },
  handler: async (ctx, { factId, content }) => {
    // 1. Call external API (only actions can do this)
    const embedding = await cohereClient.embed(content);

    // 2. Write result via internal mutation (atomically)
    await ctx.runMutation(internal.facts.attachEmbedding, {
      factId,
      embedding,
    });
  },
});

// functions/facts.ts -- Internal mutation writes to DB
export const attachEmbedding = internalMutation({
  handler: async (ctx, { factId, embedding }) => {
    await ctx.db.patch(factId, { embedding });
  },
});
```

**Impact**: Phase 3. This is the pattern for all enrichment actions (embed, extract, compress, synthesize, summarize, importance).

---

## Convex Scheduled Functions (Crons)

**File**: `docs/research/tech-stack-best-practices.md`, lines 183-257

Setup in `convex/crons.ts`:

```typescript
import { cronJobs } from "convex/server";
const crons = cronJobs();

// Daily at 3:00 AM UTC
crons.daily("relevance decay", { hourUTC: 3, minuteUTC: 0 }, internal.crons.decay.runDecay);

// Weekly Sunday at 4:00 AM UTC
crons.weekly("importance rerank", { dayOfWeek: "sunday", hourUTC: 4, minuteUTC: 0 }, internal.crons.rerank.runRerank);

// Interval-based
crons.interval("sync heartbeat", { minutes: 5 }, internal.sync.checkSyncStatus);

export default crons;
```

**Key constraints**:
- At most one run of each job at any moment
- If execution exceeds interval, subsequent runs are skipped
- Cron functions must be `internalMutation` or `internalAction`
- Times always in UTC

**Impact**: Phase 1 foundation. Define all 7 crons (decay, forget, compact, consolidate, rerank, rules, cleanup) in crons.ts.

---

## Error Handling in MCP Tools

**File**: `docs/research/tech-stack-best-practices.md`, lines 625-723

Return `isError: true` in content, not protocol-level errors. Good error messages answer three questions:

1. **What happened?** — "The vector search failed"
2. **Why?** — "The embedding service returned a rate limit error"
3. **What to do?** — "Retry in 5 seconds, or use memory_search for text-based lookup"

**Circuit breaker pattern** for external dependencies (Cohere Embed 4):

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private readonly threshold = 3;
  private isOpen = false;
  private lastFailure = 0;
  private readonly resetTimeout = 30000;

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen && Date.now() - this.lastFailure > this.resetTimeout) {
      this.isOpen = false; // Half-open: try again
    }
    if (this.isOpen) throw new Error("Service unavailable (circuit breaker open)");

    try {
      const result = await fn();
      this.failureCount = 0;
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailure = Date.now();
      if (this.failureCount >= this.threshold) this.isOpen = true;
      throw error;
    }
  }
}
```

**Impact**: Phase 2. Wrap all external calls (Cohere Embed 4, Convex) with circuit breaker.

---

## File-Based References for Implementation

All documented patterns with code examples are available at:
- **Primary reference**: `/Volumes/Main SSD/Developer/engram/docs/research/tech-stack-best-practices.md`
- **Implementation plan**: `/Volumes/Main SSD/Developer/engram/PLAN.md`
- **Architecture diagrams**: `/Volumes/Main SSD/Developer/engram/docs/diagrams/`

---

## Phase-by-Phase Application

### Phase 1: Foundation
- [ ] Define all 10 tables in `convex/schema.ts` (embedded embeddings)
- [ ] Define all 7 cron jobs in `convex/crons.ts`
- [ ] Implement CRUD queries/mutations for each table
- [ ] Test full-text search with scopeId filtering

### Phase 2: MCP Server
- [ ] **CRITICAL**: Set up logging to stderr only (not stdout)
- [ ] Use `@modelcontextprotocol/sdk` v1 (1.26+)
- [ ] Create singleton `ConvexHttpClient`
- [ ] Register all 12 tools with Zod schemas

### Phase 3: Async Enrichment
- [ ] Embed action calls Cohere Embed 4 API
- [ ] All actions idempotent (check if embedding exists first)
- [ ] Use manual retry with scheduled mutations
- [ ] Batch embedding calls to Cohere (N texts → N embeddings in one call)

### Phase 4: Multi-Agent
- [ ] Implement agent registration with scopes
- [ ] All vector searches filtered by `scopeId` via `filterFields`
- [ ] Implement signal/feedback recording

### Phase 5: Local Sync
- [ ] LanceDB mergeInsert pattern for syncing
- [ ] No vector indexes until > 20K facts
- [ ] Create BTree indexes on `scopeId`, `factType`
- [ ] Sync daemon polls Convex every 30s

### Phase 6: Migration
- [ ] Batch imports into Convex (single mutations, not loops)
- [ ] Run enrichment pipeline on imported facts
- [ ] Verify all cron jobs in production

---

## Key Takeaways

1. **MCP Logging**: stdout is reserved. Use stderr exclusively.
2. **Vector Search**: Only in actions. Dimensions must match Cohere (1024).
3. **Actions are At-Most-Once**: Design idempotent, use manual retry.
4. **Batch Inserts**: Single mutation, not N separate mutations.
5. **LanceDB is Optional**: Start without indexes, add when needed (> 20K records).
6. **Sync Pattern**: Use mergeInsert with ID as key column.
7. **Crons**: Define all 7 in convex/crons.ts, functions in convex/crons/ directory.
8. **Error Handling**: Return structured errors with guidance, use circuit breakers.

---

**Document Generated**: 2026-02-11
**Source Documents**: 2 (tech-stack-best-practices.md, PLAN.md)
