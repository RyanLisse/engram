# Mastra Observational Memory — Learnings for Engram

**Date:** 2026-02-24
**Sources:**
- [Blog Post](https://mastra.ai/blog/observational-memory)
- [Research Page](https://mastra.ai/research/observational-memory)
- [Source Code](https://github.com/mastra-ai/mastra/tree/main/packages/memory/src/processors/observational-memory)

---

## Executive Summary

Mastra's Observational Memory achieves 94.87% on LongMemEval (GPT-5-mini), 3-6x text compression, and 5-40x tool compression. It uses a two-block context model (Observation Block + Raw Messages) with an Observer/Reflector pipeline nearly identical to Engram's existing architecture. Key differences: Mastra has more sophisticated extraction prompts, degenerate repetition detection, tiktoken-based counting, and prompt caching optimization. Engram already implements ~80% of this; the remaining 20% are surgical improvements.

---

## 1. Architecture Comparison

| Feature | Mastra | Engram | Gap |
|---|---|---|---|
| Observer threshold | 30k tokens | 10k tokens (configurable) | Engram is more aggressive — consider raising |
| Reflector threshold | 40k tokens | 20k tokens (configurable) | Same — Mastra buffers more before compressing |
| Compression levels | 0-3 | 0-3 ✅ | Parity |
| Emoji priority tiers | 🔴🟡🟢 | 🔴🟡🟢 ✅ | Parity |
| Token counting | tiktoken o200k_base | chars/4 heuristic + code 1.3x | Minor — Engram's heuristic is intentional |
| Compression validation | Observer + Reflector | Reflector only | Add to Observer |
| Degenerate detection | Sliding window (200 chars, 40%) | DJB2 fingerprint | Fingerprint catches exact dupes, not fuzzy |
| Extraction categories | 9 detailed categories | Free-form emoji log | Add category structure |
| Assertion vs question | LLM-classified in prompt | Regex heuristic ✅ | Engram's is faster, good enough |
| Three-date model | observation/referenced/relative | observedDate + referencedDate ✅ | Parity |
| Multi-thread | Per-thread observation blocks | Per-scope + per-agent ✅ | Parity (scopes = threads) |
| Prompt caching | Stable prefix optimization | Not implemented | Add stable prefix pattern |
| Async mode | Synchronous (async shipping) | Async via cron ✅ | Engram is ahead |
| Execution | In-process SDK | Convex cloud actions ✅ | Engram is more scalable |

## 2. What Engram Can Adopt

### 2a. Degenerate Repetition Detection (Medium Impact, Low Effort)

Mastra uses a sliding window approach: extract 200-character windows from the observation, compare against previous observations, flag as degenerate if >40% overlap. Engram's DJB2 fingerprint only catches exact duplicates of the entire window.

**Implementation:** Add a `detectDegenerateRepetition()` function to `observer-prompts.ts`. Before sending to LLM, check for sliding-window overlaps. If degenerate, skip LLM call and return previous summary (saves API cost).

### 2b. Category-Structured Extraction (High Impact, Medium Effort)

Mastra's Observer prompt specifies 9 extraction categories:
1. **Preferences** — user likes/dislikes, style preferences
2. **Projects** — active work, codebases, deployments
3. **Technical Details** — stack choices, configurations, versions
4. **Decisions** — choices made with rationale
5. **Relationships** — people, teams, organizations
6. **Events** — meetings, deadlines, milestones
7. **Emotions** — frustration, excitement, concerns
8. **Learning** — new concepts, corrections, insights
9. **State Changes** — X changed from A to B

Engram's Observer prompt says "group related observations" but doesn't specify categories. Adding explicit categories improves extraction consistency.

**Implementation:** Enhance `buildObserverPrompt()` in `observer-prompts.ts` to include category definitions in the system prompt. Output format stays emoji-prefixed but gains category tags.

### 2c. Observer Compression Validation (Medium Impact, Low Effort)

Mastra validates that Observer output is smaller than input (not just Reflector). If validation fails, retry at one level higher compression.

**Implementation:** Add the same validation logic from `reflector.ts` to `observer.ts`. If output tokens >= input tokens, retry with `compressionLevel + 1` (max 1 retry).

### 2d. Prompt Caching Optimization (High Impact, Low Effort)

Mastra structures prompts with a stable prefix (system instructions + category definitions) that doesn't change between calls. This enables Anthropic's prompt caching (4-10x cost reduction on cache hits).

**Implementation:** Restructure Observer and Reflector prompts so that the system instructions are in a separate `system` message (cacheable) and only the observation data goes in the `user` message. Add `anthropic-beta: prompt-caching-2024-07-31` header.

### 2e. Observation Sanitization (Low Impact, Low Effort)

Mastra strips XML-like tags, normalizes whitespace, and caps line length at 500 characters before storing observations. Prevents prompt injection and reduces noise.

**Implementation:** Add `sanitizeObservation()` to `observer-prompts.ts`. Apply before storage.

---

## 3. What Engram Already Does Better

1. **Async execution** — Mastra runs synchronously (blocks the agent). Engram runs via Convex cloud actions triggered by cron, never blocking.
2. **Fingerprint dedup** — Engram's DJB2 fingerprint skips LLM entirely when the observation window is unchanged. Mastra doesn't have this.
3. **Cloud-native** — Engram's Observer/Reflector runs on Convex (auto-scaling, durable). Mastra runs in-process.
4. **State change extraction** — `extractStateChanges()` in observer-prompts.ts is a dedicated regex parser. Mastra relies on LLM to extract these.
5. **Scope-based access** — Engram's per-scope observation sessions provide natural multi-tenant isolation. Mastra uses thread IDs.

---

## 4. Implementation Priority

| Feature | Effort | Impact | Priority |
|---|---|---|---|
| Prompt caching (2d) | Low | High | P1 |
| Category-structured extraction (2b) | Medium | High | P1 |
| Observer compression validation (2c) | Low | Medium | P2 |
| Degenerate repetition detection (2a) | Low | Medium | P2 |
| Observation sanitization (2e) | Low | Low | P3 |

### Recommended Order
1. **Prompt caching** — immediate cost savings, no behavior change
2. **Category extraction** — improves compression quality
3. **Observer validation** — prevents bloated summaries
4. **Degenerate detection** — saves LLM calls on repetitive content
5. **Sanitization** — defensive hardening
