# Harness Engineering Quick Start

**Ready to optimize Engram with OpenAI's Harness Engineering principles? Start here.**

---

## What Just Happened?

I've applied OpenAI's Harness Engineering methodology to Engram. This transforms your codebase into an agent-first development environment where:

1. **Agents can reason about the code** — Golden principles are machine-readable
2. **Quality is tracked automatically** — Validation runs on every commit
3. **Technical debt is cleaned continuously** — Background agents fix violations
4. **Tasks are decomposed systematically** — Templates guide depth-first development
5. **Patterns improve over time** — Agent performance feeds back into principles

---

## Quick Start (5 Minutes)

### Step 1: Run Golden Principles Validation

```bash
cd /Users/cortex-air/Tools/engram
npx tsx scripts/validate-golden-principles.ts
```

**Expected output:**
```
[validate] Running golden principles validation...

======================================================================
VALIDATION RESULTS
======================================================================
Overall Grade: B+
Duration: 1243ms

Summary:
  Files checked: 42
  Critical violations: 0
  High violations: 3
  Medium violations: 12
  Low violations: 0

Violations by Principle:

GP-003: 3 violation(s)
  HIGH: mcp-server/src/tools/context-primitives.ts
    Tool file is 157 lines (exceeds 100-line guideline)
    Fix: Consider splitting into atomic primitives

GP-005: 12 violation(s)
  MEDIUM: mcp-server/src/lib/convex-client.ts:45
    Log message missing [component] prefix
    Fix: Add component prefix: console.error('[component] message')

======================================================================
```

### Step 2: Review Golden Principles

```bash
cat docs/GOLDEN-PRINCIPLES.md
```

Read through GP-001 through GP-012. These are the "always do this, never do that" rules that keep Engram agent-optimized.

### Step 3: Try a Task Template

```bash
cat docs/task-templates/new-mcp-tool.md
```

This template shows depth-first decomposition for adding a new MCP tool. Each step is atomic, with clear success criteria.

### Step 4: Read the Full Optimization Plan

```bash
cat docs/HARNESS-ENGINEERING-OPTIMIZATION.md
```

5-phase plan to transform Engram into a fully harness-optimized codebase over 5 weeks.

---

## What Was Created?

| File | Purpose |
|------|---------|
| `docs/HARNESS-ENGINEERING-OPTIMIZATION.md` | Master plan: 5 phases, 25 weeks, full transformation strategy |
| `docs/GOLDEN-PRINCIPLES.md` | Machine-readable rules (GP-001 through GP-012) |
| `scripts/validate-golden-principles.ts` | Automated violation detection + quality grading |
| `docs/task-templates/new-mcp-tool.md` | Depth-first template for adding MCP tools |
| `docs/HARNESS-ENGINEERING-QUICKSTART.md` | This file |

---

## Key Concepts

### 1. Golden Principles

**What**: Opinionated, mechanical rules that define "how we do things"
**Why**: Agents can validate against them, humans don't need to remember
**Example**: GP-004: "MCP server must never write to stdout"

### 2. Automated Validation

**What**: Scripts that scan codebase for principle violations
**Why**: Catch issues before merge, track quality over time
**Example**: `validate-golden-principles.ts` returns Grade A-F per file

### 3. Recurring Cleanup

**What**: Background agents that fix violations and open PRs
**Why**: Technical debt doesn't accumulate, codebase stays legible
**Example**: Weekly cron that scans for console.log and fixes them

### 4. Task Templates

**What**: Structured, depth-first breakdowns of common workflows
**Why**: Agents can instantiate templates for consistent execution
**Example**: "Add new MCP tool" template with 30+ atomic checklist items

### 5. Performance Feedback

**What**: Track which patterns lead to successful agent completions
**Why**: Golden principles evolve based on what actually works
**Example**: "90% success rate → promote pattern to golden principle"

---

## Implementation Phases (Summary)

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| **Phase 1: Foundation** | Week 1 | Golden principles + validation |
| **Phase 2: Cleanup** | Week 2 | Automated PR generation for violations |
| **Phase 3: Templates** | Week 3 | 5 core task templates |
| **Phase 4: Metrics** | Week 4 | Quality dashboard + CI integration |
| **Phase 5: Learning** | Week 5 | Agent performance feedback loop |

