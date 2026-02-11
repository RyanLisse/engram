# SimpleMem: Cross-Session Memory for LLM Agents

**Source:** https://github.com/aiming-lab/SimpleMem
**Paper:** https://arxiv.org/abs/2601.02553
**Tweet:** @HuaxiuYaoML, Feb 11, 2026
**Stars:** 2.8k | **Lab:** Salesforce AI Research / AIMING Lab (Huaxiu Yao)

---

## Why This Matters for Engram

SimpleMem is the current SOTA for cross-session agent memory. +64% over Claude-Mem on LoCoMo benchmark. Their three-stage pipeline directly maps to Engram's enrichment pipeline, and their compression strategy solves a problem we identified from ALMA research: **how to remember without drowning in context.**

---

## Core Architecture: Three-Stage Pipeline

### Stage 1: Semantic Structured Compression
- **Implicit semantic density gating** — filters redundant interaction content during LLM generation
- Converts raw dialogue into **compact memory units** — self-contained facts with resolved coreferences and absolute timestamps
- Each unit indexed through **three complementary representations** (multi-view indexing)

### Stage 2: Online Semantic Synthesis
- **Intra-session** process that runs during memory writes
- Consolidates related fragments into **unified abstract representations**
- Eliminates redundancy by merging semantically similar memories
- Maintains compact, coherent memory topology

### Stage 3: Intent-Aware Retrieval Planning
- Infers **search intent** from the query (not just keyword/vector match)
- Dynamically determines retrieval scope and query forms
- Enables **parallel multi-view retrieval**
- Token-efficient context construction

---

## Performance (LoCoMo-10 Benchmark, GPT-4.1-mini)

| System | Construction | Retrieval | Total | F1 Score |
|--------|-------------|-----------|-------|----------|
| A-Mem | 5140s | 797s | 5937s | 32.58% |
| Mem0 | 1351s | 583s | 1934s | 34.20% |
| LightMem | 98s | 577s | 676s | 24.63% |
| **SimpleMem** | **93s** | **388s** | **481s** | **43.24%** |

- **+26.4%** over Mem0 on F1
- **12.5× faster** end-to-end than A-Mem
- **51.3% faster retrieval** than Mem0

---

## Cross-Session Memory (New, Feb 2026)

+64% over Claude-Mem on long-horizon recall tasks.

### Features
- **Lifecycle management** — memories have birth, activation, decay, merge, death
- **Token-aware context injection** — stays within budget, picks highest-value memories
- **Memory provenance tracking** — every memory traces back to its source conversation
- **Auto decay / merge / pruning** — not just time-based decay, active consolidation

### How Cross-Session Works
1. At session end: compress session into memory units (Stage 1)
2. Merge with existing memory store (Stage 2 synthesis)
3. At next session start: intent-aware retrieval loads relevant context (Stage 3)

---

## Key Technical Details

### Multi-View Indexing (Three Layers)
Each memory unit is indexed through three complementary representations:
1. **Factual view** — What happened (events, decisions, outcomes)
2. **Temporal view** — When it happened (absolute timestamps, sequence)
3. **Semantic view** — What it means (embeddings for similarity search)

### Semantic Lossless Compression
The core innovation: compress memories **without losing semantic information.** Not lossy summarization — structured extraction that preserves all facts while removing dialogue noise, filler, and redundancy.

### Memory Lifecycle States
- **Active** — recently created or accessed
- **Dormant** — not accessed recently, but still searchable
- **Merged** — consolidated with similar memories
- **Pruned** — removed (below importance threshold + no access)

---

## Patterns to Extract for Engram

### P0: Three-Stage Enrichment (maps to our async pipeline)

Our current plan:
```
Store raw → Embed → Extract entities → Score → Update
```

SimpleMem's approach is better:
```
Store raw → Semantic compression (resolve references, extract facts) → 
  Synthesis (merge with existing similar facts) → 
  Multi-view index (factual + temporal + semantic)
```

