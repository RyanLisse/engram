---
date: 2026-02-12
topic: multi-agent-integration-patterns
---

# Multi-Agent Integration Patterns

## What We're Building

A hybrid integration layer for Engram that enables seamless multi-agent memory sharing across a layered agent topology (inner personal circle + outer project/team ring). The system combines three mechanisms: shared scope layering for persistent knowledge, a handoff protocol for session continuity, and smart routing via the enrichment pipeline for cross-agent awareness.

The goal: any agent in the ecosystem can discover relevant memories from other agents, receive context when taking over from another agent, and avoid duplicating knowledge — without manual bridging or explicit coordination.

## Why This Approach

**Considered:**

| Approach | Verdict |
|----------|---------|
| A: Scope Layering + Handoff Protocol | Good foundation, but lacks real-time awareness |
| B: Event-Driven Memory Bus | Powerful but over-engineered for current scale |
| C: Memory Broker Layer | Clean separation but adds a new service to maintain |
| **A + B Hybrid (chosen)** | **Scope layering as foundation + smart routing from enrichment pipeline** |

The hybrid captures the pragmatism of A (extend what exists) with the intelligence of B (push relevant facts to the right agents), without the operational burden of C (no new service).

## Key Decisions

### 1. Shared Scopes for the Inner Circle

- **Decision:** Create a `shared-personal` scope that all inner-circle agents (Indy, mobile assistant, background researcher) read/write to alongside their private scopes.
- **Rationale:** Private scopes still exist for agent-specific working memory. Shared scope is the persistent knowledge layer. Simple, no new abstractions.
- **Impact:** `memory_recall` default behavior changes to search all permitted scopes (private + shared), not just the agent's own scope.

### 2. Handoff Protocol via Session Summary Facts

- **Decision:** When a session ends (or an agent explicitly hands off), it writes a `session_summary` fact to the shared scope with `factType: "session_summary"` and metadata linking to the conversation.
- **Rationale:** Handoff summaries are just facts — they benefit from the full enrichment pipeline (embedding, importance scoring, entity extraction). They decay naturally. No new data model needed.
- **Impact:** `memory_get_context` auto-surfaces recent `session_summary` facts from other agents when warming up a new session. The incoming agent sees what happened without needing explicit bridging.

### 3. Smart Routing via Enrichment Pipeline

- **Decision:** Add a new step to the async enrichment pipeline: after embedding + entity extraction + importance scoring, evaluate which registered agents should be notified about this fact based on content similarity to their telos/capabilities, scope overlap, and importance threshold.
- **Rationale:** Fits the existing async pattern (agents never block). Leverages embeddings that are already computed. Agent registration already captures capabilities and telos — use them.
- **Implementation sketch:**
  - New `notifications` table (or extend `signals`): `{ agentId, factId, reason, read: boolean, createdAt }`
  - New enrichment action: `routeToAgents` — runs after embedding, compares fact embedding against agent capability embeddings
  - Agents check notifications on `memory_get_context` (piggyback on existing warm-start)

### 4. Cross-Agent Dedup Cron

- **Decision:** New cron job that detects semantically similar facts across agents (cosine similarity > threshold) and merges them, preserving `contributingAgents` provenance.
- **Rationale:** Without dedup, shared scopes accumulate redundant facts fast. The `contributingAgents` field already exists on facts — use it to track who contributed to merged facts.
- **Frequency:** Daily (or after N new facts), low priority relative to existing crons.

### 5. Layered Permissions (Inner/Outer Ring)

- **Decision:** Inner circle agents get `shared-personal` scope (full read/write). Outer ring agents get project-specific scopes with configurable read/write policies via existing `memory_scopes` table.
- **Rationale:** The scope model already supports this — just need conventions and possibly a helper tool/command for scope management.

## Architecture Sketch

```
Inner Circle (personal agents)
  Indy ──┐
  Mobile ─┼── shared-personal scope (full R/W)
  Researcher ──┘     │
                     │ cross-scope recall
                     ▼
              ┌─────────────┐
              │   Convex     │
              │  (facts,     │ ◄── enrichment pipeline
              │   scopes,    │     (embed → extract → score → ROUTE)
              │   agents)    │
              └─────────────┘
                     ▲
                     │ project-scoped access
  TeamAgent1 ──┐    │
  TeamAgent2 ──┼────┘
  CIBot ───────┘
Outer Ring (project/team agents)
```

**Enrichment Pipeline (updated):**
```
store_fact → immediate response to agent
     │
     ▼ (async)
  embed (Cohere Embed 4)
     → entity extraction
     → importance scoring
     → smart routing (NEW)  ← match against agent capabilities
     → notification write   ← notify relevant agents
```

## Open Questions

- **Notification delivery:** Should agents pull notifications on `get_context`, or should there be a push mechanism (webhook, polling)?
- **Dedup threshold:** What cosine similarity threshold triggers a merge? Needs experimentation.
- **Handoff trigger:** Should session summaries be auto-generated (time-based, inactivity) or only explicit?
- **Agent capability embeddings:** Pre-compute and cache, or compute on each routing step?
- **Outer ring onboarding:** How does a new project agent get added? Self-registration + approval, or admin-only?

## Next Steps

1. `/workflows:plan` for implementation details — start with shared scopes + handoff protocol (pieces 1-2)
2. Smart routing (piece 3) as a follow-up once the base is working
3. Dedup cron (piece 4) after enough multi-agent data accumulates to test with
