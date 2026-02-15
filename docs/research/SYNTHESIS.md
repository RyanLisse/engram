# Research Synthesis: Why Engram Looks This Way

This document translates research findings into explicit Engram design choices.

## Summary

Engram combines:
- Primitive MCP tools for agent composability
- Structured memory lifecycle and decay
- Scope-based sharing controls
- Feedback and outcome signals for iterative ranking improvement

## Findings -> Decisions

1. Finding: systems degrade when they only store, never consolidate or forget.
- Sources: SimpleMem, ALMA, AgeMem, field observations.
- Decision: lifecycle states (`active`, `dormant`, `merged`, `archived`, `pruned`) plus scheduled decay/forget/consolidate jobs.

2. Finding: retrieval quality improves when semantic recall is paired with utility/outcome signals.
- Sources: MemRL, AgeMem.
- Decision: `signals` + `recall_feedback` tables and reranking hooks (`outcomeScore`, `importanceScore` updates).

3. Finding: tool granularity drives agent autonomy.
- Sources: Letta patterns, MCP ecosystem practice.
- Decision: decompose workflows into primitives (`memory_vector_search`, `memory_text_search`, event and config primitives), while keeping compatibility wrappers.

4. Finding: multi-agent memory needs explicit boundaries.
- Sources: collaborative memory work and production field reports.
- Decision: `memory_scopes` + `memory_policies` + permission checks and scoped retrieval.

5. Finding: practical systems need low-latency writes and deferred heavy work.
- Sources: production memory service patterns.
- Decision: fast `storeFact` path and async enrichment/actions for embeddings/routing.

## Plugin posture

OpenClaw and Claude Code integration is currently achieved through MCP server mode.

- Why now: fastest interoperable path, lowest adoption friction.
- Native plugin mode: documented and templated for future in-process package distribution.

References:
- `/Users/cortex-air/Tools/engram/docs/setup/OPENCLAW-SETUP.md`
- `/Users/cortex-air/Tools/engram/docs/setup/OPENCLAW-NATIVE-PLUGIN-TEMPLATE.md`

## Non-goals

- No claim that memory policies are fully autonomous RL policies yet.
- No claim that native OpenClaw extension packaging is complete in this repository.

Those are tracked as explicit next-stage engineering work, not implied capabilities.
