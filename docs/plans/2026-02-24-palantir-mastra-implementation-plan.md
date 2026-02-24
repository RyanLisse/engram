# Implementation Plan: Palantir + Mastra Learnings

**Date:** 2026-02-24
**Sources:**
- `docs/brainstorms/2026-02-24-palantir-architecture-learnings.md`
- `docs/brainstorms/2026-02-24-mastra-observational-memory-learnings.md`

---

## Scope

6 features selected from both brainstorm docs, prioritized by effort/impact ratio. All changes are backward-compatible — no schema migrations, no breaking API changes.

---

## Feature 1: Prompt Caching for Observer/Reflector

**Source:** Mastra 2d | **Effort:** Low | **Impact:** High (4-10x cost reduction)

### Files to modify:
- `convex/actions/observer.ts` — restructure LLM call to use system+user messages
- `convex/actions/reflector.ts` — same restructure

### Implementation:
1. Split prompt into `system` message (stable instructions + categories) and `user` message (observations data)
2. Add `anthropic-beta: prompt-caching-2024-07-31` header to LLM calls
3. Add `cache_control: { type: "ephemeral" }` to the system message content block

### Acceptance:
- Observer and Reflector LLM calls use 2-message format (system + user)
- Prompt caching header present
- No behavior change in compression output

---

## Feature 2: Category-Structured Observer Extraction

**Source:** Mastra 2b | **Effort:** Medium | **Impact:** High

### Files to modify:
- `mcp-server/src/lib/observer-prompts.ts` — add category definitions to prompt
- `convex/actions/observer.ts` — update inline prompt copy

### Implementation:
1. Add 9 extraction categories to Observer system prompt (Preferences, Projects, Technical, Decisions, Relationships, Events, Emotions, Learning, State Changes)
2. Update output format to `<emoji> [CATEGORY] <observation>`
3. Keep backward compatible — existing emoji-only observations still parseable

### Acceptance:
- Observer output includes category tags
- `formatFactsAsObservationBlocks()` handles both old and new formats
- Existing tests pass

---

## Feature 3: Observer Compression Validation

**Source:** Mastra 2c | **Effort:** Low | **Impact:** Medium

### Files to modify:
- `convex/actions/observer.ts` — add validation + retry logic

### Implementation:
1. After LLM call, check `outputTokens >= inputTokens`
2. If true and `compressionLevel < 3`, retry at `compressionLevel + 1`
3. Max 1 retry (same pattern as reflector.ts)

### Acceptance:
- Observer never produces output larger than input
- Retry logged with compression level escalation
- Return includes `retried: boolean` flag

---

## Feature 4: Degenerate Repetition Detection

**Source:** Mastra 2a | **Effort:** Low | **Impact:** Medium

### Files to modify:
- `mcp-server/src/lib/observer-prompts.ts` — add `detectDegenerateRepetition()`
- `convex/actions/observer.ts` — call before LLM
- `mcp-server/test/observer-prompts.test.ts` — new test file

### Implementation:
1. Sliding window approach: extract 200-char windows from concatenated observations
2. Compare against previous summary content
3. If >40% of windows match, flag as degenerate and skip LLM call
4. Return previous summary with `degenerate: true` flag

### Acceptance:
- Degenerate detection skips LLM call when content is repetitive
- Tests cover: normal content, repetitive content, edge cases (empty, short)

---

## Feature 5: Feedback → Decision Decay Loop

**Source:** Palantir 1b | **Effort:** Low | **Impact:** High

### Files to modify:
- `mcp-server/src/tools/primitive-retrieval.ts` — enhance `recordFeedback`
- `mcp-server/src/lib/convex-client.ts` — add `boostFactImportance()` if needed

### Implementation:
1. When `record_feedback` marks a recall as `helpful`, boost underlying facts by +0.05 importance
2. When `unhelpful`, decay by -0.05 importance
3. Cap at [0.0, 1.0] range
4. Only apply to `decision` and `insight` fact types

### Acceptance:
- Helpful feedback boosts decision facts
- Unhelpful feedback decays them
- Importance stays within [0.0, 1.0]
- Other fact types unaffected

---

## Feature 6: Observation Sanitization

**Source:** Mastra 2e | **Effort:** Low | **Impact:** Low (defensive)

### Files to modify:
- `mcp-server/src/lib/observer-prompts.ts` — add `sanitizeObservation()`
- `mcp-server/src/tools/observe.ts` — apply before storage

### Implementation:
1. Strip XML-like tags (`<tag>...</tag>`) from observation content
2. Normalize consecutive whitespace to single space
3. Cap line length at 500 characters (truncate with `...`)
4. Trim leading/trailing whitespace

### Acceptance:
- Observations stored without XML tags
- No lines exceed 500 chars
- Whitespace normalized

---

## Build Sequence

```
Feature 1 (prompt caching) ──┐
Feature 2 (categories)    ───┤── can build in parallel
Feature 4 (degenerate det)───┤
Feature 5 (feedback loop) ───┤
Feature 6 (sanitization)  ───┘
                              │
Feature 3 (observer validation) ← depends on Feature 1 (same file)
```

5 features can build in parallel. Feature 3 depends on Feature 1 (both touch observer.ts).

---

## Out of Scope (Future)

- Webhook subscriptions (Palantir 3a) — needs event bus changes
- REST API wrapper (Palantir 3b) — separate effort
- Embedding model abstraction (Palantir 2a) — needs provider interface
- Action rules engine (Palantir 4) — design phase only
- tiktoken integration — Engram's chars/4 heuristic is intentionally lightweight
