---
title: "feat: Engram Unified Multi-Agent Memory System"
type: feat
date: 2026-02-11
---

# Engram: Unified Multi-Agent Memory System

## Overview

Engram is a shared memory layer for OpenClaw agents. Agents store atomic facts, recall context via semantic search, and share knowledge across devices and sessions. Local-first via LanceDB, cloud-synced through Convex, multimodal embeddings via Cohere Embed 4, exposed via 12 MCP tools.

This plan covers end-to-end implementation across 6 phases, from Convex foundation to MemoryLance migration.

## Problem Statement

OpenClaw agents currently suffer from:
- **Context rot** — long sessions accumulate stale context, degrading quality
- **Knowledge silos** — Agent A discovers a bug pattern, Agent B hits the same bug an hour later
- **Session amnesia** — corrections and preferences are forgotten across sessions
- **No cross-device sync** — Mac Mini, MacBook Air, and MacBook Pro each have isolated memory

## Proposed Solution

A three-tier architecture:
1. **Convex cloud backend** — Source of truth, 7 tables, async enrichment, scheduled jobs
2. **MCP server per agent** — 8 tool primitives, Convex HTTP client, stdio transport
3. **LanceDB local cache** — Sub-10ms vector search, synced from Convex every 30s

---

## Technical Approach

### Architecture

```
                    Convex Cloud Backend
    ┌────────────────────────────────────────────┐
    │  facts ── entities ── conversations         │
    │  sessions ── agents ── memory_scopes        │
    │  sync_log                                    │
    │                                              │
    │  Actions: embed, extract, importance         │
    │  Crons: decay (daily), rerank (weekly),      │
    │         cleanup (daily)                      │
    └──────────────────┬───────────────────────────┘
                       │ ConvexHttpClient
          ┌────────────┼────────────┐
          │            │            │
     MCP Server   MCP Server   MCP Server
     (Agent 1)    (Agent 2)    (Agent 3)
          │            │            │
     LanceDB      LanceDB      LanceDB
     (local)      (local)      (local)
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend | Convex | Realtime, native vector search, scheduled functions, free tier |
| Vector search | Convex native (1024-dim) | Sufficient for scale, no external dependency |
| MCP SDK | `@modelcontextprotocol/sdk` v1.26+ | `registerTool` API with Zod schemas |
| Transport | stdio | Agent spawns MCP server as child process |
| Embeddings | **Cohere Embed 4** (1024-dim) | Multimodal (text+images+code), SOTA quality, replaces OpenAI |
| Entity extraction | GPT-4o-mini in Convex actions | $0.04/1K facts, works in V8 isolates |
| Local vector DB | LanceDB `@lancedb/lancedb` | Sub-10ms, offline support, `mergeInsert` upserts |
| HTTP client | `ConvexHttpClient` | Stateless HTTP, no WebSocket overhead |
| Enrichment | Single `internalAction` per fact | Simpler than chained actions, sequential in one call |

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal:** Convex project with schema, basic CRUD, and full-text search working.

#### Tasks

- [ ] Initialize Convex project: `npx create-convex`
- [ ] Define schema in `convex/schema.ts` with all 7 tables
- [ ] Implement CRUD mutations/queries for `facts` table
- [ ] Implement CRUD mutations/queries for `entities` table
- [ ] Implement CRUD for `conversations`, `sessions`, `agents`, `memory_scopes`, `sync_log`
- [ ] Configure full-text search index on `facts.content` with filter fields `scopeId`, `factType`, `createdBy`
- [ ] Write seed script (`scripts/seed.ts`) to populate initial entities from existing memory.md
- [ ] Verify full-text search returns results filtered by scope

#### Schema Implementation

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  facts: defineTable({
    content: v.string(),
    timestamp: v.number(),
    source: v.string(),
    entityIds: v.array(v.string()),
    relevanceScore: v.float64(),
    accessedCount: v.number(),
    importanceScore: v.float64(),
    createdBy: v.string(),
    conversationId: v.optional(v.id("conversations")),
    scopeId: v.id("memory_scopes"),
    tags: v.array(v.string()),
    factType: v.string(), // decision|observation|plan|error|insight
    embedding: v.optional(v.array(v.float64())),
    status: v.optional(v.string()), // active|superseded|archived
  })
    .index("by_scope", ["scopeId", "timestamp"])
    .index("by_agent", ["createdBy", "timestamp"])
    .index("by_type", ["factType", "timestamp"])
    .index("by_importance", ["importanceScore"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["scopeId", "factType", "createdBy"],
    })
    .vectorIndex("vector_search", {
      vectorField: "embedding",
      dimensions: 1024,
      filterFields: ["scopeId"],
    }),

  entities: defineTable({
    entityId: v.string(),
    name: v.string(),
    type: v.string(), // person|project|company|concept|tool
    firstSeen: v.number(),
    lastSeen: v.number(),
    metadata: v.any(),
    relationships: v.array(v.object({
      targetId: v.string(),
      relationType: v.string(),
      since: v.optional(v.string()),
    })),
    importanceScore: v.float64(),
    accessCount: v.number(),
    createdBy: v.string(),
  })
    .index("by_entity_id", ["entityId"])
    .index("by_type", ["type"])
    .index("by_importance", ["importanceScore"])
    .searchIndex("search_name", { searchField: "name" }),

  conversations: defineTable({
    sessionId: v.id("sessions"),
    participants: v.array(v.string()),
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
    .index("by_importance", ["importance"]),

  sessions: defineTable({
    agentId: v.string(),
    startTime: v.number(),
    lastActivity: v.number(),
    factCount: v.number(),
    contextSummary: v.string(),
    parentSession: v.optional(v.id("sessions")),
    nodeId: v.optional(v.string()),
  })
    .index("by_agent", ["agentId", "startTime"])
    .index("by_node", ["nodeId"]),

  agents: defineTable({
    agentId: v.string(),
    name: v.string(),
    nodeId: v.optional(v.string()),
    capabilities: v.array(v.string()),
    lastSeen: v.number(),
    factCount: v.number(),
    defaultScope: v.string(),
    settings: v.optional(v.any()),
  })
    .index("by_agent_id", ["agentId"]),

  memory_scopes: defineTable({
    name: v.string(),
    description: v.string(),
    members: v.array(v.string()),
    readPolicy: v.string(),  // members|all|none
    writePolicy: v.string(), // members|creator|all
    retentionDays: v.optional(v.number()),
  })
    .index("by_name", ["name"]),

  sync_log: defineTable({
    nodeId: v.string(),
    lastSyncTimestamp: v.number(),
    factsSynced: v.number(),
    status: v.string(), // ok|error|syncing
  })
    .index("by_node", ["nodeId"]),
});
```

