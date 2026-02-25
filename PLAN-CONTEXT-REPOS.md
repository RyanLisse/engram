# Engram Context Repositories Optimization Plan

> Inspired by Letta's Context Repositories (git-backed memory), Panini (QA-pair structured memory),
> and Anthropic's progressive disclosure patterns. Goal: bring Engram from API-only memory to a
> context-engineered, self-organizing, versioned memory system.

## Background

Engram is already a sophisticated multi-agent memory system with 73 MCP tools, 17 Convex tables,
rich fact schema (confidence, importance, lifecycle, emotional context, temporal links), and
scope-based access control. However, it lacks several key features that Letta's Context Repositories
demonstrate as critical for production agent memory:

1. **Progressive Disclosure** — no tiered loading; agents get all or nothing
2. **Version History** — mutations are destructive, no rollback capability
3. **Sleep-Time Reflection** — no background consolidation agent
4. **QA-Pair Representation** — facts are raw text, not structured for retrieval chains
5. **History Bootstrap** — doesn't ingest existing session data
6. **Filesystem Mirror** — no file-based memory access for bash/script manipulation

## Phase 1: Progressive Disclosure Layer

### Goal
Reduce context window waste by tiering memory into pinned (always loaded) vs navigable (on-demand).

### Tasks

#### 1.1 Schema: Add pinned + summary fields to facts
- Add `pinned: v.optional(v.boolean())` to facts table in `convex/schema.ts`
- Add `summary: v.optional(v.string())` for frontmatter-style disclosure
- Add index `by_pinned` on `["pinned", "scopeId"]`
- Migration: no data migration needed (optional fields)

#### 1.2 MCP Tool: `memory_get_manifest`
New tool in `mcp-server/src/tools/` that returns:
- All pinned facts (full content) for the agent's scopes
- Category breakdown: `{ factType: string, count: number, topSummaries: string[] }`
- Total token estimate for context budget planning
- Designed for system prompt injection (replaces raw `get_context` for overview)

#### 1.3 MCP Tool: `memory_pin` / `memory_unpin`
- Pin/unpin facts by ID
- Auto-enforce max pinned limit (configurable via `set_config`, default 20)
- When pinning, auto-generate summary if missing

#### 1.4 Update `build_system_prompt` to use manifest
- Inject pinned facts as always-in-context
- Add filetree-style manifest of unpinned categories
- Respect token budget (existing `load_budgeted_facts` pattern)

#### 1.5 Summary auto-generation in enrichment pipeline
- On fact creation, generate 1-line summary via LLM (async enrichment)
- Store in `summary` field
- Used by manifest for progressive disclosure

### Tests
- Unit: pin/unpin operations, max limit enforcement
- Unit: manifest returns correct structure
- Integration: build_system_prompt includes pinned facts + manifest
- E2E: Agent creates facts → pins important ones → manifest reflects correctly

---

## Phase 2: Sleep-Time Reflection Agent

### Goal
Background memory consolidation that runs between interactions.

### Tasks

#### 2.1 Convex: Reflection cron job
- New cron in `convex/crons.ts`: every 4 hours
- Implementation in `convex/crons/reflection.ts`
- Queries recent facts (last 4h), identifies:
  - Near-duplicates (embedding cosine > 0.92)
  - Contradictions (opposing sentiment on same entity)
  - Consolidation candidates (same entity, same factType)

#### 2.2 MCP Tool: `memory_reflect`
Note: `reflect` tool already exists but is limited. Enhance it:
- Accept `depth` parameter: shallow (dedup only), deep (consolidation + re-scoring)
- Accept `timeWindow` parameter: how far back to look
- Return reflection report: `{ merged: number, archived: number, contradictions: string[] }`

#### 2.3 OpenClaw cron: Sleep-time reflection agent
- OpenClaw cron job (isolated session, Haiku model)
- Runs every 6h during active hours (08:00-01:00 CET)
- Workflow:
  1. Call `memory_reflect` with deep mode
  2. Review recent OpenClaw session history
  3. Extract new facts/preferences/corrections
  4. Store via `store_fact`
  5. Update importance scores via `boost_relevance`

#### 2.4 Defragmentation skill
- New MCP tool: `memory_defrag`
- Reorganizes facts: splits large content, merges micro-facts
- Targets 15-25 active facts per category
- Updates entity links and temporal relations
- Runs weekly via cron

### Tests
- Unit: dedup detection (cosine threshold)
- Unit: consolidation merge logic
- Integration: reflection cron runs and produces report
- E2E: Create 50 facts with overlaps → reflect → verify merge count

---

## Phase 3: Version History

### Goal
Non-destructive mutations with full audit trail and rollback.

### Tasks

#### 3.1 Schema: Add `fact_versions` table
```typescript
fact_versions: defineTable({
  factId: v.id("facts"),
  version: v.number(),
  previousContent: v.string(),
  previousMetadata: v.optional(v.string()), // JSON of changed fields
  changedBy: v.string(), // agent ID
  changedAt: v.number(),
  changeType: v.string(), // "update" | "merge" | "archive" | "pin" | "unpin"
  reason: v.string(), // commit-message style
}).index("by_fact", ["factId", "version"])
  .index("by_agent", ["changedBy", "changedAt"])
```

#### 3.2 Update mutation functions to create versions
- Wrap `update_fact`, `archive_fact`, `mark_facts_merged`, `mark_facts_pruned`
- Before mutation: snapshot current state → insert version record
- Include `reason` parameter on all mutation tools

#### 3.3 MCP Tool: `memory_history`
- Input: factId
- Returns: array of versions with diffs, sorted newest first
- Includes agent attribution and reason

#### 3.4 MCP Tool: `memory_rollback`
- Input: factId, versionNumber
- Restores fact content + metadata from that version
- Creates new version record for the rollback itself

