# Code Style and Conventions

## Language
- TypeScript throughout (Convex functions + MCP server)
- Strict TypeScript with Convex's built-in type system (`v.string()`, `v.id()`, etc.)

## Convex Patterns
- **Mutations** for writes (ACID, auto-retried)
- **Actions** for external API calls (at-most-once, use `@convex-dev/action-retrier`)
- **internalMutation/internalAction** for server-only functions
- **Helper functions** shared between public and internal mutations (not exported as Convex functions)
- **Scheduler pattern**: `ctx.scheduler.runAfter(0, ...)` for async post-write enrichment

## MCP Server Patterns
- **stdio transport**: All logging to `stderr` (`console.error`), never `console.log`
- **Error responses**: Return `isError: true` with what/why/what-to-do guidance
- **Zod schemas** for tool input validation
- **ConvexHttpClient** singleton per MCP server process

## Naming
- Tables: snake_case (`memory_scopes`, `sync_log`)
- Functions: camelCase (`storeFact`, `getByIds`)
- Files: kebab-case for MCP tools (`store-fact.ts`, `get-context.ts`)
- IDs: kebab-case with prefix (`entity-ryan`, `scope-project-engram`)

## Design Principles
- Agent parity — identical tools for every agent
- Atomic primitives — granular operations, not workflow APIs
- Non-blocking — agents get immediate responses; enrichment is async
- Merge before delete — consolidate, then archive, never true-delete
