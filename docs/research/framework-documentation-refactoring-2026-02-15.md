# Framework Documentation Research for Engram Refactoring

**Date:** 2026-02-15
**Purpose:** Comprehensive framework documentation for implementing the agent-native architecture refactoring plan
**Target Plan:** `docs/plans/2026-02-14-refactor-agent-native-architecture-production-ready-plan.md`

---

## Executive Summary

This document provides official documentation, best practices, and implementation patterns for the four core frameworks powering Engram:

1. **Convex** - Cloud backend (schema migrations, actions, crons)
2. **MCP SDK** - Model Context Protocol (tool registration, stdio transport)
3. **LanceDB** - Local vector database (indexing, mergeInsert operations)
4. **Cohere Embed 4** - Multimodal embeddings API

All research is current as of February 2026 and includes official documentation links, code examples, and production-ready patterns.

---

## 1. Convex Framework

### 1.1 Overview

**Official Documentation:** https://docs.convex.dev
**Library ID (Context7):** `/llmstxt/convex_dev_llms-full_txt`
**Code Snippets Available:** 4,147
**Source Reputation:** High
**Benchmark Score:** 63.6

Convex is a reactive database with TypeScript queries, providing a complete backend platform for real-time applications with serverless functions, authentication, file storage, and AI agent support.

### 1.2 Schema Migrations

#### Best Practices

**Key Principle:** With Convex, you don't need to explicitly explain what changed—you simply modify your `schema.ts` file to your desired shape, and the data changes represent how to transform your data from the existing schema into the desired one.

**Migration Strategies:**

1. **Online Migrations (Recommended)**
   - Database continues serving requests while asynchronously updating data
   - Preferred to avoid downtime but requires temporary dual-format handling
   - Write code that handles both old and new data formats during transition

2. **Lightweight Zero-Downtime Migrations**
   - Add optional fields first, then populate them
   - Deprecate fields before deleting them (make optional first)
   - Use paginated mutations for large-scale changes

