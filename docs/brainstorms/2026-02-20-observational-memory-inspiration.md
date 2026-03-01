---
date: 2026-02-20
topic: observational-memory-inspiration
---

# Observational Memory: What Engram Can Learn from Mastra OM

## What We're Exploring

Mastra's [Observational Memory (OM)](https://mastra.ai/blog/observational-memory) achieves 94.87% on LongMemEval with a stable, prompt-cacheable context window. Engram is a fact-centric, retrieval-based memory system. This brainstorm explores what concepts from OM could improve Engram—without copying OM wholesale, given Engram's different architecture (multi-agent, Convex, semantic search, scope-based).

---

## Current State: Engram vs Mastra OM

| Dimension | Engram | Mastra OM |
|-----------|--------|-----------|
| **Primary representation** | Atomic facts with embeddings, entities, themes | Formatted text observation log |
| **Retrieval** | Per-turn semantic search (`recall`, `get_context`) | Stable prefix—no per-turn retrieval |
| **Compression** | Daily compact (mark low-importance facts dormant), weekly consolidate | Token-triggered Observer + Reflector |
| **Context injection** | Dynamic—recall injects facts each turn | Static—observations at start, messages appended |
| **Prompt caching** | Not optimized—context changes every turn | High hit rate—prefix stable until reflection |
| **Scale** | Multi-agent, cross-session, scoped | Per-thread |
| **Temporal** | Timestamps, decay, importance | Three-date model (obs date, referenced date, relative) |

---

## Ideas Worth Implementing

### 1. Emoji-Based Priority Format for Observations

**What OM does:** Uses 🔴 (high), 🟡 (medium), 🟢 (low) to signal importance in a human-readable, LLM-friendly way.

**Engram relevance:** You already have `observationTier` (critical/notable/background) in VAULT Phase 6 and `budget-aware-loader`. Adding emoji prefixes to fact content when formatted for context injection would make priority visible to the model without extra metadata.

**Approach:**
- When `load_budgeted_facts` or `get_context` formats facts for prompt injection, prefix with emoji based on tier:
  - Critical → 🔴
  - Notable → 🟡
  - Background → 🟢
- No schema change. Only affects presentation in context blocks.

**Best when:** You care about the model quickly scanning and weighting recalled facts.

---

### 2. Temporal Anchoring (Three-Date Model)

**What OM does:** Each observation carries:
- Observation date (when it was created)
- Referenced date (date mentioned in content, e.g. "flight is Jan 31")
- Relative date (e.g. "2 days ago")

**Engram relevance:** Temporal reasoning is hard. Facts today have `createdAt`, but referenced dates (e.g. "User's deadline is March 15") are buried in content. LongMemEval temporal-reasoning scores benefit from explicit temporal anchors.

**Approach:**
- Optional `referencedDate` and `relativeDate` fields on facts (or in enrichment).
- When formatting facts for context, append relative anchors: `(created 3 days ago; references March 15, 2026)`.
- Enrichment step could extract referenced dates via cheap LLM pass.

**Best when:** You need strong temporal reasoning (deadlines, "when did X happen", preference changes over time).

---

### 3. Token-Triggered Observation (Message → Dense Log)

**What OM does:** When unobserved messages hit 30k tokens, Observer compresses them into dated, prioritized observations. Replace raw messages with observations. Repeat at 40k for Reflector.

**Engram relevance:** Engram doesn't store "conversation messages" as such—it stores facts via `observe`, `store_fact`, etc. But:
- **Session/conversation facts** grow unbounded per thread.
- **VAULT Phase 6** already plans priority tiers; the missing piece is *when* to compress.

**Approach A — Per-session token budget:** When facts in a session/thread exceed N tokens (e.g. 20k), trigger an "Observer" Convex action that:
1. Fetches recent facts in that session.
2. Uses an LLM to produce a condensed observation log (OM-style format).
3. Stores the observation block as a summary fact; marks contributing facts as merged/archived.

**Approach B — Integrate with compact cron:** Extend the existing `compact` cron to run observation-style compression on conversations with >50 facts before marking facts dormant.

**Best when:** Sessions produce many low-value observations ("opened file X") and you want automatic compression without losing critical context.

---

### 4. Stable Context Prefix for Prompt Caching

**What OM does:** Context = [observations | raw messages]. Observations change only when Observer/Reflector runs. Messages append. Prefix is stable across many turns → high cache hit rate.

**Engram relevance:** Today, `auto-recall` and `get_context` inject different facts each turn based on the query. Every turn = new context = cache miss. Provider prompt caching (Anthropic, OpenAI) could significantly reduce cost if the prefix were stable.

