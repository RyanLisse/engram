# Letta Patterns for Engram — Implementable Priorities

> Extracted from letta-deep-dive.md | 2026-02-11

---

## P0 — Must Have (Core Architecture)

### 1. Three-Tier Memory Hierarchy
**Pattern:** Core (in-context) → Recall (conversation) → Archival (vector-indexed long-term)
**Engram mapping:** Map to unified store with three **views** rather than three separate stores. Tag memories with tier + relevance score.
**Schema impact:** Add `tier` enum (core/recall/archival) and `relevance_score` float to memory items.

### 2. Memory-as-Tools
**Pattern:** LLM manages memory via explicit tool calls (core_memory_append, core_memory_replace, archival_memory_insert, archival_memory_search, conversation_search)
**Engram mapping:** Expose Engram operations as MCP tools. Agents call tools to read/write memory.
**Tools to implement:**
- `engram_core_read(agent_id, block_label)` 
- `engram_core_write(agent_id, block_label, content, mode="append"|"replace")`
- `engram_archive_store(content, tags[], scope)`
- `engram_archive_search(query, scope, top_k, strategy="hybrid")`
- `engram_recall_search(query, date_range?, agent_id?)`

### 3. Memory Blocks (Named, Sized, Mutable)
**Pattern:** Named text blocks with character limits, injected into system prompt
**Engram mapping:** `MemoryBlock` entity with label, value, limit, owner_agent_id, shared flag
**Improvement over Letta:** Support both free-text AND structured (JSON schema) blocks

### 4. Conversation Compaction
**Pattern:** Auto-summarize old messages when context fills, recursive summarization
**Engram mapping:** Background compaction job. Configurable trigger (token count threshold). Importance-aware — pin critical messages.
**Improvement over Letta:** Importance scoring so high-value messages survive compaction longer

### 5. send_message as Tool
**Pattern:** Agent response is a tool call, not default. Allows silent memory operations.
**Engram mapping:** Recommend this pattern in Engram's agent integration guide. Not an Engram feature per se, but a pattern to document.

---

## P1 — Should Have (Multi-Agent & Retrieval)

### 6. Shared Blocks for Multi-Agent Memory
**Pattern:** Same block attached to N agents. Eventually consistent. Last-write-wins.
**Engram mapping:** `shared: boolean` + `agent_ids: []` on MemoryBlock. Any attached agent can read/write.
**Improvement over Letta:** Add optimistic concurrency (version field). Notify agents of changes.

### 7. Hybrid Search (Vector + Keyword)
**Pattern:** Letta only does top-K cosine. We should do better.
**Engram mapping:** Implement hybrid retrieval: vector similarity + BM25 keyword + optional reranker. MMR for diversity.
**Schema impact:** Store both embeddings and full-text index on archival passages.

### 8. Cross-Agent Archival Search
**Pattern:** Letta silos archival per-agent. This is a gap.
**Engram mapping:** Archival memory has `scope` (private | shared | org-wide). Shared scopes searchable by multiple agents. Access control via agent permissions.

### 9. Proactive Memory Retrieval
**Pattern:** Don't wait for agent to search — auto-retrieve relevant memories based on current context.
**Engram mapping:** On each agent turn, run background retrieval against archival. Inject top results as "memory hints" in system prompt. Configurable per agent.

### 10. Memory Block Templates
**Pattern:** Reusable block configurations for consistent agent creation.
**Engram mapping:** `BlockTemplate` entity. Create agents from templates. Org-level template library.

---

## P2 — Nice to Have (Innovation)

### 11. Structured Memory Blocks
**Pattern:** Letta blocks are raw text. Fragile to parse.
**Engram mapping:** Optional JSON schema per block. Structured read/write tools: `engram_core_write(block, path="user.name", value="Alex")`. Validate on write.

### 12. Memory Importance Scoring & Decay
**Pattern:** Not in Letta. Assign importance to memories, decay over time unless reinforced.
**Engram mapping:** `importance: float` + `last_accessed: timestamp` + `access_count: int` on all memory items. Decay function configurable. High-importance items resist compaction.

### 13. Sleeptime Memory Consolidation
**Pattern:** Background agent that reorganizes memory between conversations.
**Engram mapping:** Cron job or event-triggered consolidation. Reviews recent conversations, promotes to core, deduplicates archival, builds connections.

### 14. Memory Diff & Audit Trail
**Pattern:** Letta has no versioning on blocks. 
**Engram mapping:** Version history on blocks. Diff between versions. Audit log: who wrote what when. Enables rollback.

### 15. Memory Graph (Unified Store)
**Pattern:** Instead of 3 separate stores, one knowledge graph with views.
**Engram mapping:** Long-term vision. Nodes = memory items. Edges = relationships (temporal, causal, entity). Core/Recall/Archival become query projections, not storage boundaries.

---

## Schema Sketch

```sql
-- Core: Memory Blocks (Letta-inspired + improvements)
CREATE TABLE memory_blocks (
    id UUID PRIMARY KEY,
    label VARCHAR NOT NULL,
    value TEXT DEFAULT '',
    limit_ INT DEFAULT 2000,
    schema JSONB,              -- P2: optional JSON schema
    version INT DEFAULT 1,     -- P1: optimistic concurrency
    shared BOOLEAN DEFAULT FALSE,
    template_id UUID,
    org_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Many-to-many: agents ↔ blocks
CREATE TABLE agent_blocks (
    agent_id UUID,
    block_id UUID,
    permissions VARCHAR DEFAULT 'rw',  -- P1: read/write/admin
    PRIMARY KEY (agent_id, block_id)
);

-- Archival: Passages with hybrid index
CREATE TABLE passages (
    id UUID PRIMARY KEY,
    text TEXT NOT NULL,
    embedding VECTOR(1536),
    importance FLOAT DEFAULT 0.5,     -- P2: importance scoring
    scope VARCHAR DEFAULT 'private',  -- P1: private/shared/org
    agent_id UUID,
    source_id UUID,
    tags JSONB,
    metadata_ JSONB,
    access_count INT DEFAULT 0,
    last_accessed TIMESTAMPTZ,
    created_at TIMESTAMPTZ
);

-- Full-text search index for hybrid retrieval
CREATE INDEX passages_fts ON passages USING gin(to_tsvector('english', text));

-- Recall: Messages  
CREATE TABLE messages (
    id UUID PRIMARY KEY,
    agent_id UUID,
    role VARCHAR,
    content TEXT,
    importance FLOAT DEFAULT 0.5,     -- P2: survives compaction
    pinned BOOLEAN DEFAULT FALSE,     -- P0: never compact
    compacted BOOLEAN DEFAULT FALSE,
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ
);

-- Audit trail (P2)
CREATE TABLE memory_audit (
    id UUID PRIMARY KEY,
    block_id UUID,
    agent_id UUID,
    action VARCHAR,  -- append/replace/delete
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ
);
```

---

## Implementation Order

```
Phase 1 (P0): Memory blocks + tools + compaction
  → Agents can read/write core memory, archive facts, search history
  
Phase 2 (P1): Shared blocks + hybrid search + cross-agent search
  → Multi-agent coordination, better retrieval quality
  
Phase 3 (P2): Structured blocks + importance scoring + consolidation + graph
  → Intelligence layer, self-organizing memory
```
