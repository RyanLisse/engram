# Engram Obsidian Mirror — Implementation Plan

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Convex Cloud                     │
│  (System of Record — facts, entities, scopes)     │
└──────────────┬──────────────────┬────────────────┘
               │ export           │ import
               ▼                  ▲
┌──────────────────────────────────────────────────┐
│            Markdown Mirror Layer                   │
│  convex/actions/vault-sync.ts                      │
│  - Convex→MD exporter (on fact create/update)      │
│  - MD→Convex importer (on file change detection)   │
│  - Conflict resolution (last-write-wins + provenance)│
└──────────────┬──────────────────┬────────────────┘
               │ write            │ watch
               ▼                  ▲
┌──────────────────────────────────────────────────┐
│           Local Vault (Obsidian-Compatible)        │
│  ~/engram-vault/                                   │
│  ├── decisions/                                    │
│  ├── lessons/                                      │
│  ├── people/                                       │
│  ├── projects/                                     │
│  ├── preferences/                                  │
│  ├── commitments/                                  │
│  ├── facts/                                        │
│  ├── observations/                                 │
│  ├── ledger/                                       │
│  │   ├── raw/                                      │
│  │   ├── observations/                             │
│  │   └── reflections/                              │
│  ├── .engram/                                      │
│  │   ├── graph-index.json                          │
│  │   ├── last-checkpoint.json                      │
│  │   └── sync-state.json                           │
│  └── templates/                                    │
└──────────────────────────────────────────────────┘
```

## Phase 1: Markdown Memory Format

### 1.1 Frontmatter Schema

Every exported fact becomes a markdown file with this frontmatter:

```yaml
---
title: "Chose TypeScript for the CLI"
date: 2025-01-15
type: decision
importance: 0.85
confidence: 0.90
tags: [typescript, cli, architecture]
entities: ["project:engram", "tool:typescript"]
scope: shared-personal
createdBy: indy
convexId: "j57abc123def"
lifecycle: active
emotionalContext: confident
source: direct
---

Chose TypeScript over Python for the CLI because of better type safety
and existing Convex SDK compatibility.

Related: [[projects/engram]] | [[decisions/use-convex-backend]]
```

### 1.2 Folder Taxonomy (factType → folder)

```typescript
const FACT_TYPE_TO_FOLDER: Record<string, string> = {
  decision: 'decisions',
  observation: 'observations',
  plan: 'projects',
  error: 'lessons',
  insight: 'lessons',
  correction: 'lessons',
  steering_rule: 'preferences',
  learning: 'lessons',
  session_summary: 'handoffs',
  preference: 'preferences',
  commitment: 'commitments',
  relationship: 'people',
  project: 'projects',
  fact: 'facts',
  feeling: 'feelings',
};
```

### 1.3 Filename Convention

`{slugified-title}-{short-id}.md` where short-id is first 8 chars of convexId.
Example: `chose-typescript-for-cli-j57abc12.md`

### 1.4 Schema Changes

Add to `convex/schema.ts` on the `facts` table:
- `confidence: v.optional(v.float64())` — 0.0-1.0
- `vaultPath: v.optional(v.string())` — relative path in vault
- `vaultSyncedAt: v.optional(v.number())` — last sync timestamp
- `importanceTier: v.optional(v.string())` — "structural"|"potential"|"contextual"

## Phase 2: Vault Sync Engine

### 2.1 New Files

```
mcp-server/src/lib/vault-sync.ts     — Core sync logic
mcp-server/src/lib/vault-format.ts   — MD↔Convex serialization
mcp-server/src/lib/vault-graph.ts    — Graph index builder
mcp-server/src/lib/auto-linker.ts    — Wiki-link auto-generation
```

### 2.2 Convex → Markdown Export

Triggered after `storeFact` enrichment completes:

1. Determine folder from `factType`
2. Generate filename from title/content + convexId
3. Build frontmatter from fact fields
4. Auto-link entity mentions as `[[wiki-links]]`
5. Write `.md` file to vault
6. Update `vaultPath` and `vaultSyncedAt` on the Convex fact

### 2.3 Markdown → Convex Import

Triggered by file watcher (or periodic scan):

1. Detect new/modified `.md` files in vault
2. Parse frontmatter with `gray-matter`
3. If `convexId` exists → update existing fact
4. If no `convexId` → create new fact in Convex
5. Track provenance: `source: "vault-import"`

### 2.4 Conflict Resolution

- **Convex wins by default** (it has richer metadata)
- **Human edits win** if vault file is newer than `vaultSyncedAt`
- Track `lastEditedBy: "human"|"system"` in frontmatter

## Phase 3: Observation Pipeline Enhancement

### 3.1 Scored Observation Format

Adopt ClawVault's canonical format for the ledger:

```markdown
## 2025-01-15

