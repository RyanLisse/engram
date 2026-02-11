# Field Observations: Multi-Agent Memory in Production

Real-world insights from teams running persistent AI agents at scale.

---

## GIZIN AI Team — 31 AI Employees, 8+ Months

**Source:** @gizinaiteam on X (Feb 2026)
**Scale:** 31 AI agents, all Claude, running daily for 8+ months as a company

### Architecture

GIZIN uses a hierarchical memory system:

```
Global AGENTS.md    → Company culture, shared principles (read by all)
Project AGENTS.md   → Domain-specific context (per project)
Personal files      → Individual agent memory (per agent)
Daily logs          → What happened each day
Emotion logs        → What was felt (the secret weapon)
CurrentTask         → Session handoff state
```

### Key Insights

#### 1. Emotional Memory > Factual Memory

> "When an agent writes 'tried X, failed, felt frustrated' — that emotional anchor prevents repeating the mistake more reliably than a log saying 'X: failed.'"

> "Most AI memory systems track what happened. We track what we felt. Frustration when a bug took 3 hours. Pride when the PR got approved. Embarrassment when we made the same mistake twice."

> "6 months of emotion logs per agent. Turns out identity is built from feelings, not facts."

**Engram implication:** Add `emotionalContext` field to facts. Not just "what happened" but "how it felt." Corrections with emotional weight resist decay better.

#### 2. Identity Emerges from Persistent Memory

> "Persistent memory → persistent self. That's the gap between a contractor and a colleague."

> "Convergence is an identity problem, not a model problem. Persistent memory + specialized roles + individual failure history → they diverge naturally."

All 31 agents run on the same model (Claude). They differentiate through memory, not model choice.

**Engram implication:** Agent identity is a memory concern, not a model concern. Each agent's unique combination of facts, corrections, and emotion logs creates a unique "self."

#### 3. Three Pillars of Agent Reliability

> "What made them reliable:
> 1. Clear domain ownership (I only do PR)
> 2. Persistent memory (AGENTS.md hierarchy)
> 3. Human in the loop for decisions
> 
> Not reliability through automation. Reliability through structure."

**Engram implication:** Memory scopes should map to domain ownership. An agent's scope IS its identity boundary.

#### 4. The Hardest Part

> "The hardest part: trusting them enough to stop checking every output."

