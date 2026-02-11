# ALMA: Meta-Learning Memory Designs for Agents

**Source:** Jeff Clune (@jeffclune), Feb 10, 2026
**Paper:** https://arxiv.org/abs/ALMA (linked from thread)
**GitHub:** https://github.com/[linked from thread]
**Website:** https://[linked from thread]

---

## Core Thesis

Stop hand-designing memory mechanisms. Let a **meta-agent** automatically discover what to store, how to retrieve, and how to update memory — searching in code space with open-ended algorithms.

## Key Findings

1. **Learned > Hand-crafted** — ALMA's memory designs outperform SOTA manually designed memory across ALFWorld, TextWorld, Baba Is AI, Minihack
2. **Task-Specific Patterns** — Different domains produce different memory designs. No one-size-fits-all.
3. **Scales & Generalizes** — Works on unseen tasks and larger data volumes
4. **Open-Ended Search** — Keeps "stepping stone" designs even if low-performing (they lead to breakthroughs)

## Architecture

ALMA uses:
- **Darwin-complete search space** (code) — memory mechanisms are expressed as programs
- **Open-ended exploration** — inspired by ADAS (Automated Design of Agentic Systems) and Darwin Gödel Machine
- **Archive of designs** — growing collection of ever-better memory mechanisms
- **Meta-evaluation** — designs tested on diverse tasks, scored on continual learning performance

## Community Insights (from thread replies)

### The Forgetting Problem (Consensus Theme)
Multiple practitioners independently identified the same core challenge:

> "The hard part isn't storage or retrieval, it's knowing what to FORGET" — @Bender_MkII

> "Compression > retrieval. Knowing what to throw away without losing the thread" — @ejae_dev

> "Most agent memory implementations just dump everything and pray embeddings sort it out" — @ParraEvan

> "Every agent I build eventually drowns in its own context" — @eibrahim

### Practical Concerns

> "How do you keep learned memory policies interpretable for operators?" — @idanzei

> "Hardcode a verifiable logic floor first, then let it evolve" — @larsohorpestad

> "The real bottleneck isn't what to store or how to retrieve it, it's knowing what to forget. Curious if ALMA learns selective forgetting too" — @eibrahim

> "What starts as adaptive storage turns into a feedback loop of forgotten priorities—same as an immune system losing T-cell memory, refighting old threats" — @larsohorpestad

### Meta-Observation

> "Tasking long running agents to improve their own memory as lapses are found through mandatory reflection/'dreaming' achieves some of this" — @dennizor

This aligns with the "sleep consolidation" pattern — periodic reflection and compression, not just passive decay.

---

## Patterns to Extract for Engram

### P0: Selective Forgetting (Active, Not Passive)

**Problem:** Our current decay is dumb (1%/day uniform). ALMA shows memory should actively decide what to forget.

**Implementation:**
- Add `forgetScore` field to facts table
- Cron job evaluates: "Is this fact superseded, outdated, or redundant?"
- Facts with high forget score → archived (not deleted — safety net)
- Different from decay: decay is time-based, forgetting is content-based

```typescript
// facts table addition
forgetScore: v.optional(v.float64()),  // 0.0 = keep forever, 1.0 = safe to forget
supersededBy: v.optional(v.id("facts")),  // if this fact was replaced by a newer one
```

### P0: Task-Specific Memory Policies

**Problem:** Coding agents need different memory than research agents.

**Implementation:** Scope-level memory policies:

```typescript
// memory_scopes table addition  
memoryPolicy: v.optional(v.object({
  maxFacts: v.number(),                    // cap per scope (prevent drowning)
  decayRate: v.float64(),                  // scope-specific decay (faster for ephemeral scopes)
  prioritizeTypes: v.array(v.string()),    // e.g., coding: ["error", "decision"], research: ["insight", "observation"]
  autoForget: v.boolean(),                 // enable active forgetting
  compressionStrategy: v.string(),         // "summarize" | "prune" | "merge"
  retentionFloor: v.float64(),             // minimum relevance before eligible for forgetting
}))
```

### P1: Memory Compression (Sleep Consolidation)

**Problem:** Fact count grows unbounded. Related facts pile up without synthesis.

**Implementation:** New scheduled function `compress:consolidate`:
1. Find clusters of related facts (semantic similarity > 0.8, same scope)
2. If cluster has 5+ facts → summarize into one consolidated fact
3. Consolidated fact links to originals (archived, not deleted)
4. Inherits highest importance from cluster
5. Reduces token cost of warm start injection

```typescript
// facts table addition
consolidatedFrom: v.optional(v.array(v.id("facts"))),  // originals this was consolidated from
isConsolidated: v.optional(v.boolean()),                // true if this is a summary fact
isArchived: v.optional(v.boolean()),                    // true if superseded by consolidation
```

### P1: Usefulness Tracking

**Problem:** We track access count but not whether recalled facts were actually useful.

**Implementation:**
- When agent recalls facts, track which ones appear in the response
- `wasUseful: true/false` feedback loop
- Over time: facts recalled but never useful → deprioritize
- Facts recalled AND useful → boost importance

```typescript
// New table: recall_feedback
defineTable({
  factId: v.id("facts"),
  sessionId: v.id("sessions"),
  recalled: v.boolean(),         // was this fact returned in a recall?
  usedInResponse: v.boolean(),   // did the agent actually use it?
  timestamp: v.number(),
})
```

### P2: Memory Policy Evolution (Long-Term)

**Problem:** Hand-crafted policies are static. ALMA shows policies should evolve.

**Implementation:** `engram-evolve` skill (future):
1. Monthly analysis of memory usage patterns
2. Identify: stored-but-never-recalled, recalled-but-not-useful, missing-when-needed
3. Propose policy changes per scope
4. Human approval before applying
5. Track policy change impact over next period

### P2: Mandatory Reflection ("Dreaming")

**Insight from @dennizor:** Agents should periodically reflect on memory lapses.

**Implementation:** Weekly cron that:
1. Reviews sessions where agent said "I don't know" or had to ask for context it should've had
2. Identifies memory gaps
3. Proactively fills gaps from available sources (session logs, research, etc.)
4. Reports: "I found 3 memory gaps this week and filled 2 of them"

---

## What ALMA Gets Right (Copy)

1. **Memory as code** — Memory mechanisms are programs, not static configs
2. **Open-ended archive** — Keep diverse approaches, not just the best one
3. **Task-specific designs** — No universal memory policy
4. **Evaluation-driven** — Measure if memory actually helps performance
5. **Stepping stones** — Low-performing ideas can lead to breakthroughs

## What ALMA Doesn't Address (We Must)

1. **Multi-agent sharing** — ALMA is single-agent. We need scoped sharing.
2. **Human-in-the-loop** — ALMA is fully automated. We need operator interpretability.
3. **Privacy/access control** — ALMA doesn't consider memory permissions.
4. **Real-time retrieval** — ALMA evaluates offline. We need sub-300ms recall.
5. **Incremental learning** — ALMA trains in batches. We need continuous ingestion.

---

## Related Work (from Jeff Clune's lab)

- **ADAS** — Automated Design of Agentic Systems
- **ACD** — Automated Capability Discovery  
- **OMNI** — Open-endedness via models of human notions of interestingness
- **Darwin Gödel Machine** — AI that improves itself by rewriting its own code

All share the philosophy: **let AI design AI components, don't hand-craft them.**
