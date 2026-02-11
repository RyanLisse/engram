# Engram Skills

OpenClaw skills that integrate with the Engram memory system.

---

## Core Skill: `engram`

The main skill. Every OpenClaw agent installs this to get memory tools.

### SKILL.md (Draft)
```yaml
name: engram
description: Unified multi-agent memory system. Store, recall, and share knowledge across agents and devices.
requires:
  env: [CONVEX_URL, CONVEX_DEPLOY_KEY]
```

### What It Provides
- 8 MCP tools (store, recall, search, link, context, observe, register, raw query)
- Auto-registration on first use
- Default scope configuration
- Warm start integration

### Install
```bash
clawdhub install engram
```

---

## Skill: `engram-sidecar`

Background observer that automatically extracts knowledge from sessions.

### How It Works
Runs as a cron-triggered sub-agent (every 2h). Reads recent session logs, identifies:
- **Decisions** — "We decided to use X" → `factType: "decision"`
- **Corrections** — "No, actually Y" → `factType: "correction"`, high importance
- **Patterns** — Repeated approaches → `factType: "insight"`
- **Errors** — Failed commands/tools → `factType: "error"`
- **Entities** — New people, projects, tools mentioned → entity graph

Like having a note-taker in every meeting. Agent never has to explicitly remember.

### Why Separate Skill?
Not every agent needs the sidecar. Lightweight agents (one-shot workers) just need core `engram`. The sidecar is for long-running primary agents.

---

## Skill: `engram-search`

Human-facing memory search. Ryan can ask directly:
- "What do I know about Briefly's architecture?"
- "What did we decide about the auth system?"
- "Show me everything related to Convex"

### How It Works
1. Parse natural language query
2. `memory_recall` with semantic search
3. `memory_search` with entity/tag filters
4. Format results nicely for Telegram
5. Include: fact content, source, when stored, importance score, which agent stored it

### Trigger
Any message matching: "what do I/we know about...", "memory search:", "engram:", "recall:"

---

## Skill: `engram-digest`

Weekly memory intelligence report.

### Report Sections
1. **📊 Memory Stats** — Total facts, entities, conversations this week
2. **⭐ Top Facts** — Highest importance facts stored this week
3. **🧠 New Entities** — People, projects, tools discovered
4. **📉 Fading Memories** — High-access facts with decaying relevance (may need refresh)
5. **🤖 Agent Activity** — Which agents stored what, contribution breakdown
6. **🕳️ Knowledge Gaps** — Topics queried but poorly covered
7. **⚡ Recommendations** — "Consider storing more about X", "Entity Y has no relationships"

### Schedule
Weekly Sunday 9 AM via cron. Sent as Telegram message.

---

## Skill: `engram-migrate`

One-time import from existing memory systems.

### Supported Sources
- `entities.json` → entities table
- `facts_schema.json` → facts table  
- `daily/*.md` → parse into conversations + atomic facts
- `memory.md` → extract and store as seed facts
- `indy-scratchpad.md` → import as corrections/patterns

### Migration Flow
```
1. Backup existing data
2. Parse each source format
3. Generate embeddings for all content
4. Store in Convex with proper scoping
5. Rebuild LanceDB indices
6. Verify: compare fact counts, entity counts
7. Generate migration report
```

### Run Once
```bash
npx tsx scripts/migrate.ts --source ~/clawd/memory --dry-run
npx tsx scripts/migrate.ts --source ~/clawd/memory --execute
```

---

## Skill: `engram-hygiene`

Memory maintenance and cleanup.

### What It Detects
- **Duplicates** — Facts with cosine similarity > 0.95 → merge
- **Orphaned Entities** — No facts reference them → flag for deletion
- **Stale Scopes** — No writes in 30+ days → suggest archival
- **Missing Embeddings** — Facts without vectors → trigger backfill
- **Broken Links** — Facts referencing deleted entities → repair
- **Low-Quality Facts** — Very short content, no entities, no tags → flag for review

### Run Mode
- **Audit** (default) — Report issues, don't fix
- **Fix** — Auto-fix safe issues (duplicates, missing embeddings, broken links)
- **Interactive** — Ask for confirmation on each fix

### Schedule
Can run as weekly cron or on-demand.

---

## Skill: `engram-graph`

Visualize the entity knowledge graph.

### What It Shows
- Entity nodes (sized by importance)
- Relationship edges (labeled by type)
- Cluster detection (groups of related entities)
- Fact density (how many facts per entity)

### Output
- SVG diagram (via beautiful-mermaid)
- Interactive web view (optional, Convex-powered)

### Use Case
"Show me the knowledge graph" → generates visual map of everything Engram knows about and how it connects.

---

## Future Skills (Post-MVP)

### `engram-learn`
Active learning skill. Agent explicitly studies a topic:
1. Query existing facts about topic
2. Identify gaps
3. Research to fill gaps (via Gemini)
4. Store new facts
5. Report what was learned

### `engram-export`
Export memory to portable formats:
- Markdown (human-readable)
- JSON (machine-readable)
- SQLite (offline database)
- Obsidian vault (per-entity notes with backlinks)

### `engram-share`
Share memory scopes between different OpenClaw installations. Publish/subscribe model for team memory.
