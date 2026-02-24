# Engram

**Unified multi-agent memory for OpenClaw.**

An elephant never forgets. Neither should your agents.

Engram is a shared memory layer that any OpenClaw agent can plug into. Cloud-synced through Convex with native vector search and full agent-native architecture.

## What It Does

- **Store** atomic facts, entities, and conversations across agents
- **Recall** semantically — vector search finds what matters, not just what matches
- **Share** memory between agents with scoped access control
- **Decay** gracefully — old memories fade but never disappear
- **Sync** across devices — Mac Mini, MacBook Air, MacBook Pro all see the same brain
- **Enrich** automatically — embeddings, importance scoring, lifecycle management
- **Recall** three ways — semantic vector search + symbolic text + graph expansion, fused via Reciprocal Rank Fusion

## Quick Start

```bash
# Install MCP server dependencies
cd mcp-server && npm install && npx tsc

# Set environment variables
export CONVEX_URL="https://your-deployment.convex.cloud"
export ENGRAM_AGENT_ID="your-agent-id"
export COHERE_API_KEY="your-cohere-key"  # Optional: enables real embeddings

# Run the MCP server
node mcp-server/dist/index.js
```

## Add Engram to your agent (easy guide)

Use Engram from **Claude Code** or **OpenClaw** in a few steps.

### 1. Build the MCP server (once)

From the Engram repo root:

```bash
cd mcp-server && npm install && npx tsc
# or: cd mcp-server && bun install && bun run build
```

### 2. Add the MCP server to your editor

**Claude Code** — Add to your project’s `.mcp.json` or `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "your-agent-id",
        "COHERE_API_KEY": ""
      }
    }
  }
}
```

Replace `/path/to/engram` with the real path (e.g. `~/Tools/engram`). Optional: copy the ready-made config:

```bash
cp plugins/claude-code/.mcp.json ~/.claude/settings.json
# then edit paths and CONVEX_URL / ENGRAM_AGENT_ID
```

**OpenClaw** — Add the same `engram` block to your OpenClaw MCP config (same `command`, `args`, `env`). Use your actual path in `args`.

### 3. Restart and verify

Restart Claude Code or OpenClaw, then call `memory_health`. You should see something like `{ "ok": true }`.

**Detailed setup:** [Claude Code](docs/setup/CLAUDE-CODE-SETUP.md) · [OpenClaw](docs/setup/OPENCLAW-SETUP.md) · [Editor integrations](docs/EDITOR-INTEGRATIONS.md)

---

## Point your agent here (agent instructions)

Copy this block into your AI agent’s system instructions or project rules so it knows how to use Engram:

```markdown
## Engram memory

Engram is the shared memory layer for this project. Use it to store facts, recall context, and coordinate across sessions.

### Quick reference
| Goal | Tool |
|------|------|
| Store a fact | `memory_store_fact` |
| Search memory (semantic) | `memory_recall` |
| Search (structured/filters) | `memory_search` |
| Warm-start context | `memory_get_context` |
| Register this agent | `memory_register_agent` |
| Discover all tools | `memory_list_capabilities` (72 tools) |

### Navigation
- Architecture & design → `CLAUDE.md`
- Full API → `docs/API-REFERENCE.md`
- Tool registry → `mcp-server/src/lib/tool-registry.ts`
- Convex schema → `convex/schema.ts`
- Hooks → `HOOKS.md`; Crons → `CRONS.md`

### Commands (from repo root)
- Type-check: `npx tsc --noEmit`
- Build MCP: `cd mcp-server && npm run build`
- Convex dev: `npx convex dev`
```

---

## Harness Quality

Run local harness checks before pushing:

```bash
make harness-check
```

This validates core harness artifacts and smoke-tests Claude hook installation into a temp directory.

CI enforces this on PRs and `main` via:
- `.github/workflows/harness.yml`

### Supported AI Editors

See **Add Engram to your agent (easy guide)** above for short setup. Full details:

| Editor | Setup | Features |
|--------|-------|----------|
| **Claude Code** | Add `engram` to `.mcp.json` (see easy guide) or `cp plugins/claude-code/.mcp.json ~/.claude/settings.json` | 8 lifecycle hooks, auto-recall, session checkpoints |
| **OpenClaw** | Same MCP block in OpenClaw MCP config (see easy guide) | 72 tools; optional native plugin |
| **Windsurf** | `./plugins/windsurf/setup.sh` | Full MCP access, real-time events |
| **Any MCP Client** | Same `command` / `args` / `env` as above | Standard MCP protocol |

**→ [docs/EDITOR-INTEGRATIONS.md](docs/EDITOR-INTEGRATIONS.md)** — detailed setup, troubleshooting, feature comparison.

