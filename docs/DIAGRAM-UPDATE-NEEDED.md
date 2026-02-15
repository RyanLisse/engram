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

| Component | Old Value | New Value |
|-----------|-----------|-----------|
| MCP Tools | 12 | 69 |
| Convex Tables | 10 | 14 |
| Cron Jobs | 7 | 14 |

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
