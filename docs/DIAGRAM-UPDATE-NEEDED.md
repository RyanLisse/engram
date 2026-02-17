# Diagram Update Requirements

**Generated:** 2026-02-15

The following diagrams contain outdated counts and need updating:

---

## 1. docs/diagrams/overview.svg (Dark Mode)

**Line 40:** `"12 MCP Tools"`
- **Should be:** `"69 MCP Tools"`

**Line 99:** `"12 Tools — stdio transport"`
- **Should be:** `"69 Tools — stdio transport"`

**Line 100:** `"10 Tables — Vector Search — 7 Crons"`
- **Should be:** `"14 Tables — Vector Search — 14 Crons"`

---

## 2. docs/diagrams/light/overview.svg (Light Mode)

**Line 56:** `"10 tables\n7 cron jobs"`
- **Should be:** `"14 tables\n14 cron jobs"`

---

## 3. docs/diagrams/light/architecture.svg (Light Mode)

**Line 74:** `"12 Memory Tools"`
- **Should be:** `"69 Memory Tools"`

**Line 77:** `"10 Tables"`
- **Should be:** `"14 Tables"`

---

## 4. docs/diagrams/architecture.svg (Dark Mode)

**Line 37:** `"Convex Cloud — 10 Tables"`
- **Should be:** `"Convex Cloud — 14 Tables"`

**Line 129:** `"12 MCP Tools"`
- **Should be:** `"69 MCP Tools"`

---

## Summary of Changes Needed

| Component | Old Value | New Value | Notes |
|-----------|-----------|-----------|-------|
| MCP Tools | 12 | 69 | All `.svg` files still show 12 |
| Convex Tables | 10 | 16 | `scope_memberships` + `agent_performance` added (Feb 2026) |
| Cron Jobs | 7 | 14 | usageAnalytics, agentHealth, qualityScan, learningSynthesis, updateGoldenPrinciples, embeddingBackfill, regenerateIndices added |

## Additional Changes (2026-02-17 Optimization Sweep)

The architecture diagrams should also reflect:

1. **Parallel vector search** — `vectorRecallAction` now runs `Promise.all` across scopes (was sequential).
2. **Join-table scope lookup** — `scope_memberships` table is the new first step in scope resolution, bypassing a full `memory_scopes` table scan.
3. **Contradiction pre-computation** — `contradictsWith` field is now populated by the enrichment pipeline at write time, not computed on-the-fly in the forget cron.
4. **Batch `bumpAccess`** — recall now makes 1 round-trip for all fact access bumps instead of N.
5. **LanceDB idle backoff** — sync daemon uses exponential backoff (30s → 5min) when no new facts are found.

### Files requiring SVG regeneration

All SVGs in `docs/diagrams/` and `docs/diagrams/light/` — the Mermaid source is now in `docs/diagrams/architecture.md`.

| File | Stale Values | Should Show |
|------|-------------|-------------|
| `overview.svg` | 12 tools, 10 tables, 7 crons | 69 tools, 16 tables, 14 crons |
| `light/overview.svg` | 10 tables, 7 crons | 16 tables, 14 crons |
| `architecture.svg` | 10 Tables, 12 MCP Tools | 16 Tables, 69 MCP Tools |
| `light/architecture.svg` | 12 Memory Tools, 10 Tables | 69 Memory Tools, 16 Tables |

---

## How to Update

These are SVG files that need manual editing or regeneration:

1. **Option A:** Edit SVG text elements directly
2. **Option B:** Regenerate from source diagram files (if available)
3. **Option C:** Use a diagram generation script to automate updates

**Recommendation:** Add a script to auto-generate diagrams from tool-registry.ts and schema.ts to prevent future drift.

---

## Verification

After updating, verify counts match:
- Tool count: `wc -l < <(grep "tool:" mcp-server/src/lib/tool-registry.ts)` → 69
- Table count: `grep "defineTable" convex/schema.ts | wc -l` → 14
- Cron count: `grep "crons\\.interval\\|crons\\.daily\\|crons\\.weekly\\|crons\\.monthly\\|crons\\.hourly" convex/crons.ts | wc -l` → 14

---

**Priority:** P1 (High) — Diagrams are user-facing documentation
**Effort:** ~15-30 minutes to update all 8 files
