---
date: 2026-02-24
topic: codex-babysitter-patterns
---

# Autonomous Agent Loop Patterns: What Engram Learned from Codex's PR Babysitter

## Source

OpenAI Codex commit `7e569f1` — "Add PR babysitting skill for this repo (#12513)" by Eric Traut, 2026-02-22.

## What We Analyzed

OpenAI's Codex team shipped an autonomous PR monitoring agent that continuously watches CI, reviews, and mergeability. The architecture uses a Python state machine (`gh_pr_watch.py`, 805 lines) that emits JSON snapshots with recommended actions for the LLM to interpret. The agent never merges or pushes directly — it observes state, classifies changes, and recommends actions for a higher-level agent to execute.

---

## Current State: Engram vs Codex Babysitter

| Dimension | Engram | Codex Babysitter |
|-----------|--------|------------------|
| **Observation model** | Event bus (adaptive poll, 500ms-30s backoff) + observerSweep (10min cron) | Adaptive polling (30s base, exponential backoff to 1hr) |
| **Change detection** | DJB2 fingerprint on observation window (skip LLM if unchanged) | Tuple fingerprint (`snapshot_change_key()`) |
| **Action model** | Active advisory — `action_recommendation` events + passive recall | Active recommendations — watcher pushes suggested actions |
| **Input filtering** | Scope-based access control (private/team/project/public) | Trusted author associations + bot comment filtering |
| **Retry handling** | None (failed enrichment stays failed until backfill cron) | Per-SHA retry budget with max attempt tracking |
| **State persistence** | Convex tables (cloud) | JSON file (local) |
| **Compression** | LLM-driven Observer + Reflector pipeline | No compression — raw state snapshots |

---

## Key Patterns Identified

### 1. Adaptive Polling with Exponential Backoff

**What the babysitter does:** Polls GitHub API at a base interval of 30 seconds. When no state change is detected, the interval doubles (30s → 60s → 120s → ...) up to a 1-hour cap. Any state change resets the interval to 30s. This means the agent is responsive during active CI runs but nearly silent when a PR is idle.

**Engram relevance:** Engram's event bus polls at a fixed 2-second interval regardless of activity. The observerSweep cron runs every 10 minutes regardless of whether new observations exist. Both waste cycles during idle periods and can't respond faster during bursts.

**Approach:**
- Replace `setInterval` in `event-bus.ts` with a `setTimeout` chain that tracks consecutive no-op polls.
- Base interval: 2s. Backoff factor: 1.5x. Cap: 30s. Reset on any event emission.
- For observerSweep: future consideration — adaptive cadence based on observation volume.

**Best when:** Event bus is running in long-lived agent sessions with bursty activity patterns.

---

### 2. State-Change Fingerprinting (`snapshot_change_key()`)

**What the babysitter does:** Before processing a poll result, it hashes key fields into a tuple: `(mergeable, ci_status, review_count, last_review_state, comment_count)`. If the tuple matches the previous poll, the entire processing pipeline is skipped. This avoids redundant LLM calls when nothing meaningful changed.

**Engram relevance:** The Observer pipeline (`convex/actions/observer.ts`) fetches recent observations and sends them to an LLM for compression every sweep. If the observation window hasn't changed since the last sweep, the LLM call is wasted tokens. Fingerprinting the observation window would let the Observer skip compression when nothing new exists.

**Approach:**
- Compute a DJB2 hash over the observation window (sorted fact IDs + content hashes) before calling the LLM.
- Store the last fingerprint in a lightweight Convex document or in-memory on the MCP server.
- If fingerprint matches, skip the LLM compression pass entirely.
- Log skipped sweeps for observability.

**Best when:** Observer sweep runs frequently and the observation window is often unchanged between sweeps.

---

### 3. Action Recommendation Engine (`recommend_actions()`)