- [decision|c=0.90|i=0.85] Chose TypeScript for the CLI
- [commitment|c=0.80|i=0.70] Will deliver API by Friday
- [fact|c=0.95|i=0.40] Server runs on port 3000
```

### 3.2 Importance Tiers

```typescript
const IMPORTANCE_THRESHOLDS = {
  structural: 0.8,  // Decisions, commitments, high-stakes
  potential: 0.4,   // Useful context, moderate priority
  // Below 0.4 = contextual (background noise)
};
```

### 3.3 Type Inference from Content

Port ClawVault's regex-based type inference for observations:
- Decision keywords: decided, chose, selected, opted, went with
- Commitment keywords: committed, promised, deadline, will deliver
- Lesson keywords: learned, insight, realized, never again
- etc.

### 3.4 Ledger Directory Structure

```
ledger/
  raw/                    # Raw transcripts per agent
    indy/2025/01/15.jsonl
    claude/2025/01/15.jsonl
  observations/           # Scored observations
    2025/01/15.md
  reflections/            # Weekly summaries
    2025-W03.md
  archive/                # Archived old observations
    observations/2024/12/01.md
```

## Phase 4: Knowledge Graph + Auto-Linking

### 4.1 Graph Index

Build `.engram/graph-index.json` from vault files:
- Parse wiki-links, tags, frontmatter relations
- Incremental updates (check file mtime)
- Node types: note, decision, lesson, project, person, commitment, tag, unresolved
- Edge types: wiki_link, tag, frontmatter_relation

### 4.2 Auto-Linker

When exporting facts to markdown:
1. Build entity index from Convex entities table
2. Find entity mentions in fact content
3. Replace first occurrence with `[[category/entity-slug]]`
4. Skip protected ranges (code blocks, existing links, URLs)

### 4.3 Backlink Generation

When building graph index, also generate a `_backlinks` section
or separate backlinks file for Obsidian compatibility.

## Phase 5: Context-Budgeted Recall

### 5.1 Context Profiles

Add `profile` parameter to `memory_get_context`:

```typescript
type ContextProfile = 'default' | 'planning' | 'incident' | 'handoff';

const PROFILE_ORDERING: Record<ContextProfile, SourceOrder> = {
  default:  ['structural', 'daily', 'search', 'graph', 'potential', 'contextual'],
  planning: ['search', 'graph', 'structural', 'potential', 'daily', 'contextual'],
  incident: ['structural', 'search', 'potential', 'daily', 'graph', 'contextual'],
  handoff:  ['daily', 'structural', 'potential', 'search', 'graph', 'contextual'],
};
```

### 5.2 Token Budget

Add `budget` parameter (default: 4000 tokens):
1. Gather all context items from all sources
2. Assign priority based on profile ordering
3. Sort by priority, then by score
4. Fill budget using `chars/4` token estimate
5. Return fitted items

### 5.3 Multi-Source Gathering

Extend `memory_get_context` to pull from:
1. **Observations** — from ledger files, filtered by importance tier
2. **Daily notes** — today/yesterday pinned
3. **Search results** — existing semantic search
4. **Graph neighbors** — BFS from search hits, 1-2 hops

## Phase 6: Context Death Resilience

### 6.1 Checkpoint

New MCP tool: `memory_checkpoint`
```typescript
{
  workingOn: string,
  focus?: string,
  blocked?: string,
  urgent?: boolean
}
```
Writes to `.engram/last-checkpoint.json` + history.
Sets dirty-death flag.

### 6.2 Wake

New MCP tool: `memory_wake`
1. Check for dirty-death flag
2. Load checkpoint data
3. Load recent observations with temporal decay:
   - Today: all structural + potential
   - Yesterday: structural + top 5 potential
   - 2-3 days: structural only
   - 4-6 days: top 3 structural
4. Build session recap from handoffs/projects/commitments
5. Return bootstrap context

### 6.3 Clean Exit

`memory_end_session` should clear the dirty-death flag.

## Implementation Order

1. **Schema changes** — Add confidence, vaultPath, vaultSyncedAt, importanceTier
2. **vault-format.ts** — Fact↔Markdown serialization
3. **vault-sync.ts** — Export engine (Convex→MD)
4. **MCP tool: memory_vault_sync** — Trigger export
5. **Observation format** — Scored lines, importance tiers
6. **vault-graph.ts** — Graph index builder
7. **auto-linker.ts** — Wiki-link generation
8. **Context profiles** — Enhance memory_get_context
9. **Checkpoint/wake** — Context death resilience
10. **File watcher** — MD→Convex import (bidirectional)