#### Claude Code Configuration

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "indy",
        "COHERE_API_KEY": "your-key"
      }
    }
  }
}
```

#### Windsurf Configuration

**Quick Setup:**
```bash
./plugins/windsurf/setup.sh
```

**Manual Setup:** See [plugins/windsurf/README.md](plugins/windsurf/README.md) for detailed instructions.

**Config Location:** `~/.codeium/windsurf/mcp_config.json`

### MCPorter CLI

Call Engram from the terminal without an AI client:

```bash
npm run mcp:list                    # List all 72 tools
npx mcporter call engram.memory_store_fact content="Remember this"
```

See [docs/MCPORTER-CLI.md](docs/MCPORTER-CLI.md) for full usage.

## Performance

Key optimizations shipped as of Feb 2026:

| Optimization | Where | Impact |
|---|---|---|
| Parallel vector search across scopes | `vectorRecallAction` | Concurrent `Promise.all` per scope vs sequential |
| Join-table scope lookup | `scope_memberships` + `getPermitted` | O(memberships) vs O(all scopes) full scan |
| O(n) forget cron | `crons/forget.ts` | Pre-load scope facts once, reuse for all scope members |
| Contradiction pre-computation | `enrichFact` pipeline | Checks at write time, not read time |
| Batch `bumpAccess` | `bumpAccessBatch` mutation | 1 round-trip per recall vs N |
| Index-based `getFactsSince` | `sync.ts` | `by_scope[scopeId, timestamp]` — skips old facts entirely |
| Backoff on idle sync | `lance-sync.ts` | 30s → up to 5 min when no new facts |
| `by_read_policy` index | `memory_scopes` | Public-scope lookup without full table scan |
| `by_created` index | `recall_feedback` | Time-windowed weekly synthesis query |
| Per-scope error resilience | `syncOnce()` | Bad scope doesn't abort other scopes |

## Architecture

> Diagrams available in [dark (tokyo-night)](docs/diagrams/) and [light (github-light)](docs/diagrams/light/) themes.

![System Architecture](docs/diagrams/light/architecture.svg)

### Data Flow — Store & Recall

![Data Flow](docs/diagrams/light/data-flow.svg)

### Memory Lifecycle

![Memory Lifecycle](docs/diagrams/light/memory-lifecycle.svg)

### Enrichment Pipeline — Async Fact Processing

![Enrichment Pipeline](docs/diagrams/light/enrichment-pipeline.svg)

### Memory Scopes — Multi-Agent Access Control

![Memory Scopes](docs/diagrams/light/memory-scopes.svg)

### Importance Scoring — Multi-Factor Relevance

![Importance Scoring](docs/diagrams/light/importance-scoring.svg)

### Agent Lifecycle

![Agent Lifecycle](docs/diagrams/light/agent-lifecycle.svg)

## Editor Integration

### Claude Code Hooks (8 Lifecycle Events)

Engram integrates with Claude Code's lifecycle via hooks for automated memory operations:

| Hook Event | Script | Purpose | Performance |
|------------|--------|---------|-------------|
| **SessionStart** | `session-start.sh` | Auto-inject agent context at session boundary | ~50-200ms |
| **UserPromptSubmit** | `auto-recall.sh` | Auto-recall top-3 relevant memories per prompt | ~100-500ms |
| **PostToolUse** | `post-tool-observe.sh` | Record file edit observations (async) | ~10-50ms |
| **Notification** | `notification-alert.sh` | Desktop alerts when memory needs attention | <10ms |
| **PreToolUse** | `validate-memory-ops.sh` | Warn about destructive operations | <5ms |
| **Stop** | `auto-handoff.sh` | Record turn completion events (async) | ~50-100ms |
| **PreCompact** | `pre-compact-checkpoint.sh` | Checkpoint state before context compaction | ~100-500ms |
| **SessionEnd** | `session-end.sh` | Auto-end session with handoff summary | ~100-500ms |

**Setup:** `cp .claude/settings.json.example .claude/settings.json && export ENGRAM_AGENT_ID="your-name"`

**Documentation:**
- Strategy guide: `/docs/HOOKS-AND-AUTOMATION-STRATEGY.md` (21KB)
- Setup guide: `/docs/SETUP-HOOKS.md` (7KB)
- Quick reference: `/docs/HOOKS-QUICK-REFERENCE.md` (6.5KB)

## MCP Tools (72)

Engram registers 72 `memory_*` tools: workflow wrappers, atomic primitives, admin, health, and event tools.
For full schemas and examples, see `docs/API-REFERENCE.md`.

| Tool | Description |
|------|-------------|
| `memory_store_fact` | Store atomic fact, triggers async enrichment |
| `memory_recall` | Semantic search (primary retrieval), returns recallId |
| `memory_search` | Full-text + structured filters |
| `memory_link_entity` | Create/update entities and relationships |
| `memory_get_context` | Warm start: facts + entities + themes |
| `memory_observe` | Fire-and-forget observation storage |
| `memory_register_agent` | Agent self-registration with capabilities |
| `memory_query_raw` | Escape hatch for direct Convex queries |
| `memory_record_signal` | Record ratings/sentiment feedback (PAI) |
| `memory_record_feedback` | Post-recall usefulness tracking (ALMA) |
| `memory_summarize` | Consolidate facts on a topic |
| `memory_prune` | Agent-initiated cleanup of stale facts |
| `...` | Plus primitive/admin/event/health tools (see API reference) |

## Tech Stack

- **Convex** — Cloud backend (17 tables, native vector search, scheduled functions, crons)
- **TypeScript** — MCP server + Convex functions
- **Cohere Embed 4** — Multimodal embeddings (1024-dim: `embed-v4.0`)
- **MCP SDK** — `@modelcontextprotocol/sdk` v1.x (stdio transport)

## Convex Schema (17 Tables)

| Table | Purpose |
|-------|---------|
| `facts` | Atomic memory units with embeddings, importance, lifecycle |
| `entities` | Named concepts with relationship graph |
| `conversations` | Thread facts together with handoff tracking |
| `sessions` | Agent session tracking |
| `agents` | Agent registry with capabilities and telos |
| `memory_scopes` | Scope-based access control with policies |
| `scope_memberships` | Join table for O(memberships) scope lookup (vs O(all scopes)) |
| `signals` | Feedback loop (ratings + sentiment) |
| `themes` | Thematic fact clusters (consolidated memory) |
| `sync_log` | Per-node LanceDB sync tracking |
| `notifications` | Agent-routing notifications |
| `recall_feedback` | Recall outcome tracking (with `by_created` index) |
| `system_config` | Runtime configuration |
| `memory_policies` | Scope-level policy overrides |
| `memory_events` | Watermark-ordered event stream |
| `agent_performance` | Task outcome tracking for golden principle synthesis |
| `observation_sessions` | Per-scope, per-agent Observer/Reflector compression state |

## Cron Jobs (19 Scheduled)

| Job | Schedule | Purpose |
|-----|----------|---------|
| usage-analytics | Daily 0:30 UTC | Per-agent daily stats rollup |
| notification-cleanup | Daily 1:30 UTC | Clean expired notifications |
| cleanup | Daily 2:00 UTC | Garbage collection + sync log cleanup |
| dedup | Daily 2:30 UTC | Cross-agent deduplication |
| decay | Daily 3:00 UTC | Differential relevance decay by fact type |
| forget | Daily 3:30 UTC | Archive facts with high forget score |
| compact | Daily 4:00 UTC | Conversation compaction |
| rules | Daily 7:00 UTC | Extract steering rules from patterns (monthly exec) |
| consolidate | Weekly Sun 5:00 UTC | Merge related facts into themes |
| rerank | Weekly Sun 6:00 UTC | Recalculate importance scores |
| vault-sync-heartbeat | Every 5 min | Vault mirror sync heartbeat |
| vault-regenerate-indices | Every 5 min | Trigger vault index regeneration |
| embedding-backfill | Every 15 min | Re-embed failed facts |
| agent-health | Every 30 min | Stale agent detection + notifications |
| quality-scan | Daily 4:30 UTC | Golden principles quality scan |
| learning-synthesis | Weekly Sun 7:30 UTC | Feedback signal synthesis |
| update-golden-principles | Weekly Mon 8:00 UTC | Promote patterns into golden principles |
| observer-sweep | Every 10 min | Observer/Reflector threshold sweep |
| action-recommendations | Every 15 min | Proactive action recommendations |

## Agent-Native Principles

1. **Parity** — Every agent gets the same memory tools
2. **Granularity** — Atomic primitives, not workflow-shaped APIs
3. **Composability** — New memory behaviors = new prompts, not new code
4. **Emergent Capability** — Raw query escape hatch for unanticipated use
5. **Improvement Over Time** — Memory IS the improvement mechanism

## Philosophy and Research

- Philosophy: `docs/docs/PHILOSOPHY.md`
- Research index: `docs/docs/research/README.md`
- Research synthesis to implementation: `docs/docs/research/SYNTHESIS.md`

## Project Structure

```
engram/
├── convex/                  # Convex backend
│   ├── schema.ts            # 17 tables with indexes
│   ├── functions/           # CRUD + search (9 modules)
│   ├── actions/             # Async: embed, importance, vectorSearch, enrich
│   ├── crons.ts             # 19 cron job configuration
│   └── crons/               # Cron implementations
├── mcp-server/              # MCP server (TypeScript)
│   ├── src/
│   │   ├── index.ts         # Server entry point (72 tools)
│   │   ├── tools/           # Tool implementations + primitives
│   │   └── lib/             # convex-client, lance-sync, embeddings
│   └── package.json
├── skill/                   # OpenClaw skill package
│   ├── SKILL.md
│   └── install.sh
└── docs/                    # Research + plans
    ├── research/            # Architecture research papers
    └── plans/               # Implementation plans
```

## Status

Phases 1-6 complete. Core system operational. See [PLAN.md](./PLAN.md) for detailed checklist.

**Verified:**
- All MCP tools listed with correct schemas
- `memory_store_fact` stores facts end-to-end with async enrichment
- `memory_recall` retrieves stored facts with access bumping
- Convex deploy + MCP server build clean (zero TypeScript errors)

## Setup Guides

- OpenClaw setup guide: `docs/docs/setup/OPENCLAW-SETUP.md`
- Claude Code setup guide: `docs/docs/setup/CLAUDE-CODE-SETUP.md`
- Shared agent ID pattern: `docs/docs/setup/SHARED-AGENT-ID-PATTERN.md`

## License

MIT