**What the babysitter does:** After classifying the PR state, it builds a list of recommended actions: "rebase needed", "address review comments", "wait for CI", "ready to merge". These are suggestions — the LLM agent decides whether and how to act. The pattern is: **sense → classify → recommend → delegate**.

**Engram relevance:** Engram is a passive memory store. Agents ask questions and get answers. The babysitter pattern suggests an active advisory layer: Engram could proactively surface recommendations based on observed patterns. For example: "Agent hasn't checkpointed in 2 hours", "3 facts contradict each other in scope X", "Stale facts exceed threshold — prune recommended".

**Approach:**
- Introduce an `action_recommendation` event type in the event bus.
- New cron job (or extension of `agent-health`) that evaluates conditions and emits recommendations.
- Recommendations are passive — they appear in `poll_events` / `get_notifications` but don't execute.
- Agents can subscribe to recommendation events via the existing subscription system.

**Best when:** You want Engram to nudge agents toward maintenance actions rather than waiting for manual intervention.

---

### 4. Trust-Bounded Input Filtering

**What the babysitter does:** Maintains a set of trusted GitHub usernames (PR author + configured collaborators). Comments from untrusted users or bots are excluded from the snapshot. This prevents noisy or adversarial input from polluting the agent's decision context.

**Engram relevance:** Engram already has scope-based access control (private/team/project/public). The babysitter pattern reinforces this: when building context for an agent, filter out observations from untrusted or low-signal sources. This maps directly to Engram's scope policies and could extend to agent-level trust scoring.

**Approach:**
- No immediate implementation needed — Engram's scope system already handles this.
- Future consideration: agent reputation scoring based on feedback signals. High-quality agents' facts could be weighted higher in `rank_candidates`.

**Best when:** Multi-agent environments where some agents produce noisy or low-quality observations.

---

### 5. Retry Budget Tracking

**What the babysitter does:** Tracks retry attempts per commit SHA. If CI fails for the same SHA more than N times, the babysitter stops recommending "retry CI" and instead recommends "investigate failure". This prevents infinite retry loops.

**Engram relevance:** The embedding backfill cron retries failed embeddings every 15 minutes with no attempt tracking. The enrichment pipeline similarly has no retry budget — a fact that fails enrichment will be retried indefinitely on every backfill cycle.

**Approach (deferred):**
- Add `retryCount` field to facts or a separate retry tracking table.
- Backfill cron skips facts exceeding N retries; surfaces them in `list_stale_facts` with a `retry_exhausted` flag.
- Consider for enrichment, embedding, and any other async pipeline.

**Best when:** Production systems where failed operations should not retry forever.

---

## Implementation Decisions

### Adopted

| Pattern | Where | Effort |
|---------|-------|--------|
| **Adaptive event bus polling** | `mcp-server/src/lib/event-bus.ts` — setTimeout chain with backoff | Low |
| **Observer fingerprinting** | `convex/actions/observer.ts` — DJB2 hash of observation window | Low |
| **Action recommendation events** | New cron + event type in event bus | Medium |

### Deferred

| Pattern | Why Deferred |
|---------|-------------|
| Retry budget tracking | Requires schema change; backfill cron works acceptably today |
| Adaptive observer sweep cadence | Fingerprinting solves the immediate waste; adaptive cadence adds complexity |
| State fingerprinting for Reflector | Observer is higher priority; Reflector runs weekly and is already cheap |
| Agent reputation scoring | No multi-agent trust issues observed yet; YAGNI |

---

## Connection to Prior Work

This builds on the [Observational Memory brainstorm](2026-02-20-observational-memory-inspiration.md):

| Prior Idea | Status | How This Extends It |
|------------|--------|---------------------|
| **#5 Observer/Reflector pipeline** | Implemented | Fingerprinting adds skip-when-unchanged efficiency |
| **#3 Token-triggered observation** | Implemented as observerSweep | Action recommendations extend "when to act" beyond token thresholds |
| **#1 Emoji priority format** | Implemented in observer prompts | No change — already adopted |
| **#4 Stable context prefix** | Not yet implemented | Action recommendations could be included in stable prefix blocks |