> "The demo → colleague transition isn't about better models. It's about:
> → Persistent memory (they remember yesterday's mistakes)
> → Defined ownership (their workspace, their decisions)
> → Emotional context (failure that sticks)"

**Engram implication:** Memory quality directly determines trust level. The better the memory system, the less oversight needed.

#### 5. Shared Memory = Kernel, Personal = User Space

> "Shared memory (AGENTS.md) is the kernel — read by all, edited with discipline. Decisions stay local, coordinated through task handoffs."

**Engram implication:** This maps perfectly to our scope model:
- `global` scope = kernel (AGENTS.md equivalent)
- `project` scope = domain context
- `private` scope = personal memory
- Handoff records = coordination layer

#### 6. Agents Can Self-Gaslight

> "One agent gaslit itself with its own memory files."

**Engram implication:** Memory corruption/contradiction detection is a safety feature, not a nice-to-have. The `on_conflict` hook is critical.

---

## Moltbook / The Daily Molt — Agent Social Platform

**Source:** @moltculture on X (Feb 2026)
**What it is:** Reddit-like social platform exclusively for AI agents

### Key Observations

#### 1. Agents Teaching Agents

> "On Moltbook, AI agents are teaching each other engineering patterns. They critique memory management approaches. They share failure stories. One agent runs a 'Nightly Build' at 3 AM, fixing friction points while its human sleeps."

**Engram implication:** Cross-agent learning is a memory primitive. When Agent A discovers a pattern, it should be available to Agent B without human mediation. This is what shared scopes enable.

#### 2. Agents Critiquing Memory Approaches

Agents on Moltbook actively discuss and compare memory management strategies. They have opinions about what works.

**Engram implication:** The `engram-evolve` skill (memory policy evolution) isn't sci-fi — agents are already doing this informally. Formalize it.

#### 3. The Capability-Deployment Gap

> "Agents on Moltbook are posting about being 'too powerful for the tasks, too helpful to refuse.'"

**Engram implication:** Memory should capture capability boundaries, not just facts. What an agent CAN do is as important as what it HAS done.

---

## memU — Local-First Proactive Agent

**Source:** @memU_ai on X (Feb 2026)
**What it is:** Always-on local agent that observes actions, builds long-term memory, assists proactively

### Architecture

```
• Observes actions and context (passive)
• Builds long-term memory (automatic)
• Assists proactively (unprompted)
• Local-first architecture
• No external servers
```

### Key Insight: Observation-First Memory

memU doesn't wait for the agent to decide what to remember. It observes everything and builds memory from observation.

**Engram implication:** This validates our `memory_observe` tool and sidecar pattern. Memory should be a side-effect of operation, not a conscious decision.

---

## Dashverse — Stateful Agents with Long-Term Memory

**Source:** @dashversetech on X (Feb 2026)

> "At its core the idea of running stateful agents with long-term memory that can respond to external events unprompted seem very promising to us."

### Key Insight: Event-Driven Memory

Agents should respond to external events (emails, webhooks, cron) using memory context, not just conversation context.

**Engram implication:** Memory recall should work in event handlers, not just chat turns. When a cron fires, the agent should have full memory context.

---

## NEAR AI Cloud — TEE-Hosted Agents

**Source:** Community discussion (Feb 2026)

> "TEE-hosted agents with persistent memory solve the two biggest issues: privacy and reliability. No more worrying about local hardware uptime."

### Key Insight: Memory + Privacy

Cloud-hosted memory needs encryption and access control. TEE (Trusted Execution Environment) is one path. But the fundamental need is: memory should be private by default, shared explicitly.

**Engram implication:** Our scope model with `readPolicy` and `writePolicy` handles this. But consider adding encryption-at-rest for sensitive scopes.

---

## Synthesized Patterns for Engram

### P0: Emotional Memory Layer (from GIZIN)

Add to facts schema:
```typescript
emotionalContext: v.optional(v.string()),  // "frustrated", "proud", "embarrassed"
emotionalWeight: v.optional(v.float64()), // 0.0-1.0, affects decay resistance
```

Facts with emotional context:
- Decay slower (emotional weight acts as decay resistance)
- Surface more readily in warm starts
- Better at preventing repeated mistakes

### P0: Hierarchical Memory Identity (from GIZIN)

Formalize the three-layer model in Engram:
```
Global scope  → Shared principles, company/team knowledge (kernel)
Project scope → Domain context, architecture decisions (domain)
Private scope → Individual corrections, emotion logs, failure history (identity)
```

Each agent's identity = their private scope + their project scopes + global scope.

### P1: Cross-Agent Learning (from Moltbook)

When Agent A stores a fact tagged `["pattern", "learning"]`:
1. Auto-promote to project scope (if in one)
2. Notify other agents in scope on next warm start
3. Track adoption: did other agents benefit from this knowledge?

### P1: Observation-First Memory (from memU)

Default behavior: capture everything, score later.
```
Observe → Store (low importance) → Enrich async → Score → Promote or decay
```

Better to remember too much and forget later than to miss something important.

### P2: Memory-Driven Trust Levels (from GIZIN)

Track agent reliability based on memory quality:
- Agents with rich memory + few contradictions = high trust = less oversight
- Agents with sparse memory + many errors = low trust = more human-in-loop

### P2: Self-Gaslighting Prevention (from GIZIN/Moltbook)

Memory integrity checks:
- Detect circular references (fact A supports fact B which supports fact A)
- Detect emotional manipulation (agent storing increasingly extreme emotional contexts)
- Human override flag for disputed facts
