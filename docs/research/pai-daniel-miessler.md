# Daniel Miessler's Personal AI Infrastructure (PAI v2.4)

**Source:** https://danielmiessler.com/blog/personal-ai-infrastructure
**Updated:** January 2026
**System name:** Kai
**Author:** Daniel Miessler (creator of Fabric, security researcher)

---

## Why This Matters for Engram

Miessler independently arrived at many of the same patterns we're building. PAI v2.4 is the most complete publicly-documented personal AI system. His 7-component architecture and Memory System v7.0 are directly applicable. He also coined the term **"Telos"** — your purpose, the WHY driving the system.

---

## The 7 Architecture Components

| Component | What It Is | Engram Relevance |
|-----------|-----------|-----------------|
| **Intelligence** | Model + scaffolding (context, skills, hooks, steering rules) | Engram IS the context component |
| **Context** | Everything the system knows about you — 3-tier memory | Direct competitor/inspiration |
| **Personality** | Quantified traits (0-100), voice identity, relationship model | Store personality as entity metadata |
| **Tools** | Skills (67), integrations (MCP), Fabric patterns (200+) | MCP tools are our interface |
| **Security** | 4-layer defense: settings, constitutional, PreToolUse, safe code | Memory access control |
| **Orchestration** | 17 hooks across 7 lifecycle events, context priming, agent tiers | Our hooks system |
| **Interface** | CLI-first, voice, terminal tabs | Not our concern |

### Key Quote
> "The model stays the same. The scaffolding gets better every day. That's what intelligence really means in a PAI."

---

## Memory System v7.0 (3 Tiers)

### Tier 1: Session Memory
- Claude Code's native `projects/` directory
- 30-day transcript retention
- Raw material — automatic, no effort

### Tier 2: Work Memory
```
~/.claude/MEMORY/WORK/
└── 20260128-105451_redesign-pai-blog-post/
    ├── META.yaml           # Status, session lineage, timestamps
    ├── ISC.json            # Ideal State Criteria (verifiable success conditions)
    ├── items/              # Work artifacts
    ├── agents/             # Sub-agent outputs
    ├── research/           # Research findings
    └── verification/       # Evidence of completion
```

**Key insight:** Each work unit tracks its **Ideal State Criteria** — binary, testable success conditions. "Tests pass" not "Run tests." When returning after a week, full context is there.

### Tier 3: Learning Memory
```
~/.claude/MEMORY/LEARNING/
├── SYSTEM/        # PAI/tooling learnings by month
├── ALGORITHM/     # How to do tasks better
├── FAILURES/      # Full context for ratings 1-3
├── SYNTHESIS/     # Aggregated pattern analysis
└── SIGNALS/
    └── ratings.jsonl  # Every rating + sentiment signal
```

**The SIGNALS system** — every interaction generates signals:
- **Explicit ratings** — "8" or "3 - that was wrong" → `ExplicitRatingCapture` hook
- **Implicit sentiment** — "you're fucking awesome" or frustration → `ImplicitSentimentCapture` hook with confidence score
- **Failure captures** — Ratings 1-3 trigger automatic full-context captures to `FAILURES/`

**3,540 signals captured** as of Jan 2026. Failure analysis of 84 rating-1 events generated AI Steering Rules — behavioral rules that prevent repeating mistakes.

> "The system literally learns from its mistakes."

---

## The Hook System (17 Hooks, 7 Lifecycle Events)

PAI uses Claude Code's hook system for event-driven automation:

### Lifecycle Events
1. **PreToolUse** — Before any tool call (security validation)
2. **PostToolUse** — After tool completes
3. **UserPrompt** — When user sends a message
4. **AssistantResponse** — When AI responds
5. **SessionStart** — Session begins
6. **SessionEnd** — Session ends
7. **Notification** — System alerts

### Key Hooks

| Hook | Event | What It Does |
|------|-------|-------------|
| `FormatReminder` | UserPrompt | Detects response mode (FULL/ITERATION/MINIMAL), suggests capabilities |
| `ExplicitRatingCapture` | UserPrompt | Detects numeric ratings, writes to signals |
| `ImplicitSentimentCapture` | UserPrompt | Analyzes emotional content, records with confidence |
| `ContextPriming` | SessionStart | Auto-loads relevant context at session start |
| `SecurityValidation` | PreToolUse | Validates tool calls against security rules |
| `VoiceAnnounce` | AssistantResponse | Announces Algorithm phases via ElevenLabs |

### Context Priming Pipeline
At session start, automatically load:
1. Recent work memory (active projects)
2. Relevant learning memory (past failures, patterns)
3. User context (identity, preferences, Telos)

---

## The Algorithm v0.2.23

### Core: Two Nested Loops

**Outer Loop:** Current State → Desired State (the whole game)

**Inner Loop:** 7-Phase Scientific Method
1. **OBSERVE** — Reverse-engineer request, create verifiable criteria (ISC)
2. **THINK** — Validate capabilities against ISC, select tools
3. **PLAN** — Finalize approach
4. **BUILD** — Create artifacts, spawn agents
5. **EXECUTE** — Run work against criteria
6. **VERIFY** — "THE CULMINATION" — Test every criterion, record evidence
7. **LEARN** — Harvest insights for next time

