# ClawVault Learnings — What Engram Should Adopt

## Executive Summary

ClawVault is a file-native, Obsidian-compatible memory system for AI agents. Its core insight:
**markdown files are the system of record**, not a database. This makes memories human-inspectable,
editable in Obsidian, and immune to database corruption.

Engram's strength is its DB-first architecture (Convex + LanceDB) with robust access control,
multi-agent scoping, and async enrichment. The plan is **not** to replace Convex, but to add
a **bidirectional markdown mirror** that gives us ClawVault's inspectability while keeping
Convex as the source of truth for real-time operations.

---

## Key Patterns to Adopt

### 1. Typed Memory Taxonomy (8 categories)

ClawVault classifies every memory into one of 8 types, each mapping to a folder:

| Type | Category/Folder | Description |
|------|----------------|-------------|
| `fact` | `facts/` | Raw information, data points |
| `feeling` | `feelings/` | Emotional states, reactions |
| `decision` | `decisions/` | Choices with reasoning |
| `lesson` | `lessons/` | Insights, patterns observed |
| `commitment` | `commitments/` | Promises, obligations |
| `preference` | `preferences/` | Likes/dislikes, how things should be |
| `relationship` | `people/` | People, one file per person |
| `project` | `projects/` | Active work, ongoing efforts |

**Engram mapping:** Our `factType` field already supports similar types. We need to extend it
and add the folder-routing logic in the markdown exporter.

### 2. Observation Format — Scored Lines

ClawVault's canonical observation line format:

```
- [decision|c=0.90|i=0.85] Chose TypeScript over Python for the CLI
- [commitment|c=0.80|i=0.70] Will deliver the API by Friday
- [fact|c=0.95|i=0.40] The server runs on port 3000
```

Fields: `[type|c=confidence|i=importance] content`

**Importance tiers:**
- `structural` (i ≥ 0.8) — decisions, commitments, high-stakes facts
- `potential` (i ≥ 0.4) — useful context, moderate-priority items
- `contextual` (i < 0.4) — background noise, may be pruned

**Engram mapping:** Our `importanceScore` already exists. We need to:
- Add `confidence` field to facts table
- Classify observations into these tiers during enrichment
- Use tiers for context-budgeted recall

### 3. Memory Graph from Wiki-Links

ClawVault builds a knowledge graph from three sources:
1. **Wiki-links** in markdown body: `[[entity-name]]`
2. **Hashtags**: `#tag-name`
3. **Frontmatter relations**: `related`, `depends_on`, `blocked_by`, `owner`, `project`, `people`, `links`

The graph is stored as `.clawvault/graph-index.json` with incremental updates (only re-parses
files whose mtime changed). Node types: `note`, `daily`, `observation`, `handoff`, `decision`,
`lesson`, `project`, `person`, `commitment`, `tag`, `unresolved`.

Edge types: `wiki_link`, `tag`, `frontmatter_relation`.

**Engram mapping:** We already have entity linking in Convex. The markdown mirror should:
- Generate `[[wiki-links]]` when exporting facts that reference entities
- Parse wiki-links when importing human edits back to Convex
- Build a graph index JSON for Obsidian graph view compatibility

### 4. Auto-Linker

Automatically converts entity mentions to `[[wiki-links]]` in markdown content.
Key implementation details:
- **Protected ranges**: Skip frontmatter, code blocks, inline code, existing links, URLs
- **First-occurrence only**: Only link the first mention of each entity
- **Alias support**: Entity can have multiple aliases (e.g., "John", "John Smith" → `[[people/john-smith]]`)
- **Display text**: `[[path|Display Text]]` when alias differs from filename

### 5. Ledger System (Observational Memory)

Three-level date-tree structure:
```
ledger/
  raw/            # Raw session transcripts (JSONL, per-source)
    openclaw/
      2025/01/15.jsonl
    claude/
      2025/01/15.jsonl
  observations/   # Compressed observations (scored markdown)
    2025/01/15.md
  reflections/    # Weekly reflection summaries
    2025-W03.md
  archive/        # Old observations moved here
    observations/
      2024/12/01.md
```

### 6. Context-Budgeted Retrieval

The `context` command gathers from **four sources** with priority ordering:

1. **Observations** — scored by importance tier
2. **Daily notes** — pinned today/yesterday
3. **Search results** — semantic search matches
4. **Graph neighbors** — BFS from search hits, max N hops, with decay

**Context profiles** control ordering and caps:
- `default`: structural → daily → search → graph → potential → contextual
- `planning`: search → graph → structural → potential → daily → contextual
- `incident`: structural → search → potential → daily → graph → contextual
- `handoff`: daily → structural → potential → search → graph → contextual

**Token budget fitting**: Priority-sorted items fill budget (chars/4 estimate) until full.

### 7. Checkpoint/Recovery (Context Death Resilience)

- **Checkpoint**: Saves `workingOn`, `focus`, `blocked`, session state to `.clawvault/last-checkpoint.json`
- **Dirty-death flag**: Written on checkpoint, cleared on clean exit
- **Wake**: Detects dirty death, loads checkpoint + recent handoffs + observations with temporal decay
- **Temporal decay on wake**:
  - Today: all structural + potential observations
  - Yesterday: all structural, top 5 potential
  - 2-3 days ago: structural only
  - 4-6 days ago: max 3 structural

### 8. Session Recap (Bootstrap Hook)

`generateRecap()` builds a "Who I Was" document from:
- Recent handoffs (last N)
- Active projects (not completed/archived)
- Pending commitments (not done)
- Recent decisions
- Recent lessons
- Key relationships
- Emotional arc (from handoff feelings)

---

## What Engram Already Has That ClawVault Doesn't

| Feature | Engram | ClawVault |
|---------|--------|-----------|
| Multi-agent scoped access | ✅ Full RBAC | ❌ Single-user |
| Vector search (Cohere Embed 4) | ✅ Built-in | ⚠️ Via optional `qmd` |
| Async enrichment pipeline | ✅ Convex scheduler | ❌ Manual |
| Cross-device sync | ✅ Convex cloud | ⚠️ Tailscale P2P |
| Signal/feedback system (ALMA) | ✅ | ❌ |
| Memory decay/pruning | ✅ Lifecycle states | ❌ Manual archival |
| Temporal/causal links | ✅ Schema ready | ❌ |

---

## Implementation Priority for Engram

### Phase 1: Markdown Mirror (High Value, Medium Effort)
Add a Convex→Markdown exporter that writes facts to an Obsidian-compatible vault.
Bidirectional: detect human edits and sync back to Convex.

### Phase 2: Observation Pipeline (High Value, Medium Effort)
Add scored observation format with confidence + importance.
Implement importance tiers (structural/potential/contextual).

### Phase 3: Knowledge Graph + Auto-Linking (Medium Value, Medium Effort)
Generate wiki-links from entity references.
Build graph index for Obsidian compatibility.
Auto-link entity mentions in exported markdown.

### Phase 4: Context-Budgeted Recall (High Value, Low Effort)
Add context profiles (default, planning, incident, handoff).
Token-budget fitting for memory_get_context.

### Phase 5: Context Death Resilience (Medium Value, Low Effort)
Checkpoint/dirty-death/wake pattern.
Temporal decay for observation loading.
