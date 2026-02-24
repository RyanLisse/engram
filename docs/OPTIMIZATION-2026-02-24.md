# Engram Optimization Plan — Feb 24, 2026

Based on latest memory-for-agents research (Mem0, Zep, Letta, Anthropic Memory, Cognee, GenAITech market analysis, MarkTechPost architecture patterns).

## TL;DR

Engram already has a strong foundation (scoped facts, entity graph, temporal links, hierarchical recall, observation pipeline). The gaps are in **retrieval quality**, **temporal intelligence**, and **memory economics**. These 7 optimizations close those gaps.

---

## 1. 🔴 Hybrid Retrieval: KV + Vector + Graph (from Mem0)

**Gap:** Engram's recall does hybrid text+vector, but lacks a **KV store for explicit facts** (preferences, rules, profile data).

**What Mem0 does:** Three-store architecture — KV for deterministic recall ("Ryan prefers Bun over npm"), vector for fuzzy semantic, graph for relationship traversal.

**Optimization:**
- Add a `key_value_facts` table (or use `system_config` pattern) for **deterministic facts** that should never require similarity search
- Schema: `{ key: string, value: string, scopeId, agentId, updatedAt }`
- On `recall`, check KV first (exact match on entities/keywords), then fall through to hybrid
- On `store_fact`, auto-classify: if fact contains "prefers", "always", "never", "rule:" → also write to KV

**Impact:** Eliminates false negatives on explicit preferences. Sub-5ms for deterministic recalls.

```typescript
// New table in schema.ts
key_value_facts: defineTable({
  key: v.string(),        // normalized: "ryan.preference.package_manager"
  value: v.string(),      // "bun"
  factId: v.id("facts"),  // backlink to full fact
  scopeId: v.id("memory_scopes"),
  agentId: v.string(),
  updatedAt: v.number(),
}).index("by_key", ["key"]).index("by_scope", ["scopeId"])
```

---

## 2. 🔴 Episodic Memory / Temporal Grouping (from Zep)

**Gap:** Engram has `temporalLinks` on facts but no **episode abstraction**. Facts are atoms without session-level narrative.

**What Zep does:** Groups interactions into episodes → summarizes into durable memory → retrieves by time + relevance + recency.

**Optimization:**
- Add an `episodes` table: groups of facts within a time window that form a coherent narrative
- Auto-create episodes from observation sessions (you already have `observation_sessions`)
- Each episode gets a summary embedding for coarse retrieval
- Recall can first match episodes, then drill into constituent facts

```typescript
episodes: defineTable({
  scopeId: v.id("memory_scopes"),
  agentId: v.string(),
  startTime: v.number(),
  endTime: v.number(),
  factIds: v.array(v.id("facts")),
  summary: v.string(),
  embedding: v.optional(v.array(v.float64())),
  importance: v.float64(),
  tags: v.array(v.string()),
}).index("by_scope_time", ["scopeId", "startTime"])
  .vectorIndex("episode_search", {
    vectorField: "embedding",
    dimensions: 1024,
    filterFields: ["scopeId"],
  })
```

**Impact:** Enables "what happened last Tuesday?" queries. Reduces retrieval noise by matching at episode granularity first.

---

## 3. 🟡 Intent-Aware Retrieval (from Mem0)

**Gap:** Current recall treats all queries the same. A question ("what does Ryan think about X?") should retrieve differently than a command ("store that Ryan likes X").

**Optimization:**
- Add query intent classification to `recall` entry point (cheap, regex + keyword based):
  - `lookup`: exact entity/fact retrieval → prioritize KV + entity search
  - `explore`: open-ended → prioritize vector + hierarchical traversal  
  - `temporal`: time-based → prioritize episode search + recency weighting
  - `relational`: about connections → prioritize graph traversal
- Route to different retrieval strategies based on intent

```typescript
function classifyIntent(query: string): "lookup" | "explore" | "temporal" | "relational" {
  if (/^(what is|who is|what does|preference|rule)/i.test(query)) return "lookup";
  if (/\b(when|last|yesterday|today|this week|timeline)\b/i.test(query)) return "temporal";
  if (/\b(related|connected|depends|works with|between)\b/i.test(query)) return "relational";
  return "explore";
}
```

**Impact:** 20-30% relevance improvement by routing queries to the right retrieval path.

---

## 4. 🟡 Memory Economics / Token Budget (from GenAITech analysis)

**Gap:** No token accounting. Memory injection can silently blow up context windows.

**What the market says:** Memory is now metered infrastructure. Google Vertex charges per-session. Re-deriving context is expensive — the whole point of memory is token savings.