---

## Architecture Insight

The Codex babysitter is a domain-specific memory system with a built-in action loop:

| Babysitter Component | Engram Equivalent |
|----------------------|-------------------|
| JSON file state persistence | Convex tables |
| GitHub polling (observe changes) | Event bus + observation pipeline |
| Branch classification (flaky vs real failure) | Assertion classifier + observation tiers |
| `recommend_actions()` output | **NEW**: `action_recommendation` events |

The missing piece was the action recommendation layer — turning Engram from a passive memory store into an active advisory system. The babysitter never *acts* on its own recommendations; it presents them to the LLM for decision-making. Engram should follow the same principle: recommend, don't execute.

---

## Harness Engineering Framing

On 2026-02-23, Charlie Guo (DevEx @ OpenAI) published ["The Emerging Harness Engineering Playbook"](https://www.ignorance.ai/p/the-emerging-harness-engineering), synthesizing practices from OpenAI, Stripe, and OpenClaw. Martin Fowler's Birgitta Böckeler also analyzed the pattern. These four practices map directly to Engram:

| Harness Practice | Engram Implementation |
|---|---|
| **Architecture as Guardrails** — enforced layers, structural tests | Scope-based access control, lifecycle state machines, `action_recommendation` events |
| **Tools as Foundation** — 400+ MCP tools, clear error messages | 69 MCP primitives, agent-native architecture, `list_capabilities` for self-discovery |
| **Documentation as System of Record** — AGENTS.md, self-maintaining docs | `build_system_prompt`, Observer/Reflector compression pipeline, observation summaries |
| **Structured Progress Tracking** — JSON > Markdown for agent state | Facts with structured metadata, event bus, subscription system |

Key quote from Birgitta Böckeler: *"Harnesses will become the next generation of service templates — starting points with custom linters, structural tests, context, and documentation."* Engram's plugin system (`.mcp.json` + hooks + `SKILL.md`) is already this template for memory-augmented agents.

The harness engineering playbook validates Engram's design direction: the value is not in the model, but in the memory infrastructure that makes agents effective across sessions.

---

## Open Questions (Remaining)

- How do we prevent recommendation fatigue — agents ignoring recommendations because there are too many?
- Should the Observer fingerprint extend to the Reflector as well?
- What's the right approach for "self-maintaining documentation" agents that use `action_recommendation` events to auto-trigger doc updates?
- How does Engram position as a "harness template" for greenfield agent projects?

---

## Related Brainstorms

- [Observational Memory Inspiration](2026-02-20-observational-memory-inspiration.md) — Observer/Reflector pipeline, emoji priority format, token-triggered observation
- [Memory Research Synthesis](2026-02-20-memory-research-synthesis.md) — Broader memory architecture patterns

## External References

- [OpenAI: Harness Engineering](https://openai.com/index/harness-engineering/)
- [The Emerging "Harness Engineering" Playbook (ignorance.ai)](https://www.ignorance.ai/p/the-emerging-harness-engineering)
- [Martin Fowler: Harness Engineering](https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html)

---

## Implementation Status (2026-02-24)

All three patterns from this brainstorm have been implemented:

- [x] Adaptive event bus polling (`mcp-server/src/lib/event-bus.ts`) — setTimeout chain, 2x backoff, 30s cap, generation counter for race safety
- [x] DJB2 fingerprinting for Observer (`convex/actions/observer.ts`, `mcp-server/src/lib/observer-prompts.ts`) — skip LLM when observation window unchanged
- [x] Action recommendation cron (`convex/crons/actionRecommendations.ts`) — 15min interval, 3 checks (stale facts, unread notifications, feedback signals), 4hr cooldown
- [x] Brainstorm doc with harness engineering framing (this file)
