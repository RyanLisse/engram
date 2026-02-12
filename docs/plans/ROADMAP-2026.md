# Engram 2026 Roadmap
Multi-Agent Expansion + Optimization Strategy

## Vision
Engram becomes:
- Scope-safe by construction
- Hybrid-recall by default
- Self-improving via feedback
- Resistant to duplication
- Local-first with consistent global semantics
- Optionally accelerated via Rust

---

# Strategic Pillars

## 1. Multi-Agent Scope Safety (Critical)

### Problem
Multi-scope recall currently risks dropping filters when multiple scopes are involved.

### Solution
Add server-side multi-scope recall:
- `functions/facts:searchFactsMulti(scopeIds[])`
- `functions/facts:vectorRecall(scopeIds[], embedding)`

Guarantee:
- No unfiltered recall
- All filtering happens in Convex

### Files to Touch
- `convex/functions/facts.ts`
- `convex/functions/scopes.ts`
- `mcp-server/src/tools/recall.ts`

---

## 2. Hybrid Retrieval (Quality Upgrade)

### Ranking Formula
```
score = 0.45 * semantic + 0.15 * lexical + 0.20 * importance + 0.10 * freshness + 0.10 * outcome
```

### Inputs
- **semantic** = cosine similarity from vector search
- **lexical** = normalized rank from full-text search
- **importance** = stored `importanceScore`
- **freshness** = `exp(-age_days / decay_constant)`
- **outcome** = learned `outcomeScore`

### Flow
1. Resolve permitted scopes
2. Generate query embedding
3. Vector recall per scope
4. Full-text recall per scope
5. Merge candidate pool
6. Normalize signals
7. Weighted ranking
8. Batch bumpAccess
9. Return results + recallId

---

## 3. Feedback → Learning Loop

Signals → outcomeScore → rerank cron → better recall.

### Add
- usefulness integration in `crons/rerank.ts`
- outcomeScore incremental updates via `functions/facts:updateOutcomeFromFeedback`
- EMA or bounded average for online updates

---

## 4. Synthesis (Anti-Bloat)

During enrichment:
- Detect near-duplicates (cosine > threshold)
- Merge or mark `lifecycleState: "merged"` with `mergedInto` pointer
- Track `contributingAgents` provenance

### Files to Touch
- `convex/actions/enrich.ts`
- `convex/functions/facts.ts` (merge bookkeeping mutations)

---

## 5. Optional Rust Acceleration

**Only for:**
- ✔ Ranking engine (`rank_candidates`)
- ✔ Duplicate detection (`detect_duplicates`)
- ✔ Local sync transforms

**Not for:**
- ✘ Convex backend logic
- ✘ Embeddings API calls
- ✘ LanceDB vector core (already Rust)

### Interface
```rust
fn rank_candidates(candidates: Vec<Candidate>, weights: Weights, k: usize) -> Vec<Result>
fn detect_duplicates(embeddings: Vec<Vec<f32>>, threshold: f32) -> Vec<(usize, usize)>
```

Expose via napi-rs (preferred), WASM fallback.

---

# Milestones

| # | Milestone | Key Deliverables |
|---|-----------|-----------------|
| 1 | Safety Baseline | Multi-scope search, vector recall, no-leak tests |
| 2 | Hybrid Recall | Ranking merge, batch bumpAccess, searchStrategy param |
| 3 | Learning | outcomeScore updates, usefulness integration |
| 4 | Synthesis | Duplicate detection, merge bookkeeping |
| 5 | Rust (Optional) | Native ranking engine, WASM fallback |

# Success Metrics

| Metric | Target |
|--------|--------|
| Recall p95 | <300ms cloud |
| Local recall | <50ms |
| Scope leaks | 0 |
| Duplicate rate | <5% |
| Used recall ratio | >70% |

---

# Research Principles
- Hybrid retrieval outperforms vector-only
- Learned utility beats static ranking
- Consolidation reduces entropy
- Selective forgetting scales memory
- Local-first reduces cognitive latency
