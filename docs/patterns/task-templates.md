# Depth-First Task Templates

Standard decomposition patterns for common agent workflows.
Each template maps to a BD (beads) workflow with dependencies.

## Template 1: Feature Implementation

```
[root] Implement <feature>
  ├── [1] Research & context gathering
  │     └── memory_get_context(topic=<feature>, profile="planning")
  ├── [2] Schema design (depends: 1)
  │     └── Update convex/schema.ts if new tables needed
  ├── [3] Backend implementation (depends: 2)
  │     ├── [3a] Convex function (query/mutation/action)
  │     └── [3b] MCP tool handler + registry entry
  ├── [4] Test & verify (depends: 3)
  │     └── npx tsc --noEmit && manual tool test
  └── [5] Document (depends: 4)
        └── Update API-REFERENCE.md, AGENTS.md if needed
```

**BD commands:**
```bash
bd create "Research <feature>" --tag feature --priority high
bd create "Schema design for <feature>" --depends <research-id>
bd create "Implement <feature> backend" --depends <schema-id>
bd create "Test <feature>" --depends <impl-id>
bd create "Document <feature>" --depends <test-id>
```

## Template 2: Bug Fix

```
[root] Fix <bug>
  ├── [1] Reproduce & isolate
  │     └── memory_recall(query=<bug symptoms>)
  ├── [2] Root cause analysis (depends: 1)
  │     └── Read relevant source, check memory for prior fixes
  ├── [3] Minimal fix (depends: 2)
  │     └── Single upstream change, avoid downstream workarounds
  └── [4] Regression test (depends: 3)
        └── Verify fix + no new breakage
```

## Template 3: Cron Job Addition

```
[root] Add <cron-name> cron
  ├── [1] Design behavior & schedule
  │     └── Check existing crons in CRONS.md for conflicts
  ├── [2] Implement handler (depends: 1)
  │     └── convex/crons/<name>.ts — internalMutation pattern
  ├── [3] Register in crons.ts (depends: 2)
  │     └── Add crons.daily/weekly/interval entry
  └── [4] Update CRONS.md (depends: 3)
```

## Template 4: Tool Optimization

```
[root] Optimize <tool>
  ├── [1] Baseline metrics
  │     └── memory_health → check metrics.tools.<tool>
  ├── [2] Identify bottleneck (depends: 1)
  │     └── Profile: is it Convex latency? Computation? Token size?
  ├── [3] Implement optimization (depends: 2)
  │     └── Prefer: batching, caching, compact responses
  └── [4] Verify improvement (depends: 3)
        └── memory_health → compare p95 before/after
```

## Template 5: Memory Pattern Investigation

```
[root] Investigate <topic> in memory
  ├── [1] Semantic recall
  │     └── memory_recall(query=<topic>)
  ├── [2] Structured search (depends: 1, if recall insufficient)
  │     └── memory_search(text=<topic>, tags=[...])
  ├── [3] Graph traversal (depends: 1|2)
  │     └── memory_get_graph_neighbors(entityIds=[...from step 1/2])
  └── [4] Synthesize findings (depends: 3)
        └── memory_store_fact(content=<synthesis>, factType="insight")
```

## Template 6: Multi-Agent Handoff

```
[root] Hand off <context> to next agent
  ├── [1] Summarize session
  │     └── memory_end_session(summary=<what was done, what remains>)
  ├── [2] Store key decisions
  │     └── memory_store_fact(factType="decision", content=<decisions made>)
  ├── [3] File remaining work
  │     └── bd create <remaining tasks>
  └── [4] Push all code
        └── git add . && git commit && git push
```

## Usage with BD

Templates can be instantiated as BD bead chains:

```bash
# Instantiate a feature template
bd template feature --name "Add vault search" --assign @indy

# View dependency graph
bd graph <root-bead-id>

# Execute depth-first (leaves first)
bd ready  # Shows next actionable bead (all deps satisfied)
```

## Principles

1. **Depth-first execution**: Always complete leaf tasks before parents
2. **One bead in-progress at a time**: Avoid context switching
3. **Each bead is independently verifiable**: Clear done criteria
4. **Dependencies are explicit**: No hidden ordering assumptions
5. **Templates are starting points**: Adapt to actual complexity