#### Convex Functions Structure

```
convex/
  schema.ts
  functions/
    facts.ts         # storeFact, getFact, getByIds, search, updateEnrichment, bumpAccess
    entities.ts      # upsert, get, getByEntityId, addRelationship, search
    conversations.ts # create, addFact, addHandoff, getBySession
    sessions.ts      # create, updateActivity, getByAgent
    agents.ts        # register, get, updateLastSeen
    scopes.ts        # create, getPermitted, addMember, removeMember
    sync.ts          # getFactsSince, updateSyncLog, getSyncStatus
```

**Key mutation pattern (facts.ts):**
```typescript
// convex/functions/facts.ts
import { mutation, query, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

export const storeFact = mutation({
  args: {
    content: v.string(),
    source: v.optional(v.string()),
    entityIds: v.optional(v.array(v.string())),
    tags: v.optional(v.array(v.string())),
    factType: v.optional(v.string()),
    scopeId: v.id("memory_scopes"),
    createdBy: v.string(),
    conversationId: v.optional(v.id("conversations")),
  },
  returns: v.object({ factId: v.id("facts"), importanceScore: v.number() }),
  handler: async (ctx, args) => {
    const quickImportance = estimateImportance(args.content);

    const factId = await ctx.db.insert("facts", {
      content: args.content,
      source: args.source ?? "direct",
      entityIds: args.entityIds ?? [],
      tags: args.tags ?? [],
      factType: args.factType ?? "observation",
      scopeId: args.scopeId,
      createdBy: args.createdBy,
      conversationId: args.conversationId,
      timestamp: Date.now(),
      relevanceScore: 1.0,
      accessedCount: 0,
      importanceScore: quickImportance,
      status: "active",
      // embedding left undefined — filled by async enrichment
    });

    // Schedule async enrichment (non-blocking)
    await ctx.scheduler.runAfter(0, internal.actions.enrich.enrichFact, {
      factId,
    });

    return { factId, importanceScore: quickImportance };
  },
});

// Quick importance estimate (no external calls)
function estimateImportance(content: string): number {
  const lower = content.toLowerCase();
  const highKeywords = ["decision", "error", "critical", "breaking", "failed", "security"];
  const medKeywords = ["fix", "implement", "create", "build", "update", "deploy"];
  const lowKeywords = ["note", "observation", "maybe", "consider", "minor"];

  if (highKeywords.some(k => lower.includes(k))) return 0.9;
  if (medKeywords.some(k => lower.includes(k))) return 0.6;
  if (lowKeywords.some(k => lower.includes(k))) return 0.3;
  return 0.5;
}
```

