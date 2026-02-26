# Beads Workflow — From Plan to Actionable Tasks

> **Core principle:** "Check your beads N times, implement once."

Beads are **epics/tasks/subtasks with dependency structure**, optimized for AI coding agents. Self-contained, self-documenting, dependency-aware.

---

## Quick Reference

| Action | Command |
|--------|--------|
| Find available work | `bd ready` |
| View issue | `bd show <id>` |
| Claim work | `bd update <id> --status in_progress` |
| Complete | `bd close <id>` |
| Sync with git | `bd sync` |
| Dependency tree | `bd dep tree <id>` |
| Create bead | `bd create "Title" -t feature -p 1` |
| Add dependency | `bd depend <child-id> <parent-id>` |

**BV (Beads Viewer) — always use `--robot-*` flags (never bare `bv`):**

| Action | Command |
|--------|--------|
| Triage + recommendations | `bv --robot-triage` |
| Single top pick | `bv --robot-next` |
| Parallel tracks | `bv --robot-plan` |
| Graph health (cycles, bottlenecks) | `bv --robot-insights` |

---

## Converting a Plan to Beads

Use when you have a markdown plan and need a full bead set.

**Prompt (replace `YOUR_PLAN.md` with the plan file):**

```
OK so now read ALL of YOUR_PLAN.md; please take ALL of that and elaborate on it and use it to create a comprehensive and granular set of beads for all this with tasks, subtasks, and dependency structure overlaid, with detailed comments so that the whole thing is totally self-contained and self-documenting (including relevant background, reasoning/justification, considerations, etc.—anything we'd want our "future self" to know about the goals and intentions and thought process and how it serves the over-arching goals of the project.). The beads should be so detailed that we never need to consult back to the original markdown plan document. Remember to ONLY use the `bd` tool to create and modify the beads and add the dependencies. Use ultrathink.
```

**Shorter variant:**

```
OK so please take ALL of that and elaborate on it more and then create a comprehensive and granular set of beads for all this with tasks, subtasks, and dependency structure overlaid, with detailed comments so that the whole thing is totally self-contained and self-documenting (including relevant background, reasoning/justification, considerations, etc.—anything we'd want our "future self" to know about the goals and intentions and thought process and how it serves the over-arching goals of the project.) Use only the `bd` tool to create and modify the beads and add the dependencies. Use ultrathink.
```

---

## Polishing Beads

Run after initial conversion or when refining scope. Repeat until changes are minimal (often 6–9 rounds).

**Prompt (with plan file):**

```
Reread AGENTS.md so it's still fresh in your mind. Then read ALL of YOUR_PLAN.md. Use ultrathink. Check over each bead super carefully—are you sure it makes sense? Is it optimal? Could we change anything to make the system work better for users? If so, revise the beads. It's a lot easier and faster to operate in "plan space" before we start implementing! DO NOT OVERSIMPLIFY THINGS! DO NOT LOSE ANY FEATURES OR FUNCTIONALITY! Also make sure that as part of the beads we include comprehensive unit tests and e2e test scripts with great, detailed logging so we can be sure that everything is working perfectly after implementation. It's critical that EVERYTHING from the markdown plan be embedded into the beads so that we never need to refer back to the markdown plan and we don't lose any important context or ideas or insights into the new features planned and why we are making them.
```

**Standard (no plan file):**

```
Reread AGENTS.md so it's still fresh in your mind. Check over each bead super carefully—are you sure it makes sense? Is it optimal? Could we change anything to make the system work better for users? If so, revise the beads. It's a lot easier and faster to operate in "plan space" before we start implementing!

DO NOT OVERSIMPLIFY THINGS! DO NOT LOSE ANY FEATURES OR FUNCTIONALITY!

Also, make sure that as part of these beads we include comprehensive unit tests and e2e test scripts with great, detailed logging so we can be sure that everything is working perfectly after implementation. Remember to ONLY use the `bd` tool to create and modify the beads and to add the dependencies. Use ultrathink.
```

---

## Bead Quality Checklist

Before implementation, verify:

- [ ] **Self-contained** — Understandable without the original plan
- [ ] **Clear scope** — One coherent piece of work
- [ ] **Dependencies explicit** — All blocking/blocked links set
- [ ] **Testable** — Clear success criteria
- [ ] **Includes tests** — Unit and e2e in scope
- [ ] **Preserves features** — Nothing from the plan dropped
- [ ] **Not oversimplified** — Needed complexity kept

---

## When Beads Are Ready

- Polishing rounds yield minimal changes
- At least one cross-model review (e.g. Codex, Gemini) if possible
- No cycles: `bv --robot-insights` (or equivalent) shows no cycles
- Every feature bead has associated test beads
- Dependencies form a logical DAG

---

## Adding Test Coverage Beads

If the bead set lacks full unit/e2e coverage:

```
Do we have full unit test coverage without using mocks/fake stuff? What about complete e2e integration test scripts with great, detailed logging? If not, then create a comprehensive and granular set of beads for all this with tasks, subtasks, and dependency structure overlaid with detailed comments.
```

---

## Fresh Session (When Polishing Flatlines)

1. **Re-establish context:**

```
First read ALL of AGENTS.md and README.md super carefully and understand both. Then use your code investigation mode to fully understand the code, technical architecture, and purpose of the project. Use ultrathink.
```

2. **Then review beads:**

```
We recently transformed a markdown plan file into a bunch of new beads. I want you to very carefully review and analyze these using `bd` and `bv`.
```

3. Run the standard polish prompt.

---

## Agent Mail Integration (Optional)

- Use bead ID as Mail `thread_id`: e.g. `thread_id="engram-2kn"`
- Prefix subjects: `[engram-2kn] Starting schema work`
- In file reservations, put bead ID in `reason`

---

## Common Mistakes

1. **Oversimplifying** — Keep needed complexity
2. **Losing features** — Every plan feature should appear in beads
3. **Skipping tests** — Include unit and e2e beads
4. **Single review** — Polish until steady-state
5. **Missing dependencies** — Make all blockers explicit
6. **Short descriptions** — Beads should be verbose and self-documenting
