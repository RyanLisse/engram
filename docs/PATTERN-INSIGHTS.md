# Pattern Insights

Generated insights from agent performance and recall/signal trends.

## 2026-02-16 Snapshot

### High-performing patterns
- Type-safe Convex path usage via `mcp-server/src/lib/convex-paths.ts`
- Small/atomic tool handlers with explicit Zod schemas
- Compact JSON responses in MCP server output paths

### Improvement opportunities
- Reduce required param count in selected admin/config tools where safe defaults exist
- Continue splitting multi-purpose tool files when they exceed readability thresholds

### Candidate Golden Principles updates
- Add explicit guidance for weekly quality report generation consistency
- Add principle for workflow portability (GNU/BSD shell compatibility in CI scripts)
