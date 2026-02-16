# Engram Golden Principles

**Purpose**: Machine-readable rules that define "how we do things" in Engram. These principles enable automated validation, quality tracking, and agent-driven refactoring.

**Last Updated**: 2026-02-15

## How to Use This Document

1. **For Developers**: Read before making changes. Follow all principles marked `MUST`.
2. **For Agents**: Parse this document to understand project standards. Validate changes against these rules.
3. **For Automation**: Scripts scan codebase against these principles, generating quality grades and automated PRs.

---

## GP-001: Single Source of Truth (Tool Registry)

**Category**: Code Organization
**Severity**: Critical

**Rule**: All MCP tools MUST be defined in `mcp-server/src/lib/tool-registry.ts`. No tool implementations outside the registry.

**Rationale**:
- Prevents drift between MCP server and plugin implementations
- Enables automated API documentation generation
- Ensures consistent tool schemas across all consumers

**Enforcement**:
```bash
# Automated validation
npx tsx scripts/validate-tool-registry.ts

# Manual check
grep -r "export.*Tool" mcp-server/src/tools/ | grep -v "tool-registry.ts"
```

**Examples**:
```typescript
// ✅ CORRECT: Tool defined in registry
export const TOOL_REGISTRY: ToolRegistryEntry[] = [
  {
    tool: {
      name: "memory_store_fact",
      description: "Store atomic fact with async enrichment"
    },
    zodSchema: z.object({ content: z.string() }),
    handler: storeFact
  }
];

// ❌ WRONG: Tool defined outside registry
// mcp-server/src/tools/my-tool.ts
export const myCustomTool = { name: "my_tool", ... };
```

---

## GP-002: Convex Function Paths (Type-Safe References)

**Category**: Code Organization
**Severity**: High

**Rule**: All Convex function paths MUST use constants from `mcp-server/src/lib/convex-paths.ts`. No string literals.

**Rationale**:
- Type-safe references prevent runtime errors from typos
- Centralized location makes refactoring easier
- TypeScript compiler catches broken references

**Enforcement**:
```bash
# Check for string literal calls
grep -r "ctx.run(api\." mcp-server/src/ | grep -v "convex-paths"
grep -r "ctx.runMutation.*'api\." mcp-server/src/
```

**Examples**:
```typescript
// ✅ CORRECT: Type-safe constant
import { PATHS } from '../lib/convex-paths';
await convex.mutation(PATHS.storeFact, { content: "..." });

// ❌ WRONG: String literal (typo-prone)
await convex.mutation("api.functions.storeFact", { content: "..." });
```

---

## GP-003: Atomic Primitives Only (No Workflow Wrappers)

**Category**: Architecture
**Severity**: High

**Rule**: MCP tool files MUST stay under 200 lines. Agents compose workflows via prompts, not code.

**Rationale**:
- Maximizes composability — agents can combine primitives in novel ways
- Prevents workflow lock-in — no assumptions about how tools are used
- Enables emergent capability — new workflows without new tools
- Tool files can contain multiple related primitives (e.g., context-primitives.ts)

**Enforcement**:
```bash
# Check tool handler line counts
for file in mcp-server/src/tools/*.ts; do
  lines=$(wc -l < "$file")
  if [ $lines -gt 200 ]; then
    echo "⚠️  $file: $lines lines (consider splitting)"
  fi
done
```

**Examples**:
```typescript
// ✅ CORRECT: Atomic primitive
export async function storeFact(args: { content: string }) {
  return await convex.mutation(PATHS.storeFact, args);
}

// ❌ WRONG: Workflow wrapper (search + store + notify)
export async function smartMemoryStore(args: { content: string }) {
  const existing = await searchSimilar(args.content);
  if (existing.length > 0) {
    await deduplicate(existing);
  }
  const factId = await storeFact(args);
  await notifyAgents(factId);
  return factId;
}
```

---

## GP-004: MCP Server Logging Constraint (stderr Only)

**Category**: Logging & Debugging
**Severity**: Critical

**Rule**: MCP server code MUST NEVER write to stdout. All logging goes to stderr.

**Rationale**:
- stdout is reserved for JSON-RPC protocol messages
- Any output to stdout corrupts the protocol and breaks communication
- This is a hard requirement of MCP stdio transport

**Enforcement**:
```bash
# Fail on any console.log in MCP server
if grep -r "console.log" mcp-server/src/; then
  echo "❌ console.log detected in MCP server (use console.error)"
  exit 1
fi
```

**Examples**:
```typescript
// ✅ CORRECT: Log to stderr
console.error('[engram] Debug info:', data);

// ❌ WRONG: Log to stdout (corrupts protocol)
console.log('[engram] Debug info:', data);
```

**Reference**: `docs/INSTITUTIONAL_LEARNINGS.md`, lines 14-28

---

## GP-005: Structured Logging (Component Prefix)

**Category**: Logging & Debugging
**Severity**: Medium

**Rule**: All logs MUST use structured format: `[component] message`

