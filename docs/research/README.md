# Engram Research Index

All research informing Engram's architecture, ordered by relevance.

---

## Memory Systems & Frameworks

| Document | Source | Key Takeaway |
|----------|--------|-------------|
| [SimpleMem](simplemem-cross-session.md) | Salesforce/AIMING Lab | SOTA cross-session memory. Semantic lossless compression, multi-view indexing, token-aware injection. +64% over Claude-Mem |
| [Letta Deep Dive](letta-deep-dive.md) | Letta/MemGPT | 3-tier memory (core/recall/archival), memory-as-tools, conversation compaction, memory blocks |
| [Letta Patterns for Engram](letta-patterns-for-engram.md) | Extracted from deep dive | Prioritized P0/P1/P2 patterns mapped to Engram schema |
| [PAI v2.4 — Daniel Miessler](pai-daniel-miessler.md) | danielmiessler.com | 7-component PAI architecture, Memory System v7.0, Signal system (ratings + sentiment), 17 hooks, The Algorithm, Telos |

## Meta-Learning & Theory

| Document | Source | Key Takeaway |
|----------|--------|-------------|
| [ALMA Meta-Memory](alma-meta-memory.md) | Jeff Clune / @jeffclune | Meta-learning memory designs > hand-crafted. Selective forgetting > better storage. Task-specific policies. Community consensus: "the hard part is knowing what to FORGET" |

## Field Observations (Production Systems)

| Document | Source | Key Takeaway |
|----------|--------|-------------|
| [Field Observations](field-observations.md) | GIZIN (31 agents, 8mo), Moltbook, memU, Dashverse | Emotional memory is the secret weapon. Identity emerges from persistent memory. Observation-first capture. Self-gaslighting is a real risk. |

---

## Cross-Cutting Insights

### What Everyone Agrees On
1. **Memory is the moat** — not model choice, not prompt engineering
2. **Knowing what to forget > knowing what to store** (ALMA, SimpleMem, GIZIN, community)
3. **Scaffolding > model intelligence** (Miessler, GIZIN)
4. **Emotional/sentiment signals matter** (GIZIN emotion logs, Miessler SIGNALS system)
5. **Cross-session continuity is the #1 unsolved problem** (SimpleMem, Letta, Zac's 5-part system)

### Unique Insights Per Source
- **SimpleMem:** Semantic lossless compression + token budgets for injection
- **Letta:** Memory blocks (named, sized, mutable) as system prompt components
- **Miessler:** Signal system (explicit ratings + implicit sentiment → steering rules)
- **ALMA:** Let the system evolve its own memory policies
- **GIZIN:** Emotional memory prevents mistakes better than factual logs
- **Moltbook:** Agents naturally teach each other when memory is shared

### What No One Has Solved Yet
1. **Multi-agent memory sharing** with proper access control (Engram's differentiator)
2. **Memory policy evolution** that's interpretable to operators
3. **Real-time contradiction detection** across agents
4. **Intent-aware retrieval** combined with emotional context
5. **Telos-driven memory** — filtering everything through purpose