**Total**: 5 weeks to full harness engineering implementation

---

## Next Actions

### Immediate (Today)

1. **Run validation** to establish baseline:
   ```bash
   npx tsx scripts/validate-golden-principles.ts > baseline.txt
   ```

2. **Fix critical violations** (if any):
   - Focus on GP-004 (stdout logging)
   - Should take <30 minutes

3. **Review golden principles** with team:
   - Do these make sense for Engram?
   - Any missing? Any too strict?

### This Week

1. **Fix high-priority violations**:
   - GP-003: Split oversized tools into primitives
   - GP-005: Add [component] prefixes to logs

2. **Add pre-commit hook**:
   ```bash
   cat > .git/hooks/pre-commit << 'EOF'
   #!/bin/bash
   npx tsx scripts/validate-golden-principles.ts
   EOF
   chmod +x .git/hooks/pre-commit
   ```

3. **Create first automated cleanup PR**:
   - Run validation
   - Pick 1 violation type
   - Fix all instances
   - Open PR with "🤖 Harness Engineering" prefix

### This Month

1. **Complete Phase 1** (Golden Principles Foundation)
2. **Complete Phase 2** (Recurring Agent Cleanup)
3. **Complete Phase 3** (Task Templates)

### This Quarter

1. **Complete all 5 phases**
2. **Track metrics**:
   - % of files with Grade A
   - # of automated PRs merged
   - Time to add new MCP tool (target: 50% reduction)
3. **Iterate on golden principles** based on learnings

---

## Success Metrics

Track these weekly:

| Metric | Baseline | Target (3 months) |
|--------|----------|-------------------|
| Files with Grade A | TBD | 95%+ |
| Critical violations | TBD | 0 for 30+ days |
| Time to add MCP tool | ~2 hours | ~1 hour |
| Automated PRs merged | 0 | 10+/month |
| Test coverage | TBD | 90%+ |

---

## Common Questions

**Q: Do I need to rewrite everything?**
A: No. Start with new code following principles, fix violations incrementally.

**Q: What if a principle doesn't fit?**
A: Golden principles should evolve. If it doesn't make sense, propose a change.

**Q: Can agents really fix violations automatically?**
A: Yes, for mechanical violations (like console.log → console.error). Human review for complex cases.

**Q: How long until we see results?**
A: Week 1: Validation running. Week 3: First automated PRs. Month 2: Quality grade improving. Month 3: Agents autonomously maintaining code.

**Q: Does this work for other codebases?**
A: Yes! Golden principles + validation + templates are transferable patterns.

---

## Resources

### OpenAI Articles
- [Harness Engineering: Leveraging Codex in an Agent-First World](https://openai.com/index/harness-engineering/)
- [Unlocking the Codex Harness](https://openai.com/index/unlocking-the-codex-harness/)

### Engram Docs
- `docs/HARNESS-ENGINEERING-OPTIMIZATION.md` — Full implementation plan
- `docs/GOLDEN-PRINCIPLES.md` — All 12 principles
- `docs/task-templates/` — Depth-first task breakdowns
- `scripts/validate-golden-principles.ts` — Validation tool

### Community
- Medium: ["2026 Is Agent Harnesses"](https://aakashgupta.medium.com/2025-was-agents-2026-is-agent-harnesses-heres-why-that-changes-everything-073e9877655e)
- Gend.co: ["Codex for Agent-First Engineering"](https://www.gend.co/blog/codex-agent-first-engineering)

---

## Getting Help

1. **Found a bug in validation?** Open issue with label `harness-engineering`
2. **Have a principle suggestion?** PR to `GOLDEN-PRINCIPLES.md`
3. **Need a new task template?** Create in `docs/task-templates/` following the pattern

---

## Celebrate Wins 🎉

As you implement harness engineering:

- **First Grade A file** 🎯
- **First automated PR merged** 🤖
- **Zero critical violations for 7 days** 🔒
- **First agent-written feature using templates** 🚀
- **Golden principle promoted from learnings** 🧠

---

## Welcome to Harness Engineering

You're now set up to build Engram the way OpenAI builds their internal products: **agent-first, quality-tracked, continuously improving.**

The goal isn't perfection on day 1. It's **measurable improvement every week**, compounding over time.

Let's ship it. 🚀