**Rationale**:
- Enables automated log parsing and analysis
- Makes debugging easier (know where log came from)
- Consistent format across all components

**Enforcement**:
```bash
# Check for unstructured logs
grep -r "console.error(" mcp-server/src/ | grep -v "\[.*\]"
```

**Examples**:
```typescript
// ✅ CORRECT: Structured log
console.error('[tool-registry] Registered 69 tools');
console.error('[convex-client] Connected to deployment');

// ❌ WRONG: Unstructured log
console.error('Registered 69 tools');
console.error('Connected to deployment');
```

---

## GP-006: Scope-Based Access Control

**Category**: Data Modeling
**Severity**: High

**Rule**: Every stored fact MUST include `scopeId` and all reads/writes MUST respect scope membership.

**Rationale**:
- Multi-agent memory isolation — agents can't see each other's private memory
- Security boundary enforcement
- Enables scope-based policies (retention, access, etc.)

**Enforcement**:
```typescript
// Convex schema validation
facts: defineTable({
  // ... other fields
  scopeId: v.id("memory_scopes"), // ✅ Required, not optional
})
```

**Examples**:
```typescript
// ✅ CORRECT: Scope provided
await storeFact({
  content: "Meeting notes",
  scopeId: "private-indy"
});

// ❌ WRONG: No scope (would fail schema validation)
await storeFact({
  content: "Meeting notes"
  // scopeId missing
});
```

---

## GP-013: Compact JSON Responses (No Pretty-Print)

**Category**: Performance
**Severity**: High

**Rule**: MCP responses MUST use compact JSON (`JSON.stringify(data)`), never pretty-printed JSON.

**Rationale**:
- Reduces token usage in tool responses
- Improves response throughput and parsing speed

**Enforcement**:
```bash
grep -R "JSON.stringify(.*null, 2" mcp-server/src
```

**Examples**:
```typescript
// ✅ CORRECT
JSON.stringify(result)

// ❌ WRONG
JSON.stringify(result, null, 2)
```

---

## GP-007: No Debug/TODO `console.log` in Convex Crons

**Category**: Logging & Debugging
**Severity**: Low

**Rule**: Cron code MUST NOT include debug/TODO `console.log` statements.

**Rationale**:
- Low latency for memory operations — agents don't wait for embeddings
- Non-blocking — enrichment failures don't prevent storage
- Scalability — enrichment can be parallelized/batched

**Enforcement**:
```typescript
// Performance test
const start = Date.now();
await storeFact({ content: "test" });
const duration = Date.now() - start;
assert(duration < 50, "storeFact must complete in <50ms");
```

**Examples**:
```typescript
// ✅ CORRECT: Store immediately, enrich async
export async function storeFact(args) {
  // 1. Store fact immediately (mutation)
  const factId = await ctx.runMutation(internal.functions.storeFact, args);

  // 2. Schedule async enrichment (action)
  await ctx.scheduler.runAfter(0, internal.actions.enrichFact, { factId });

  return factId; // Return immediately
}

// ❌ WRONG: Wait for enrichment (blocks)
export async function storeFact(args) {
  const factId = await ctx.runMutation(internal.functions.storeFact, args);
  const embedding = await generateEmbedding(args.content); // ⚠️ Blocks 500ms+
  await ctx.runMutation(internal.functions.updateEmbedding, { factId, embedding });
  return factId;
}
```

**Reference**: `docs/diagrams/enrichment-pipeline.svg`

---

## GP-008: AGENTS.md Size Constraint (<=150 lines)

**Category**: Documentation
**Severity**: Medium

**Rule**: `AGENTS.md` MUST remain concise and stay at or under 150 lines.

**Rationale**:
- Documentation always matches implementation (no drift)
- Changes to tools automatically update docs
- Single source of truth for API surface

**Enforcement**:
```bash
# Pre-commit hook
npx tsx scripts/generate-api-reference.ts
git diff --exit-code docs/API-REFERENCE.md || {
  echo "❌ API-REFERENCE.md out of sync. Commit generated version."
  exit 1
}
```

**Examples**:
```bash
# ✅ CORRECT: Generate docs from code
npx tsx scripts/generate-api-reference.ts
git add docs/API-REFERENCE.md

# ❌ WRONG: Manually edit API-REFERENCE.md
vim docs/API-REFERENCE.md  # Don't do this!
```

---

## GP-009: Required Documentation Files Must Exist

**Category**: Documentation
**Severity**: High

**Rule**: Core docs MUST exist: `docs/GOLDEN-PRINCIPLES.md`, `AGENTS.md`, `CLAUDE.md`, `CRONS.md`, `docs/API-REFERENCE.md`.

**Rationale**:
- Prevents repeating mistakes
- Captures tribal knowledge
- Enables new contributors to learn quickly

**Enforcement**:
```markdown
# PR template checklist
- [ ] If this fixes a gotcha/mistake, add it to INSTITUTIONAL_LEARNINGS.md
- [ ] If this introduces a new pattern, document it
```