**Official Resources:**
- [Intro to Migrations](https://stack.convex.dev/intro-to-migrations)
- [Zero-Downtime Migrations](https://stack.convex.dev/zero-downtime-migrations)
- [Lightweight Migrations](https://stack.convex.dev/lightweight-zero-downtime-migrations)
- [Stateful Migrations with Mutations](https://stack.convex.dev/migrating-data-with-mutations)
- [Convex Migrations Component](https://github.com/get-convex/migrations)

#### Implementation Pattern for Engram

```typescript
// Adding optional fields (Phase 1)
// convex/schema.ts
agents: defineTable({
  // Existing fields...
  agentId: v.string(),
  name: v.string(),

  // NEW: Make optional for zero-downtime
  role: v.optional(v.string()),
  persona: v.optional(v.string()),
  specialization: v.optional(v.array(v.string())),
})

// Migration mutation for populating new fields
// convex/migrations/001_populate_agent_roles.ts
export const populateAgentRoles = internalMutation({
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").collect();

    for (const agent of agents) {
      if (!agent.role) {
        await ctx.db.patch(agent._id, {
          role: "assistant", // Default value
          specialization: agent.capabilities || [],
        });
      }
    }
  },
});
```

**Large-Scale Data Handling:**
If your data can't all be updated in one transaction (many thousands of documents), break up the change into a paginated mutation:

```typescript
export const migrateAgentsPaginated = internalMutation({
  handler: async (ctx, { cursor }: { cursor?: string }) => {
    let query = ctx.db.query("agents");
    if (cursor) {
      query = query.paginate({ cursor, numItems: 100 });
    }

    const page = await query.paginate({ numItems: 100 });

    for (const agent of page.page) {
      if (!agent.role) {
        await ctx.db.patch(agent._id, { role: "assistant" });
      }
    }

    if (page.isDone) {
      return { done: true };
    } else {
      await ctx.scheduler.runAfter(0, internal.migrations.migrateAgentsPaginated, {
        cursor: page.continueCursor,
      });
      return { done: false, cursor: page.continueCursor };
    }
  },
});
```

### 1.3 Actions for Async Operations

**ActionCtx Documentation:** https://docs.convex.dev/generated-api/server

#### Key Capabilities

Actions provide access to:
- `runQuery()` - Execute queries
- `runMutation()` - Execute mutations
- `runAction()` - Execute other actions
- `auth` - Authentication service
- `scheduler` - Schedule delayed mutations/actions
- `storage` - File storage interface
- `vectorSearch()` - Vector similarity search

#### Best Practices

**Pattern 1: Schedule Action After Mutation Commits**

✅ **Recommended:** Mutation schedules action (enforces invariants)

```typescript
// ✅ CORRECT: Mutation schedules internal action
export const mutationThatSchedulesAction = mutation({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    const taskId = await ctx.db.insert("tasks", { text });

    // Schedule action to run after mutation commits
    await ctx.scheduler.runAfter(0, internal.myFunctions.actionThatCallsAPI, {
      taskId,
      text
    });

    return { taskId };
  }
});

export const actionThatCallsAPI = internalAction({
  args: { taskId: v.id("tasks"), text: v.string() },
  handler: async (ctx, args) => {
    // Call external API (Cohere, etc.)
    const result = await fetch('https://api.example.com/data');

    // Store result via mutation
    await ctx.runMutation(internal.tasks.updateResult, {
      taskId: args.taskId,
      result: await result.json(),
    });
  }
});
```

**Why This Matters:**
- Ensures non-transactional operations (API calls) only occur if mutation succeeds
- Leverages Convex's transaction guarantees
- Prevents duplicate executions via invariant checks in mutation

**Pattern 2: Actions for External API Calls**

```typescript
// Engram: Cohere embedding enrichment
export const embedFact = internalAction({
  args: { factId: v.id("facts"), content: v.string() },
  handler: async (ctx, { factId, content }) => {
    // External API call
    const response = await fetch('https://api.cohere.ai/v1/embed', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        texts: [content],
        model: 'embed-english-v4.0',
        input_type: 'search_document',
      }),
    });

    const { embeddings } = await response.json();

    // Store embedding via mutation
    await ctx.runMutation(internal.facts.updateEmbedding, {
      factId,
      embedding: embeddings[0],
    });
  },
});
```

### 1.4 Scheduled Functions (Crons)

**Official Documentation:** https://docs.convex.dev/api/classes/server.Crons

#### Daily Schedule Pattern

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "Memory decay",
  {
    hourUTC: 6,      // 6:00 AM UTC
    minuteUTC: 0,
  },
  internal.crons.decayFacts
);

crons.daily(
  "Archive stale facts",
  {
    hourUTC: 7,
    minuteUTC: 30,
  },
  internal.crons.forgetStale
);

export default crons;
```

#### Security Best Practice: Use `internal` API

❌ **ANTI-PATTERN:** Exposing cron jobs via `api`

```typescript
// ❌ BAD: Using `api` allows spoofing sensitive arguments
export const sendMessage = mutation({
  args: {
    body: v.string(),
    author: v.string(), // Can be spoofed by external clients!
  },
  handler: async (ctx, { body, author }) => {
    await ctx.db.insert("messages", { body, author });
  },
});

// crons.ts
crons.daily(
  "send daily reminder",
  { hourUTC: 17, minuteUTC: 30 },
  api.messages.sendMessage, // ❌ Exposed to external clients
  { author: "System", body: "Update!" },
);
```

✅ **CORRECT:** Using `internal` API

```typescript
// ✅ GOOD: Internal mutation not exposed to clients
export const sendSystemMessage = internalMutation({
  args: { body: v.string() },
  handler: async (ctx, { body }) => {
    await ctx.db.insert("messages", {
      body,
      author: "System", // Controlled by server, can't be spoofed
    });
  },
});

// crons.ts
crons.daily(
  "send daily reminder",
  { hourUTC: 17, minuteUTC: 30 },
  internal.messages.sendSystemMessage,
  { body: "Update!" },
);
```

#### Cron Job Intervals

Available interval types:
- `crons.hourly()` - Every hour at specified minute
- `crons.daily()` - Every day at specified UTC time
- `crons.weekly()` - Specific day of week
- `crons.monthly()` - Specific day of month
- `crons.interval()` - Custom intervals in seconds

**Example: Multiple Intervals**

```typescript
// Every 5 minutes
crons.interval(
  "Fast decay",
  { seconds: 300 },
  internal.crons.fastDecay
);

// Weekly on Monday at 9 AM
crons.weekly(
  "Weekly consolidation",
  {
    dayOfWeek: "monday",
    hourUTC: 9,
    minuteUTC: 0,
  },
  internal.crons.consolidateThemes
);
```

### 1.5 Query Optimization Best Practices

**Official Guide:** [Convex Best Practices](https://docs.convex.dev/understanding/best-practices/)

#### Always Use Indexes

```typescript
// ❌ BAD: Table scan
const facts = await ctx.db
  .query("facts")
  .filter(q => q.eq(q.field("scopeId"), scopeId))
  .collect();

// ✅ GOOD: Index lookup
const facts = await ctx.db
  .query("facts")
  .withIndex("by_scope", q => q.eq("scopeId", scopeId))
  .collect();
```

#### Cursor-Based Pagination

```typescript
// ✅ Efficient pagination for large results
export const listFactsPaginated = query({
  args: { scopeId: v.id("memory_scopes"), cursor: v.optional(v.string()) },
  handler: async (ctx, { scopeId, cursor }) => {
    let query = ctx.db
      .query("facts")
      .withIndex("by_scope", q => q.eq("scopeId", scopeId));

    const page = await query.paginate({
      cursor,
      numItems: 100,
    });

    return {
      facts: page.page,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});
```

### 1.6 Additional Resources

- **Convex Best Practices Gist:** https://gist.github.com/srizvi/966e583693271d874bf65c2a95466339
- **Stack Convex (Blog):** https://stack.convex.dev
- **Schema Documentation:** https://docs.convex.dev/database/schemas
- **Migration Away Guide:** https://stack.convex.dev/how-hard-is-it-to-migrate-away-from-convex

---

## 2. Model Context Protocol (MCP) SDK

### 2.1 Overview

**Official Documentation:** https://modelcontextprotocol.io/docs/sdk
**GitHub Repository:** https://github.com/modelcontextprotocol/typescript-sdk
**Library ID (Context7):** `/modelcontextprotocol/python-sdk` (Python examples transferable to TypeScript)
**Code Snippets Available:** 417
**Source Reputation:** High
**Benchmark Score:** 85.5

**Key Packages:**
- `@modelcontextprotocol/server` - Building MCP servers
- `@modelcontextprotocol/client` - Building MCP clients
- Peer dependency: `zod` v4 (for schema validation)

**Language Distribution:** 97.2% TypeScript (strong type safety)

### 2.2 Version Timeline

- **Current Stable:** v1.x (recommended for production)
- **Development:** v2 (pre-alpha, not production-ready)
- **v2 Release:** Anticipated Q1 2026
- **v1.x Support:** Bug fixes and security updates for 6+ months after v2 ships

### 2.3 Tool Registration Patterns

#### Low-Level Server with Explicit Handlers

**Pattern:** Decorator-based tool registration with JSON Schema definitions

```typescript
import { Server } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio.js";
import { z } from "zod";

const server = new Server("engram-memory-server");

// List tools handler
server.setRequestHandler("tools/list", async () => {
  return {
    tools: [
      {
        name: "memory_store_fact",
        description: "Store atomic fact with async enrichment pipeline",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "The fact content",
            },
            factType: {
              type: "string",
              description: "decision|insight|observation|...",
              enum: ["decision", "insight", "observation", "note"],
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags for categorization",
            },
          },
          required: ["content"],
        },
      },
    ],
  };
});

// Call tool handler
server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "memory_store_fact") {
    const { content, factType, tags } = args;

    // Convex mutation call
    const result = await convexClient.mutation(
      api.functions.facts.storeFact,
      { content, factType, tags }
    );

    return {
      content: [
        {
          type: "text",
          text: `Fact stored with ID: ${result.factId}`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start server with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

#### High-Level Server with Tool Registration

**Pattern:** Functional tool registration with Zod schemas

```typescript
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const server = new McpServer({
  name: "engram-memory-server",
  version: "2.0.0",
});

// Register tool with Zod schema
server.tool(
  "memory_store_fact",
  "Store atomic fact with async enrichment pipeline",
  {
    content: z.string().describe("The fact content"),
    factType: z
      .enum(["decision", "insight", "observation", "note"])
      .optional()
      .describe("Fact type for importance scoring"),
    tags: z.array(z.string()).optional().describe("Tags for categorization"),
    scopeId: z.string().optional().describe("Target scope (defaults to agent's private)"),
  },
  async ({ content, factType, tags, scopeId }) => {
    // Input validation handled by Zod automatically
    const result = await convexClient.mutation(
      api.functions.facts.storeFact,
      { content, factType, tags, scopeId }
    );

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
  }
);
```

### 2.4 Stdio Transport Setup

**Important:** Stdio transport should **only** be used for connecting to local servers. It cannot be deployed to production environments (use Streamable HTTP for remote servers).

#### Client-Side Stdio Connection

```typescript
import { ClientSession, StdioServerParameters } from "@modelcontextprotocol/client";
import { stdio_client } from "@modelcontextprotocol/client/stdio.js";

// Configure stdio connection to server
const serverParams: StdioServerParameters = {
  command: "node",
  args: ["dist/mcp-server/index.js"],
  env: {
    CONVEX_URL: process.env.CONVEX_URL,
    ENGRAM_AGENT_ID: "researcher",
  },
};

async function connectToMcpServer() {
  const { read, write } = await stdio_client(serverParams);

  const session = new ClientSession(read, write);
  await session.initialize();

  // List available tools
  const tools = await session.list_tools();
  console.log("Available tools:", tools.tools.map(t => t.name));

  // Call a tool
  const result = await session.call_tool("memory_store_fact", {
    content: "Use Cohere Embed 4 for embeddings",
    factType: "decision",
    tags: ["architecture"],
  });

  console.log("Result:", result.content[0].text);
}
```

#### Server-Side Stdio Transport

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio.js";

// Initialize server
const server = new Server("engram-memory-server");

// Register tools...
server.setRequestHandler("tools/list", ...);
server.setRequestHandler("tools/call", ...);

// Connect via stdio
const transport = new StdioServerTransport();
await server.connect(transport);

// Server now listens on stdin/stdout
// Logs go to stderr only!
console.error("[engram] MCP server started");
```

### 2.5 Error Handling Best Practices

#### Structured Error Responses

```typescript
server.setRequestHandler("tools/call", async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (name === "memory_store_fact") {
      // Validate input
      if (!args.content || args.content.length > 10_000_000) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Error: Content is required and must be <10MB",
            },
          ],
        };
      }

      // Call Convex
      const result = await convexClient.mutation(...);

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  } catch (error) {
    // Log to stderr (not stdout!)
    console.error("[engram] Tool call error:", error);

    // Return user-friendly error (no stack traces)
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
    };
  }
});
```

### 2.6 Resources and Prompts

MCP servers can expose three capability types:

1. **Tools** - Functions that perform actions
2. **Resources** - Structured data sources (URIs)
3. **Prompts** - Templated prompt fragments

**Example: Exposing Resources**

```typescript
server.setRequestHandler("resources/list", async () => {
  return {
    resources: [
      {
        uri: "memory://facts/recent",
        name: "Recent Facts",
        description: "Last 100 facts stored",
        mimeType: "application/json",
      },
    ],
  };
});

