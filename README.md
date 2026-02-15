# Engram

**Unified multi-agent memory for OpenClaw.**

An elephant never forgets. Neither should your agents.

Engram is a shared memory layer that any OpenClaw agent can plug into. Local-first vector search via LanceDB, cloud-synced through Convex, with full agent-native architecture.

## What It Does

- **Store** atomic facts, entities, and conversations across agents
- **Recall** semantically — vector search finds what matters, not just what matches
- **Share** memory between agents with scoped access control
- **Decay** gracefully — old memories fade but never disappear
- **Sync** across devices — Mac Mini, MacBook Air, MacBook Pro all see the same brain
- **Enrich** automatically — embeddings, importance scoring, lifecycle management

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

### Supported AI Editors

Engram provides automated setup for multiple AI code editors. **[Full integration guide →](docs/EDITOR-INTEGRATIONS.md)**

| Editor | Setup | Features |
|--------|-------|----------|
| **Claude Code** | `cp plugins/claude-code/.mcp.json ~/.claude/settings.json` | 8 lifecycle hooks, auto-recall, session checkpoints |
| **Windsurf** | `./plugins/windsurf/setup.sh` | Full MCP access (69 tools), real-time events |
| **OpenClaw** | Native integration | Zero-overhead TypeScript imports |
| **Any MCP Client** | Manual config below | Standard MCP protocol support |

**→ See [docs/EDITOR-INTEGRATIONS.md](docs/EDITOR-INTEGRATIONS.md) for detailed setup guides, troubleshooting, and feature comparisons.**

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
npm run mcp:list                    # List all 52 tools
npx mcporter call engram.memory_store_fact content="Remember this"
```

See [docs/MCPORTER-CLI.md](docs/MCPORTER-CLI.md) for full usage.

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

## MCP Tools (69)

Engram currently registers 69 `memory_*` tools (workflow-compatible wrappers + atomic primitives + admin/health/event tools).
For full schemas and examples, see `/Users/cortex-air/Tools/engram/docs/API-REFERENCE.md`.

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

- **Convex** — Cloud backend (15 tables, native vector search, scheduled functions, crons)
- **LanceDB** — Local vector search (sub-10ms, offline, mergeInsert sync)
- **TypeScript** — MCP server + Convex functions
- **Cohere Embed 4** — Multimodal embeddings (1024-dim: `embed-v4.0`)
- **MCP SDK** — `@modelcontextprotocol/sdk` v1.x (stdio transport)

## Convex Schema (14 Tables)

| Table | Purpose |
|-------|---------|
| `facts` | Atomic memory units with embeddings, importance, lifecycle |
| `entities` | Named concepts with relationship graph |
| `conversations` | Thread facts together with handoff tracking |
| `sessions` | Agent session tracking |
| `agents` | Agent registry with capabilities and telos |
| `memory_scopes` | Scope-based access control with policies |
| `signals` | Feedback loop (ratings + sentiment) |
| `themes` | Thematic fact clusters (consolidated memory) |
| `sync_log` | Per-node LanceDB sync tracking |
| `notifications` | Agent-routing notifications |
| `recall_feedback` | Recall outcome tracking |
| `system_config` | Runtime configuration |
| `memory_policies` | Scope-level policy overrides |
| `memory_events` | Watermark-ordered event stream |

## Cron Jobs (14 Scheduled)

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

## Agent-Native Principles

1. **Parity** — Every agent gets the same memory tools
2. **Granularity** — Atomic primitives, not workflow-shaped APIs
3. **Composability** — New memory behaviors = new prompts, not new code
4. **Emergent Capability** — Raw query escape hatch for unanticipated use
5. **Improvement Over Time** — Memory IS the improvement mechanism

## Philosophy and Research

- Philosophy: `/Users/cortex-air/Tools/engram/docs/PHILOSOPHY.md`
- Research index: `/Users/cortex-air/Tools/engram/docs/research/README.md`
- Research synthesis to implementation: `/Users/cortex-air/Tools/engram/docs/research/SYNTHESIS.md`

## Project Structure

```
engram/
├── convex/                  # Convex backend
│   ├── schema.ts            # 15 tables with indexes
│   ├── functions/           # CRUD + search (9 modules)
│   ├── actions/             # Async: embed, importance, vectorSearch, enrich
│   ├── crons.ts             # 10 cron job configuration
│   └── crons/               # Cron implementations
├── mcp-server/              # MCP server (TypeScript)
│   ├── src/
│   │   ├── index.ts         # Server entry point (52 tools)
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

- OpenClaw setup guide: `/Users/cortex-air/Tools/engram/docs/setup/OPENCLAW-SETUP.md`
- Claude Code setup guide: `/Users/cortex-air/Tools/engram/docs/setup/CLAUDE-CODE-SETUP.md`
- Shared agent ID pattern: `/Users/cortex-air/Tools/engram/docs/setup/SHARED-AGENT-ID-PATTERN.md`

## License

MIT
