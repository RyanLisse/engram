# Engram Architecture Diagrams

All diagrams exist in two colour themes:
- **Dark** (Tokyo Night): `docs/diagrams/*.svg`
- **Light** (GitHub Light): `docs/diagrams/light/*.svg`

## Mermaid Source

The canonical Mermaid source for all diagrams lives in [`architecture.md`](./architecture.md).
Update that file first, then regenerate SVGs.

## Diagrams

| File | Description |
|------|-------------|
| `overview.svg` | High-level system overview |
| `architecture.svg` | Component architecture (MCP ↔ Convex ↔ LanceDB) |
| `data-flow.svg` | Store and recall data flow |
| `enrichment-pipeline.svg` | Async enrichment: embed → importance → contradictions → route |
| `memory-lifecycle.svg` | Fact lifecycle states (active → dormant → merged → archived → pruned) |
| `memory-scopes.svg` | Multi-agent access control with scope_memberships join table |
| `importance-scoring.svg` | Multi-factor importance scoring formula |
| `agent-lifecycle.svg` | Agent registration → recall → signal → handoff loop |

## Current State (as of 2026-02-17)

### Correct values

| Metric | Value |
|--------|-------|
| MCP Tools | **69** |
| Convex Tables | **16** |
| Cron Jobs | **14** |

### SVG files are stale

The `.svg` files still show outdated counts (12 tools, 10 tables, 7 crons). See [`../DIAGRAM-UPDATE-NEEDED.md`](../DIAGRAM-UPDATE-NEEDED.md) for the full list of changes needed.

### What changed in Feb 2026 optimizations

The following architectural changes should be reflected in updated diagrams:

1. **`scope_memberships` join table** — scope resolution now starts with the `scope_memberships` table (`by_agent` index → O(memberships)), then fetches `memory_scopes` by ID. This replaced the previous full `memory_scopes` table scan.

2. **Parallel vector search** — `vectorRecallAction` uses `Promise.all(scopeIds.map(...))` to run all scope vector searches concurrently. Previously ran sequentially.

3. **Contradiction pre-computation** — The enrichment pipeline now calls `checkContradictions` immediately after embedding. The `contradictsWith` field is pre-populated at write time so the forget cron reads it directly (O(1) field read vs O(n) live scan).

4. **Batch access bumping** — A single `bumpAccessBatch` mutation replaces N sequential `bumpAccess` calls after recall.

5. **LanceDB idle backoff** — The sync daemon now backs off from 30s to up to 5 minutes when no new facts are found, resetting to 30s when facts appear.

## Regenerating SVGs

SVGs were originally generated with a Mermaid CLI script. To regenerate:

```bash
# Install Mermaid CLI (once)
npm install -g @mermaid-js/mermaid-cli

# Extract individual diagrams from architecture.md and convert
# (Manual step — automation script TBD)
mmdc -i architecture.md -o architecture.svg -t dark
```

Until SVGs are regenerated, the Mermaid source in `architecture.md` is authoritative.