**Implementation:** Add a **synthesis step** to our enrichment pipeline. After embedding, check for existing similar facts (cosine > 0.85). If found, merge rather than store duplicate. This is the `compress:consolidate` cron we planned, but done inline.

### P0: Token-Aware Context Injection

SimpleMem's retrieval doesn't just return top-K — it stays within a token budget. This is critical for warm starts.

```typescript
// memory_get_context enhancement
memory_get_context({
  topic: "Briefly architecture",
  maxTokens: 4000,  // budget for injection
  strategy: "importance_weighted"  // fill budget with highest-value facts first
})
```

**Why:** Without a budget, warm start injection can bloat context. With a budget, we always inject the most valuable memories that fit.

### P1: Multi-View Indexing

We currently plan one vector index. SimpleMem uses three views:

```typescript
// Enhanced facts schema
factualSummary: v.string(),    // "Ryan decided to use Convex for cloud sync"
temporalIndex: v.string(),     // "2026-02-11T20:00:00Z"
embedding: v.array(v.float64()), // semantic vector

// Three search strategies:
// 1. Full-text on factualSummary (keyword match)
// 2. Range query on temporalIndex (date-based)
// 3. Vector search on embedding (semantic similarity)
// Combined: hybrid search with re-ranking
```

### P1: Memory Lifecycle States

Add state machine to facts:
```typescript
lifecycleState: v.string(),  // "active" | "dormant" | "merged" | "archived" | "pruned"
mergedInto: v.optional(v.id("facts")),  // if merged, pointer to consolidated fact
```

Better than our binary approach (exists or decayed). Lifecycle states enable smarter garbage collection — don't delete, merge first.

### P1: Semantic Lossless Compression

When storing conversation-derived facts, don't just dump the raw text. Compress:
1. Resolve coreferences ("he" → "Ryan", "it" → "Convex")
2. Extract standalone facts (no dialogue noise)
3. Add absolute timestamps
4. Result: memory unit that makes sense without surrounding context

This could be a step in the sidecar extraction process.

### P2: Intent-Aware Retrieval

Don't just vector search. Infer what the agent actually needs:
- "What did we decide?" → search `factType: "decision"`, recent, high importance
- "What went wrong with X?" → search `factType: "error"`, entity-filtered
- "How does Y work?" → broad semantic search, prefer `factType: "observation"` or `"insight"`

Map query intent to search strategy automatically.

---

## Comparison: SimpleMem vs Engram's Current Plan

| Feature | SimpleMem | Engram (Current Plan) | Gap? |
|---------|-----------|----------------------|------|
| Compression | Semantic lossless (excellent) | Raw storage + async enrichment | **Add compression step** |
| Cross-session | ✅ Built-in | ✅ Via Convex sync | ✓ Covered |
| Multi-view indexing | 3 views (factual, temporal, semantic) | 1 view (vector only) + full-text | **Add temporal view** |
| Token-aware injection | ✅ Budget-based | Not planned | **Add token budgets** |
| Memory lifecycle | 4 states | Binary (exists/decayed) | **Add lifecycle states** |
| Multi-agent | ❌ Single agent | ✅ Scoped sharing | We win here |
| Emotional memory | ❌ | ✅ (from GIZIN) | We win here |
| Memory scopes | ❌ | ✅ | We win here |
| Intent-aware retrieval | ✅ | ❌ | **Add intent mapping** |
| Provenance tracking | ✅ | Partial (source field) | **Strengthen** |

---

## Related Work Mentioned

- **A-Mem** — Autonomous memory agent (slow but decent F1)
- **Mem0** — Popular open-source memory (we should also research)
- **LightMem** — Fast but low accuracy
- **Claude-Mem** — Claude's built-in memory (SimpleMem beats by 64%)
- **LoCoMo benchmark** — Long-Context Multi-session benchmark for memory evaluation
