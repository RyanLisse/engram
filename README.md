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

![Architecture](docs/diagrams/architecture.svg)

### Data Flow — Store & Recall

![Data Flow](docs/diagrams/data-flow.svg)

### Memory Scopes — Multi-Agent Access Control

![Memory Scopes](docs/diagrams/memory-scopes.svg)

### Importance Scoring — Multi-Factor Relevance

![Importance Scoring](docs/diagrams/importance-scoring.svg)

### Agent Lifecycle

![Agent Lifecycle](docs/diagrams/agent-lifecycle.svg)

### Enrichment Pipeline — Async Fact Processing

![Enrichment Pipeline](docs/diagrams/enrichment-pipeline.svg)

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
- **Cohere Embed 4** — Multimodal embeddings (1024-dim: text + images + code)

## Status

🚧 Planning phase — see [PLAN.md](./PLAN.md) and [RESEARCH.md](./RESEARCH.md)

## License

MIT
