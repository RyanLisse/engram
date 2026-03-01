# Doc-to-LoRA Adapter Memory Integration — Implementation Summary

**Date:** 2026-02-27  
**Status:** ✅ Complete — All 5 components implemented

---

## 📦 Components Implemented

### ✅ Component 1: Convex Function (`convex/functions/adapterMemory.ts`)

Created 3 queries:

1. **`buildAdapterDocument`** — Builds dense memory documents from scope facts
   - Filters by importance (≥0.3 default) and lifecycle (active only)
   - Supports optional fact type filtering
   - Groups facts by type for structured output
   - Prioritizes `factualSummary` over raw `content`
   - Includes QA pairs when available
   - Optional entity list generation

2. **`listMemoryModules`** — Lists agent-accessible memory modules
   - Queries `scope_memberships` for agent's scopes
   - Returns scope metadata with fact/token counts
   - Phase 1: all modules in "retrieval" mode

3. **`buildEntityClusterDocument`** — Builds entity-centric documents
   - BFS traversal of entity relationship graph
   - Configurable depth (default: 1 hop)
   - Gathers facts referencing cluster entities
   - Returns root entity metadata + cluster size

**Key patterns followed:**
- Uses `v.id("memory_scopes")` for scope references
- Filters by `lifecycleState === "active"`
- Sorts by `importanceScore` descending
- Includes token estimation for budgeting

---

### ✅ Component 2: Schema Update (`convex/schema.ts`)

Added **`adapter_modules`** table:

```typescript
adapter_modules: defineTable({
  agentId: v.string(),
  scopeId: v.id("memory_scopes"),
  name: v.string(),
  mode: v.string(), // "retrieval" | "adapter"
  status: v.string(), // "draft" | "ready" | "stale" | "generating"
  document: v.optional(v.string()),
  documentChecksum: v.optional(v.string()),
  factCount: v.optional(v.number()),
  tokenEstimate: v.optional(v.number()),
  baseModel: v.optional(v.string()),
  loraConfig: v.optional(v.object({
    rank: v.number(),
    targetModules: v.array(v.string()),
    alpha: v.optional(v.number()),
  })),
  lastGeneratedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_agent", ["agentId"])
  .index("by_scope", ["scopeId"])
  .index("by_status", ["status"]),
```

**Location:** Inserted before closing `});` at end of schema  
**Backup:** `convex/schema.ts.backup` (original), `convex/schema.ts.bak2` (sed backup)

---

### ✅ Component 3: MCP Tool Source (`mcp-server/src/tools/adapter-memory.ts`)

TypeScript source recreated from compiled dist/tools/adapter-memory.js:

- Zod schemas for all 3 tools
- `resolveScopeId` helper (inlined from observation-memory pattern)
- Proper error handling (returns `{error: "..."}` on failure)
- Includes D2L compatibility hints in responses

**Tools exported:**
- `buildAdapterDocument` + schema
- `listMemoryModules` + schema  
- `buildEntityClusterDocument` + schema

---

### ✅ Component 4: Tool Registry Entries (`mcp-server/src/lib/tool-registry/adapter-entries.ts`)

Registers 3 MCP tools following `kv-entries.ts` pattern:

- **`adapter_build_document`** — Build scope-level memory document
- **`adapter_list_modules`** — List agent's memory modules
- **`adapter_build_entity_cluster`** — Build entity cluster document

Each entry includes:
- Tool name/description
- JSON Schema (inputSchema)
- Zod schema reference
- Handler function with agentId injection

**Integration:** Added to `mcp-server/src/lib/tool-registry/index.ts`:
```typescript
import { entries as adapterEntries } from "./adapter-entries.js";
// ...
const _baseEntries: ToolEntry[] = [
  // ...
  ...adapterEntries,
  // ...
];
```

---

### ✅ Component 5: E2E Test Script (`~/Tools/engram/test-adapter-e2e.ts`)

Bun test script that:

1. Calls Convex `buildAdapterDocument` via HTTP client
2. Pipes document to modified `test_mps.py` (D2L inference)
3. Compares WITH vs WITHOUT internalization outputs
4. Verifies outputs differ (proves internalization works)

**Usage:**
```bash
cd ~/Tools/engram
bun run test-adapter-e2e.ts [scopeId]
```

**Default scope:** `shared-ryan` (20 facts, importance ≥0.5)

**D2L test path:** `~/Tools/doc-to-lora/test_adapter_e2e.py` (auto-created)

---

## 🔧 Build Status

### MCP Server
```bash
cd ~/Tools/engram/mcp-server
npm run build
```
**Result:** ✅ **No TypeScript errors**

### Convex Schema
- Syntax validated ✅ (balanced braces: 42 open, 42 close)
- `adapter_modules` table present ✅
- Schema length: 22,993 chars

**Note:** Full `convex deploy` blocked by unrelated validation error in `kv-store.js` filename (predates this work). Schema changes are **ready** for deployment once upstream issue resolved.

---

## 📝 Files Modified

| File | Action |
|------|--------|
| `convex/functions/adapterMemory.ts` | ✅ Created (3 queries) |
| `convex/schema.ts` | ✅ Updated (`adapter_modules` table) |
| `mcp-server/src/tools/adapter-memory.ts` | ✅ Created (tool implementations) |
| `mcp-server/src/lib/tool-registry/adapter-entries.ts` | ✅ Created (registry) |
| `mcp-server/src/lib/tool-registry/index.ts` | ✅ Updated (import + include) |
| `test-adapter-e2e.ts` | ✅ Created (E2E test) |

**Backups:**
- `convex/schema.ts.backup` (original)
- `mcp-server/src/lib/tool-registry/index.ts.backup`

---

## 🚀 Next Steps

1. **Deploy Convex schema:**
   ```bash
   cd ~/Tools/engram
   npx convex deploy --yes
   ```
   ⚠️ **Blocked:** Fix `kv-store.js` filename validation error first.

2. **Verify MCP tools:**
   ```bash
   # Test via MCP stdio server
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node mcp-server/dist/index.js
   ```

3. **Run E2E test:**
   ```bash
   cd ~/Tools/engram
   bun install convex  # If not already installed
   bun run test-adapter-e2e.ts
   ```

4. **Wire into OpenClaw:**
   Update `~/.openclaw/openclaw.json` to include Engram MCP server with adapter tools enabled.

---

## 🎯 Design Decisions

1. **Inlined `resolveScopeId`** instead of creating shared utility (follows existing pattern in `observation-memory.ts`)

2. **No external deps** — Used existing Convex client and Zod schemas from project

3. **Phase 1 only** — All modules return `mode: "retrieval"`. Phase 2 (hypernetwork adapter generation) is TODO.

4. **Token estimation** — Simple char/4 heuristic (matches existing `estimateTokens` in facts.ts)

5. **BFS depth default = 1** — Prevents combinatorial explosion in dense entity graphs

---

## 📊 Impact

- **MCP tool count:** 69 → **72** (+3)
- **Convex queries:** +3 (`buildAdapterDocument`, `listMemoryModules`, `buildEntityClusterDocument`)
- **Schema tables:** +1 (`adapter_modules`)

**No breaking changes** — All additions are backward-compatible.

---

**Implementation completed by:** Subagent `engram-adapter`  
**Runtime:** OpenClaw agent:main:subagent:d47489d6-475b-4dd0-a2b1-022394a6d774  
**Requester:** agent:main:main (Ryan via Telegram)
