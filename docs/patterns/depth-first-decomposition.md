# Depth-First Task Decomposition

## Principle
Break goals into atomic building blocks. Complete each block fully before moving to dependents. No work on level N+1 until level N is complete and tested.

## Pattern
```
Goal
├── Foundation (complete first)
│   ├── Schema changes
│   ├── Validation
│   └── Tests
├── Core Logic (depends on Foundation)
│   ├── Implementation
│   ├── Error handling
│   └── Tests
├── Integration (depends on Core Logic)
│   ├── Wire to tool registry
│   ├── Update convex-paths.ts
│   └── Tests
└── Documentation (depends on Integration)
    ├── Update API-REFERENCE.md
    ├── Add to CLAUDE.md if needed
    └── Update patterns/ if new pattern
```

## BD Integration
```bash
bd create --title "Foundation: Schema" --type task
bd create --title "Core: Implementation" --type task
bd create --title "Integration: Wire tools" --type task
bd dep add <core-id> <foundation-id>    # Core depends on Foundation
bd dep add <integration-id> <core-id>   # Integration depends on Core
```

## Example: Adding a New Tool

### Level 1 — Foundation
1. Add Convex function in `convex/functions/`
2. Add path to `mcp-server/src/lib/convex-paths.ts`
3. Add wrapper in `mcp-server/src/lib/convex-client.ts`
4. Verify: `npx tsc --noEmit` in both `convex/` and `mcp-server/`

### Level 2 — Tool Handler
1. Create handler in `mcp-server/src/tools/`
2. Define Zod schema + handler function
3. Unit test the handler

### Level 3 — Registry
1. Import handler in `mcp-server/src/lib/tool-registry.ts`
2. Add entry to `TOOL_REGISTRY` array with MCP schema + Zod schema + handler
3. Add to correct category in `memory_list_capabilities`
4. Verify: `npx tsc --noEmit` in `mcp-server/`

### Level 4 — Documentation
1. Run `npx tsx scripts/generate-api-reference.ts`
2. Update tool count in `CLAUDE.md` if category changed
3. Update `AGENTS.md` navigation if new category

## Anti-Patterns
- **Breadth-first**: Starting all levels simultaneously leads to half-finished work
- **Skip testing**: Untested foundation causes cascading failures at integration
- **Documentation debt**: Leaving docs for "later" means they never get written