**Approach:**
- Introduce an **observation block** concept: a cached, formatted block of high-signal facts for a session/scope.
- **Observation block** is updated only when:
  - Token threshold exceeded (see #3), or
  - Explicit refresh (e.g. session end).
- `get_context` returns: `[observation block] + [recent facts / delta]` instead of purely dynamic recall.
- Agents using Claude/OpenAI with prompt caching would put the observation block in the cacheable prefix.

**Best when:** You want to reduce token costs via prompt caching while keeping recall quality.

---

### 5. Two-Stage Compression: Observer + Reflector

**What OM does:** Observer turns messages → observations. Reflector turns observations → condensed observations (combine, drop redundant, reflect on patterns).

**Engram relevance:** You have `summarize` (facts → summary fact) and `consolidate` (cluster facts → theme). The Reflector adds a second pass: not just "summarize" but "reflect and condense"—merge related observations, drop superseded ones.

**Approach:**
- Extend `consolidate` cron or add a `reflect` cron:
  - Input: Facts (or observation blocks) in a scope.
  - Output: Condensed "reflection" that combines related items, drops outdated state, preserves patterns.
- Could produce `factType: "reflection"` facts that replace or supplement raw facts for context.

**Best when:** Long-running sessions accumulate many facts and you want intelligent garbage collection, not just "archive low importance."

---

### 6. Formatted Text as Primary Observation Format

**What OM does:** Observations are formatted text (bulleted, dated, emoji-prefixed). "Down with knowledge graphs. Text is the universal interface."

**Engram relevance:** Engram stores structured facts with entities, themes, embeddings. For LLM consumption, you already format facts into text. OM suggests: the *format* of that text matters—grouped by date, prioritized, with clear structure.

**Approach:**
- When building context for `get_context` / `load_budgeted_facts`, format facts as OM-style blocks:
  ```
  Date: Feb 18, 2026
  * 🔴 (14:30) User decided to migrate DB to Supabase
  * 🟡 (14:35) Agent ran migration script, 3 tables created
  Date: Feb 20, 2026
  * 🔴 (09:00) User stated deadline is March 15
  ```
- No storage change; only the presentation layer for prompt injection.

**Best when:** You want the model to better parse and reason over recalled context.

---

## What NOT to Adopt (and Why)

| OM Feature | Why Skip for Engram |
|------------|---------------------|
| **No vector DB** | Engram's strength is semantic search across agents/scopes. Removing vectors would break recall, multi-session search. |
| **Single-thread scope** | Engram is multi-agent, scope-based. OM's thread-scoped model doesn't map 1:1. |
| **Replace message history** | Engram doesn't own conversation messages; agents do. You observe *outcomes*, not raw chat. |
| **Synchronous observation** | Engram's async enrichment pipeline is a core principle. Keep compression async. |

---

## Prioritization (YAGNI-Friendly)

**Quick wins (formatting only):**
1. **Emoji prefix** (#1) — Add to fact formatting in context builders.
2. **Formatted observation blocks** (#6) — Change how `get_context` / `load_budgeted_facts` present facts.

**Medium effort (enrichment/schema):**
3. **Temporal anchoring** (#2) — Add `referencedDate` extraction in enrichment; format in context.

**Larger effort (new pipelines):**
4. **Token-triggered observation** (#3) — New Convex action + trigger logic.
5. **Stable context prefix** (#4) — Observation block storage, cache-aware context builder.
6. **Reflector pass** (#5) — Extend consolidate or new reflect cron.

---

## Key Decisions

- **Start with formatting (#1, #6)** — Zero schema change, immediate LLM-facing improvement.
- **Temporal anchoring (#2)** — High value for temporal reasoning; requires enrichment changes.
- **Token-triggered observation (#3)** — Aligns with VAULT Phase 6 priority tiers; implement after classifier exists.
- **Stable prefix (#4)** — Consider when prompt caching becomes a cost priority.

---

## Open Questions

- Should observation blocks be stored per-session, per-scope, or both?
- How does an "observation block" interact with `recall`—does it replace or supplement semantic recall?
- LongMemEval: Do we want to run it on Engram to establish a baseline before/after these changes?

---

## Related Brainstorms

- [Memory Research Synthesis](2026-02-20-memory-research-synthesis.md) — Formats (#1, #6) and temporal anchoring (#2) align with this brainstorm; also covers MemFly, Memory Decoder, geometry of decision-making.

---

## Next Steps

→ `/workflows:plan` to implement emoji prefix + formatted observation blocks in context builders.
