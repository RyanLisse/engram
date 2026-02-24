# Share Paper → Engram: What We Can Learn & Implement

**Paper:** "Shared LoRA Subspaces for almost Strict Continual Learning" (Kaushik et al., JHU, Feb 2026)
**arXiv:** https://arxiv.org/abs/2602.06043

## What the Paper Actually Is

Share is about **model weight** continual learning — maintaining a single evolving low-rank subspace of LoRA adapters so one model can learn new tasks without forgetting old ones. **Not** about agent memory directly.

But the core principles translate powerfully to Engram's memory architecture.

---

## Key Ideas & Their Engram Translations

### 1. 🔴 Shared Foundational Subspace → Memory Consolidation via SVD

**Share's insight:** All task-specific LoRA adapters converge to a shared low-rank subspace. You don't need N separate adapters — you need k basis vectors + N lightweight coefficient vectors.

**Engram translation:** All facts in a scope converge to a shared "knowledge subspace." Instead of storing 10,000 raw facts, identify the k principal knowledge dimensions and represent each fact as a projection onto those dimensions.

**Implementation: Embedding Subspace Consolidation**

```typescript
// New: consolidation pipeline
// 1. Gather all fact embeddings in a scope
// 2. Run SVD (or incremental PCA) to find top-k principal directions
// 3. Store principal directions as "knowledge axes" 
// 4. Each fact gets a lightweight coefficient vector instead of full 1024-dim embedding
// 5. New facts project onto existing axes; if reconstruction error > threshold, expand subspace

// Schema addition
knowledge_subspaces: defineTable({
  scopeId: v.id("memory_scopes"),
  principalVectors: v.array(v.array(v.float64())),  // k × 1024
  explainedVariance: v.array(v.float64()),           // per-axis variance
  k: v.number(),                                      // current rank
  factCount: v.number(),                              // facts consolidated
  updatedAt: v.number(),
})

// On each fact: store compact coefficients instead of full embedding
// compactEmbedding: v.optional(v.array(v.float64()))  // k-dimensional, k << 1024
```