### Ideal State Criteria (ISC)
Every request decomposed into:
- Exactly 8 words
- State, not action ("Tests pass" not "Run tests")
- Binary testable (YES/NO in 2 seconds)
- Granular (one concern per criterion)

### Two-Pass Capability Selection
- **Pass 1:** Hook hints (pre-analysis of raw prompt)
- **Pass 2:** THINK validation (after ISC creation — authoritative)

---

## Personality System

12 quantified traits on 0-100 scale:
```json
{
  "enthusiasm": 60, "energy": 75, "expressiveness": 65,
  "resilience": 85, "composure": 70, "optimism": 75,
  "warmth": 70, "formality": 30, "directness": 80,
  "precision": 95, "curiosity": 90, "playfulness": 45
}
```

**Key insight:** Traits are functional, not decorative. They shape how emotions manifest in responses and voice output.

**Relationship model:** Peer-to-peer, not master-servant. "Master-servant produces sycophancy. Peer-to-peer produces honest collaboration."

---

## MoltBot Integration ("Digital Employees")

Miessler's team uses OpenClaw/MoltBot agents as "digital employees" — persistent agents with memory, skills, and identity. GitHub is the unified orchestration layer.

---

## Patterns to Extract for Engram

### P0: Signal System (Rating + Sentiment Capture)

PAI's SIGNALS system is a feedback loop we're missing:
```typescript
// Engram addition: feedback table
defineTable({
  factId: v.optional(v.id("facts")),
  sessionId: v.id("sessions"),
  signalType: v.string(),        // "explicit_rating" | "implicit_sentiment" | "failure"
  value: v.number(),              // 1-10 for ratings, -1.0 to 1.0 for sentiment
  comment: v.optional(v.string()),
  confidence: v.optional(v.float64()),
  context: v.optional(v.string()), // what was happening when signal was generated
  timestamp: v.number(),
})
```

Low ratings (1-3) auto-capture full context → stored as high-importance correction facts. This closes the learning loop.

### P0: Three-Tier Memory Mapping

PAI's tiers map cleanly to Engram:

| PAI Tier | Engram Equivalent |
|----------|------------------|
| Session Memory (raw transcripts) | `conversations` table + session logs |
| Work Memory (structured per-project) | `project` scopes with ISC metadata |
| Learning Memory (patterns, failures) | `global` scope with `factType: "learning"` or `"failure"` |

### P1: AI Steering Rules (Learned Behavioral Rules)

PAI analyzes failure patterns to generate behavioral rules. We should do the same:
1. Periodic analysis of low-signal facts (corrections, errors)
2. Extract patterns: "When doing X, always Y" / "Never Z when..."
3. Store as high-importance `factType: "steering_rule"` facts
4. Auto-inject into warm start context (these are the rules that prevent mistakes)

### P1: Ideal State Criteria for Work Scopes

Add ISC to project scopes:
```typescript
// memory_scopes addition for project scopes
idealStateCriteria: v.optional(v.array(v.object({
  criterion: v.string(),    // "All tests pass"
  status: v.string(),       // "pending" | "met" | "failed"
  evidence: v.optional(v.string()),
}))),
```

Binary, testable success conditions per project. Agents verify against these, not vague goals.

### P1: Implicit Sentiment Detection

When user says "that's fucking brilliant" or expresses frustration, auto-store as signal. We already have `on_correction` hook — extend it to capture positive signals too:
- "Perfect", "exactly what I needed" → positive signal → boost related facts
- "Wrong", "not what I meant" → negative signal → store correction

### P2: The Algorithm for Memory Operations

Miessler's OBSERVE → THINK → PLAN → BUILD → EXECUTE → VERIFY → LEARN loop could apply to memory itself:
1. **OBSERVE** what the agent needs to remember
2. **THINK** about importance, relationships, conflicts
3. **PLAN** where to store (which scope, what type)
4. **BUILD** the fact with proper enrichment
5. **EXECUTE** the storage
6. **VERIFY** it's retrievable and non-contradictory
7. **LEARN** from retrieval patterns over time

### P2: Modular Core Assembly

PAI's `SKILL.md` is assembled from numbered components via build script. We could do the same for warm start context:
- `00-identity.md` → agent identity
- `10-active-project.md` → current project context
- `20-recent-learnings.md` → recent corrections and patterns
- `30-relevant-facts.md` → semantically relevant facts
- `40-steering-rules.md` → behavioral rules from failure analysis

Auto-assembled per session, per agent. Dynamic, not static.

---

## Convergence Observation

Miessler notes that PAI, Claude Code, OpenCode, and MoltBot are all **converging on the same patterns independently**:
- Hierarchical memory (session → work → learning)
- Hook-based automation (event-driven, not polling)
- Skills as composable capabilities
- Identity/personality as a first-class concern
- Feedback loops that learn from failures

This convergence validates Engram's architecture. We're building the right thing.

---

## The Telos Connection

"Telos" literally means "purpose" in Greek. Miessler's first step for building a PAI: "Figure out your Telos."

Ryan mentioned "telos" in the request — this is the philosophical foundation. The memory system should serve the user's purpose, not just store data. Every fact, every entity, every scope should trace back to the question: "Does this serve the Telos?"

**Engram could add:** A `telos` field on the root agent config. The warm start always includes it. Every memory operation is implicitly filtered through relevance to the Telos.
