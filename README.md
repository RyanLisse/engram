# Engram 🧠

**Unified multi-agent memory for OpenClaw.**

An elephant never forgets. Neither should your agents.

Engram is a shared memory layer that any OpenClaw agent can plug into. Local-first vector search via LanceDB, cloud-synced through Convex, with full agent-native architecture.

## What It Does

- **Store** atomic facts, entities, and conversations across agents
- **Recall** semantically — vector search finds what matters, not just what matches
- **Share** memory between agents with scoped access control
- **Decay** gracefully — old memories fade but never disappear
- **Sync** across devices — Mac Mini, MacBook Air, MacBook Pro all see the same brain

## Architecture

```
┌──────────────────────────────────────────────────┐
│                 Convex Backend                     │
│                                                    │
│  facts ── entities ── conversations ── sessions   │
│  agents ── memory_scopes ── sync_log              │
│                                                    │
│  Scheduled: decay, importance, garbage collect     │
│  Actions: embed, summarize, extract entities       │
└─────────────────────┬────────────────────────────┘
                      │
               Convex HTTP API
                      │
       ┌──────────────┼──────────────┐
       │              │              │
  ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
  │  Agent  │   │  Agent  │   │  Agent  │
  │  (MCP)  │   │  (MCP)  │   │  (MCP)  │
  └────┬────┘   └────┬────┘   └────┬────┘
       │              │              │
  ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
  │ LanceDB │   │ LanceDB │   │ LanceDB │
  │ (local) │   │ (local) │   │ (local) │
  └─────────┘   └─────────┘   └─────────┘
```

## Agent-Native Principles

1. **Parity** — Every agent gets the same memory tools
2. **Granularity** — Atomic primitives, not workflow-shaped APIs
3. **Composability** — New memory behaviors = new prompts, not new code
4. **Emergent Capability** — Raw query escape hatch for unanticipated use
5. **Improvement Over Time** — Memory IS the improvement mechanism

## Tech Stack

- **Convex** — Cloud backend (realtime, scheduled functions, server-side logic)
- **LanceDB** — Local vector search (sub-10ms, per-node)
- **TypeScript** — MCP server + Convex functions
- **OpenAI Embeddings** — Vector representations for semantic search

## Status

🚧 Planning phase — see [PLAN.md](./PLAN.md) and [RESEARCH.md](./RESEARCH.md)

## License

MIT
