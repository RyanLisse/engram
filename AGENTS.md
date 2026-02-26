# Agent Instructions

This project uses **bd** (beads) for issue tracking and **bv** for task prioritization.

## Current Sprint: Context Repositories Optimization

We're adding Letta-inspired features to Engram: progressive disclosure, sleep-time reflection,
version history, QA-pair retrieval, history bootstrap, and filesystem mirror.

**Plan:** `PLAN-CONTEXT-REPOS.md` (DO NOT modify — reference only)
**Architecture:** `CLAUDE.md` (tech stack, schema, tool registry, design principles)

### Parallel Tracks (agents can work simultaneously on these)

| Track | Root Beads | First Task |
|-------|-----------|------------|
| **P1: Progressive Disclosure** | engram-adw | engram-2kn (schema) |
| **P3: Version History** | engram-gd6 | engram-rqm (schema) |
| **P4: QA-Pairs** | engram-5id | engram-7hb (schema) |

P2 (Sleep-Time), P5 (Bootstrap), P6 (FS Mirror) are blocked until P1 completes.

## Quick Reference

```bash
bd ready              # Find available work (unblocked beads)
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
bd dep tree <id>      # Show dependency tree
```

## BV (Beads Viewer) — CRITICAL: Always use --robot-* flags

```bash
bv --robot-triage     # Full triage with recommendations
bv --robot-next       # Single top pick
bv --robot-plan       # Parallel execution tracks
bv --robot-insights   # Graph health (cycles, bottlenecks)
```

**NEVER run bare `bv`** — it launches interactive TUI that blocks your session.

## Beads Workflow (Plan → Beads → Polish)

When converting a markdown plan to beads or polishing existing beads, follow **`docs/BEADS-WORKFLOW.md`**:

- **Plan → beads:** Use the conversion prompt (in that doc) with `bd` only; create tasks, subtasks, and dependencies so beads are **self-contained** and never require re-reading the plan.
- **Polish:** Reread AGENTS.md, then check each bead; revise for clarity and completeness. Include **unit + e2e test beads** with detailed logging. Do **not** oversimplify or drop features.
- **Quality:** Beads are ready when self-contained, dependency-clean, test-covered, and polishing yields minimal change. Use `bv --robot-insights` to confirm no cycles.
- **Fresh session:** If polishing flatlines, start a new session: read AGENTS.md + README.md, re-understand the codebase, then review beads with `bd`/`bv` and run the polish prompt again.

Full prompts, checklist, and Agent Mail conventions are in **`docs/BEADS-WORKFLOW.md`**.

## I Want To...

| Goal | Tool / Path |
|------|-------------|
| Store a fact | `memory_store_fact` → Core tools |
| Search memory | `memory_recall` (semantic) or `memory_search` (structured) |
| Build context | `memory_get_context` (token-aware injection) |
| Register an agent | `memory_register_agent` → Agent tools |
| Subscribe to events | `memory_subscribe` → `memory_poll_subscription` |
| Query raw data | `memory_query_raw` (escape hatch) |
| Discover all tools | `memory_list_capabilities` (69 tools, 13 categories) |

## Navigation Map

- **Architecture & Design** → `CLAUDE.md`
- **Beads workflow (plan → beads, polish, quality)** → `docs/BEADS-WORKFLOW.md`
- **Golden Principles** → `GOLDEN_PRINCIPLES.md` (mechanical rules)
- **Full API Reference** → `docs/API-REFERENCE.md` (auto-generated)
- **Tool Registry** → `mcp-server/src/lib/tool-registry.ts` (single source of truth)
- **Convex Schema** → `convex/schema.ts` (14 tables)
- **Cron Jobs** → `CRONS.md` (14 scheduled tasks)
- **Hooks** → `HOOKS.md` (6 lifecycle automations)
- **Patterns** → `docs/patterns/` (async enrichment, scopes, events, depth-first)
- **Plans** → `docs/plans/` (timestamped design docs)

## Key Build Commands

```bash
npx tsc --noEmit                 # Type-check MCP server
cd mcp-server && npm run build   # Build MCP server
npx convex dev                   # Start Convex dev
npx tsx scripts/generate-api-reference.ts  # Regen API docs
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