#### 3.5 Dashboard: Version timeline view
- In `dashboard/`, add version history component
- Shows git-log style commit history per fact
- Diff view between versions

### Tests
- Unit: version creation on each mutation type
- Unit: rollback restores correct state
- Integration: 5 updates → history shows 5 versions → rollback to v2 → verify
- E2E: Agent workflow with corrections → version trail is accurate

---

## Phase 4: QA-Pair Representation (Panini-inspired)

### Goal
Make facts more retrievable and reasoning-friendly via structured QA pairs.

### Tasks

#### 4.1 Schema: Add QA fields to facts
```typescript
// Add to facts table:
qaQuestion: v.optional(v.string()),   // "What is Ryan's preferred tech stack?"
qaAnswer: v.optional(v.string()),     // "TypeScript/Next.js primary, Swift for macOS CLIs"
qaEntities: v.optional(v.array(v.string())), // ["Ryan", "TypeScript", "Next.js", "Swift"]
qaConfidence: v.optional(v.float64()), // 0.0-1.0
```
- Add search index on `qaQuestion` for text search

#### 4.2 QA generation in enrichment pipeline
- On fact creation (async), generate QA pair via LLM
- Prompt: "Convert this fact into a question-answer pair that would help retrieve it"
- Store in qa fields
- Fallback: if LLM unavailable, leave null (graceful degradation)

#### 4.3 QA-aware recall
- Update `recall` tool to also search `qaQuestion` field
- Reciprocal Rank Fusion: existing content search + QA question search + vector search
- Weight QA matches higher for structured queries

#### 4.4 Graph-based retrieval chains
- New tool: `memory_chain_recall`
- Given a complex question, decompose into sub-questions
- For each sub-question, find matching QA pairs
- Follow entity links to related facts
- Return synthesized answer with provenance chain

#### 4.5 Benchmark suite
- Create test set: 50 known facts, 25 retrieval questions
- Measure recall@5, precision@5, MRR before and after QA pairs
- Store results in `tests/benchmarks/`

### Tests
- Unit: QA generation produces valid pairs
- Unit: QA-aware recall finds facts that content search misses
- Integration: chain_recall follows multi-hop entity links
- Benchmark: QA representation improves recall@5 by >15%

---

## Phase 5: History Bootstrap

### Goal
Initialize Engram from existing OpenClaw/Claude Code session history.

### Tasks

#### 5.1 Session ingestion script
- `scripts/bootstrap-from-sessions.ts`
- Reads OpenClaw session logs from `~/.openclaw/agents/main/sessions/`
- Parses conversation turns, extracts factual content
- Deduplicates against existing Engram facts (embedding similarity)

#### 5.2 Claude Code history ingestion
- Parse `~/.claude/projects/` session files
- Extract tool uses, decisions, corrections
- Map to Engram fact types (decision, correction, learning, etc.)

#### 5.3 Parallel processing
- Fan out to N workers (configurable, default 4)
- Each worker processes a time slice of history
- Merge results with dedup pass

#### 5.4 One-shot bootstrap command
- New CLI command: `engram bootstrap --source openclaw --source claude-code`
- Dry-run mode: shows what would be ingested
- Progress reporting

### Tests
- Unit: session parser extracts facts correctly
- Unit: dedup detects overlapping facts
- Integration: bootstrap 10 sessions → verify fact count and quality
- E2E: Full bootstrap → recall test on known historical facts

---

## Phase 6: Filesystem Mirror (Optional)

### Goal
Provide file-based memory access alongside API for bash/script manipulation.

### Tasks

#### 6.1 Export to filesystem
- `scripts/sync-to-fs.ts` or new MCP tool `memory_fs_sync`
- Export facts to `~/.engram/memory/` as markdown files
- Directory structure:
  ```
  system/        → pinned facts
  preferences/   → user preference facts
  projects/      → project-scoped facts
  corrections/   → correction/steering_rule facts
  observations/  → observation facts
  archive/       → dormant/archived facts
  ```

#### 6.2 YAML frontmatter per file
```yaml
---
id: facts:abc123
type: decision
importance: 0.85
confidence: 0.9
entities: [Ryan, TypeScript]
pinned: true
created: 2026-02-25T10:00:00Z
---
Ryan prefers TypeScript/Next.js for all web projects.
```

#### 6.3 File watcher for two-way sync
- Watch `~/.engram/memory/` for changes
- On file edit → parse frontmatter + content → update Convex
- On file create → create new fact
- On file delete → archive fact (not true-delete)

#### 6.4 Git integration
- `git init` in `~/.engram/memory/`
- Auto-commit on sync with descriptive messages
- Agent can use `git log`, `git diff`, `git blame` for history

### Tests
- Unit: export produces valid markdown with frontmatter
- Unit: file watcher detects changes correctly
- Integration: edit file → verify Convex updated
- E2E: Full round-trip: create fact via API → exported → edit file → API reflects change

---

## Dependency Graph

```
Phase 1 (Progressive Disclosure) ──┐
                                    ├──► Phase 2 (Sleep-Time Reflection)
Phase 3 (Version History) ─────────┘         │
                                              ├──► Phase 5 (History Bootstrap)
Phase 4 (QA-Pairs) ──────────────────────────┘
                                              │
                                              ▼
                                    Phase 6 (Filesystem Mirror)
```

- Phase 1 + 3 can run in parallel (no dependencies)
- Phase 2 depends on Phase 1 (uses manifest for context-aware reflection)
- Phase 4 is independent (can run in parallel with 1-3)
- Phase 5 depends on Phase 2 + 4 (uses reflection + QA for quality bootstrap)
- Phase 6 depends on Phase 1 (uses pinned/unpinned structure)
