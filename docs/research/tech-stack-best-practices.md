# Tech Stack Best Practices: Convex + MCP SDK + LanceDB

> Structured findings for Engram's implementation. Sourced from official documentation,
> Context7 code examples, and verified patterns (Feb 2026).

---

## Table of Contents

1. [Convex Best Practices](#1-convex-best-practices)
   - [1.1 Schema Design with Vector Indexes](#11-schema-design-with-vector-indexes)
   - [1.2 Internal Actions vs Mutations](#12-internal-actions-vs-mutations)
   - [1.3 Scheduled Functions (Crons)](#13-scheduled-functions-crons)
   - [1.4 ConvexHttpClient for MCP Server](#14-convexhttpclient-for-mcp-server)
   - [1.5 Batch Processing Patterns](#15-batch-processing-patterns)
   - [1.6 Error Handling in Actions](#16-error-handling-in-actions)
2. [MCP TypeScript SDK Best Practices](#2-mcp-typescript-sdk-best-practices)
   - [2.1 SDK Versions and Import Paths](#21-sdk-versions-and-import-paths)
   - [2.2 registerTool with Zod Schemas](#22-registertool-with-zod-schemas)
   - [2.3 StdioServerTransport Patterns](#23-stdioservertransport-patterns)
   - [2.4 Error Handling in Tool Handlers](#24-error-handling-in-tool-handlers)
   - [2.5 Resource and Prompt Registration](#25-resource-and-prompt-registration)
   - [2.6 Testing with MCP Inspector](#26-testing-with-mcp-inspector)
3. [LanceDB TypeScript Best Practices](#3-lancedb-typescript-best-practices)
   - [3.1 mergeInsert for Syncing](#31-mergeinsert-for-syncing)
   - [3.2 Vector Search with Filters](#32-vector-search-with-filters)
   - [3.3 FTS Index Creation](#33-fts-index-creation)
   - [3.4 Connection Management](#34-connection-management)
   - [3.5 Index Strategies for <50K Records](#35-index-strategies-for-50k-records)
4. [Cross-Stack Integration Patterns](#4-cross-stack-integration-patterns)
5. [Decision Matrix](#5-decision-matrix)

---

## 1. Convex Best Practices

### 1.1 Schema Design with Vector Indexes

**Pattern: Separate embeddings table from metadata**

Convex recommends splitting vector data into a dedicated table with a reference back to the main table. This optimizes vector search performance since the vector index only scans the smaller embeddings table.

```typescript
// schema.ts -- Recommended: separate embeddings table
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Metadata table (no large embedding array)
  facts: defineTable({
    content: v.string(),
    timestamp: v.number(),
    source: v.string(),
    scopeId: v.id("memory_scopes"),
    factType: v.string(),
    relevanceScore: v.float64(),
    importanceScore: v.float64(),
    accessedCount: v.number(),
    createdBy: v.string(),
    tags: v.array(v.string()),
    embeddingId: v.optional(v.id("fact_embeddings")),
  })
    .index("by_scope", ["scopeId", "timestamp"])
    .index("by_agent", ["createdBy", "timestamp"])
    .index("by_type", ["factType", "timestamp"])
    .index("by_importance", ["importanceScore"])
    .index("by_embedding", ["embeddingId"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["scopeId", "factType", "createdBy"],
    }),

  // Dedicated embeddings table
  fact_embeddings: defineTable({
    embedding: v.array(v.float64()),
    scopeId: v.id("memory_scopes"),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
    filterFields: ["scopeId"],
  }),
});
```

**Key constraints:**
- `dimensions` must exactly match the embedding model output (1536 for `text-embedding-3-small`)
- `filterFields` in vector index only supports equality filters via `q.eq()`
- Vector search is only available in **actions** (not queries/mutations)
- Returns document IDs and scores only -- you must load full documents separately

**Engram implication:** The current PLAN.md schema embeds `embedding` directly in the `facts` table. Consider splitting to a `fact_embeddings` table for better performance at scale.

### 1.2 Internal Actions vs Mutations

**The core distinction:**

| Aspect | Mutations | Actions |
|--------|-----------|---------|
| Side effects | None (deterministic) | External APIs, file I/O |
| Retry behavior | Automatically retried on internal errors | Never auto-retried (at-most-once) |
| Transaction | Full ACID within single mutation | No transaction guarantees |
| Vector search | Not available | Available |
| External APIs | Not allowed | Allowed |
| Database access | Direct `ctx.db` | Via `ctx.runMutation` / `ctx.runQuery` |

**Pattern: Action orchestrates, mutation writes**

```typescript
// actions/embed.ts -- Action handles external API call
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

export const generateEmbedding = internalAction({
  args: { factId: v.id("facts"), content: v.string() },
  handler: async (ctx, { factId, content }) => {
    // 1. Call external API (only actions can do this)
    const embedding = await fetchEmbedding(content);

    // 2. Write result via internal mutation (atomically)
    await ctx.runMutation(internal.facts.attachEmbedding, {
      factId,
      embedding,
    });
  },
});
```

```typescript
// functions/facts.ts -- Internal mutation writes to DB
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const attachEmbedding = internalMutation({
  args: {
    factId: v.id("facts"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, { factId, embedding }) => {
    // Insert into embeddings table
    const embeddingId = await ctx.db.insert("fact_embeddings", {
      embedding,
      scopeId: (await ctx.db.get(factId))!.scopeId,
    });
    // Link back to fact
    await ctx.db.patch(factId, { embeddingId });
  },
});
```

**Pattern: Helper functions for shared logic between public and internal mutations**

```typescript
// Shared helper -- not exported as a Convex function
async function sendMessageHelper(
  ctx: MutationCtx,
  args: { body: string; author: string },
) {
  await ctx.db.insert("messages", args);
}

// Public mutation -- validates auth
export const sendMessage = mutation({
  args: { body: v.string() },
  handler: async (ctx, { body }) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new Error("Unauthorized");
    await sendMessageHelper(ctx, { body, author: user.name ?? "Anonymous" });
  },
});

// Internal mutation -- trusted callers (crons, other actions)
export const sendInternalMessage = internalMutation({
  args: { body: v.string(), author: v.string() },
  handler: async (ctx, { body, author }) => {
    await sendMessageHelper(ctx, { body, author });
  },
});
```

**Engram implication:** The async enrichment pipeline (embed, extract, importance) should be `internalAction` functions that call `internalMutation` to persist results. The `store_fact` MCP tool triggers these via `ctx.scheduler.runAfter(0, ...)`.

### 1.3 Scheduled Functions (Crons)

**Setup: `convex/crons.ts`**

```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily relevance decay at 3:00 AM UTC
crons.daily(
  "relevance decay",
  { hourUTC: 3, minuteUTC: 0 },
  internal.crons.decay.runDecay,
);

// Weekly importance recalculation every Sunday at 4:00 AM UTC
crons.weekly(
  "importance rerank",
  { dayOfWeek: "sunday", hourUTC: 4, minuteUTC: 0 },
  internal.crons.rerank.runRerank,
);

// Daily garbage collection at 2:00 AM UTC
crons.daily(
  "garbage collection",
  { hourUTC: 2, minuteUTC: 0 },
  internal.crons.cleanup.runCleanup,
);

// Alternative: interval-based (e.g., every 5 minutes for sync log)
crons.interval(
  "sync heartbeat",
  { minutes: 5 },
  internal.sync.checkSyncStatus,
);

export default crons;
```

**Key constraints:**
- At most one run of each cron job can execute at any moment
- If execution exceeds the interval, subsequent runs are skipped (logged in dashboard)
- Cron functions must be `internalMutation` or `internalAction`
- Times are always in UTC
- All five scheduling methods: `interval()`, `hourly()`, `daily()`, `weekly()`, `monthly()`
- Traditional cron syntax also supported: `crons.cron("name", "0 3 * * *", ...)`

**Pattern: Paginated decay for large tables**

```typescript
// crons/decay.ts
export const runDecay = internalMutation({
  handler: async (ctx) => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    // Process in batches to stay within mutation time limits
    const facts = await ctx.db
      .query("facts")
      .withIndex("by_scope")
      .filter((q) => q.lt(q.field("timestamp"), sevenDaysAgo))
      .take(500); // Batch size

    for (const fact of facts) {
      const newScore = Math.max(fact.relevanceScore * 0.99, 0.1);
      await ctx.db.patch(fact._id, { relevanceScore: newScore });
    }

    // If there are more, schedule another run immediately
    if (facts.length === 500) {
      await ctx.scheduler.runAfter(0, internal.crons.decay.runDecay);
    }
  },
});
```

### 1.4 ConvexHttpClient for MCP Server

**ConvexHttpClient is stateful but HTTP-based** -- designed for server-side environments where reactive subscriptions are unnecessary.

```typescript
// mcp-server/src/lib/convex-client.ts
import { ConvexHttpClient } from "convex/browser";
import { api, internal } from "../../../convex/_generated/api";

// Singleton client for the MCP server process
const client = new ConvexHttpClient(process.env.CONVEX_URL!);

// Optional: Set auth token if using Convex Auth
// client.setAuth(jwtToken);

// Query example (read-only)
export async function recallFacts(query: string, scopeId: string) {
  return client.query(api.facts.search, { query, scopeId });
}

// Mutation example (write)
export async function storeFact(content: string, source: string, scopeId: string) {
  return client.mutation(api.facts.store, { content, source, scopeId });
}

// Action example (can call external APIs on Convex side)
export async function semanticSearch(queryEmbedding: number[], scopeId: string) {
  return client.action(api.facts.vectorSearch, {
    embedding: queryEmbedding,
    scopeId,
  });
}
```

**Key considerations:**
- The client is **stateful** (holds credentials, queues mutations) -- do not share between concurrent requests in a multi-tenant server
- For a single-agent MCP server (Engram's case), a singleton is fine
- Each `query()`, `mutation()`, `action()` call is a separate HTTP request
- No real-time subscriptions -- call explicitly when needed
- `consistentQuery()` (experimental) ensures multiple queries read from the same timestamp
- Custom `fetch` implementation can be provided for environments without global fetch

**Engram implication:** Since each MCP server instance serves a single agent, a module-level singleton `ConvexHttpClient` is appropriate. No need for per-request isolation.

### 1.5 Batch Processing Patterns

**Anti-pattern: Loop of separate mutations**

```typescript
// BAD -- each mutation is a separate transaction
export const importFacts = action({
  handler: async (ctx, { facts }) => {
    for (const fact of facts) {
      await ctx.runMutation(internal.facts.insertOne, fact); // N transactions!
    }
  },
});
```

**Correct: Single mutation with batch**

```typescript
// GOOD -- all inserts in one atomic transaction
export const importFacts = action({
  handler: async (ctx, { facts }) => {
    await ctx.runMutation(internal.facts.insertBatch, { facts });
  },
});

export const insertBatch = internalMutation({
  args: {
    facts: v.array(v.object({
      content: v.string(),
      source: v.string(),
      scopeId: v.id("memory_scopes"),
      factType: v.string(),
      tags: v.array(v.string()),
    })),
  },
  handler: async (ctx, { facts }) => {
    const ids = [];
    for (const fact of facts) {
      const id = await ctx.db.insert("facts", {
        ...fact,
        timestamp: Date.now(),
        relevanceScore: 1.0,
        importanceScore: 0.5,
        accessedCount: 0,
        createdBy: "system",
      });
      ids.push(id);
    }
    return ids;
  },
});
```

**Mutation size limits:** Convex mutations have a time limit (~1 second) and document size limits. For very large batches (thousands of records), chunk into groups of ~100-500 and schedule successive mutations.

**Engram implication:** Migration scripts (Phase 6) importing from MemoryLance should batch inserts. The enrichment pipeline should batch embedding calls to OpenAI (send multiple texts, get multiple embeddings in one API call).

### 1.6 Error Handling in Actions

**Core principle:** Mutations retry automatically on transient errors. Actions do NOT retry -- they execute at-most-once.

**Pattern: Manual retry via scheduled mutation**

```typescript
// Use the action-retrier component
import { ActionRetrier } from "@convex-dev/action-retrier";
import { components } from "./_generated/server";

const retrier = new ActionRetrier(components.actionRetrier);

// In a mutation, schedule a retryable action
export const triggerEnrichment = internalMutation({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    await retrier.run(ctx, internal.actions.embed.generateEmbedding, {
      factId,
    });
  },
});
```

**Pattern: Manual retry with status checking**

```typescript
export const retryableEmbed = internalMutation({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    // Schedule the action
    const jobId = await ctx.scheduler.runAfter(
      0,
      internal.actions.embed.generateEmbedding,
      { factId },
    );

    // Schedule a checker to verify completion
    await ctx.scheduler.runAfter(
      5000, // Check after 5 seconds
      internal.actions.embed.checkAndRetry,
      { factId, jobId, attempt: 1 },
    );
  },
});

export const checkAndRetry = internalMutation({
  args: {
    factId: v.id("facts"),
    jobId: v.id("_scheduled_functions"),
    attempt: v.number(),
  },
  handler: async (ctx, { factId, jobId, attempt }) => {
    const status = await ctx.db.system.get(jobId);

    if (status?.state.kind === "success") return; // Done
    if (status?.state.kind === "failed" && attempt < 3) {
      // Retry with exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      const newJobId = await ctx.scheduler.runAfter(
        delay,
        internal.actions.embed.generateEmbedding,
        { factId },
      );
      await ctx.scheduler.runAfter(
        delay + 5000,
        internal.actions.embed.checkAndRetry,
        { factId, jobId: newJobId, attempt: attempt + 1 },
      );
    }
    // After max retries, log error but don't crash
  },
});
```

**Idempotency principle:** Make actions idempotent so retries are safe. Check if the embedding already exists before calling OpenAI again.

---

## 2. MCP TypeScript SDK Best Practices

### 2.1 SDK Versions and Import Paths

**Two SDK versions coexist as of Feb 2026:**

| Feature | v1 (`@modelcontextprotocol/sdk` 1.26.x) | v2 (split packages) |
|---------|------------------------------------------|---------------------|
| Package | Single `@modelcontextprotocol/sdk` | `@modelcontextprotocol/server` + `@modelcontextprotocol/core` |
| Tool registration | `server.tool()` (variadic) | `server.registerTool()` (config object) |
| Schema | Raw shape `{ name: z.string() }` | Must wrap `z.object({ name: z.string() })` |
| Zod | `zod@3` | `zod/v4` |
| Node.js | 18+ | 20+ (ESM only) |
| Status | Stable, widely deployed | Newer, migration path available |

**Recommendation for Engram:** Start with v1 (`@modelcontextprotocol/sdk` 1.26.x) for stability. The v2 migration is straightforward when ready.

**v1 Import Paths:**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
```

**v2 Import Paths (when migrating):**

```typescript
import { McpServer, StdioServerTransport } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
```

### 2.2 registerTool with Zod Schemas

**v1 Pattern (current stable):**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "engram-memory",
  version: "1.0.0",
});

// Simple form: name, schema, handler
server.tool(
  "memory_store_fact",
  {
    content: z.string().describe("The atomic fact to store"),
    source: z.string().optional().describe("Source agent or context"),
    tags: z.array(z.string()).optional().describe("Classification tags"),
    factType: z
      .enum(["decision", "observation", "plan", "error", "insight"])
      .optional()
      .describe("Category of fact"),
    scopeId: z.string().optional().describe("Memory scope ID"),
  },
  async ({ content, source, tags, factType, scopeId }) => {
    const result = await convexClient.mutation(api.facts.store, {
      content,
      source: source ?? "unknown",
      tags: tags ?? [],
      factType: factType ?? "observation",
      scopeId,
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            factId: result.factId,
            importanceScore: result.importanceScore,
          }),
        },
      ],
    };
  },
);

// With description (4-arg form)
server.tool(
  "memory_recall",
  "Semantic vector search across permitted memory scopes",
  {
    query: z.string().describe("Natural language search query"),
    limit: z.number().optional().default(10).describe("Max results"),
    scopeId: z.string().optional().describe("Filter to specific scope"),
    factType: z.string().optional().describe("Filter by fact type"),
    minImportance: z.number().optional().describe("Minimum importance threshold"),
  },
  async ({ query, limit, scopeId, factType, minImportance }) => {
    // Implementation
  },
);
```

**v2 Pattern (newer, config-object based):**

```typescript
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const server = new McpServer({ name: "engram-memory", version: "1.0.0" });

server.registerTool(
  "memory_store_fact",
  {
    title: "Store Fact",
    description: "Store an atomic fact with scope, entities, and tags",
    inputSchema: z.object({
      content: z.string().describe("The atomic fact to store"),
      source: z.string().optional().describe("Source agent or context"),
      tags: z.array(z.string()).optional().describe("Classification tags"),
      factType: z
        .enum(["decision", "observation", "plan", "error", "insight"])
        .optional(),
      scopeId: z.string().optional(),
    }),
    outputSchema: z.object({
      factId: z.string(),
      importanceScore: z.number(),
    }),
  },
  async ({ content, source, tags, factType, scopeId }) => {
    const result = await storeFact(content, source, tags, factType, scopeId);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
);
```

### 2.3 StdioServerTransport Patterns

**Complete MCP server entry point:**

```typescript
#!/usr/bin/env node
// mcp-server/src/index.ts

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";

// Initialize Convex client
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// Create MCP server
const server = new McpServer({
  name: "engram-memory",
  version: "1.0.0",
});

// Register all 12 tools
// ... (tool registrations here)

// CRITICAL: Never use console.log() with stdio transport!
// It writes to stdout and corrupts JSON-RPC messages.
// Use console.error() for debugging instead.
console.error("[engram] Starting MCP server...");

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);

console.error("[engram] MCP server connected via stdio");
```

**Logging constraint:** With stdio transport, `stdout` is reserved for JSON-RPC protocol messages. ALL logging must go to `stderr`:

```typescript
// WRONG -- corrupts protocol
console.log("Debug info");

// CORRECT -- goes to stderr
console.error("[engram] Debug info");

// BETTER -- use a logger configured for stderr
import { createLogger } from "./lib/logger.js";
const log = createLogger({ stream: process.stderr });
log.info("Debug info");
```

### 2.4 Error Handling in Tool Handlers

**Pattern: Return `isError: true` in content, not protocol-level errors**

```typescript
server.tool(
  "memory_recall",
  "Semantic search across memory",
  { query: z.string(), limit: z.number().optional() },
  async ({ query, limit }) => {
    // 1. Validate early
    if (!query.trim()) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Invalid input: query cannot be empty. Provide a natural language search query.",
          },
        ],
      };
    }

    try {
      const results = await convex.action(api.facts.vectorSearch, {
        query,
        limit: limit ?? 10,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(results) }],
      };
    } catch (error) {
      // 2. Log full error to stderr for debugging
      console.error("[engram] memory_recall failed:", error);

      // 3. Return user-safe error with recovery guidance
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Memory recall failed: ${error instanceof Error ? error.message : "Unknown error"}. ` +
              `Try a shorter query or use memory_search for text-based lookup instead.`,
          },
        ],
      };
    }
  },
);
```

**Error message design for LLM consumers:**

A good MCP error response answers three questions:
1. **What happened?** -- "The vector search failed"
2. **Why?** -- "The embedding service returned a rate limit error"
3. **What to do?** -- "Retry in 5 seconds, or use memory_search for text-based lookup"

**Circuit breaker pattern for external dependencies:**

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private readonly threshold = 3;
  private isOpen = false;
  private lastFailure = 0;
  private readonly resetTimeout = 30000; // 30 seconds

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen) {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.isOpen = false; // Half-open: try again
      } else {
        throw new Error("Service unavailable (circuit breaker open)");
      }
    }
    try {
      const result = await fn();
      this.failureCount = 0;
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailure = Date.now();
      if (this.failureCount >= this.threshold) {
        this.isOpen = true;
      }
      throw error;
    }
  }
}

const convexBreaker = new CircuitBreaker();

// Usage in tool handler
const results = await convexBreaker.call(() =>
  convex.action(api.facts.vectorSearch, { query, limit })
);
```

### 2.5 Resource and Prompt Registration

**Resources -- expose read-only data to LLM clients:**

```typescript
// v1 pattern
server.resource(
  "memory-stats",
  "engram://stats",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(await convex.query(api.stats.getSummary)),
      },
    ],
  }),
);

// v2 pattern
server.registerResource(
  "memory-stats",
  "engram://stats",
  {
    title: "Memory Statistics",
    description: "Current memory system statistics and health",
    mimeType: "application/json",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify(await convex.query(api.stats.getSummary)),
      },
    ],
  }),
);
```

**Prompts -- reusable templates for agent workflows:**

```typescript
// v1 pattern
server.prompt(
  "warm-start",
  { topic: z.string(), maxFacts: z.number().optional() },
  async ({ topic, maxFacts }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Retrieve everything relevant about "${topic}" from memory. ` +
            `Include recent facts (max ${maxFacts ?? 20}), related entities, ` +
            `and any active sessions. Summarize key context.`,
        },
      },
    ],
  }),
);

// v2 pattern
server.registerPrompt(
  "warm-start",
  {
    title: "Warm Start",
    description: "Load full context for a topic from memory",
    argsSchema: z.object({
      topic: z.string().describe("Topic or project to load context for"),
      maxFacts: z.number().optional().describe("Maximum facts to retrieve"),
    }),
  },
  async ({ topic, maxFacts }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Retrieve everything relevant about "${topic}" from memory. ` +
            `Include recent facts (max ${maxFacts ?? 20}), related entities, ` +
            `and any active sessions. Summarize key context.`,
        },
      },
    ],
  }),
);
```

### 2.6 Testing with MCP Inspector

**MCP Inspector** is a developer tool for testing MCP servers interactively.

```bash
# Install and run inspector against your server
npx @modelcontextprotocol/inspector node mcp-server/dist/index.js

# Or with environment variables
CONVEX_URL=https://your-deployment.convex.cloud \
  npx @modelcontextprotocol/inspector node mcp-server/dist/index.js
```

The Inspector provides:
- List of registered tools, resources, and prompts
- Interactive tool invocation with parameter editing
- Response visualization
- Error display

**Testing pattern for CI:**

```typescript
// test/tools.test.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

describe("memory_store_fact", () => {
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    server = createServer(); // Your server factory
    client = new Client({ name: "test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  it("stores a fact and returns id", async () => {
    const result = await client.callTool({
      name: "memory_store_fact",
      arguments: { content: "Test fact", factType: "observation" },
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.factId).toBeDefined();
  });
});
```

---

## 3. LanceDB TypeScript Best Practices

### 3.1 mergeInsert for Syncing

**mergeInsert is the primary sync primitive** -- it performs upsert operations: updating existing rows and inserting new ones based on a key column.

```typescript
import * as lancedb from "@lancedb/lancedb";

const db = await lancedb.connect("./engram-local");
const table = await db.openTable("facts");

// Sync new/updated facts from Convex
async function syncFacts(factsFromConvex: ConvexFact[]) {
  const records = factsFromConvex.map((fact) => ({
    id: fact._id,                    // Match key
    content: fact.content,
    embedding: fact.embedding,
    scopeId: fact.scopeId,
    factType: fact.factType,
    importanceScore: fact.importanceScore,
    relevanceScore: fact.relevanceScore,
    timestamp: fact.timestamp,
  }));

  await table
    .mergeInsert("id")              // Match on 'id' column
    .whenMatchedUpdateAll()          // Update existing rows
    .whenNotMatchedInsertAll()       // Insert new rows
    .execute(records);
}
```

**Available merge behaviors:**

```typescript
// Full upsert: update matched, insert new
await table
  .mergeInsert("id")
  .whenMatchedUpdateAll()
  .whenNotMatchedInsertAll()
  .execute(newData);

// Insert-only: skip existing, insert new
await table
  .mergeInsert("id")
  .whenNotMatchedInsertAll()
  .execute(newData);

// Full sync: update matched, insert new, DELETE rows not in source
await table
  .mergeInsert("id")
  .whenMatchedUpdateAll()
  .whenNotMatchedInsertAll()
  .whenNotMatchedBySourceDelete()   // Removes stale rows
  .execute(newData);
```

**Engram sync daemon pattern:**

```typescript
// mcp-server/src/lib/lance-sync.ts
import * as lancedb from "@lancedb/lancedb";
import { ConvexHttpClient } from "convex/browser";

export class LanceSyncDaemon {
  private db: lancedb.Connection;
  private table: lancedb.Table;
  private convex: ConvexHttpClient;
  private lastSyncTimestamp = 0;

  async initialize() {
    this.db = await lancedb.connect("./engram-local");
    // Create table if not exists
    try {
      this.table = await this.db.openTable("facts");
    } catch {
      this.table = await this.db.createTable("facts", [
        {
          id: "init",
          content: "",
          embedding: new Array(1536).fill(0),
          scopeId: "",
          factType: "",
          importanceScore: 0,
          relevanceScore: 0,
          timestamp: 0,
        },
      ]);
      // Remove init row
      await this.table.delete("id = 'init'");
    }
  }

  async sync() {
    // Fetch facts modified since last sync
    const newFacts = await this.convex.query(api.sync.getFactsSince, {
      since: this.lastSyncTimestamp,
      limit: 500,
    });

    if (newFacts.length === 0) return;

    await this.table
      .mergeInsert("id")
      .whenMatchedUpdateAll()
      .whenNotMatchedInsertAll()
      .execute(
        newFacts.map((f) => ({
          id: f._id,
          content: f.content,
          embedding: f.embedding,
          scopeId: f.scopeId,
          factType: f.factType,
          importanceScore: f.importanceScore,
          relevanceScore: f.relevanceScore,
          timestamp: f.timestamp,
        })),
      );

    this.lastSyncTimestamp = Math.max(...newFacts.map((f) => f.timestamp));
    console.error(`[lance-sync] Synced ${newFacts.length} facts`);
  }

  startPolling(intervalMs = 30000) {
    setInterval(() => this.sync().catch(console.error), intervalMs);
  }
}
```

### 3.2 Vector Search with Filters

```typescript
import * as lancedb from "@lancedb/lancedb";

const db = await lancedb.connect("./engram-local");
const table = await db.openTable("facts");

// Basic vector search
const results = await table
  .search(queryEmbedding)     // 1536-dim float array
  .limit(10)
  .toArray();

// Vector search with SQL filter
const filtered = await table
  .query()
  .nearestTo(queryEmbedding)
  .where("scopeId = 'scope-123' AND importanceScore > 0.5")
  .select(["id", "content", "importanceScore", "relevanceScore"])
  .limit(20)
  .toArray();

// Vector search with distance metric
const cosineResults = await table
  .query()
  .nearestTo(queryEmbedding)
  .distanceType("cosine")
  .limit(10)
  .toArray();

// Hybrid: vector + full-text
const hybridResults = await table
  .query()
  .nearestTo(queryEmbedding)
  .fullTextSearch("specific keyword")
  .limit(10)
  .toArray();
```

**Distance types:** `"l2"` (default), `"cosine"`, `"dot"`

For normalized embedding models (Cohere Embed 4, OpenAI `text-embedding-3-small`), **cosine distance** is recommended.

### 3.3 FTS Index Creation

```typescript
import * as lancedb from "@lancedb/lancedb";

const db = await lancedb.connect("./engram-local");
const table = await db.openTable("facts");

// Create full-text search index on content column
await table.createIndex("content", {
  config: lancedb.Index.fts({
    withPosition: true,      // Enable phrase queries
    stem: true,              // Stemming (e.g., "running" matches "run")
    removeStopWords: true,   // Filter common words
    lowercase: true,         // Case-insensitive
  }),
});

// Basic FTS query
const results = await table
  .search("project deadline update", "fts")
  .limit(10)
  .toArray();

// FTS with SQL filter
const filtered = await table
  .query()
  .fullTextSearch("error deployment")
  .where("factType = 'error'")
  .select(["id", "content", "timestamp"])
  .limit(20)
  .toArray();

// Advanced match query with boost and fuzziness
const matchQuery = new lancedb.MatchQuery("memory recall", "content", {
  boost: 1.5,
  fuzziness: 1,
  operator: lancedb.Operator.And,
});

const advanced = await table
  .query()
  .fullTextSearch(matchQuery)
  .limit(10)
  .toArray();
```

### 3.4 Connection Management

```typescript
import * as lancedb from "@lancedb/lancedb";

// Local embedded connection (recommended for Engram)
const db = await lancedb.connect("./engram-local");

// Remote connection (LanceDB Cloud)
const remoteDb = await lancedb.connect("db://my-database");

// Connection is lightweight -- create once, reuse
// The connection object manages internal state and file handles

// Table management
const tables = await db.tableNames();
const table = await db.openTable("facts");

// Create table with initial data
const newTable = await db.createTable("entities", [
  { id: "entity-1", name: "Test", embedding: new Array(1536).fill(0) },
]);

// Drop table
await db.dropTable("temp_table");
```

**Connection lifecycle for MCP server:**

```typescript
// Singleton pattern -- initialize once at startup
let db: lancedb.Connection | null = null;
let factsTable: lancedb.Table | null = null;

export async function getDb(): Promise<lancedb.Connection> {
  if (!db) {
    db = await lancedb.connect(process.env.LANCE_DB_PATH ?? "./engram-local");
  }
  return db;
}

export async function getFactsTable(): Promise<lancedb.Table> {
  if (!factsTable) {
    const conn = await getDb();
    try {
      factsTable = await conn.openTable("facts");
    } catch {
      // Table doesn't exist yet -- will be created on first sync
      factsTable = null;
      throw new Error("Facts table not initialized. Run initial sync first.");
    }
  }
  return factsTable;
}
```

### 3.5 Index Strategies for <50K Records

**For datasets under 50K records, brute-force search (no index) is often fastest.**

LanceDB performs flat/brute-force scans by default when no index exists. For 1536-dim vectors and fewer than 50K rows, this typically completes in under 10ms on modern hardware.

**When to create indexes:**

| Record Count | Recommendation |
|-------------|----------------|
| < 10K | No vector index needed. Brute-force is < 5ms |
| 10K - 50K | Optional. Brute-force still < 20ms. Index saves ~10ms |
| 50K - 500K | Create IVF-PQ or HNSW-SQ index |
| > 500K | Index required. Consider partitioning |

**If you do create an index for future growth:**

```typescript
// HNSW-SQ: best for small-medium datasets with cosine similarity
await table.createIndex("embedding", {
  config: lancedb.Index.hnswSq({
    distanceType: "cosine",
    m: 16,              // Connections per node (default 20, lower = smaller index)
    efConstruction: 150, // Build quality (default 300, lower = faster build)
  }),
});

// BTree index for scalar filter columns (always helpful)
await table.createIndex("scopeId", {
  config: lancedb.Index.btree(),
});

await table.createIndex("factType", {
  config: lancedb.Index.btree(),
});

// Bitmap index for low-cardinality columns
await table.createIndex("createdBy", {
  config: lancedb.Index.bitmap(),
});
```

**Engram recommendation:** Start without vector indexes. Create BTree indexes on `scopeId` and `factType` immediately (they help filter queries). Add HNSW-SQ only when the local fact count exceeds ~20K rows.

---

## 4. Cross-Stack Integration Patterns

### MCP Server + Convex + LanceDB Flow

```
Agent sends tool call
    |
    v
MCP Server (stdio transport)
    |
    ├── Fast path: LanceDB local search (< 10ms)
    |     Used when: offline, or for `memory_recall` with cached embeddings
    |
    └── Standard path: Convex HTTP call
          |
          ├── Query/Mutation: ConvexHttpClient.query() / .mutation()
          |     Used for: store_fact, search (FTS), link_entity, register_agent
          |
          └── Action: ConvexHttpClient.action()
                Used for: vector search (requires ctx.vectorSearch)
                |
                └── Action internally calls:
                      ├── OpenAI embedding API
                      ├── ctx.vectorSearch() on Convex
                      └── ctx.runMutation() to persist results
```

### Recommended Initialization Sequence

```typescript
// mcp-server/src/index.ts
async function main() {
  // 1. Initialize Convex client
  const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  console.error("[engram] Convex client initialized");

  // 2. Initialize LanceDB (optional, for local fallback)
  let lance: LanceSyncDaemon | null = null;
  if (process.env.LANCE_DB_PATH) {
    lance = new LanceSyncDaemon(convex, process.env.LANCE_DB_PATH);
    await lance.initialize();
    lance.startPolling(30000); // Sync every 30s
    console.error("[engram] LanceDB sync daemon started");
  }

  // 3. Create MCP server with all 12 tools
  const server = new McpServer({ name: "engram-memory", version: "1.0.0" });
  registerAllTools(server, convex, lance);

  // 4. Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[engram] MCP server ready");
}

main().catch((err) => {
  console.error("[engram] Fatal error:", err);
  process.exit(1);
});
```

---

## 5. Decision Matrix

### Open Questions from PLAN.md -- Resolved

| Question | Decision | Rationale |
|----------|----------|-----------|
| Embedding model | **Cohere Embed 4** (1024-dim) | Multimodal (text + images + code), SOTA quality, replaces OpenAI. See PLAN.md locked decision |
| Entity extraction | Cheap model via Convex action | Keep it async; quality matters less than coverage |
| Convex vector search vs external | Convex native | Keeps stack simple; filter by scopeId built-in |
| LanceDB necessity | Yes, for offline + sub-10ms local search | Sync daemon pattern (above) is straightforward |
| Conversation boundary | Time gap > 30min OR agent explicit boundary | Both mechanisms; time gap as default, explicit as override |

### Schema Decision: Embedded vs Split Embeddings

| Approach | Pros | Cons |
|----------|------|------|
| Embedded (current PLAN.md) | Simpler schema, one table | Larger documents slow down non-vector queries |
| Split (Convex recommended) | Better vector search perf, cleaner separation | Extra join step, two tables to maintain |

**Recommendation:** Start with embedded (simpler), split if performance degrades at scale. The vector index works either way.

---

## Sources

- [Convex Vector Search Documentation](https://docs.convex.dev/search/vector-search)
- [Convex Best Practices](https://docs.convex.dev/understanding/best-practices)
- [Convex Cron Jobs](https://docs.convex.dev/scheduling/cron-jobs)
- [Convex Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions)
- [Convex Error Handling](https://docs.convex.dev/functions/error-handling)
- [Convex ConvexHttpClient API](https://docs.convex.dev/api/classes/browser.ConvexHttpClient)
- [Convex Action Retrier](https://stack.convex.dev/retry-actions)
- [Convex Workpool Component](https://www.convex.dev/components/workpool)
- [MCP TypeScript SDK Repository](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP TypeScript SDK Server Docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)
- [MCP TypeScript SDK Migration Guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration.md)
- [MCP Build a Server Guide](https://modelcontextprotocol.io/docs/develop/build-server)
- [MCP Error Handling Best Practices](https://mcpcat.io/guides/error-handling-custom-mcp-servers/)
- [MCP Tools Specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [LanceDB TypeScript SDK](https://lancedb.github.io/lancedb/js/globals/)
- [LanceDB GitHub Repository](https://github.com/lancedb/lancedb)
- [LanceDB npm Package](https://www.npmjs.com/package/@lancedb/lancedb)
- [@modelcontextprotocol/sdk on npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
