# Task Completion Checklist

When completing a task in Engram:

## Before Marking Complete
1. **Verify changes work**: Run `npx convex dev` (when Convex is set up) to verify schema/function changes
2. **Check type safety**: TypeScript errors in Convex functions will block deployment
3. **Test MCP tools**: Use MCP Inspector to test tool I/O
4. **Check consistency**: Ensure PLAN.md, CLAUDE.md, and detailed plan doc all agree on counts (10 tables, 12 tools, 7 crons)

## Code Quality
- No `console.log` in MCP server code (use `console.error` for stdio transport)
- Actions must be idempotent (check if enrichment already exists before calling external APIs)
- Mutations should validate scope write permissions before inserting

## Git
- Commit with descriptive messages following existing style (imperative, detail-oriented)
- Don't commit `.env` files or API keys
- Keep commits focused on one logical change

## Documentation
- Update PLAN.md phase checklists when implementing features
- Reference CLAUDE.md for architecture decisions
- Research docs in `docs/research/` are reference material, not to be modified unless new research is added