**Impact:**
- **281x memory savings** (paper's claim) translates to ~10-50x embedding storage reduction
- Currently: 10K facts × 1024 floats × 8 bytes = 80MB embeddings
- With subspace: 10K facts × 32 coefficients × 8 bytes + 32 × 1024 × 8 bytes = 2.8MB
- Vector search becomes k-dimensional instead of 1024-dimensional → faster

---

### 2. 🔴 Incremental Subspace Update → Streaming Memory Integration

**Share's insight:** When a new task arrives, don't recompute SVD from scratch. Learn φ << k temporary basis vectors, then merge them into the existing subspace via SVD of the reconstructed + new data.

**Engram translation:** When new facts arrive, don't re-embed everything. Incrementally update the knowledge subspace:

```
1. New fact arrives with embedding e_new
2. Project onto existing subspace: e_hat = V_k @ (V_k^T @ e_new)
3. Compute residual: r = e_new - e_hat
4. If ||r|| > threshold: 
   - This fact contains novel knowledge not in current subspace
   - Expand subspace: k → k+1 with new direction r/||r||
   - Periodically re-merge (SVD on reconstructed matrix) to keep k bounded
5. If ||r|| < threshold:
   - Store only the k-dim coefficient vector
```

**This is exactly how Share works for adapters — applied to memory embeddings.**

**Implementation path:**
- Add to `store-fact.ts`: after embedding, check projection residual
- New `consolidate-subspace` action/cron: periodic SVD re-merge
- Threshold: start at 60% explained variance (paper's recommendation)

---

### 3. 🟡 Backward Knowledge Transfer → Memory Retroactive Enrichment

**Share's insight:** Updating the shared subspace with new task knowledge sometimes *improves* performance on old tasks (backward transfer). The subspace captures cross-task structure that individual adapters missed.

**Engram translation:** When new facts are integrated and the subspace is re-merged, re-project old facts onto the updated subspace. Their representations may improve — previously unrelated facts may now cluster meaningfully.

**Implementation:**
- After subspace update, recompute coefficients for recent facts (last 30 days)
- Check if any facts that were previously low-relevance now score higher for common queries
- Surface "retroactively relevant" facts in recall results

---

### 4. 🟡 Coefficient-Only Learning → Lightweight Recall Tuning

**Share's insight:** For a new task, only the coefficient vector ε (k×p parameters) needs training. The basis vectors stay frozen. 100x parameter reduction.

**Engram translation:** For a new agent joining a scope, don't rebuild its memory index. Give it the shared knowledge subspace and let it learn lightweight "attention coefficients" — which knowledge dimensions matter for *this* agent's tasks.

```typescript
// Per-agent, per-scope attention over knowledge axes
agent_knowledge_profile: defineTable({
  agentId: v.string(),
  scopeId: v.id("memory_scopes"),
  axisWeights: v.array(v.float64()),  // k weights, one per principal direction
  updatedAt: v.number(),
})
```

**Impact:** New agents get instant memory access without re-indexing. Their retrieval is personalized by learned axis weights.

---

### 5. 🟢 Strict Continual Learning Constraints → Memory Without Replay

**Share's constraints:** No data replay, no model growth, no access to previous tasks.

**Engram mapping:** This validates the consolidation → prune → forget pattern. Don't keep raw conversation history forever. Consolidate into subspace, store coefficients, prune the originals. The subspace IS the memory — the raw data can be forgotten.

Aligns with:
- ALMA forgetting pipeline (already in schema as `forgetScore`)
- Observer/Reflector compression pipeline (already in `observation_sessions`)
- Adds mathematical rigor: the reconstruction error bound tells you exactly how much you lose

---

### 6. 🟢 Explained Variance Threshold → Adaptive Memory Capacity

**Share's finding:** k at 60% explained variance is sufficient. You don't need to capture everything — just the principal directions.

**Engram translation:** Each scope has an adaptive capacity. Monitor explained variance:
- If dropping below 60% → subspace needs expansion (more diverse knowledge)
- If above 90% → subspace is over-fitted, probably redundant facts
- Sweet spot: 70-80% → good compression with acceptable loss

This gives a principled answer to "how much memory is enough?" — not count-based, variance-based.

---

## Concrete Implementation Plan

### Phase 1: Embedding Subspace (Week 1-2)
1. Add `knowledge_subspaces` table to schema
2. Implement incremental PCA in a Convex action (or external script)
3. On `store_fact`: compute and store compact coefficients alongside full embedding
4. On `recall`: support search in compact subspace (faster, cheaper)

### Phase 2: Streaming Integration (Week 2-3)
5. Implement residual-based novelty detection on new facts
6. Auto-expand subspace when novel knowledge arrives
7. Periodic re-merge cron (SVD consolidation)

### Phase 3: Agent Profiles (Week 3-4)
8. Add `agent_knowledge_profile` table
9. Learn axis weights from recall_feedback (which facts were actually used)
10. Personalized retrieval per agent

### Phase 4: Forget with Guarantees (Week 4+)
11. Reconstruction error bounds → principled forgetting
12. Archive raw facts once captured in subspace
13. Report memory health as explained variance %

---

## Why This Matters for Engram Specifically

Engram's architecture is uniquely suited for this because:
1. **Convex vector index** already stores 1024-dim Cohere embeddings → subspace compression directly reduces storage/cost
2. **Multi-agent scopes** → per-scope subspaces with per-agent coefficient profiles
3. **Observation pipeline** already generates high-volume facts → needs compression
4. **Themes table** already groups facts → themes could become "axes" in the subspace
5. **Consolidation pattern** (`mergedInto`, `consolidatedFrom`) already exists → subspace merge is the principled version

The paper essentially provides the **mathematical foundation** for what Engram is already trying to do with heuristics (importance scoring, decay, consolidation). Share replaces heuristics with SVD-based guarantees.

---

## Key Numbers from the Paper

| Metric | Share Result | Engram Implication |
|--------|-------------|-------------------|
| Parameter reduction | 100x | ~30x embedding storage reduction |
| Memory savings | 281x | Depends on fact count, likely 10-50x |
| Min explained variance | 60% | Threshold for subspace adequacy |
| Convergence | 5 tasks | ~500 facts before subspace stabilizes |
| Backward transfer | Observed | Retroactive enrichment possible |
| k selection | eigenvalue threshold | Adaptive per-scope capacity |

---

## References

- Share paper: https://arxiv.org/abs/2602.06043
- Share project page: https://toshi2k2.github.io/share/
- Universal Weight Subspace Hypothesis: cited as [12] in paper
- EigenLoRAx: cited as [15] — related prior work on shared LoRA subspaces
