# Engram Research

Collected research on memory systems for AI agents. Informs architecture decisions.

---

## 1. MemGPT / Letta (UC Berkeley, 2023)

**Paper:** https://arxiv.org/abs/2310.08560
**GitHub:** https://github.com/letta-ai/letta

**Core Insight:** Treat context like an OS manages RAM. The LLM controls memory via function calls.

### Three-Tier Architecture

1. **Core Memory** (~2-4KB) — Always in context, editable
   - Persona block (who the agent is)
   - Human block (user info, preferences)
   - Agent edits via `core_memory_append`, `core_memory_replace`

2. **Archival Memory** (unlimited) — Vector DB for long-term storage
   - `archival_memory_insert(content)`
   - `archival_memory_search(query, k=10)`

3. **Recall Memory** — Complete conversation history
   - Searchable past interactions
   - Used for context retrieval

### Key Innovation
Agent *deliberately* manages what it remembers. Memory operations are explicit tool calls, not hidden magic.

---

## 2. Sidecar Memory Pattern (Richard Aragon)

**Core Insight:** Separate memory agent runs alongside main agent, handling memory asynchronously.

### Architecture
```
┌─────────────┐     async      ┌─────────────┐
│ Main Agent  │ ←───────────── │ Sidecar     │
│ (Expensive) │                │ (Cheap)     │
└─────────────┘                └─────────────┘
      │                              │
      └──────── Observations ────────┘
                    │
              ┌─────┴─────┐
              │ Memory DB │
              └───────────┘
```

### Benefits
- Non-blocking (main agent never waits)
- Uses cheaper models for memory processing
- Memory injected transparently into context
- Better for high-throughput systems

---

## 3. Observational Memory (Mastra)

**Source:** Mastra blog / Ryan Carson bookmark (Feb 2026)

**Core Insight:** Agent passively observes and stores without being explicitly asked. Memory is a side-effect of interaction, not a deliberate action.

### How It Differs
- MemGPT: Agent decides what to remember (active)
- Sidecar: External process decides (passive, external)
- Observational: Every interaction generates observations automatically (passive, integrated)

### Application to Engram
The `memory_observe` tool implements this — fire-and-forget fact storage. Convex actions handle enrichment (entity extraction, embeddings, importance scoring) asynchronously.

---

## 4. Context Transfer System (Zac / @PerceptualPeak)

**5-part system for zero knowledge loss across sessions:**

1. **Hourly Memory Summaries** — Granular session snapshots
2. **Full Conversation History** (.JSONL) — Raw conversation replay
3. **Bi-Hourly Learnings Extraction** — LLM extracts patterns, corrections, preferences
4. **User Prompt Submit Hook** — Embed prompt → retrieve relevant learnings → inject before processing (<300ms)
5. **Scratch Pad** — Running list of mistakes, corrections, patterns

### Key Metric
Sub-300ms overhead per prompt for memory retrieval + injection.

---

## 5. Context Rot (Team9)

**Source:** Team9 blog (Feb 2026), bookmarked by community

**Problem:** Long-running agent sessions accumulate stale context, leading to:
- Repeated mistakes
- Forgotten corrections
- Degrading response quality over time

**Solution patterns:**
- Active memory management (prune stale facts)
- Importance-weighted context injection (not FIFO)
- Session summarization at boundaries
- Decay functions on stored knowledge

---

## 6. Multi-Agent Memory Sharing

**Problem:** When agents hand off work, knowledge is lost. Agent A discovers a bug pattern, Agent B hits the same bug an hour later.

**Existing approaches:**

| System | How It Shares |
|--------|--------------|
| Agent Mail | Mailbox messages (text, not structured memory) |
| Claude Code Teams | Shared task list + mailbox (no persistent memory) |
| NTM | File-based state (fragile, no search) |
| Letta | Multi-agent via shared archival memory |

**Engram's approach:**
- Memory scopes: `private`, `team`, `project`, `global`
- Any agent can write to a scope it has access to
- Any agent can search across permitted scopes
- Conversation handoffs preserve full context chain

---

## 7. Importance Scoring (MemoryLance Learnings)

From our existing `ImportanceCalculator` (Swift):

### Multi-Factor Formula
```
importance = (content_score × 0.4) + (centrality × 0.3) + (temporal × 0.2) + (access × 0.1)
```

**Content Analysis (40%):**
- High: decision, error, critical, breaking, failed → 0.9
- Medium: fix, implement, create, build, update → 0.6
- Low: note, observation, maybe, consider → 0.3
- Default: 0.5

**Entity Centrality (30%):**
- 0 entities → 0.1
- 1 entity → 0.4
- 2-3 entities → 0.7
- 4+ entities → 1.0

**Temporal Relevance (20%):**
- < 7 days → 1.0
- Exponential decay: 0.99^days
- Floor: 0.1 (old facts stay searchable)

**Access Frequency (10%):**
- +0.05 per access, max 0.5

### Learnings
- Keyword-based content scoring is rough but effective for v1
- Should upgrade to LLM-based classification in v2
- Decay floor of 0.1 is important — don't delete old knowledge, just deprioritize
- Access boosting creates a natural "frequently needed" signal

---

## 8. Schema Evolution (MemoryLance → Engram)

### What Worked in MemoryLance
- Extended schemas with migration defaults (backward compat)
- Access control per fact (`sharedWith`)
- Conversation threading (facts → conversations → sessions)
- Agent attribution (`createdBy`)

### What Needs Improvement
- Colon-delimited relationships → structured objects
- Local-only → cloud sync
- Script-based queries → MCP tools
- Manual entity linking → auto-extraction
- No multi-device → Convex realtime sync

### Migration Path
1. Export existing entities.json → Convex entities table
2. Export facts_schema.json → Convex facts table
3. Import daily logs → conversation records
4. Rebuild LanceDB indices from Convex data

---

## References

- MemGPT paper: https://arxiv.org/abs/2310.08560
- Letta GitHub: https://github.com/letta-ai/letta
- Mastra observational memory: https://mastra.ai/blog
- Team9 context rot: referenced in community bookmarks
- Zac's 5-part system: @PerceptualPeak Twitter thread
- Our previous research: ~/clawd/memory/archive/2026-01-29-memory-systems.md
- Context system plan: ~/clawd/memory/context-system-plan.md
- Memory plugin integration: ~/clawd/memory/resources/memory-plugin-integration-2026-02-01.md
- MemoryLance source: ~/clawd/memory/resources/memory-system-dev/
