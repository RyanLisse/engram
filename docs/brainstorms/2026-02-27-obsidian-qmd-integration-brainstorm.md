---
date: 2026-02-27
topic: obsidian-qmd-integration
---

# Obsidian + QMD Full-Stack Integration

## What We're Building

A three-layer integration that makes Engram the bridge between cloud agent memory (Convex), local search (QMD), and human knowledge management (Obsidian). The result is a unified stack where:

- **Agents** get hybrid search: Engram cloud semantic search + QMD local BM25/vector/LLM-reranked search
- **Humans** get Obsidian as a first-class UI for browsing, editing, and querying Engram memories
- **The vault** is the shared substrate — markdown files that all three systems read and write

## Why This Approach

**Approaches considered:**
1. **Layered integration (chosen)** — Ship QMD managed search → Obsidian format enhancements → Obsidian plugin. Each layer independently valuable.
2. **QMD-first** — Focus entirely on QMD, defer Obsidian. Rejected: leaves human experience behind.
3. **Obsidian-first** — Build plugin first. Rejected: Obsidian plugins are complex; agents don't benefit until QMD is integrated.

**Why layered wins:** Each layer ships independently and is valuable on its own. QMD search (Layer 1) immediately improves agent recall quality. Obsidian format (Layer 2) makes the vault richer for both humans and QMD. The Obsidian plugin (Layer 3) is the capstone that ties it all together for human users.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT INTERFACE                          │
│  memory_recall (cloud)  memory_local_query (QMD)  deep_search   │
├─────────────────────────────────────────────────────────────────┤
│                      ENGRAM MCP SERVER                          │
│  73 existing tools + 4 new QMD proxy tools + deep_search fusion │
│  vault_sync triggers qmd update after each export               │
├──────────────────┬──────────────────┬───────────────────────────┤
│   CONVEX CLOUD   │   LOCAL VAULT    │       QMD ENGINE          │
│   (facts, embed, │   (markdown +    │   (BM25 + vector +        │
│    lifecycle)    │    YAML front)   │    LLM rerank, SQLite)    │
└──────────────────┴──────────────────┴───────────────────────────┘
                          ▲                     ▲
                          │                     │
                   bidirectional sync     collection index
                          │                     │
                   ┌──────┴──────────────────────┘
                   │         VAULT ROOT
                   │    (Obsidian-compatible)
                   │    ┌─ daily/YYYY-MM-DD.md
                   │    ├─ decisions/*.md
                   │    ├─ observations/*.md
                   │    ├─ insights/*.md
                   │    ├─ .index/
                   │    └─ .obsidian/graph.json
                   └─────────────────────────────
                          ▲
                   ┌──────┴──────┐
                   │  OBSIDIAN   │
                   │  (plugin +  │
                   │   Dataview) │
                   └─────────────┘
```

## Key Decisions

- **Engram owns QMD lifecycle**: Auto-configure collection, trigger re-index post-sync, proxy search via MCP tools. Single control plane for agents.
- **QMD runs as managed subprocess**: Not embedded in Engram codebase (too much coupling). Engram spawns/manages it.
- **Vault is the shared substrate**: All three systems (Engram, QMD, Obsidian) read/write the same markdown files.
- **Search fusion at Engram layer**: `memory_deep_search` combines Convex vector results + QMD hybrid results with reciprocal rank fusion.
- **Daily notes are generated, not manual**: Vault sync creates/updates daily note files automatically from that day's facts.
- **Obsidian plugin is TypeScript**: Obsidian's plugin API is TypeScript-based, aligns with Engram's stack.

## Layer 1: QMD as Managed Search Backend

### New Components

1. **QMD Manager** (`mcp-server/src/lib/qmd-manager.ts`)
   - Checks if QMD is installed (`qmd --version`)
   - Auto-creates collection: `qmd collection add <VAULT_ROOT> --name engram-vault`
   - Triggers re-index: `qmd update` after vault export
   - Generates embeddings: `qmd embed` on first setup
   - Health check: `qmd status`

2. **QMD Proxy Tools** (4 new MCP tools)
   - `memory_local_search` → BM25 keyword search via `qmd search`
   - `memory_local_vsearch` → Local vector search via `qmd vsearch`
   - `memory_local_query` → Hybrid search via `qmd query` (BM25 + vector + LLM rerank)
   - `memory_deep_search` → Fused search: Engram cloud + QMD local with RRF blending

3. **Vault Sync Enhancement**
   - After `vault_export` completes, call `qmd update` to re-index changed files
   - After `qmd update`, optionally call `qmd embed` for new chunks

### Search Fusion Algorithm (`memory_deep_search`)

```
1. Parallel: Engram vectorSearch(query) + QMD query(query)
2. Normalize scores to 0.0–1.0
3. Reciprocal Rank Fusion with k=60
4. Deduplicate by factId (vault files have factId in frontmatter)
5. Return top-N with blended scores and source attribution
```

### Configuration

New env vars:
- `ENGRAM_QMD_ENABLED=true|false` (default: false, opt-in)
- `ENGRAM_QMD_AUTO_INDEX=true|false` (default: true when QMD enabled)

New config keys (via `memory_set_config`):
- `qmd.enabled` — Toggle QMD integration
- `qmd.collection_name` — QMD collection name (default: "engram-vault")
- `qmd.auto_reindex` — Re-index after vault sync (default: true)
- `qmd.deep_search_weights` — `{cloud: 0.5, local: 0.5}` blending weights

### Success Criteria
- `memory_local_query "topic"` returns relevant vault facts with scores
- `memory_deep_search "topic"` fuses cloud + local results
- QMD re-indexes automatically after vault sync
- Works without QMD installed (graceful degradation, tools return "QMD not available")

## Layer 2: Enhanced Obsidian Vault Format

### Daily Notes

Generate `vault/{scope}/daily/YYYY-MM-DD.md` with:

```markdown
---
date: 2026-02-27
scope: private-indy
facts_count: 12
agents: [claude-code, opencode]
---

# 2026-02-27

## Decisions
- [[2026-02-27-decision-use-layered-approach]] (importance: 0.8)

## Observations
- [[2026-02-27-observation-vault-sync-takes-3s]] (importance: 0.5)

## Insights
- [[2026-02-27-insight-qmd-improves-recall]] (importance: 0.7)

## Session Activity
- claude-code: 5 facts stored, 3 recalls
- opencode: 2 facts stored, 1 recall
```

Daily notes are regenerated on each vault sync (idempotent).

### Dataview-Compatible Properties

Upgrade YAML frontmatter to use Obsidian Properties syntax:

```yaml
---
id: "j57abc123def"
source: direct
factType: decision
createdBy: claude-code
scopeId: "scope123"
timestamp: 2026-02-27T08:30:00Z   # ISO 8601 (Dataview-friendly)
tags:
  - architecture
  - qmd
importanceScore: 0.8
relevanceScore: 0.7
lifecycleState: active
entities:
  - "[[QMD]]"
  - "[[Obsidian]]"
---
```

Key changes from current format:
- `timestamp` as ISO 8601 string (not unix ms) for Dataview date queries
- `entities` as wiki-link array for Dataview link queries
- All scores as numbers (not strings)

### Obsidian Templates

Generate `vault/.obsidian/templates/new-fact.md`:
```markdown
---
factType: {{factType}}
source: direct
tags: []
importanceScore: 0.5
---

{{content}}
```

This lets humans create facts from within Obsidian using the Templates core plugin, which vault import picks up.

### Success Criteria
- Dataview queries like `TABLE importanceScore FROM "decisions" WHERE importanceScore > 0.7` work
- Daily notes update automatically on vault sync
- Templates enable manual fact creation from Obsidian

## Layer 3: Obsidian Plugin

### Plugin Architecture

```
plugins/obsidian/
  manifest.json        # Obsidian plugin manifest
  main.ts              # Plugin entry point
  src/
    engram-client.ts   # HTTP client to Engram SSE server
    commands.ts        # Obsidian commands (store fact, recall, sync)
    views/
      status-bar.ts    # Connection status indicator
      recall-modal.ts  # Search/recall modal (Ctrl+Shift+R)
      fact-panel.ts    # Side panel showing fact metadata
  styles.css           # Plugin styles
```

### Features

1. **Status Bar**: Shows Engram connection status (connected/disconnected/syncing)
2. **Store as Fact**: Command palette action — stores current note as an Engram fact
3. **Recall Modal**: Cmd+Shift+R opens a search modal that queries `memory_recall` + `memory_local_query`
4. **Fact Metadata Panel**: Right sidebar panel showing lifecycle state, importance, entities for the current note
5. **Auto-Sync Trigger**: When Obsidian detects file changes in the vault, triggers `memory_vault_import`

### Communication
- Plugin talks to Engram via the SSE HTTP server (`ENGRAM_SSE_PORT`)
- Alternatively, could use the MCP server directly via stdio (but SSE is simpler for a plugin)

### Success Criteria
- Plugin installs from Obsidian community plugins
- Store/recall commands work from within Obsidian
- Status bar reflects real-time connection state

## Open Questions

1. **QMD model downloads**: QMD downloads ~2GB of models on first use. Should Engram warn/prompt the user?
2. **Obsidian plugin distribution**: Community plugins require review. Should we also support manual sideloading via BRAT?
3. **Daily note timezone**: Use agent's timezone or UTC? (Prefer UTC for cross-timezone agent consistency)
4. **Dataview dependency**: Should we hard-depend on Dataview plugin or make it optional enhancement?
5. **QMD MCP coexistence**: If a user already runs QMD's own MCP server, should Engram detect and defer to it instead of proxying?

## Next Steps

→ `/workflows:plan` for Layer 1 (QMD managed search) implementation details
→ Layer 2 and 3 can be planned separately after Layer 1 ships
