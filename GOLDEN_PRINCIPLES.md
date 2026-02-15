# Engram Golden Principles

Mechanical rules enforced by tooling. Not guidelines — constraints.

## Tool Design (Non-Negotiable)

1. **Atomic only** — One operation, one responsibility per tool
2. **Sub-50ms storage** — Async enrichment for slow ops (embeddings, classification)
3. **Zod-first** — Every tool validates via Zod schema before execution
4. **No workflow APIs** — Composition happens in prompts, not tools
5. **Optional agentId** — Every scoped tool accepts agentId for identity context

## Memory Storage

1. **Store first, enrich later** — Never block on embeddings or classification
2. **Facts are append-only** — Updates create new versions; originals are never mutated
3. **Scope before store** — Resolve scope name→ID before any write operation
4. **Private by default** — Shared scope requires explicit override
5. **Merge before delete** — Consolidate related facts, then archive; never true-delete

## Code Organization

1. **Single source of truth** — `tool-registry.ts` is the only place tool definitions live
2. **Type-safe paths** — All Convex calls go through `convex-paths.ts` constants
3. **Hooks are fire-and-forget** — Never block the main thread
4. **Event bus for coordination** — No direct agent-to-agent calls
5. **SSE primary, polling fallback** — Real-time streaming is the default

## Documentation

1. **AGENTS.md is a map** — Under 150 lines, points to deeper sources
2. **CLAUDE.md is the manual** — Architecture, patterns, tool reference
3. **API-REFERENCE.md auto-generates** — From tool-registry.ts via `scripts/generate-api-reference.ts`
4. **Patterns in /docs/patterns/** — Reusable architectural decisions
5. **Plans in /docs/plans/** — Timestamped, never deleted

## Performance Targets

| Metric | Target | Measured By |
|--------|--------|-------------|
| Tool response (storage) | <50ms | MCP server request tracing |
| Tool response (retrieval) | <200ms | MCP server request tracing |
| Embedding enrichment | <2s async | Convex action logs |
| Rate limit | 200 req/min/agent | MCP server rate limiter |
| JSON response overhead | Compact (no pretty-print) | Token count |

## Enforcement

- **Pre-commit**: TypeScript compilation (`npx tsc --noEmit`)
- **Runtime**: Zod validation on every tool call
- **Tracing**: Every call logged with `#id tool OK/ERR durationMs`
- **Convex paths**: Rename breaks at compile time via `convex-paths.ts`
- **Rate limiter**: Automatic with configurable `ENGRAM_RATE_LIMIT`