**Examples**:
```markdown
<!-- ✅ CORRECT: Document the gotcha -->
## Gotcha: Convex Vector Search Only in Actions

**Problem**: Used `ctx.vectorSearch()` in a query, got runtime error.
**Solution**: Vector search is only available in actions.
**Reference**: `docs/INSTITUTIONAL_LEARNINGS.md`, lines 32-50

<!-- ❌ WRONG: Fix bug, don't document -->
// Fixed the bug, moved to action... hope nobody makes this mistake again!
```

---

## GP-010: Required Pattern Docs Must Exist

**Category**: Documentation
**Severity**: Low

**Rule**: Pattern docs MUST exist under `docs/patterns/` for key workflows.

**Rationale**:
- Preserves history — know what was remembered at each point in time
- Enables time-travel debugging
- Simplifies sync (no conflict resolution on updates)

**Enforcement**:
```typescript
// ❌ WRONG: Mutate existing fact
export async function updateFact(factId, newContent) {
  await ctx.runMutation(internal.functions.updateFactContent, {
    factId,
    content: newContent
  });
}

// ✅ CORRECT: Create new fact, link old one
export async function supersedeFact(factId, newContent) {
  const newFactId = await ctx.runMutation(internal.functions.storeFact, {
    content: newContent,
    supersedes: factId
  });
  await ctx.runMutation(internal.functions.markSuperseded, {
    factId,
    supersededBy: newFactId
  });
  return newFactId;
}
```

**Note**: `memory_update_fact` updates metadata (tags, tier), not content.

---

## GP-011: Tool Parameter Complexity Limits

**Category**: Tool Design
**Severity**: High

**Rule**: Tool schemas should keep parameter counts manageable (<=7 params, <=3 required where practical).

**Rationale**:
- Prevents regressions
- Documents expected behavior
- Enables confident refactoring

**Enforcement**:
```bash
# Check for missing tests
for tool in $(grep "name:" mcp-server/src/lib/tool-registry.ts | cut -d'"' -f2); do
  test_file="mcp-server/src/tools/__tests__/${tool}.test.ts"
  if [ ! -f "$test_file" ]; then
    echo "⚠️  Missing test for tool: $tool"
  fi
done
```

---

## GP-012: Cron Jobs Must Be Idempotent (Safe to Re-run)

**Category**: Reliability
**Severity**: High

**Rule**: All cron jobs MUST be idempotent — safe to run multiple times without side effects.

**Rationale**:
- Cron jobs can fail mid-execution
- Manual re-runs should be safe
- Enables testing in production

**Enforcement**:
```typescript
// ✅ CORRECT: Idempotent (check before act)
export const cleanupStale = internalMutation({
  handler: async (ctx) => {
    const stale = await ctx.db.query("facts")
      .filter(q => q.eq(q.field("lifecycleState"), "stale"))
      .collect();

    // Only process if not already processed
    for (const fact of stale) {
      if (!fact.processedAt) {
        await processFact(fact);
        await markProcessed(fact._id);
      }
    }
  }
});

// ❌ WRONG: Not idempotent (no check)
export const cleanupStale = internalMutation({
  handler: async (ctx) => {
    const stale = await ctx.db.query("facts")
      .filter(q => q.eq(q.field("lifecycleState"), "stale"))
      .collect();

    // Processes all stale facts every time (could double-process)
    for (const fact of stale) {
      await processFact(fact);
    }
  }
});
```

---

## Validation Status

> **Note**: This table shows current validation results. Run `make harness-validate` to see the latest status.

| Principle | Current Status | Violations | Target |
|-----------|---------------|-----------|--------|
| GP-001 | 🟢 Passing | 0 | 0 |
| GP-002 | 🟢 Passing | 0 | 0 |
| GP-003 | 🟢 Passing | 0 | 0 |
| GP-004 | 🟢 Passing | 0 | 0 |
| GP-005 | 🟢 Passing | 0 | 0 |
| GP-006 | 🟢 Passing | 0 | 0 |
| GP-007 | 🟢 Passing | 0 | 0 |
| GP-008 | 🟢 Passing | 0 | 0 |
| GP-009 | 🟢 Passing | 0 | 0 |
| GP-010 | 🟢 Passing | 0 | 0 |
| GP-011 | 🟡 Partial | 2 medium (tool parameter complexity) | 0 |
| GP-012 | 🟢 Passing | 0 | 0 |

**Overall Grade**: A (2 medium violations)

---

## Adding New Principles

When a pattern emerges as consistently successful:

1. Document it here with GP-XXX number
2. Add automated validation (if possible)
3. Update `scripts/validate-golden-principles.ts`
4. Announce to team
5. Fix existing violations

**Criteria for promotion**:
- Pattern used in 10+ places successfully
- Violation leads to bugs/tech debt
- Can be validated automatically

---

## References

- [Harness Engineering (OpenAI)](https://openai.com/index/harness-engineering/)
- [Institutional Learnings](./INSTITUTIONAL_LEARNINGS.md)
- [Agent-Native Architecture Plan](./plans/2026-02-14-refactor-mcp-tools-agent-native-architecture-plan.md)
