---
module: MCP Server
date: 2026-02-12
problem_type: integration_issue
component: tooling
symptoms:
  - "MCP server cannot import Convex generated types from separate package"
  - "TypeScript error: Type 'string | undefined' not assignable to type 'string' in scope resolution"
  - "ConvexHttpClient requires function path strings, not typed API references"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [convex, mcp-server, typescript, string-paths, type-narrowing]
---

# Troubleshooting: MCP Server Cannot Use Convex Generated Types

## Problem
When building an MCP server as a separate TypeScript package (`mcp-server/`) that calls Convex backend functions, the server cannot import the generated Convex API types from `convex/_generated/api`. This means `ConvexHttpClient` calls must use string-based function paths instead of typed references, and optional scope resolution chains produce `string | undefined` types that fail TypeScript strict mode.

## Environment
- Module: MCP Server (`mcp-server/src/`)
- TypeScript: 5.7+
- Convex: ^1.31.7
- MCP SDK: @modelcontextprotocol/sdk ^1.12.1
- Date: 2026-02-12

## Symptoms
- Importing `api` from `../convex/_generated/api` in `mcp-server/src/` fails — different `package.json`, different `tsconfig.json`
- `client.query(api.functions.facts.searchFacts, args)` cannot work without generated types
- TypeScript strict mode rejects `scopeId as string` when the variable might be `undefined` after a fallback resolution chain
- `tsc --noEmit` reports: `Type 'string | undefined' is not assignable to type 'string'`

## What Didn't Work

**Attempted Solution 1:** Import Convex generated types cross-package
- **Why it failed:** The MCP server has its own `tsconfig.json` with `rootDir: "src"`. Importing from `../convex/_generated/` is outside rootDir and fails compilation. Even with path aliases, the generated types reference other Convex internals that aren't available.

**Attempted Solution 2:** Use `as string` type assertion on optional scopeId
- **Why it failed:** TypeScript strict mode correctly flags `scopeId as string` when the variable is `string | undefined`. The assertion hides a real bug — if the fallback chain doesn't resolve a scope, the function would pass `undefined` to the Convex query.

## Solution

**1. String-based function paths for ConvexHttpClient:**

```typescript
// Before (broken — can't import from separate package):
import { api } from "../../convex/_generated/api";
const facts = await client.query(api.functions.facts.searchFacts, { query: "test" });

// After (working — string-based paths with `as any`):
const facts = await client.query("functions/facts:searchFacts" as any, { query: "test" });
```

Wrap in typed helper functions for safety:

```typescript
// mcp-server/src/lib/convex-client.ts
export async function searchFacts(args: {
  query: string;
  limit?: number;
  scopeIds?: string[];
}) {
  return await query("functions/facts:searchFacts", args);
}
```

**2. Non-null assertion after exhaustive fallback chain:**

```typescript
// Before (TypeScript error):
const allFacts = await convex.searchFacts({
  query: "",
  scopeIds: [scopeId as string],  // TS2322: string | undefined
});

// After (safe — variable proven non-undefined by control flow):
const resolvedScopeId = scopeId!;  // Safe: all branches above either assign or return
const allFacts = await convex.searchFacts({
  query: "",
  scopeIds: [resolvedScopeId],
});
```

## Why This Works

1. **String-based paths**: Convex's `ConvexHttpClient` accepts string function references at runtime. The format is `"directory/file:exportedFunction"` — e.g., `"functions/facts:storeFact"`. The `as any` cast is needed because TypeScript expects typed references, but the strings resolve correctly at runtime.

2. **Typed wrapper functions**: By wrapping each Convex call in a typed helper, the MCP server tools get type safety at the call site without needing Convex generated types. The `as any` is isolated to one file (`convex-client.ts`).

3. **Non-null assertion**: After an exhaustive fallback chain where every branch either assigns a value or returns an error, the `!` assertion is safe and documents the invariant clearly.

## Prevention

- When building external clients for Convex (MCP servers, CLI tools, etc.), always use string-based function paths with typed wrapper functions
- Keep the `as any` casts isolated to a single client wrapper file
- For scope resolution chains with multiple fallbacks, use early returns to ensure the variable is always defined by the time it's used
- Test with `tsc --noEmit` before and after every tool implementation
- Convex function path format: `"directory/filename:exportedFunctionName"`

## Related Issues

No related issues documented yet.
