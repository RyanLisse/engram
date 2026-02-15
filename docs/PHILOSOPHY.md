# Engram Philosophy

Engram is built on one core belief: memory is infrastructure, not a feature.

## Core Thesis

- Models reason.
- Tools act.
- Memory compounds.

Without durable memory, agents repeat work, re-open solved questions, and drift from user intent. Engram treats memory as a first-class system with explicit lifecycle, access control, and feedback loops.

## Design Principles

1. Agent parity
- Any memory capability available to humans should be available to agents through tools.

2. Primitive-first composition
- Prefer small, orthogonal tools over workflow-shaped monoliths.
- Complex behavior should emerge from composition, not bespoke API endpoints.

3. Scope before recall
- Memory sharing must be explicit and policy-driven.
- Retrieval quality is irrelevant if access boundaries are weak.

4. Evidence over intuition
- Capture usage, usefulness, and outcomes.
- Improve retrieval/ranking from observed utility, not static assumptions.

5. Async enrichment, fast writes
- Memory writes should be cheap and low-latency.
- Expensive processing (embeddings, routing, synthesis) runs out-of-band.

6. Graceful forgetting
- Useful systems remember selectively.
- Lifecycle states and decay prevent memory bloat while preserving critical decisions.

## Why plugin + MCP architecture

- MCP gives immediate interoperability with Claude Code/OpenClaw and other clients.
- A plugin model enables future in-process extension for tighter runtime integration.
- Current repository ships production-ready MCP mode and documents a native plugin packaging path.

## Research-informed stance

Engram’s architecture is intentionally aligned with observed patterns from modern memory systems:

- Memory tools must be composable.
- Feedback loops matter more than one-shot scoring formulas.
- Consolidation + selective forgetting are necessary for long-running agents.
- Multi-agent access control is a differentiator, not a bolt-on.

See:
- `/Users/cortex-air/Tools/engram/docs/research/README.md`
- `/Users/cortex-air/Tools/engram/docs/research/SYNTHESIS.md`
