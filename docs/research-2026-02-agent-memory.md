# Agent Memory Systems Research -- February 2026 Update

Structured research findings for Engram architecture decisions. Covers new papers/systems, infrastructure updates (Convex, MCP, LanceDB), and competitive landscape.

Researched: 2026-02-11

---

## Table of Contents

1. [New Papers and Systems (Jan-Feb 2026)](#1-new-papers-and-systems-jan-feb-2026)
2. [Convex Platform Updates](#2-convex-platform-updates)
3. [MCP SDK Updates](#3-mcp-sdk-updates)
4. [LanceDB Updates](#4-lancedb-updates)
5. [Competitive Landscape](#5-competitive-landscape)
6. [Actionable Insights for Engram](#6-actionable-insights-for-engram)
7. [Sources](#7-sources)

---

## 1. New Papers and Systems (Jan-Feb 2026)

### 1.1 Landmark Survey: "Memory in the Age of AI Agents"

**Paper:** https://arxiv.org/abs/2512.13564 (Dec 2025, companion paper list actively maintained into Feb 2026)

The definitive survey paper organizing the entire field. Proposes a three-dimensional taxonomy that supersedes the old "short-term vs long-term" framing:

- **Forms**: Token-level (in-context), parametric (fine-tuned weights), latent (learned representations)
- **Functions**: Factual memory, experiential memory, working memory
- **Dynamics**: Formation (extraction), evolution (consolidation and forgetting), retrieval (access strategies)

**Key conversion pathways identified:**
- Episodic to semantic (consolidation)
- Explicit to implicit (parameter absorption)
- Individual to shared (multi-agent transfer)

**Engram relevance:** This taxonomy validates Engram's design of atomic facts (factual memory) with async enrichment (formation/evolution pipeline) and scope-based sharing (individual to shared conversion). The survey identifies multi-agent memory and memory automation as the two most important open frontiers -- exactly what Engram targets.

### 1.2 EverMemOS -- Memory Operating System (Jan 2026)

**Paper:** https://arxiv.org/abs/2601.02163
**Commercial:** https://evermind.ai/

Three-phase memory lifecycle inspired by neuroscience "engram" concept (same name as our project):

1. **Episodic Trace Formation**: Dialogue streams convert to "MemCells" capturing episodic traces, atomic facts, and time-bounded "Foresight" signals
2. **Semantic Consolidation**: MemCells organize into thematic "MemScenes", distilling stable semantic structures and updating user profiles
3. **Reconstructive Recollection**: MemScene-guided agentic retrieval composes necessary and sufficient context

**Results:** 92.3% accuracy on LoCoMo, 82% on LongMemEval-S (current SOTA on these benchmarks).

**Engram relevance:** The MemCell/MemScene hierarchy maps directly to Engram's facts/conversations structure. The key insight is *thematic grouping* during consolidation -- Engram's entity extraction pipeline could produce similar MemScene-like clusters by grouping facts sharing common entities. Consider adding a `themes` or `scenes` table that aggregates related facts.

### 1.3 MAGMA -- Multi-Graph Agentic Memory (Jan 2026)

**Paper:** https://arxiv.org/abs/2601.03236

Core innovation: Represents each memory item across **four orthogonal graphs**:

| Graph | What It Captures | Retrieval Use |
|-------|-----------------|---------------|
| Semantic | Meaning similarity | Standard vector search |
| Temporal | Time relationships | "What happened before/after X?" |
| Causal | Cause-effect chains | "Why did X happen?" |
| Entity | Named entity connections | "What do we know about X?" |

Retrieval is formulated as **policy-guided traversal** over these graphs. An intent-aware query mechanism selects relevant graph views, traverses them independently, and fuses results.

**Results:** 0.7 overall judge score on LoCoMo, outperforming baselines by 18.6% to 45.5%.

**Engram relevance:** Engram already has semantic (vector search) and entity graphs. The temporal and causal dimensions are gaps. Consider:
- Adding `temporal_links` (before/after/during) to the facts table
- Adding `causal_links` (caused_by/led_to) -- could be auto-extracted during enrichment
- Query routing that selects which index/graph to traverse based on query intent

### 1.4 AgeMem -- Unified LTM/STM Management (Jan 2026)

**Paper:** https://arxiv.org/abs/2601.01885

Unifies long-term and short-term memory management as tool-based actions within the agent's own policy. Memory operations are not external heuristics -- the agent learns *when* and *what* to remember via reinforcement learning.

**Memory tools exposed:** ADD, UPDATE, DELETE, RETRIEVE, SUMMARY, FILTER

**Training approach:** Three-stage progressive reinforcement learning with step-wise GRPO (Group Relative Policy Optimization) to handle sparse/discontinuous rewards from memory operations.

**Results:** On Qwen2.5-7B, AgeMem achieves 41.96 avg vs 37.14 for Mem0. Gap widens on smaller models (54.31 vs 44.70 on Qwen3-4B).

**Engram relevance:** AgeMem's tool set almost exactly mirrors Engram's 8 MCP tools. The key insight is that agents should learn *when* to call memory tools, not just have them available. This validates Engram's approach of exposing atomic primitives. The SUMMARY and FILTER operations could be added as additional MCP tools (`memory_summarize`, `memory_prune`).

### 1.5 MemRL -- Reinforcement Learning on Episodic Memory (Jan 2026)

**Paper:** https://arxiv.org/abs/2601.03192
**GitHub:** https://github.com/anvanster/tempera

Key innovation: **Two-Phase Retrieval** that separates semantic relevance from learned utility:

1. **Phase 1**: Standard semantic similarity retrieval (candidate generation)
2. **Phase 2**: Learned Q-value scoring (utility selection) -- picks memories that *actually lead to success*, not just similar ones

Learns "utility scores" via environmental feedback without modifying the base LLM (frozen backbone). The stability-plasticity dilemma is solved by keeping the model fixed while evolving memory utility scores.

**Engram relevance:** This directly improves on Engram's importance scoring. Currently Engram uses a static multi-factor formula. MemRL shows that importance should be *learned from outcomes*. Consider:
- Adding an `outcome_score` field to facts that tracks whether retrieved facts led to successful task completion
- Two-phase retrieval: first vector search for candidates, then re-rank by learned utility
- This could be implemented as a Convex action that re-ranks after initial vector search

### 1.6 SimpleMem -- Semantic Lossless Compression (Jan 2026)

**Paper:** https://arxiv.org/abs/2601.02553
**GitHub:** https://github.com/aiming-lab/SimpleMem

Three-stage pipeline for maximizing information density:

1. **Semantic Structured Compression**: Distills unstructured interactions into compact, multi-view indexed memory units
2. **Online Semantic Synthesis**: Intra-session, instantly integrates related context into unified abstract representations (eliminates redundancy)
3. **Intent-Aware Retrieval Planning**: Infers search intent to dynamically determine retrieval scope

**Results:** 26.4% F1 improvement on LoCoMo while reducing token consumption by up to 30x.

**Engram relevance:** The "online semantic synthesis" stage is a missing piece in Engram. Currently facts accumulate without consolidation. Engram should add a scheduled consolidation step (Convex cron) that merges related facts into higher-level abstractions. The intent-aware retrieval could inform `memory_recall`'s search strategy.

### 1.7 LightMem -- Three-Stage Memory (Accepted ICLR 2026)

**Paper:** https://arxiv.org/abs/2510.18866
**GitHub:** https://github.com/zjunlp/LightMem

Inspired by the Atkinson-Shiffrin model:

1. **Sensory Memory**: Rapidly filters irrelevant information through lightweight compression, groups by topic
2. **Short-Term Memory**: Consolidates topic-based groups, organizes and summarizes for structured access
3. **Long-Term Memory**: Offline "sleep-time" update decouples consolidation from online inference

**Results:** Up to 7.7% accuracy improvement while reducing token usage by 38x and API calls by 30x.

**Engram relevance:** The "sleep-time update" pattern maps perfectly to Convex cron jobs. The `rerank` weekly cron could perform LightMem-style offline consolidation -- merging related facts, updating importance scores, and pruning redundancies without blocking agent operations.

### 1.8 Active Context Compression / Focus Agent (Jan 2026)

**Paper:** https://arxiv.org/abs/2601.07190

The "Focus" architecture gives agents autonomy over when to compress context. Inspired by slime mold (Physarum polycephalum) exploration strategies.

Key behaviors:
- Agent autonomously decides when to consolidate key learnings into a persistent "Knowledge" block
- Actively prunes raw interaction history after consolidation
- 22.7% net token savings across experiments

**Engram relevance:** The "consolidate then prune" pattern should inform Engram's `memory_observe` flow. After enough observations accumulate on a topic, trigger automatic consolidation into a summary fact and mark originals as consolidated (lower importance, but not deleted).

### 1.9 Collaborative Memory -- Multi-Agent Access Control (May 2025)

**Paper:** https://arxiv.org/abs/2505.18279

Directly addresses Engram's multi-agent sharing challenge:

- **Two memory tiers**: Private fragments (single user) and shared fragments (selectively shared)
- **Access control via bipartite graphs**: Links users, agents, and resources with asymmetric, time-evolving permissions
- **Immutable provenance**: Each memory fragment carries contributing agents, accessed resources, and timestamps

**Engram relevance:** This is the most directly relevant paper for Engram's scope-based access control. Key additions to consider:
- Add provenance tracking to facts: `contributingAgents`, `accessedResources`, `provenanceTimestamp`
- Bipartite graph model for permissions is more flexible than Engram's current flat scope model
- Time-evolving permissions: scopes should support `validFrom`/`validUntil` fields

### 1.10 Memory as a Service (MaaS) Position Paper (Jun 2025)

**Paper:** https://arxiv.org/abs/2506.22815

Proposes decoupling memory from being "attached to agents" and treating it as an independently callable, dynamically composable service. Key argument: current memory creates "memory silos" that impede cross-entity collaboration.

**Engram relevance:** Engram's MCP server architecture already implements MaaS -- memory is a service that any agent can call. This paper validates the architectural decision. The key refinement: memory should be composable (agents should be able to create ephemeral memory views by combining scopes dynamically, not just query fixed scopes).

### 1.11 Memory Decay and Forgetting Research

**Key papers:**
- ACT-R-inspired memory for agents (HAI 2025): https://dl.acm.org/doi/10.1145/3765766.3765803
- FadeMem: Teaching agents to forget (2025-2026)

**Latest findings on decay mechanisms:**
- Vector-based activation incorporating temporal decay, semantic similarity, and probabilistic noise
- ACT-R base-level activation: combines historical access patterns with temporal decay
- Differential decay: important memories (frequently accessed, emotionally significant, semantically relevant) decay slower
- Specific decay factor: 0.995 per hour (compared to Engram's planned 0.99 per day)
- Forgetting framed as adaptive feature: prevents cognitive overload, maintains relevance, enables efficient generalization

**Engram relevance:** Engram's planned decay (0.99^days, floor 0.1) is reasonable but could be more sophisticated:
- Consider access-pattern-weighted decay (memories accessed more recently decay slower)
- Differential decay rates by fact type (decisions decay slower than observations)
- The 0.995/hour rate from some implementations is far too aggressive for a persistent memory system -- Engram's daily rate is better for long-term knowledge

---

## 2. Convex Platform Updates

### 2.1 Convex Agent Component

**Docs:** https://docs.convex.dev/agents
**npm:** @convex-dev/agent

Convex has released an official Agent component that overlaps significantly with Engram's planned architecture:

**What it provides:**
- Thread-based message persistence with automatic LLM context management
- Built-in hybrid vector + text search for messages
- Agent-to-agent thread handoffs
- Per-user message search across threads (`searchOtherThreads: true`)
- Configurable context window: control recent message count, enable/disable text/vector search independently
- Text embedder integration for automatic embedding generation
- Agent playground for debugging prompts and context

**What it does NOT provide (Engram's differentiation):**
- Atomic fact storage (it stores messages, not extracted facts)
- Entity extraction and knowledge graph
- Multi-agent scope-based access control
- Memory decay and importance scoring
- Async enrichment pipeline (entity extraction, summarization)
- Cross-device local sync (LanceDB)
- Memory consolidation and compression

**Engram strategy:** Use the Convex Agent component for message-level persistence and thread management. Build Engram's fact/entity/scope layer on top. The Agent component handles the "conversation memory" tier while Engram handles the "knowledge memory" tier.

### 2.2 Durable Agents Component

**Docs:** https://www.convex.dev/components/durable-agents

A component for building agents that survive failures and restarts. Provides an async tool loop that runs indefinitely.

**Engram relevance:** Could be useful for Engram's enrichment pipeline -- a durable agent that processes the enrichment queue (embeddings, entity extraction, importance scoring) and survives server restarts.

### 2.3 Vector Search Status

**Docs:** https://docs.convex.dev/search/vector-search

Current state:
- Vector search is **only available in Convex actions** (not queries or mutations)
- Supports filter fields within vector indexes for fast pre-filtering
- Consistent and fully up-to-date (write-then-immediately-read works)
- Defined via `vectorIndex()` in schema

**Limitation for Engram:** Since vector search requires actions, the `memory_recall` tool must be implemented as a Convex action, not a query. This adds latency but ensures consistency.

---

## 3. MCP SDK Updates

### 3.1 TypeScript SDK Status

**GitHub:** https://github.com/modelcontextprotocol/typescript-sdk
**npm:** @modelcontextprotocol/sdk

**Current state:**
- v1.x is the recommended production version
- **v2 stable release anticipated Q1 2026** -- imminent
- v1.x will receive bug fixes and security updates for 6+ months after v2 ships

**Key features:**
- Streamable HTTP transport (recommended over legacy HTTP+SSE)
- Stateless and stateful server patterns
- Session management with IDs and resumability
- Multi-node deployment support
- Middleware packages for Express, Hono, Node.js HTTP

**Engram strategy:** Build on v1.x now with awareness that v2 is coming. Use Streamable HTTP transport. The server patterns doc covers exactly the patterns Engram needs for its MCP server.

### 3.2 MCP Protocol Improvements

**Latest spec (June 2025):**
- **Structured tool outputs**: Tools can return structured data, not just text -- useful for `memory_recall` returning typed fact objects
- **OAuth-based authorization**: Relevant for multi-agent auth in Engram
- **Elicitation**: Server-initiated user interactions (could prompt user for clarification during memory operations)
- **Server discovery via .well-known URLs**: Engram's MCP server could advertise itself automatically

**MCP Apps (new):**
- Tools can now return interactive UI components (dashboards, forms, visualizations)
- Could enable a memory browser UI rendered directly in the conversation

**MCP Registry:**
- Launched preview in Sep 2025, progressing toward GA
- Engram could be registered as a discoverable MCP server

### 3.3 FastMCP Framework

**GitHub:** https://github.com/punkpeye/fastmcp

A community TypeScript framework for building MCP servers that simplifies boilerplate. Worth evaluating as an alternative to raw SDK usage for Engram's MCP server.

---

## 4. LanceDB Updates

### 4.1 SDK Direction

- Consolidating around **Rust core** with language bindings
- TypeScript SDK async API is the forward path (sync API will become a wrapper)
- Focus on feature parity across language SDKs

### 4.2 Recent TypeScript Features

- **Session-based cache control**: Customize caching per session (useful for multi-agent scenarios where each agent has different access patterns)
- **Multi-vector support (JS)**: Can now index multiple vector columns per table
- **Binary vector support**: Native binary vector indexing and querying (64x storage reduction for compatible use cases)
- **Automatic conflict resolution**: Update operations support retries with exponential backoff for concurrent writes
- **Embedding function improvements**: Fixed issues with `createTable()` and `mergeInsert` for tables with registered embedding functions

### 4.3 Index Improvements

- **IVF_PQ float64 support**: Previously limited to float16/32
- **GPU-accelerated IVF-PQ indexing**: 10x faster index building
- **Full-text search on string arrays**: Enables multi-value keyword search
- **Hybrid search consistency fix**: Distance values now consistent between hybrid and standalone vector search

### 4.4 Engram-Relevant Patterns

**For local sync:**
- Use async API (forward-compatible)
- IVF_PQ index for the 1536-dim embedding column (good balance of speed and recall)
- Session-based caching: each agent session gets its own cache config
- Multi-vector support could enable storing both content embeddings and entity embeddings per fact

**For offline fallback:**
- LanceDB's embedded mode works offline by default
- Sync daemon should use `mergeInsert` for conflict-free updates from Convex
- Binary vectors could be used for a fast pre-filter index alongside full float32 embeddings

---

## 5. Competitive Landscape

### 5.1 Mem0 (v1.0.0 Released)

**Website:** https://mem0.ai
**Paper:** https://arxiv.org/abs/2504.19413
**GitHub:** https://github.com/mem0ai/mem0

**Latest developments:**
- v1.0.0 released with API modernization and improved vector store support
- **Graph Memory** (Jan 2026): Combines vector-based semantic search with optional graph memory for entity relationships
- **OpenMemory MCP Server**: Local-first memory server for coding agents (Cursor, VS Code, JetBrains)
- AWS integration: Mem0 + ElastiCache + Neptune Analytics for enterprise deployments
- **Performance**: 26% accuracy improvement over OpenAI Memory on LOCOMO, 91% faster responses than full-context, 90% lower token usage

**OpenMemory MCP Server details:**
- Runs entirely on local machine (nothing goes to cloud)
- Auto-captures coding preferences, patterns, and setup
- Groups memories into types: user_preferences, implementation, troubleshooting, component_context, project_overview, incident_rca
- Per-project memory scoping

**Engram differentiation from Mem0:**
- Mem0 is primarily single-agent with optional sharing; Engram is multi-agent-first
- Mem0's graph memory is optional add-on; Engram's entity graph is core
- Mem0's OpenMemory is local-only; Engram syncs cloud (Convex) and local (LanceDB)
- Mem0 lacks structured scope-based access control
- Mem0 lacks conversation threading and handoff context

### 5.2 A-MEM (Feb 2025, actively maintained)

**Paper:** https://arxiv.org/abs/2502.12110
**GitHub:** https://github.com/agiresearch/A-mem

Zettelkasten-inspired memory system:
- Each memory stored as a "note" with contextual descriptions, keywords, tags
- Link generation: LLM determines whether connections should be established between memories
- "Box" concept: Related memories interconnected through similar contextual descriptions
- Memory evolution: New memories trigger updates to existing memory attributes

**Engram vs A-MEM:**
- A-MEM's note structure is similar to Engram's facts with entity links
- A-MEM uses LLM for link generation (expensive); Engram plans cheaper entity extraction
- A-MEM lacks multi-agent support, scoping, or decay mechanisms
- A-MEM's "box" concept could inform Engram's thematic grouping (similar to EverMemOS MemScenes)

### 5.3 LightMem (Accepted ICLR 2026)

See Section 1.7 above. Key competitive position: LightMem is a research system, not a production framework. Engram can adopt its three-stage architecture pattern while providing the production infrastructure (Convex, MCP, multi-agent) that LightMem lacks.

### 5.4 EverMemOS / EverMind (Jan 2026)

See Section 1.2 above. EverMind has launched a commercial platform (EverMemOS Cloud Service) with API access. They are a direct competitor in the "memory infrastructure" space, but focused on single-agent use cases with commercial API, not open-source multi-agent systems.

### 5.5 Emerging Category: Memory MCP Servers

Multiple projects now provide memory as MCP servers:
- **Mem0 OpenMemory MCP**: Local-first, coding-focused
- **MemoryLance MCP**: Community project (our previous system)
- **mem0-mcp** (community): https://github.com/coleam00/mcp-mem0
- **Supermemory**: Another MCP memory server appearing in tool registries

This validates Engram's MCP server approach but means the space is getting crowded. Engram's differentiation must be the multi-agent, scope-based, entity-rich architecture.

---

## 6. Actionable Insights for Engram

### 6.1 Architecture Enhancements (Priority Order)

**HIGH PRIORITY:**

1. **Adopt Convex Agent component for thread management** -- Do not rebuild what Convex provides. Use @convex-dev/agent for message persistence and thread handoffs. Build Engram's fact/entity/scope layer on top of it.

2. **Add memory consolidation (SimpleMem/LightMem pattern)** -- Implement a weekly Convex cron that:
   - Groups related facts by shared entities and embedding similarity
   - Generates summary facts from clusters (consolidation)
   - Marks originals as consolidated (lower importance, kept for provenance)
   - This is the biggest gap vs. current SOTA systems

3. **Implement two-phase retrieval (MemRL pattern)** -- After vector search returns candidates in `memory_recall`, re-rank by learned utility (not just static importance formula). Track whether retrieved facts led to successful outcomes.

4. **Add temporal and causal graph dimensions (MAGMA pattern)** -- Extend facts with `temporal_links` and `causal_links` fields. Implement query routing that selects semantic vs temporal vs causal vs entity graph based on query intent classification.

**MEDIUM PRIORITY:**

5. **Enhance provenance tracking (Collaborative Memory pattern)** -- Add `contributingAgents[]`, `accessedResources[]`, and `provenanceTimestamp` to facts schema. Enables audit trail and fine-grained access control.

6. **Add two new MCP tools** -- `memory_summarize` (consolidate facts on a topic) and `memory_prune` (agent-initiated cleanup of stale facts). These match AgeMem's SUMMARY and FILTER tools.

7. **Implement differential decay** -- Instead of flat 0.99^days, vary decay rate by fact type: decisions (0.998^days), errors (0.995^days), observations (0.99^days), notes (0.985^days).

8. **Add composable scope views** -- Let agents create ephemeral scope combinations for specific queries (e.g., "search my private + team project-alpha scopes together"). Aligns with MaaS position paper.

**LOWER PRIORITY:**

9. **Binary vector pre-filter index in LanceDB** -- Use LanceDB's new binary vector support for fast candidate pre-filtering before full float32 similarity search. Reduces local search latency.

10. **MCP structured tool outputs** -- Return typed objects from `memory_recall` instead of text. Leverage the MCP spec's structured output capability for richer agent integration.

11. **MCP server discovery** -- Implement `.well-known` URL for Engram's MCP server so agents can auto-discover it.

### 6.2 Schema Additions

Based on research findings, consider these schema extensions:

```typescript
// New fields for facts table
temporal_links: v.optional(v.array(v.object({
  targetFactId: v.id("facts"),
  relation: v.union(v.literal("before"), v.literal("after"), v.literal("during"), v.literal("caused_by"), v.literal("led_to")),
  confidence: v.float64(),
}))),
consolidated_into: v.optional(v.id("facts")),  // points to summary fact
is_consolidation: v.optional(v.boolean()),       // true for summary facts
contributing_agents: v.optional(v.array(v.string())),
outcome_score: v.optional(v.float64()),          // MemRL-style utility tracking

// New table: themes (EverMemOS MemScenes equivalent)
themes: defineTable({
  name: v.string(),
  description: v.string(),
  factIds: v.array(v.id("facts")),
  entityIds: v.array(v.id("entities")),
  scope: v.string(),
  importance: v.float64(),
  lastUpdated: v.float64(),
  embedding: v.array(v.float64()),  // 1536-dim
}).vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 1536 }),
```

### 6.3 Key Research Gaps to Watch

1. **ICLR 2026 MemAgents Workshop** -- Will produce new research specifically on memory for agentic systems. Track proceedings when published.
2. **MCP v2 release** -- Anticipated Q1 2026. May change tool registration patterns.
3. **Multi-agent memory benchmarks** -- Current benchmarks (LoCoMo, LongMemEval) test single-agent memory. No standard benchmark yet for multi-agent memory sharing quality.
4. **RL-trained memory policies** -- AgeMem and MemRL show RL can improve memory decisions. No production-ready implementation yet for MCP-based systems.

### 6.4 Revised Priority Assessment

The research landscape has shifted since Engram's initial planning:

| Original Assumption | Updated Understanding |
|---------------------|----------------------|
| Flat fact storage is sufficient | Hierarchical memory (facts -> themes/scenes -> knowledge) is SOTA |
| Static importance formula works | Learned utility scores from outcomes significantly outperform |
| Scope-based access is novel | Collaborative Memory and MaaS papers validate but also refine this approach |
| LanceDB sync is differentiating | Local-first with cloud sync remains valuable but Mem0 OpenMemory also does local-first |
| 8 MCP tools cover all cases | AgeMem suggests SUMMARY and FILTER/PRUNE tools should be added (10 tools total) |
| Daily decay is sufficient | Differential decay by fact type and access-weighted decay are improvements |
| Entity extraction is nice-to-have | MAGMA shows multi-graph (semantic + temporal + causal + entity) is a major performance differentiator |

---

## 7. Sources

### Papers

- [Memory in the Age of AI Agents (Survey)](https://arxiv.org/abs/2512.13564) -- Dec 2025
- [EverMemOS: Self-Organizing Memory Operating System](https://arxiv.org/abs/2601.02163) -- Jan 2026
- [MAGMA: Multi-Graph based Agentic Memory Architecture](https://arxiv.org/abs/2601.03236) -- Jan 2026
- [AgeMem: Agentic Memory for Unified LTM/STM](https://arxiv.org/abs/2601.01885) -- Jan 2026
- [MemRL: Self-Evolving Agents via RL on Episodic Memory](https://arxiv.org/abs/2601.03192) -- Jan 2026
- [SimpleMem: Efficient Lifelong Memory](https://arxiv.org/abs/2601.02553) -- Jan 2026
- [LightMem: Lightweight Memory-Augmented Generation](https://arxiv.org/abs/2510.18866) -- ICLR 2026
- [Active Context Compression / Focus Agent](https://arxiv.org/abs/2601.07190) -- Jan 2026
- [A-MEM: Agentic Memory](https://arxiv.org/abs/2502.12110) -- Feb 2025
- [Collaborative Memory: Multi-User Memory Sharing](https://arxiv.org/abs/2505.18279) -- May 2025
- [Memory as a Service (MaaS)](https://arxiv.org/abs/2506.22815) -- Jun 2025
- [Mem0: Production-Ready Long-Term Memory](https://arxiv.org/abs/2504.19413) -- Apr 2025
- [Human-Like Remembering and Forgetting (ACT-R)](https://dl.acm.org/doi/10.1145/3765766.3765803) -- 2025
- [ICLR 2026 MemAgents Workshop Proposal](https://openreview.net/pdf?id=U51WxL382H)

### Infrastructure

- [Convex Agent Component Docs](https://docs.convex.dev/agents)
- [Convex Durable Agents](https://www.convex.dev/components/durable-agents)
- [Convex Vector Search Docs](https://docs.convex.dev/search/vector-search)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Protocol Roadmap](https://modelcontextprotocol.io/development/roadmap)
- [MCP Next Version Update](https://modelcontextprotocol.info/blog/mcp-next-version-update/)
- [LanceDB Changelog](https://docs.lancedb.com/changelog/changelog)
- [LanceDB TypeScript API](https://lancedb.github.io/lancedb/js/globals/)
- [LanceDB Hybrid Search Guide](https://blog.lancedb.com/hybrid-search-rag-for-real-life-production-grade-applications-e1e727b3965a/)

### Competitive

- [Mem0 Platform](https://mem0.ai/)
- [Mem0 OpenMemory MCP](https://mem0.ai/openmemory)
- [Mem0 Graph Memory (Jan 2026)](https://mem0.ai/blog/graph-memory-solutions-ai-agents)
- [A-MEM GitHub](https://github.com/agiresearch/A-mem)
- [SimpleMem GitHub](https://github.com/aiming-lab/SimpleMem)
- [LightMem GitHub](https://github.com/zjunlp/LightMem)
- [EverMind Platform](https://evermind.ai/)
- [Agent Memory Paper List (maintained)](https://github.com/Shichun-Liu/Agent-Memory-Paper-List)
- [Awesome AI Memory](https://github.com/IAAR-Shanghai/Awesome-AI-Memory)
- [FastMCP Framework](https://github.com/punkpeye/fastmcp)
