# Async Enrichment Pattern

## Principle
Store first, enrich later. Facts are persisted in <50ms; heavy processing runs async.

## Flow
```
Agent → memory_store_fact → DB insert (sync, <50ms) → return factId
                                ↓
                        scheduler.runAfter(0, ...)
                                ↓
                    ┌──────────────────────────┐
                    │  enrichFact (action)      │
                    │  1. Generate embedding    │
                    │  2. Extract entities      │
                    │  3. Classify importance   │
                    │  4. Compress summary      │
                    │  5. Auto-link backlinks   │
                    │  6. Route notifications   │
                    └──────────────────────────┘
```

## Implementation
- `convex/functions/facts.ts:storeFact` — Sync mutation, returns immediately
- `convex/actions/enrich.ts:enrichFact` — Scheduled action, runs post-response
- `convex/actions/mirrorToVault.ts` — Non-blocking vault mirror signal

## Why This Matters
Agents need instant confirmation that memory was stored. Embedding generation (Cohere API call) takes 200-500ms. Classification and entity extraction add more latency. By decoupling, the agent can continue working while enrichment happens in the background.

## Error Handling
If enrichment fails, the fact remains stored with `embedding: undefined`. The `embedding-backfill` cron (every 15m) retries failed enrichments.
