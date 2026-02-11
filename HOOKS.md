# Engram Hooks

Event-driven hooks that make memory automatic, not manual.

---

## Session Lifecycle Hooks

### `on_session_start` — Warm Start Injection
**Trigger:** Any OpenClaw agent session starts
**Action:** 
1. Detect topic from channel/agent/recent messages
2. Call `memory_get_context(topic, limit=20)`
3. Inject top facts as hidden context before first turn

**Why:** Replaces static `MEMORY.md` with dynamic, relevance-weighted context. Agent only sees what matters for THIS conversation.

**Implementation:** OpenClaw pre-turn hook or MCP resource injection.

---

### `on_session_end` — Auto-Summarize & Store
**Trigger:** Session ends, compacts, or goes idle > 30min
**Action:**
1. Summarize session (decisions, corrections, patterns, entities)
2. Store as facts with `factType: "session_summary"`
3. Update session record with `contextSummary` for future warm start
4. Link to conversation thread

**Why:** The anti-context-rot hook. Nothing is lost between sessions.

---

### `on_agent_spawn` — Context Handoff
**Trigger:** `sessions_spawn` fires
**Action:**
1. Summarize parent's current conversation context
2. Create conversation handoff record
3. Attach relevant scope facts to child agent's context
4. Child agent auto-registers with parent's project scope

**Why:** Zero knowledge loss on delegation.

---

## Memory Event Hooks

### `on_fact_stored` — Enrichment Pipeline
**Trigger:** Any `memory_store_fact` or `memory_observe` call
**Action:** Async pipeline:
1. Generate embedding (OpenAI, ~200ms)
2. Extract entities (cheap model, ~500ms)
3. Calculate importance score (~10ms)
4. Update fact with enriched data
5. Signal sync_log for all nodes

**Why:** Agents store raw facts fast. Enrichment happens in the background.

---

### `on_correction` — Learning Amplifier
**Trigger:** Detect correction patterns in user messages:
- "no, actually..."
- "that's wrong"
- "not X, Y"
- "I meant..."
- "correction:"

**Action:**
1. Store as fact with `factType: "correction"`, `importanceScore: 0.9`
2. Set minimum decay floor at 0.5 (corrections should persist longer)
3. Link to the fact being corrected (if identifiable)
4. Tag with `["correction", "high-priority"]`

**Why:** Corrections are the highest-value memory. Agent should never repeat a corrected mistake.

---

### `on_handoff_complete` — Merge Back
**Trigger:** Spawned agent session ends
**Action:**
1. Collect all facts from child agent's private scope
2. Promote relevant facts to parent's project scope
3. Update conversation handoff record with completion summary
4. Merge entity discoveries back to shared graph

**Why:** The orchestrator sees everything the worker discovered.

---

### `on_conflict` — Fact Contradiction Detection
**Trigger:** New fact has semantic similarity > 0.9 with existing fact but opposite sentiment/content
**Action:**
1. Flag both facts as `conflicting`
2. Do NOT auto-resolve
3. Surface to agent: "Conflict detected: [old fact] vs [new fact]. Which is current?"
4. On resolution: deprecate old fact, boost new fact importance

**Why:** Memory should be consistent. Contradictions erode trust.

---

## External Event Hooks

### `on_tool_error` — Error Memory
**Trigger:** Any tool call fails
**Action:**
1. Store error as fact: `factType: "error"`
2. Include: tool name, error message, context
3. Tag with tool name for easy retrieval
4. Next time agent uses same tool, relevant errors surface via warm start

**Why:** Don't hit the same wall twice.

---

### `on_research_complete` — Knowledge Ingestion
**Trigger:** Research sub-agent completes
**Action:**
1. Parse research output for atomic facts
2. Store each as separate fact with `source: "research"`
3. Extract and link entities
4. Create conversation record linking all research facts

**Why:** Research should feed the memory system, not sit in a markdown file.

---

### `on_bookmark_processed` — External Knowledge
**Trigger:** Bookmark miner processes new bookmarks (Twitter, etc.)
**Action:**
1. Extract key insights from bookmarked content
2. Store as facts with `source: "bookmark"` + original URL
3. Link to relevant project/topic entities

**Why:** Bookmarks are intent signals. The knowledge should be queryable.