#### Success Criteria
- [ ] `npx convex dev` runs successfully with all 7 tables
- [ ] Can insert and query facts via Convex dashboard
- [ ] Full-text search returns filtered results
- [ ] Seed script populates initial entities

---

### Phase 2: MCP Server (Week 1-2)

**Goal:** TypeScript MCP server with 8 tools connected to Convex backend.

#### Tasks

- [ ] Initialize `mcp-server/` with package.json, tsconfig.json
- [ ] Install dependencies: `@modelcontextprotocol/sdk`, `convex`, `zod`, `cohere-ai`
- [ ] Create `lib/convex-client.ts` — ConvexHttpClient singleton
- [ ] Create `schemas/shared.ts` — Shared Zod schemas
- [ ] Implement all 8 tools (one file each in `tools/`)
- [ ] Create `index.ts` — server init, tool registration, stdio transport
- [ ] Test each tool with MCP Inspector: `npx @modelcontextprotocol/inspector npx tsx src/index.ts`
- [ ] Create OpenClaw skill package (`skill/SKILL.md`, `skill/install.sh`)

#### Project Setup

```json
// mcp-server/package.json
{
  "name": "engram-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "bin": { "engram": "./build/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node build/index.js",
    "inspect": "npx @modelcontextprotocol/inspector npx tsx src/index.ts",
    "test": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.26.0",
    "cohere-ai": "^7.0.0",
    "convex": "^1.17.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "tsx": "^4.0.0"
  }
}
```

```json
// mcp-server/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

#### Tool Architecture Pattern

Each tool exports a register function:

```typescript
// mcp-server/src/tools/store-fact.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getConvexClient } from "../lib/convex-client.js";
import { api } from "../../convex/_generated/api.js";