server.setRequestHandler("resources/read", async (request) => {
  const { uri } = request.params;

  if (uri === "memory://facts/recent") {
    const facts = await convexClient.query(api.functions.facts.listRecent);

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(facts),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});
```

### 2.7 Authentication & Authorization

**Pattern:** Pass agent identity via environment variable

```typescript
// Client launches server with agent identity
const serverParams: StdioServerParameters = {
  command: "node",
  args: ["dist/mcp-server/index.js"],
  env: {
    ENGRAM_AGENT_ID: "researcher",
    CONVEX_URL: process.env.CONVEX_URL,
  },
};

// Server validates agent identity on every request
server.setRequestHandler("tools/call", async (request) => {
  const agentId = process.env.ENGRAM_AGENT_ID;

  if (!agentId) {
    return {
      isError: true,
      content: [{ type: "text", text: "Error: ENGRAM_AGENT_ID not set" }],
    };
  }

  // Verify agent exists in Convex
  const agent = await convexClient.query(
    api.functions.agents.getByAgentId,
    { agentId }
  );

  if (!agent) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: Unknown agent: ${agentId}` }],
    };
  }

  // Proceed with tool call...
});
```

### 2.8 Additional Resources

- **TypeScript SDK GitHub:** https://github.com/modelcontextprotocol/typescript-sdk
- **API Documentation:** https://modelcontextprotocol.github.io/typescript-sdk/
- **MCP Specification:** https://spec.modelcontextprotocol.io
- **SDK Documentation Index:** https://modelcontextprotocol.io/llms.txt
- **Community SDK Tiers:** https://modelcontextprotocol.io/community/sdk-tiers

**Key Documentation Files (in TypeScript SDK repo):**
- `docs/server.md` - Server patterns, transports, deployment
- `docs/client.md` - Client usage, OAuth integration
- `docs/capabilities.md` - Sampling, forms, task execution
- `docs/faq.md` - Environment setup, troubleshooting

---

## 3. LanceDB

### 3.1 Overview

**Official Documentation:** https://lancedb.com/docs
**Library ID (Context7):** `/lancedb/lancedb`
**Code Snippets Available:** 585
**Source Reputation:** High
**Benchmark Score:** 90.1

LanceDB is a developer-friendly, embedded retrieval engine for multimodal AI. It's built on the open-source Lance columnar format and designed for scalable data retrieval, management, and training of AI/ML workloads with vector, full-text, and SQL search capabilities.

### 3.2 Indexing Strategies

**Official Guide:** [LanceDB Indexing](https://lancedb.com/docs/search/optimize-queries/)

#### When to Add Indexes

- **<20,000 records:** Brute-force vector search is fast enough (no index needed)
- **>20,000 records:** Add IVF-PQ or HNSW-SQ index for performance

#### IVF-PQ Index (Inverted File with Product Quantization)

**Best For:** Large datasets where compression is important

```typescript
import * as lancedb from "@lancedb/lancedb";

const db = await lancedb.connect("./my_database");
const table = await db.openTable("facts");

// Create IVF-PQ vector index
await table.createIndex("embedding", {
  config: lancedb.Index.ivfPq({
    numPartitions: 256,      // Number of IVF partitions (groups)
    numSubVectors: 96,       // PQ sub-vectors (compression)
    distanceType: "l2",      // or "cosine"
  }),
});
```

**Parameters:**
- `numPartitions` - Controls search speed vs accuracy tradeoff (typical: 100-1000)
- `numSubVectors` - Controls compression ratio (typical: 8-96)
- `distanceType` - "l2" (Euclidean) or "cosine" (similarity)

**Tradeoffs:**
- ✅ Compressed storage (smaller index size)
- ✅ Fast search on large datasets
- ⚠️ Memory-intensive training process
- ⚠️ Slower training on large datasets

#### HNSW-SQ Index (Hierarchical Navigable Small World with Scalar Quantization)

**Best For:** High-accuracy requirements, moderate datasets

```typescript
await table.createIndex("embedding", {
  config: lancedb.Index.hnswSq({
    distanceType: "cosine",
    m: 20,                   // HNSW graph parameter (connections per node)
    efConstruction: 300,     // HNSW graph parameter (search during construction)
  }),
  replace: true,             // Replace existing index if present
});
```

**Parameters:**
- `m` - Higher = better accuracy, larger index (typical: 16-48)
- `efConstruction` - Higher = better quality, slower construction (typical: 100-500)

**Tradeoffs:**
- ✅ High recall (accuracy)
- ✅ Fast search
- ⚠️ Larger index size
- ⚠️ Slower construction

#### Scalar Indexes (BTree and Bitmap)

**BTree Index:** For scalar filtering on high-cardinality columns

```typescript
// Create BTree index for scalar filtering
await table.createIndex("scopeId", {
  config: lancedb.Index.btree(),
});

await table.createIndex("createdAt", {
  config: lancedb.Index.btree(),
});
```

**Bitmap Index:** For low-cardinality columns (few unique values)

```typescript
// Create bitmap index for status field
await table.createIndex("lifecycleState", {
  config: lancedb.Index.bitmap(),
});
```

**When to Use:**
- **BTree:** High cardinality (IDs, timestamps, names)
- **Bitmap:** Low cardinality (status, type, boolean flags)

#### Managing Indexes

```typescript
// List all indexes
const indices = await table.listIndices();
for (const idx of indices) {
  console.log(`Index: ${idx.name} on ${idx.columns}`);
}

// Get index statistics
const stats = await table.indexStats("embedding_idx");
console.log("Index stats:", stats);
```

### 3.3 Vector Search Patterns

**Basic Vector Search:**

```typescript
import lancedb from "@lancedb/lancedb";

const db = await lancedb.connect("./my_database");
const table = await db.openTable("facts");

// Basic search - 10 nearest neighbors
const queryVector = [0.1, 0.2, 0.3, ...]; // 1024-dim embedding
const results = await table
  .search(queryVector)
  .limit(10)
  .toArray();

console.log("Found:", results);
```

**Search with SQL Filters:**

```typescript
// Combine vector search with SQL filtering
const results = await table
  .search(queryVector)
  .where("scopeId = ? AND lifecycleState = ?", scopeId, "active")
  .select(["_id", "content", "importance", "_distance"])
  .limit(20)
  .toArray();
```

**Search with Metric Type:**

```typescript
// Configure distance metric and index parameters
const results = await table
  .search(queryVector)
  .metric("cosine")        // "l2", "cosine", or "dot"
  .nprobes(20)             // Number of IVF partitions to search
  .refine_factor(10)       // Refine results for better accuracy
  .limit(10)
  .toArray();

console.log(`Found ${results.length} results`);
```

**Understanding Parameters:**
- `nprobes` - Higher = more partitions searched, better accuracy, slower (typical: 10-50)
- `refine_factor` - Higher = post-filter refinement, better accuracy (typical: 1-20)

### 3.4 MergeInsert Operations

**Official Guide:** [Updating and Modifying Table Data](https://docs.lancedb.com/tables/update)

#### Basic MergeInsert Pattern

```typescript
// MergeInsert: Update existing records, insert new ones
await table.mergeInsert("factId", [
  { factId: "abc123", content: "Updated content", importance: 0.8 },
  { factId: "xyz789", content: "New fact", importance: 0.6 },
]);
```

**Logic:**
- If `factId` exists → update the record
- If `factId` doesn't exist → insert new record

#### Conditional MergeInsert

```typescript
// Custom update/insert logic
await table
  .mergeInsert("factId")
  .whenMatchedUpdateAll()      // Update all fields on match
  .whenNotMatchedInsertAll()   // Insert all fields on no match
  .execute([
    { factId: "abc123", content: "Updated", importance: 0.8 },
  ]);
```

### 3.5 Performance Best Practices

#### Batch Operations

**Problem:** Individual inserts are slow on large tables

```typescript
// ❌ SLOW: Individual inserts
for (const fact of facts) {
  await table.add([fact]); // Each insert = separate transaction
}
```

**Solution:** Batch inserts (500-1000 records at a time)

```typescript
// ✅ FAST: Batch inserts
const BATCH_SIZE = 500;
for (let i = 0; i < facts.length; i += BATCH_SIZE) {
  const batch = facts.slice(i, i + BATCH_SIZE);
  await table.add(batch);
}
```

**Performance Note:** In one reported case, batch inserts with batch size of 400 showed degradation from 0.06s initially to 1.2s as table grew to 25 million records. Monitor performance and adjust batch size as needed.

#### Known Limitations

**Indexes and MergeInsert:**
- **Issue:** MergeInsert doesn't work properly for tables with indexes ([Issue #2285](https://github.com/lancedb/lancedb/issues/2285))
- **Workaround:** Drop index, perform mergeInsert, recreate index
- **Status:** Under active development

**Concurrent Operations:**
- **Issue:** Concurrent delete, update, and merge_insert operations frequently conflict ([Issue #1597](https://github.com/lancedb/lancedb/issues/1597))
- **Impact:** Performance degradation under high concurrency
- **Mitigation:** Serialize operations or implement retry logic

#### Compression for Storage Optimization

```typescript
// Compress embeddings to float16 (50% storage reduction)
// Note: Requires custom Lance schema configuration
// See: https://lancedb.com/docs/tables/update/
```

### 3.6 Async API (Python transferable to TypeScript patterns)

**Async IVF-PQ Index Creation:**

```python
import lancedb

async def create_ivfpq_index():
    db = await lancedb.connect_async("path/to/your/db")
    table = await db.open_table("facts")

    await table.create_index(
        "embedding",
        index_type=lancedb.index.IvfPq,
        num_partitions=100,
        num_sub_vectors=8,
    )
```

### 3.7 Additional Resources

- **LanceDB Documentation:** https://lancedb.com/docs
- **Lance Format (columnar storage):** https://github.com/lancedb/lance
- **Administrator's Handbook:** https://fahadsid1770.medium.com/the-lancedb-administrators-handbook-a-comprehensive-tutorial-on-live-database-manipulation-and-5e6915727898
- **Performance Optimization:** https://lancedb.com/docs/search/optimize-queries/
- **Merge Insert Epic:** https://github.com/lancedb/lance/issues/2022
- **Moving from Qdrant Discussion:** https://github.com/lancedb/lancedb/discussions/899

---

## 4. Cohere Embed 4

### 4.1 Overview

**Official Documentation:**
- [Cohere Embed Models](https://docs.cohere.com/docs/cohere-embed)
- [Embed Multimodal v4 Announcement](https://docs.cohere.com/changelog/embed-multimodal-v4)
- [Embed API Reference](https://docs.cohere.com/reference/embed)
- [Blog: Introducing Embed 4](https://cohere.com/blog/embed-4)

**AWS Documentation:**
- [Cohere Embed v4 on Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed-v4.html)

**Model Details:**
- **Model ID:** `embed-english-v4.0` (text), `embed-v4.0` (multimodal)
- **Dimensions:** 256, 512, 1024, or 1536 (Matryoshka embeddings)
- **Modalities:** Text, images, and interleaved content
- **Max Context:** ~128k tokens
- **Pricing:** ~$0.0001/1K tokens

### 4.2 Key Features

**1. Multimodal Embeddings**
- Supports text, images, and interleaved text+image content
- Ideal for document understanding, visual search, and multimodal retrieval
- Single embedding space for both modalities

**2. Matryoshka Embeddings**
- Supports dimensions: `[256, 512, 1024, 1536]`
- Lower dimensions = faster search, smaller storage
- Higher dimensions = better accuracy
- Can truncate 1536-dim to 256-dim without recomputing

**3. Unified Embeddings**
- Mixed modality input (images + text) produces single embedding
- Preserves semantic relationship between text and visual context

### 4.3 Best Practices

#### Context Length for RAG

**Recommendation:** For RAG applications, smaller chunks often improve retrieval quality and reduce cost.

```typescript
// ❌ Avoid: Very long context
const embedding = await cohere.embed({
  texts: [entireDocument], // 50k tokens
  model: "embed-english-v4.0",
});

// ✅ Better: Chunk documents
const chunks = chunkDocument(document, 512); // 512 tokens each
const embeddings = await cohere.embed({
  texts: chunks,
  model: "embed-english-v4.0",
  input_type: "search_document",
});
```

**Why:** Smaller chunks improve retrieval precision and reduce embedding costs.

#### Image Handling

**Automatic Processing:**
- Images **>2,458,624 pixels** are downsampled to that size
- Images **<3,136 pixels** are upsampled
- No manual preprocessing required

**Multimodal Input:**

```typescript
// For page-like multimodal content, use inputs.content[]
const embedding = await cohere.embed({
  inputs: [
    {
      content: [
        { type: "text", text: "Invoice from Acme Corp" },
        { type: "image", image_url: "https://example.com/invoice.png" },
        { type: "text", text: "Total: $1,234.56" },
      ],
    },
  ],
  model: "embed-v4.0",
  input_type: "search_document",
});
```

**Why:** Text context (filename, entities, metadata) travels with the image for better semantic understanding.

#### Output Format Options

**Supported Formats:**
- `float` - Standard 32-bit floats (default)
- `int8` - 8-bit integers (4x smaller)
- `uint8` - Unsigned 8-bit integers
- `binary` - Binary quantization (32x smaller)
- `ubinary` - Unsigned binary

**Example: Compression for Storage**

```typescript
// Full precision (default)
const embeddingFull = await cohere.embed({
  texts: ["sample text"],
  model: "embed-english-v4.0",
  embedding_types: ["float"],
});

// Compressed (int8)
const embeddingCompressed = await cohere.embed({
  texts: ["sample text"],
  model: "embed-english-v4.0",
  embedding_types: ["int8"],
});

// Storage: 1536 * 4 bytes = 6KB (float) vs 1536 * 1 byte = 1.5KB (int8)
```

#### Input Type Parameter

**Important:** Set `input_type` for optimal embeddings

```typescript
// For documents being stored/indexed
const docEmbedding = await cohere.embed({
  texts: ["Document content"],
  model: "embed-english-v4.0",
  input_type: "search_document", // Optimized for storage
});

// For search queries
const queryEmbedding = await cohere.embed({
  texts: ["user search query"],
  model: "embed-english-v4.0",
  input_type: "search_query", // Optimized for search
});
```

**Options:**
- `search_document` - For documents being indexed
- `search_query` - For user queries
- `classification` - For text classification tasks
- `clustering` - For clustering/grouping

### 4.4 Implementation Example (Engram)

**Current Implementation:** `convex/actions/embed.ts`

```typescript
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const embedFact = internalAction({
  args: {
    factId: v.id("facts"),
    content: v.string(),
  },
  handler: async (ctx, { factId, content }) => {
    // Call Cohere Embed API
    const response = await fetch("https://api.cohere.ai/v1/embed", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.COHERE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        texts: [content],
        model: "embed-english-v4.0",
        input_type: "search_document",
        embedding_types: ["float"],
        truncate: "END", // Truncate if >128k tokens
      }),
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.statusText}`);
    }

    const { embeddings } = await response.json();
    const embedding = embeddings.float[0]; // 1024-dim array

    // Store embedding in Convex
    await ctx.runMutation(internal.functions.facts.updateEmbedding, {
      factId,
      embedding,
      embeddingModel: "embed-english-v4.0",
    });

    return { success: true, dimensions: embedding.length };
  },
});
```

### 4.5 Rate Limiting & Error Handling

**Circuit Breaker Pattern:**

```typescript
class CohereClient {
  private failureCount = 0;
  private circuitOpen = false;
  private lastFailureTime = 0;

  async embed(texts: string[]) {
    // Circuit breaker: fail fast if too many errors
    if (this.circuitOpen) {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure < 60_000) { // 1 minute cooldown
        throw new Error("Circuit breaker open: Cohere API unavailable");
      }
      // Try to close circuit after cooldown
      this.circuitOpen = false;
      this.failureCount = 0;
    }

    try {
      const response = await fetch("https://api.cohere.ai/v1/embed", {
        // ... request config
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Success: reset failure count
      this.failureCount = 0;
      return await response.json();

    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      // Open circuit after 3 failures
      if (this.failureCount >= 3) {
        this.circuitOpen = true;
        console.error("[cohere] Circuit breaker opened");
      }

      throw error;
    }
  }
}
```

### 4.6 Model Availability

**Platforms:**
- Cohere Platform (direct API)
- AWS SageMaker
- Azure AI Foundry
- Amazon Bedrock

**Recommended:** Cohere Platform for simplest integration

### 4.7 Additional Resources

- **Cohere Documentation:** https://docs.cohere.com
- **Embed API Reference:** https://docs.cohere.com/reference/embed
- **Model Overview:** https://docs.cohere.com/docs/models
- **Release Notes:** https://docs.cohere.com/changelog
- **Blog Post:** https://cohere.com/blog/embed-4
- **AWS Bedrock Guide:** https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed-v4.html

---

## 5. Integration Patterns for Engram

### 5.1 Schema Migration Workflow

**Applying the refactoring plan:**

**Step 1: Add optional fields (Day 1-2)**

```typescript
// convex/schema.ts
export default defineSchema({
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
    .index("by_key", ["key"]),

  memory_policies: defineTable({
    scopeId: v.id("memory_scopes"),
    policyKey: v.string(),
    policyValue: v.union(v.string(), v.number(), v.boolean()),
    priority: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_scope_key", ["scopeId", "policyKey"]),

  agents: defineTable({
    // Existing fields
    agentId: v.string(),
    name: v.string(),
    capabilities: v.array(v.string()),
    telos: v.optional(v.string()),

    // NEW: Optional fields (Phase 1)
    role: v.optional(v.string()),
    persona: v.optional(v.string()),
    specialization: v.optional(v.array(v.string())),
    workingMemorySize: v.optional(v.number()),
  })
    .index("by_agentId", ["agentId"]),
});
```

**Step 2: Seed config values (Day 3-4)**

```typescript
// convex/migrations/001_seed_system_config.ts
export const seedSystemConfig = internalMutation({
  handler: async (ctx) => {
    const configs = [
      {
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
      },
      // ... more configs
    ];

    for (const config of configs) {
      await ctx.db.insert("system_config", config);
    }
  },
});
```

**Step 3: Update code to use config (Day 4-5)**

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

  // 3. Fallback to hardcoded defaults
  return HARDCODED_DEFAULTS[key];
}

// convex/actions/importance.ts
export const calculateImportance = internalAction({
  handler: async (ctx, { factType, ... }) => {
    // OLD: const typeScore = HARDCODED_WEIGHTS[factType] || 0.5;

    // NEW: Get from config
    const weights = await getConfig(ctx, "importance_weights");
    const typeScore = weights[factType] || 0.5;

    // ... rest of logic
  },
});
```

### 5.2 MCP Tool Decomposition Pattern

**Before: Workflow tool (157 lines)**

```typescript
// ❌ OLD: memory_recall (workflow tool)
server.tool(
  "memory_recall",
  "Semantic vector search with strategy, merging, ranking, and access bumping",
  {
    query: z.string(),
    strategy: z.enum(["hybrid", "vector-only", "text-only"]).default("hybrid"),
    limit: z.number().default(10),
    // ... 10 more parameters
  },
  async (args) => {
    // 1. Route by strategy
    // 2. Query vault index
    // 3. Merge results
    // 4. Rank candidates
    // 5. Bump access count
    // 6. Record recall
    // ... 157 lines of orchestration
  }
);
```

**After: Decomposed primitives**

```typescript
// ✅ NEW: Primitive tools (agent composes)

server.tool(
  "memory_vector_search",
  "Vector similarity search using embeddings",
  {
    embedding: z.array(z.number()).length(1024),
    scopeIds: z.array(z.string()).optional(),
    limit: z.number().default(10),
  },
  async ({ embedding, scopeIds, limit }) => {
    const results = await convexClient.action(
      api.actions.vectorSearch.search,
      { embedding, scopeIds, limit }
    );
    return { results };
  }
);

server.tool(
  "memory_text_search",
  "Full-text search with filters",
  {
    query: z.string(),
    scopeIds: z.array(z.string()).optional(),
    filters: z.object({}).optional(),
    limit: z.number().default(10),
  },
  async ({ query, scopeIds, filters, limit }) => {
    const results = await convexClient.query(
      api.functions.facts.textSearch,
      { query, scopeIds, filters, limit }
    );
    return { results };
  }
);

server.tool(
  "memory_bump_access",
  "Increment access count for facts",
  {
    factIds: z.array(z.string()),
  },
  async ({ factIds }) => {
    await convexClient.mutation(
      api.functions.facts.bumpAccess,
      { factIds }
    );
    return { updated: factIds.length };
  }
);

// Keep memory_recall as optional convenience wrapper
server.tool(
  "memory_recall",
  "(Deprecated) Use memory_vector_search + memory_text_search for composition",
  // ... original args
  async (args) => {
    console.warn("[engram] memory_recall is deprecated");
    // Call primitives internally
    const vectorResults = await memoryVectorSearch(...);
    const textResults = await memoryTextSearch(...);
    // Merge and return
  }
);
```

### 5.3 LanceDB Sync Optimization

**Current Pattern:** Individual mergeInsert per fact (slow)

```typescript
// ❌ OLD: Slow sync
for (const fact of facts) {
  await lanceTable.mergeInsert("factId", [fact]);
}
```

**Optimized Pattern:** Batch mergeInsert

```typescript
// ✅ NEW: Fast batch sync
const BATCH_SIZE = 500;

for (let i = 0; i < facts.length; i += BATCH_SIZE) {
  const batch = facts.slice(i, i + BATCH_SIZE);

  try {
    await lanceTable.mergeInsert("factId", batch);
  } catch (error) {
    // Retry individual records on conflict
    for (const fact of batch) {
      try {
        await lanceTable.mergeInsert("factId", [fact]);
      } catch (err) {
        console.error(`[lance] Failed to sync fact ${fact.factId}:`, err);
      }
    }
  }
}
```

### 5.4 Cohere Embedding Circuit Breaker

**Production-Ready Pattern:**

```typescript
// mcp-server/src/lib/embeddings.ts
export class CohereEmbedder {
  private failureCount = 0;
  private circuitOpen = false;
  private lastFailureTime = 0;

  async embed(texts: string[]): Promise<number[][]> {
    // Fail fast if circuit open
    if (this.circuitOpen) {
      const cooldown = 60_000; // 1 minute
      if (Date.now() - this.lastFailureTime < cooldown) {
        throw new Error("Cohere API circuit breaker open");
      }
      // Try to close after cooldown
      this.circuitOpen = false;
      this.failureCount = 0;
    }

    try {
      const response = await fetch("https://api.cohere.ai/v1/embed", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.COHERE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          texts,
          model: "embed-english-v4.0",
          input_type: "search_document",
        }),
        signal: AbortSignal.timeout(30_000), // 30s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const { embeddings } = await response.json();

      // Success: reset
      this.failureCount = 0;
      return embeddings.float;

    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      // Open circuit after 3 failures
      if (this.failureCount >= 3) {
        this.circuitOpen = true;
        console.error("[cohere] Circuit breaker opened after 3 failures");
      }

      throw error;
    }
  }
}
```

### 5.5 Event-Driven Real-Time Propagation

**Pattern: Emit events from mutations**

```typescript
// convex/functions/facts.ts
export const storeFact = mutation({
  args: {
    content: v.string(),
    factType: v.optional(v.string()),
    // ...
  },
  handler: async (ctx, args) => {
    // 1. Store fact
    const factId = await ctx.db.insert("facts", {
      content: args.content,
      factType: args.factType || "observation",
      lifecycleState: "active",
      createdAt: Date.now(),
      createdBy: args.agentId,
    });

    // 2. Schedule enrichment action
    await ctx.scheduler.runAfter(0, internal.actions.enrich.enrichFact, {
      factId,
      content: args.content,
    });

    // 3. Emit event for real-time propagation
    const watermark = await getNextWatermark(ctx);
    await ctx.db.insert("memory_events", {
      eventType: "fact_created",
      payload: {
        factId,
        content: args.content,
        scopeId: args.scopeId,
      },
      agentId: args.agentId,
      scopeId: args.scopeId,
      factId,
      timestamp: Date.now(),
      watermark,
    });

    return { factId };
  },
});

// MCP tool: Poll events
server.tool(
  "memory_poll_events",
  "Poll for new events since last watermark",
  {
    agentId: z.string(),
    sinceWatermark: z.number().default(0),
    eventTypes: z.array(z.string()).optional(),
    limit: z.number().default(100),
  },
  async ({ agentId, sinceWatermark, eventTypes, limit }) => {
    const events = await convexClient.query(
      api.functions.events.pollEvents,
      { agentId, sinceWatermark, eventTypes, limit }
    );

    return {
      events: events.events,
      latestWatermark: events.latestWatermark,
      hasMore: events.hasMore,
    };
  }
);
```

---

## 6. Summary & Quick Reference

### Framework Quick Links

| Framework | Official Docs | Context7 Library | Benchmark Score |
|-----------|---------------|------------------|-----------------|
| Convex | [docs.convex.dev](https://docs.convex.dev) | `/llmstxt/convex_dev_llms-full_txt` | 63.6 |
| MCP SDK | [modelcontextprotocol.io](https://modelcontextprotocol.io/docs/sdk) | `/modelcontextprotocol/python-sdk` | 85.5 |
| LanceDB | [lancedb.com/docs](https://lancedb.com/docs) | `/lancedb/lancedb` | 90.1 |
| Cohere | [docs.cohere.com](https://docs.cohere.com) | N/A | N/A |

### Key Implementation Checklist

**Convex:**
- ✅ Use online migrations (optional fields first)
- ✅ Actions for external API calls (Cohere, etc.)
- ✅ Schedule actions via mutations (not direct)
- ✅ Use `internal` API for cron jobs (security)
- ✅ Always use indexes with `.withIndex()`
- ✅ Cursor-based pagination for large results

**MCP SDK:**
- ✅ Zod v4 for schema validation
- ✅ Stdio transport for local servers only
- ✅ Structured error responses (no stack traces)
- ✅ Log to stderr only (not stdout)
- ✅ Pass agent identity via environment
- ✅ TypeScript SDK v1.x for production

**LanceDB:**
- ✅ No index needed until >20K records
- ✅ IVF-PQ for compression, HNSW-SQ for accuracy
- ✅ Batch operations (500-1000 records)
- ✅ BTree for high-cardinality, Bitmap for low
- ⚠️ MergeInsert limitation with indexes (drop/recreate)
- ⚠️ Concurrent operations may conflict (retry logic)

**Cohere Embed 4:**
- ✅ Use `embed-english-v4.0` for text (1024-dim)
- ✅ Set `input_type` (search_document/search_query)
- ✅ Chunk documents for RAG (512-1024 tokens)
- ✅ Circuit breaker for API failures
- ✅ Images auto-resize (2.4M pixels max)
- ✅ Multimodal via `inputs.content[]`

### Performance Targets (from Refactoring Plan)

- **Tool Response Time:** <50ms
- **Query Latency:** <100ms p95
- **Enrichment Lag:** <3s from store to embed
- **Propagation Latency:** <5s from event to poll
- **Vault Sync Lag:** <30s (file watcher limitation)

### Security Checklist

- ✅ Input validation (length limits, format checks)
- ✅ Rate limiting (100 req/min per agent)
- ✅ Scope access checks in every function
- ✅ Never expose stack traces to clients
- ✅ Circuit breaker for external APIs
- ✅ Audit log for admin operations

---

## Appendix: Official Documentation Sources

### Convex
- [Intro to Migrations](https://stack.convex.dev/intro-to-migrations)
- [Zero-Downtime Migrations](https://stack.convex.dev/zero-downtime-migrations)
- [Lightweight Migrations](https://stack.convex.dev/lightweight-zero-downtime-migrations)
- [Stateful Migrations with Mutations](https://stack.convex.dev/migrating-data-with-mutations)
- [Convex Migrations Component](https://github.com/get-convex/migrations)
- [Schema Documentation](https://docs.convex.dev/database/schemas)
- [Best Practices](https://docs.convex.dev/understanding/best-practices/)
- [ActionCtx API](https://docs.convex.dev/generated-api/server)
- [Crons API](https://docs.convex.dev/api/classes/server.Crons)

### Model Context Protocol (MCP)
- [MCP SDK Overview](https://modelcontextprotocol.io/docs/sdk)
- [TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
- [API Documentation](https://modelcontextprotocol.github.io/typescript-sdk/)
- [MCP Specification](https://spec.modelcontextprotocol.io)
- [SDK Documentation Index](https://modelcontextprotocol.io/llms.txt)
- [Community SDK Tiers](https://modelcontextprotocol.io/community/sdk-tiers)

### LanceDB
- [Official Documentation](https://lancedb.com/docs)
- [Updating and Modifying Table Data](https://docs.lancedb.com/tables/update)
- [Optimize Query Performance](https://lancedb.com/docs/search/optimize-queries/)
- [Lance Format GitHub](https://github.com/lancedb/lance)
- [LanceDB GitHub](https://github.com/lancedb/lancedb)
- [Administrator's Handbook](https://fahadsid1770.medium.com/the-lancedb-administrators-handbook-a-comprehensive-tutorial-on-live-database-manipulation-and-5e6915727898)

### Cohere Embed 4
- [Cohere Embed Models](https://docs.cohere.com/docs/cohere-embed)
- [Embed Multimodal v4 Announcement](https://docs.cohere.com/changelog/embed-multimodal-v4)
- [Embed API Reference](https://docs.cohere.com/reference/embed)
- [Blog: Introducing Embed 4](https://cohere.com/blog/embed-4)
- [AWS Bedrock: Cohere Embed v4](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed-v4.html)
- [Oracle Cloud: Cohere Embed 4](https://docs.oracle.com/en-us/iaas/Content/generative-ai/cohere-embed-4.htm)
- [Model Overview](https://docs.cohere.com/docs/models)
- [Release Notes](https://docs.cohere.com/changelog)

---

**Document Status:** Complete
**Last Updated:** 2026-02-15
**Next Review:** Upon plan implementation start (Phase 1, Day 1)