**Optimization:**
- Track `tokenEstimate` on every fact (approximate: `content.length / 4`)
- `get_context` and `recall` should return total token estimate
- Add a `tokenBudget` parameter to recall: "give me the best memories that fit in N tokens"
- Log token savings: `tokens_saved = (full_history_tokens - memory_injected_tokens)`

```typescript
// Add to recall response
{
  facts: [...],
  recallId: "...",
  tokenEstimate: 2340,    // total tokens of returned facts
  tokenBudget: 4000,      // requested budget (if set)
  tokensUsed: 2340,       // actual usage
}
```

**Impact:** Prevents context bloat. Enables cost tracking per-agent per-scope.

---

## 5. 🟢 Forget Score + Active Forgetting (from ALMA — already partially implemented)

**Gap:** `forgetScore` field exists in schema but no active forgetting pipeline.

**What Letta/Mem0 do:** Explicit memory editing — agents can delete/update/merge. Not just decay.

**Optimization:**
- Implement a `forget_pipeline` cron (already have crons infrastructure):
  1. Facts with `forgetScore > 0.8` + `accessedCount < 2` + `age > 30 days` → archive
  2. Facts with contradicting newer facts (`supersededBy` set) → merge or archive
  3. Background observations that were never accessed → compress into episode summaries
- Add `memory_forget` MCP tool: explicit agent-driven forgetting

**Impact:** Keeps memory lean. Currently facts accumulate forever.

---

## 6. 🟢 Emotional Memory Weighting (already in schema, needs activation)

**Gap:** `emotionalContext` and `emotionalWeight` fields exist but aren't used in retrieval scoring.

**Research backing:** GIZIN pattern — emotionally tagged memories resist decay and rank higher in retrieval. "That time production went down" should be more memorable than "updated package.json".

**Optimization:**
- In `rank-candidates.ts`, add emotional weight boost:
  ```typescript
  const emotionalBoost = (fact.emotionalWeight ?? 0) * 0.15;
  finalScore = baseScore * (1 + emotionalBoost);
  ```
- In `observe`, auto-detect emotional context from content keywords (frustrated, proud, critical, urgent, celebration)

**Impact:** Better recall of significant events. Aligns with how human memory actually works.

---

## 7. 🟢 Vault Index as Retrieval Anchor (PageIndex pattern)

**Gap:** `hierarchical-recall.ts` is implemented but the vault index (`vault-index.md`) is a flat file, not a proper hierarchical tree.

**What PageIndex shows:** Tree traversal (98.7% accuracy) > vector search for structured knowledge.

**Optimization:**
- Generate a hierarchical vault index: scope → entity type → entity → facts
- Use this as the first traversal layer in hierarchical recall
- Cache the index in Convex (rebuild on fact mutations via `memory_events`)

**Impact:** Faster, more accurate retrieval for known-entity queries.

---

## Priority Order

| # | Optimization | Effort | Impact | Priority |
|---|-------------|--------|--------|----------|
| 1 | KV store for deterministic facts | Medium | High | 🔴 Do first |
| 4 | Token budget on recall | Small | High | 🔴 Do first |
| 3 | Intent-aware retrieval routing | Small | Medium | 🟡 Next |
| 2 | Episodic memory / episodes table | Large | High | 🟡 Next |
| 5 | Active forgetting pipeline | Medium | Medium | 🟢 Soon |
| 6 | Emotional weight in ranking | Small | Low | 🟢 Soon |
| 7 | Hierarchical vault index | Medium | Medium | 🟢 Soon |

---

## Market Context

- **Agent memory market**: $6.27B (2025) → $28.45B (2030), 35% CAGR
- **Key trend**: Memory is shifting from "feature" to "metered infrastructure"
- **Competitive landscape**: Mem0 (multi-store), Zep (temporal graph), Letta (stateful blocks), Anthropic (native), Cognee (pipeline)
- **Engram's edge**: Already has entity graph + temporal links + observation pipeline + scoped access. Most competitors lack the graph layer OR the observation layer — Engram has both.
- **Engram's gap**: No KV store, no episode abstraction, no token budgeting, no active forgetting

---

## Sources

- [Top 10 AI Memory Products 2026](https://medium.com/@bumurzaqov2/top-10-ai-memory-products-2026-09d7900b5ab1) — Bobur, Feb 2026
- [Memory Becomes a Meter](https://www.genaitech.net/p/memory-becomes-a-meter-why-memory) — GenAITech, Feb 2026
- [How to Build Memory-Driven AI Agents](https://www.marktechpost.com/2026/02/01/how-to-build-memory-driven-ai-agents-with-short-term-long-term-and-episodic-memory/) — MarkTechPost, Feb 2026
- [Agent Memory Survey](https://arxiv.org/pdf/2512.13564) — arXiv, Dec 2025
- Engram RESEARCH.md (existing: MemGPT, Sidecar, Observational, Context Transfer, Context Rot patterns)