export function registerStoreFact(server: McpServer) {
  server.registerTool(
    "memory_store_fact",
    {
      title: "Store Fact",
      description: "Store an atomic fact. Triggers async enrichment (embedding, entity extraction, importance scoring).",
      inputSchema: {
        content: z.string().min(1).max(4000).describe("The atomic fact to store"),
        source: z.string().optional().describe("Source attribution"),
        entityIds: z.array(z.string()).optional().describe("Known entity IDs to link"),
        tags: z.array(z.string()).optional().describe("Categorization tags"),
        factType: z.enum(["decision", "observation", "plan", "error", "insight"]).optional(),
        scopeId: z.string().optional().describe("Memory scope ID (uses agent default if omitted)"),
      },
    },
    async ({ content, source, entityIds, tags, factType, scopeId }) => {
      try {
        const client = getConvexClient();
        const result = await client.mutation(api.functions.facts.storeFact, {
          content, source, entityIds, tags, factType,
          scopeId: scopeId ?? defaultScopeId,
          createdBy: agentId,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
```

#### Entry Point

```typescript
// mcp-server/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerStoreFact } from "./tools/store-fact.js";
import { registerRecall } from "./tools/recall.js";
import { registerSearch } from "./tools/search.js";
import { registerLinkEntity } from "./tools/link-entity.js";
import { registerGetContext } from "./tools/get-context.js";
import { registerObserve } from "./tools/observe.js";
import { registerAgent } from "./tools/register-agent.js";
import { registerQueryRaw } from "./tools/query-raw.js";

const server = new McpServer({ name: "engram", version: "1.0.0" });

registerStoreFact(server);
registerRecall(server);
registerSearch(server);
registerLinkEntity(server);
registerGetContext(server);
registerObserve(server);
registerAgent(server);
registerQueryRaw(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Engram MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Critical:** Never use `console.log()` in stdio MCP servers — it corrupts JSON-RPC messages. Use `console.error()` only.

#### Convex HTTP Client

```typescript
// mcp-server/src/lib/convex-client.ts
import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (!client) {
    const url = process.env.CONVEX_URL;
    if (!url) throw new Error("CONVEX_URL environment variable required");
    client = new ConvexHttpClient(url);
  }
  return client;
}
```

**Note:** ConvexHttpClient is stateful — the research recommends creating new instances per request for safety, but for an MCP server (single-agent, no concurrent requests over stdio), a singleton is fine.

#### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CONVEX_URL` | Yes | Convex deployment URL |
| `COHERE_API_KEY` | Yes | For Cohere Embed 4 embeddings |
| `OPENAI_API_KEY` | Yes | For entity extraction (GPT-4o-mini) |
| `ENGRAM_AGENT_ID` | No | Default agent identity |
| `ENGRAM_DEFAULT_SCOPE` | No | Default memory scope |

#### Success Criteria
- [ ] `npm run build` compiles without errors
- [ ] MCP Inspector shows all 8 tools with correct schemas
- [ ] `memory_store_fact` stores a fact in Convex and returns factId
- [ ] `memory_search` returns facts matching full-text query
- [ ] `memory_observe` returns immediately (fire-and-forget)
- [ ] `memory_register_agent` creates agent record in Convex

---

### Phase 3: Async Enrichment (Week 2)

**Goal:** Facts stored via MCP automatically get embeddings, entity extraction, and importance scoring.

#### Tasks

- [ ] Implement `convex/actions/enrich.ts` — single internalAction for full enrichment pipeline
- [ ] Wire Cohere Embed 4 (`embed-v4.0`, 1024-dim) for embedding generation
- [ ] Wire GPT-4o-mini for entity extraction + relationship inference
- [ ] Implement multi-factor importance scoring (content 40%, centrality 30%, temporal 20%, access 10%)
- [ ] Configure vector search index on facts table
- [ ] Implement `memory_recall` tool with vector search via Convex action
- [ ] Verify end-to-end: store fact → enrichment runs → recall finds it semantically

#### Enrichment Action (Single Action Pattern)

```typescript
// convex/actions/enrich.ts
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

export const enrichFact = internalAction({
  args: { factId: v.id("facts") },
  returns: v.null(),
  handler: async (ctx, { factId }) => {
    // 1. Fetch the raw fact
    const fact = await ctx.runQuery(internal.functions.facts.getById, { id: factId });
    if (!fact) return null;

    // 2. Generate embedding (~200ms)
    const embedding = await generateEmbedding(fact.content);

    // 3. Extract entities + relationships (~500ms)
    const extraction = await extractEntities(fact.content);

    // 4. Upsert extracted entities into entities table
    const entityIds = [];
    for (const entity of extraction.entities) {
      const id = await ctx.runMutation(internal.functions.entities.upsert, {
        entityId: `entity-${entity.name.toLowerCase().replace(/\s+/g, "-")}`,
        name: entity.name,
        type: entity.type,
        createdBy: fact.createdBy,
      });
      entityIds.push(id);
    }

    // 5. Calculate full importance score
    const importanceScore = calculateImportance(fact, entityIds.length);

    // 6. Update fact with all enrichment results
    await ctx.runMutation(internal.functions.facts.updateEnrichment, {
      factId,
      embedding,
      entityIds: [...fact.entityIds, ...entityIds],
      importanceScore,
    });
  },
});

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.cohere.com/v2/embed", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "embed-v4.0",
      texts: [text],
      input_type: "search_document",
      embedding_types: ["float"],
    }),
  });
  const data = await response.json();
  return data.embeddings.float[0]; // 1024-dim
}

async function extractEntities(content: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{
        role: "system",
        content: `Extract entities and relationships. Return JSON:
{"entities":[{"name":"...","type":"person|project|company|concept|tool"}],
 "relationships":[{"source":"...","target":"...","type":"works_on|uses|created_by|part_of|related_to"}]}`
      }, { role: "user", content }],
    }),
  });
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

function calculateImportance(fact: any, entityCount: number): number {
  // Content score (40%)
  const lower = fact.content.toLowerCase();
  let contentScore = 0.5;
  if (["decision", "error", "critical", "breaking", "failed"].some(k => lower.includes(k))) contentScore = 0.9;
  else if (["fix", "implement", "create", "build", "update"].some(k => lower.includes(k))) contentScore = 0.6;
  else if (["note", "observation", "maybe", "consider"].some(k => lower.includes(k))) contentScore = 0.3;

  // Entity centrality (30%)
  const centralityScore = Math.min(1.0, entityCount <= 0 ? 0.1 : entityCount <= 1 ? 0.4 : entityCount <= 3 ? 0.7 : 1.0);

  // Temporal relevance (20%)
  const daysSince = (Date.now() - fact.timestamp) / (24 * 60 * 60 * 1000);
  const temporalScore = Math.max(0.1, Math.pow(0.99, daysSince));

  // Access frequency (10%)
  const accessScore = Math.min(0.5, fact.accessedCount * 0.05);

  return (contentScore * 0.4) + (centralityScore * 0.3) + (temporalScore * 0.2) + (accessScore * 0.1);
}
```

#### Vector Search (Runs in Actions Only)

```typescript
// convex/actions/search.ts
export const semanticSearch = internalAction({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    scopeId: v.optional(v.id("memory_scopes")),
  },
  handler: async (ctx, args) => {
    const embedding = await generateEmbedding(args.query);

    const results = await ctx.vectorSearch("facts", "vector_search", {
      vector: embedding,
      limit: args.limit ?? 10,
      filter: args.scopeId ? (q) => q.eq("scopeId", args.scopeId) : undefined,
    });

    // Fetch full documents
    const facts = await ctx.runQuery(internal.functions.facts.getByIds, {
      ids: results.map(r => r._id),
    });

    // Bump access counts
    for (const result of results) {
      await ctx.runMutation(internal.functions.facts.bumpAccess, { id: result._id });
    }

    return facts.map((fact, i) => ({
      ...fact,
      _score: results[i]._score,
    }));
  },
});
```

#### Success Criteria
- [ ] Storing a fact triggers async enrichment within seconds
- [ ] Facts get embeddings (1024-dim float array populated)
- [ ] Entities are auto-extracted and upserted
- [ ] Importance scores reflect multi-factor formula
- [ ] `memory_recall("authentication patterns")` returns semantically relevant facts
- [ ] Vector search respects scope filtering

---

### Phase 4: Multi-Agent (Week 2-3)

**Goal:** Multiple agents can register, share memory via scopes, and hand off conversations.

#### Tasks

- [ ] Implement agent registration flow in `memory_register_agent` tool
- [ ] Create default scopes on first agent registration: `private-{agentId}`, `public`
- [ ] Implement scope-aware queries — all reads filtered by agent's permitted scopes
- [ ] Implement `memory_get_context` tool — warm start with facts, entities, recent sessions
- [ ] Implement conversation handoff tracking in `conversations` table
- [ ] Test with 2+ agents: Agent A stores facts, Agent B recalls them via shared scope
- [ ] Add scope membership management (add/remove agents from scopes)

#### Agent Registration Flow

```
Agent calls memory_register_agent({ agentId: "coder-1", name: "Coder", capabilities: ["code", "debug"] })
  → Check if agent exists in agents table
  → If new: create agent record + create private scope + return available scopes
  → If existing: update lastSeen + return available scopes
  → Agent receives list of scopes it can read/write
```

#### Scope-Aware Query Pattern

Every query that returns facts must filter by the agent's permitted scopes:

```typescript
// Get all scopes this agent can read
async function getPermittedScopes(ctx, agentId: string): Promise<Id<"memory_scopes">[]> {
  const allScopes = await ctx.db.query("memory_scopes").collect();
  return allScopes
    .filter(s => s.readPolicy === "all" || s.members.includes(agentId))
    .map(s => s._id);
}
```

#### Conversation Handoff

```typescript
// When Agent A hands off to Agent B:
// 1. Agent A creates handoff record with context summary
// 2. Agent B receives handoff + top-N important facts from shared scope
// 3. Both agents can access the conversation's facts

interface Handoff {
  fromAgent: string;
  toAgent: string;
  timestamp: number;
  contextSummary: string; // LLM-generated summary of conversation so far
}
```

#### Success Criteria
- [ ] Agent registers and gets private + public scopes
- [ ] Agent A stores fact in "team" scope, Agent B can recall it
- [ ] Agent cannot access facts in scopes it's not a member of
- [ ] Conversation handoff preserves context for receiving agent
- [ ] `memory_get_context` returns warm-start bundle for a topic

---

### Phase 5: Local Sync (Week 3)

**Goal:** LanceDB local cache synced from Convex for sub-10ms offline vector search.

#### Tasks

- [ ] Install `@lancedb/lancedb` in MCP server
- [ ] Create `lib/lance-sync.ts` — sync daemon class
- [ ] Implement incremental sync: pull facts from Convex since last `_creationTime` cursor
- [ ] Use `mergeInsert` for atomic upserts into LanceDB
- [ ] Create FTS index on `content` and B-tree indexes on `scope`, `importance`
- [ ] Implement local-first query with Convex fallback in `memory_recall`
- [ ] Track sync state in Convex `sync_log` table
- [ ] Start daemon alongside MCP server, stop on shutdown
- [ ] Test offline scenario: disconnect Convex, verify local search still works

#### LanceDB Sync Daemon

```typescript
// mcp-server/src/lib/lance-sync.ts
import * as lancedb from "@lancedb/lancedb";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

export class LanceSyncDaemon {
  private db: lancedb.Connection;
  private table: lancedb.Table | null = null;
  private convex: ConvexHttpClient;
  private lastSyncTimestamp = 0;
  private intervalId?: NodeJS.Timeout;
  private nodeId: string;

  constructor(dbPath: string, convexUrl: string, nodeId: string) {
    this.nodeId = nodeId;
    this.convex = new ConvexHttpClient(convexUrl);
  }

  async start(intervalMs = 30_000) {
    this.db = await lancedb.connect(this.dbPath);
    await this.fullSync();
    this.intervalId = setInterval(() => this.incrementalSync(), intervalMs);
  }

  async stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async incrementalSync() {
    const facts = await this.convex.query(api.functions.sync.getFactsSince, {
      since: this.lastSyncTimestamp,
      limit: 100,
    });

    if (facts.length === 0) return;

    // Only sync facts that have embeddings
    const withEmbeddings = facts.filter(f => f.embedding);

    if (withEmbeddings.length > 0) {
      const records = withEmbeddings.map(f => ({
        id: f._id,
        content: f.content,
        vector: f.embedding,
        importance: f.importanceScore,
        scope: f.scopeId,
        agentId: f.createdBy,
        factType: f.factType,
        timestamp: f.timestamp,
      }));

      await this.table!
        .mergeInsert("id")
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute(records);
    }

    this.lastSyncTimestamp = facts[facts.length - 1]._creationTime;
  }

  async search(queryVector: number[], limit: number, scope?: string) {
    let query = this.table!.search(queryVector).limit(limit);
    if (scope) query = query.where(`scope = '${scope}'`);
    return await query.toArray();
  }
}
```

#### Local-First Query Pattern

```typescript
// In memory_recall tool:
async function recallWithFallback(query: string, limit: number, scopeId?: string) {
  const embedding = await generateEmbedding(query);

  // Try local LanceDB first
  try {
    const localResults = await lanceDaemon.search(embedding, limit, scopeId);
    if (localResults.length > 0) return localResults;
  } catch {
    console.error("Local search failed, falling back to Convex");
  }

  // Fallback to Convex vector search
  return await convexClient.action(api.actions.search.semanticSearch, {
    query, limit, scopeId,
  });
}
```

#### Index Strategy

- **No vector index initially** — brute-force is faster for < 10K facts
- **Add IVF_PQ** when facts exceed 10K: `table.createIndex("vector", { config: lancedb.Index.ivfPq({ distanceType: "cosine" }) })`
- **Always create:** FTS index on `content`, B-tree on `scope` and `importance`

#### Success Criteria
- [ ] Sync daemon pulls facts from Convex every 30s
- [ ] LanceDB contains all facts with embeddings
- [ ] Local vector search returns results in < 10ms
- [ ] Fallback to Convex works when LanceDB is empty
- [ ] Sync state tracked in Convex sync_log
- [ ] Graceful shutdown stops the daemon

---

### Phase 6: Migration + Polish (Week 3-4)

**Goal:** Import existing MemoryLance data, add scheduled jobs, performance-tune.

#### Tasks

- [ ] Implement `scripts/migrate.ts` — import from MemoryLance JSON files
- [ ] Migrate entities.json → Convex entities table (transform colon-delimited relationships to objects)
- [ ] Migrate facts_schema.json → Convex facts table (regenerate embeddings, reset scores)
- [ ] Migrate daily logs → conversations (group by day, generate summaries)
- [ ] Implement cron jobs in `convex/crons.ts`:
  - [ ] Daily relevance decay (`relevanceScore *= 0.99^days`, floor 0.1)
  - [ ] Weekly importance rerank (recalculate based on entity graph)
  - [ ] Daily garbage collection (expired scopes, old sync_log entries)
- [ ] Performance benchmarks: target < 300ms for `memory_recall`
- [ ] Create OpenClaw skill package (`skill/SKILL.md` + `skill/install.sh`)

#### Cron Jobs

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("relevance decay", { hourUTC: 3, minuteUTC: 0 },
  internal.crons.decay.runDecay);

crons.weekly("importance rerank", { dayOfWeek: "monday", hourUTC: 4, minuteUTC: 0 },
  internal.crons.rerank.runRerank);

crons.daily("scope cleanup", { hourUTC: 2, minuteUTC: 0 },
  internal.crons.cleanup.runCleanup);

export default crons;
```

#### Decay with Batched Processing

```typescript
// convex/crons/decay.ts
export const runDecay = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
    const facts = await ctx.db
      .query("facts")
      .withIndex("by_importance")
      .take(100);

    for (const fact of facts) {
      if (fact.timestamp < cutoff) {
        const days = (Date.now() - fact.timestamp) / (24 * 60 * 60 * 1000);
        const decayed = Math.max(0.1, fact.relevanceScore * Math.pow(0.99, days));
        await ctx.db.patch(fact._id, { relevanceScore: decayed });
      }
    }

    // Self-reschedule if more to process
    if (facts.length === 100) {
      await ctx.scheduler.runAfter(0, internal.crons.decay.runDecay);
    }
  },
});
```

#### Migration Script

```typescript
// scripts/migrate.ts
// 1. Parse entities.json → transform relationships → batch insert to Convex
// 2. Parse facts_schema.json → assign to "migration" scope → batch insert
// 3. Regenerate embeddings async (Convex enrichment pipeline handles this)
// 4. Parse daily logs → group by day → create conversation records
// 5. Validate referential integrity
// Run as: npx tsx scripts/migrate.ts
```

#### Success Criteria
- [ ] All MemoryLance entities imported with correct relationships
- [ ] All existing facts imported and enrichment pipeline processes them
- [ ] Cron jobs run on schedule (verified in Convex dashboard)
- [ ] `memory_recall` latency < 300ms (local) / < 500ms (remote)
- [ ] Skill package installs and configures MCP server

---

## Alternative Approaches Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Pinecone for vector search | Extra dependency; Convex native vector search sufficient for scale |
| Separate embeddings table | Adds join complexity; `v.optional(embedding)` works fine |
| Chained Convex actions for enrichment | More failure modes; single action is simpler and sufficient |
| Local Nomic embeddings | Slower than OpenAI API, and Convex actions can't run local models |
| Per-fact ACLs instead of scopes | Higher overhead; scope-based is cleaner per research |
| SSE transport for MCP | Deprecated; stdio is correct for local agent integration |
| ConvexClient (WebSocket) | Unnecessary for request/response pattern; ConvexHttpClient is lighter |

---

## Acceptance Criteria

### Functional Requirements
- [ ] Agent can store a fact and retrieve it semantically within 5 seconds
- [ ] Agent can search facts by full-text query with scope filtering
- [ ] Multiple agents share memory through team/project/public scopes
- [ ] Agent registration creates private scope automatically
- [ ] Conversation handoffs preserve context chain
- [ ] `memory_observe` returns immediately, enrichment runs async
- [ ] `memory_query_raw` provides escape hatch for direct Convex queries
- [ ] `memory_get_context` returns warm-start bundle for any topic

### Non-Functional Requirements
- [ ] `memory_recall` latency < 300ms (local LanceDB) / < 500ms (Convex fallback)
- [ ] `memory_store_fact` returns in < 100ms (enrichment is async)
- [ ] Sync daemon pulls changes within 30 seconds
- [ ] System handles 100K+ facts without degradation
- [ ] Works offline (local LanceDB serves cached data)

### Quality Gates
- [ ] All MCP tools testable via MCP Inspector
- [ ] Vitest unit tests for tool handlers with mocked Convex client
- [ ] Integration test: store → enrich → recall end-to-end
- [ ] Migration script validates data integrity post-import

---

## Edge Cases & Risks

### Edge Cases (from SpecFlow Analysis)
1. **Embedding not yet ready** — `memory_recall` may miss recently stored facts. Mitigation: fall back to full-text search for facts without embeddings.
2. **Cold start (empty LanceDB)** — First recall on new device goes to Convex. Mitigation: local-first with Convex fallback pattern.
3. **Scope permission denied** — Agent queries scope it's not a member of. Mitigation: filter scopes server-side, never expose unauthorized data.
4. **Concurrent entity upserts** — Two agents extract the same entity simultaneously. Mitigation: Convex mutations are serializable; second write will see first.
5. **query_raw injection** — Agent passes malicious filter to escape hatch. Mitigation: validate/sanitize table names and filter expressions, limit to read-only.

### Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenAI API rate limits | Enrichment delays | Batch embeddings, retry with backoff |
| Convex free tier limits | Service interruption | Monitor usage, upgrade tier if needed |
| LanceDB sync lag | Stale local results | 30s poll interval, Convex fallback |
| Entity extraction quality | Bad entity graph | GPT-4o-mini is good enough; upgrade model later |

---

## Dependencies & Prerequisites

- Convex account (free tier)
- OpenAI API key (for embeddings + entity extraction)
- Node.js 22+
- npm / TypeScript 5.7+
- Existing MemoryLance data files (for Phase 6 migration)

---

## Success Metrics

1. **Zero knowledge loss** — Retrieve a correction from 2 weeks ago
2. **Sub-300ms recall** — Semantic search returns in < 300ms locally
3. **Multi-agent sharing** — Agent B finds Agent A's discoveries without explicit sharing
4. **Cross-device sync** — Same memory on all 3 machines within 30 seconds
5. **Self-improving** — Frequently accessed facts rank higher over time

---

## References & Research

### Internal References
- Architecture plan: `PLAN.md`
- Research survey: `RESEARCH.md`
- Claude Code guidance: `CLAUDE.md`

### External References
- [Convex Schema Docs](https://docs.convex.dev/database/schemas)
- [Convex Vector Search](https://docs.convex.dev/search/vector-search)
- [Convex Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions)
- [MCP TypeScript SDK v1.26](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Server Build Guide](https://modelcontextprotocol.io/docs/develop/build-server)
- [LanceDB TypeScript Quickstart](https://docs.lancedb.com/quickstart)
- [OpenAI Embeddings API](https://platform.openai.com/docs/api-reference/embeddings)
- [Letta Multi-Agent Shared Memory](https://docs.letta.com/guides/agents/multi-agent-shared-memory)
- [FadeMem: Biologically-Inspired Forgetting](https://arxiv.org/html/2601.18642)
- [Collaborative Memory (ICML 2025)](https://arxiv.org/abs/2505.18279)
- [Graph-Based Agent Memory Taxonomy](https://arxiv.org/html/2602.05665)

### Related Work
- MemoryLance (predecessor): `~/clawd/memory/resources/memory-system-dev/`
- Context system plan: `~/clawd/memory/context-system-plan.md`
