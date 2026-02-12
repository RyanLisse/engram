# Rust / WASM Acceleration Strategy

## Where Rust Helps
- ✔ Hybrid ranking engine (top-k selection, weighted scoring)
- ✔ Batch cosine similarity scoring
- ✔ Near-duplicate detection (clustering, merge decisions)
- ✔ Local sync transforms (JSON → LanceDB upserts)

## Where It Does NOT Help
- ✘ Convex backend logic (JS runtime, hosted)
- ✘ Cohere embedding API calls (network-bound)
- ✘ LanceDB vector engine (already Rust internally)

---

## Proposed Native Interface

```rust
// crate: engram-accel

/// Rank candidates using weighted multi-signal scoring
fn rank_candidates(
    candidates: Vec<Candidate>,
    weights: Weights,
    k: usize
) -> Vec<RankedResult>

/// Detect near-duplicate pairs from embedding matrix
fn detect_duplicates(
    embeddings: Vec<Vec<f32>>,
    threshold: f32
) -> Vec<(usize, usize)>

struct Candidate {
    id: String,
    semantic: f32,
    lexical: f32,
    importance: f32,
    freshness: f32,
    outcome: f32,
}

struct Weights {
    semantic: f32,   // 0.45
    lexical: f32,    // 0.15
    importance: f32,  // 0.20
    freshness: f32,   // 0.10
    outcome: f32,     // 0.10
}
```

## Exposure
- **Primary:** napi-rs (N-API addon for Node.js) — fastest, simplest
- **Fallback:** WASM build for portability (browser/edge)

---

## Integration Point

```
mcp-server/src/lib/ranking.ts
```

```typescript
// Try native first, fall back to TS
let rankFn: RankFunction;
try {
  const native = require('engram-accel');
  rankFn = native.rankCandidates;
} catch {
  rankFn = tsRankCandidates; // Pure TS fallback
}
```

---

## Folder Structure

```
rust/
├── Cargo.toml
├── src/
│   ├── lib.rs
│   ├── ranking.rs
│   ├── dedup.rs
│   └── sync.rs
├── benches/
│   └── ranking_bench.rs
└── tests/
    ├── ranking_test.rs
    └── dedup_test.rs
```

## When to Build This
After milestones 1-3 (safety, hybrid recall, learning loop) are working in TypeScript. Profile MCP server tool calls first — only move to Rust if ranking/dedup becomes a measurable bottleneck.
