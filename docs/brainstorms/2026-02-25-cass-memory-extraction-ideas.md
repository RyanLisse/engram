# Brainstorm: CASS Memory System — Features to Extract and Implement

**Source:** [Dicklesworthstone/cass_memory_system](https://github.com/Dicklesworthstone/cass_memory_system) (README + cm SKILL)  
**DeepWiki:** Attempted `https://deepwiki.com/Dicklesworthstone/cass_memory_system` — returned loading page; used raw GitHub README instead.  
**Date:** 2026-02-25

---

## What CASS Is

CASS Memory System gives AI coding agents **procedural memory** across sessions and agents. It uses a **three-layer cognitive model**:

- **Episodic** — Raw session logs (via `cass` search).
- **Working** — Diary entries (accomplishments, decisions, challenges, outcomes).
- **Procedural** — Playbook rules with confidence decay and maturity (`candidate` → `established` → `proven`).

Design principles: local-first, deterministic curator (no LLM in consolidation), evidence-gated validation, 90-day confidence decay, anti-pattern learning, graceful degradation.

---

## Features We Can Extract and Implement in Engram

### 1. **Confidence decay with half-life (not just relevance)**

**CASS:** 90-day half-life; effective score = base × decay factor; 4× weight for harmful feedback.

**Engram today:** Relevance decay via crons (`decay`, `forget`); importance scoring; feedback signals (`record_feedback`, `record_recall`).

**Extract:** Explicit **confidence** or **validation decay** on facts or themes: e.g. last_validated_at, half-life in days, and a multiplier for negative feedback so one “harmful” mark counts more than one “helpful.”

**Implement:** Optional `confidenceScore` / `lastValidatedAt` and decay formula in retrieval (or new field + cron that applies decay). Config: `decay_half_life_days`, `harmful_feedback_multiplier`.

---

### 2. **Maturity / state progression (candidate → established → proven)**

**CASS:** Rules move through maturity based on feedback history; “proven” rules rank higher.

**Engram today:** Fact lifecycle (active → dormant → merged → archived → pruned); no explicit maturity for “rules” or themes.

**Extract:** Maturity or **tier** for theme-like or rule-like entities: e.g. `candidate` (new, few validations), `established` (repeated use), `proven` (high confidence + evidence). Use in ranking (proven > established > candidate).

**Implement:** Add `maturity` to themes or to a new “rule” entity type; or derive from fact type + feedback count + age. Expose in retrieval (e.g. `memory_get_themes` or `memory_search` with maturity filter).

---

### 3. **Anti-patterns: harmful rules become warnings**

**CASS:** When a rule is marked harmful multiple times, it’s inverted into an anti-pattern (“PITFALL: Don’t …”) so future agents avoid it.

**Engram today:** Feedback (helpful/harmful), record_signal; no automatic inversion into “avoid this” facts.

**Extract:** When feedback is consistently harmful for a fact/theme, create or tag a **warning** or **anti-pattern** (e.g. factType `anti_pattern` or link to original with role “inversion”). Retrieve and show these in context as “avoid” items.

**Implement:** Cron or mutation that (a) detects facts/themes with high harmful ratio, (b) creates or updates an anti-pattern fact/link. New tool or filter: `memory_get_anti_patterns` or `memory_search` with `type: "anti_pattern"`.

---

### 4. **Structured session summary (diary: accomplishments, decisions, challenges, outcomes)**

**CASS:** Working memory = diary entries with structured fields (accomplishments, decisions, challenges, outcomes).

**Engram today:** Session facts, handoffs, session-end checkpoint; summaries are free-form or single blob.

**Extract:** **Structured session summary** schema: accomplishments[], decisions[], challenges[], outcomes[]. Store as fact payload or dedicated fields so retrieval can filter by “decisions” or “challenges.”

**Implement:** Extend session-end or checkpoint payload to include structured fields; optional LLM or template to fill them. New tool or filter: e.g. `memory_search_facts` with `summaryField: "decisions"`.

---

### 5. **Token budget and retrieval controls (--limit, --min-score, --no-history)**

**CASS:** `--limit N`, `--min-score N`, `--no-history` for context size.

**Engram today:** `limit`, `minScore` in recall/search; token budget in `memory_get_context` / `load_budgeted_facts`.

**Extract:** Align with CASS-style semantics: **cap rules/facts count**, **min relevance threshold**, **exclude history snippets** (e.g. exclude “session_summary” or “diary” in a context call). Document as “token budget management” for agents.

**Implement:** Ensure `memory_get_context` (and build_system_prompt) support `limit`, `minScore`, and optional `excludeTypes: ["session_summary"]` or equivalent; document in API reference.

---

### 6. **Suggested follow-up queries (suggestedCassQueries)**

**CASS:** Context response includes `suggestedCassQueries` — searches for deeper investigation.

**Engram today:** Recall returns facts; no “suggested searches.”

**Extract:** After recall, optionally return **suggested queries** (e.g. related topics or under-represented scopes) so the agent can run a second, deeper recall.

**Implement:** In `memory_recall` or `memory_get_context`, add optional step: generate 2–5 suggested queries from topic or from low-recall areas; return as `suggestedQueries: string[]`.

---

### 7. **Evidence-gated validation (rules validated against history)**

**CASS:** New rules validated against historical sessions; rules without evidence stay “candidate.”

**Engram today:** Facts and themes are stored without requiring evidence; no “evidence gate.”

**Extract:** Optional **evidence gate** for new themes or “rule” facts: e.g. require N matching facts or sessions before promoting to “established.” Candidate-only items still returned but ranked lower.

**Implement:** Theme or rule creation flow: store as candidate; background job or on-demand check that searches historical facts/sessions for support; update maturity when evidence threshold met. Config: `evidence_gate_enabled`, `min_evidence_count`.

---

### 8. **Inline feedback parsing ([cass: helpful id] / [cass: harmful id])**

**CASS:** Inline comments in code/conversation parsed to apply helpful/harmful to rule IDs.

**Engram today:** Explicit `memory_record_feedback`; no parsing of inline markers.

**Extract:** Optional **inline feedback** in observations or fact content: e.g. parse `[engram: helpful <factId>]` / `[engram: harmful <factId>]` (or configurable prefix) and call record_feedback internally.

**Implement:** In `memory_observe` or in a post-processing hook, scan content for markers and call `record_feedback`; document in AGENTS.md / CLAUDE.md.

---

### 9. **Session outcome recording (success/failure with rule IDs)**

**CASS:** `cm outcome success b-8f3a2c,b-xyz789 --summary "Fixed auth bug"` then `cm outcome-apply` to update playbook.

**Engram today:** `record_feedback`, `record_recall`; no single “session outcome” with multiple rule IDs and summary.

**Extract:** **Outcome** primitive: status (success/failure), list of fact/theme IDs that helped or hurt, free-text summary. Backend applies feedback to those IDs and optionally stores an outcome fact.

**Implement:** New tool `memory_record_outcome` (status, factIds[], summary); implementation calls record_feedback for each ID and optionally stores a session outcome fact.

---

### 10. **Gap-targeted sampling / onboarding (--fill-gaps, categories)**

**CASS:** `cm onboard sample --fill-gaps` prioritizes sessions that fill underrepresented playbook categories (debugging, testing, security, …).

**Engram today:** No category-based coverage or “gap” analysis.

**Extract:** **Coverage or gap view**: by fact type, theme, or scope, show counts; “gaps” = types or scopes with few facts. Optional **sampling**: suggest facts or sessions to review to fill gaps (e.g. for onboarding or curation).

**Implement:** Tool or dashboard view: `memory_get_coverage` or analytics that return counts by type/scope; “suggested focus” = low-count areas. Optional CLI/dashboard “onboard” flow that suggests recall queries or sessions to process.

---

### 11. **Trauma Guard (persistent anti-pattern library)**

**CASS:** Built-in “doom patterns” and Trauma Guard so agents avoid known-bad actions.

**Engram today:** No built-in doom list; anti-patterns would be stored as facts.

**Extract:** **System-level anti-pattern list** (e.g. “never run rm -rf”, “never commit secrets”) that is always included in context or in a dedicated tool. Can be configurable (YAML or Convex table) and merged with user/agent anti-patterns.

**Implement:** Config or table of trauma-guard rules; in `memory_get_context` or `memory_get_system_prompt`, append trauma-guard bullets; optional tool `memory_list_guard_rules`.

---

### 12. **Graceful degradation (no cass / no playbook / no LLM)**

**CASS:** Works with no cass (playbook only), no playbook (empty), no LLM (deterministic only), offline (cached).

**Engram today:** Convex is central; if Convex is down, most tools fail. Optional local vault.

**Extract:** Document **degradation modes**: e.g. vault-only, cached facts, read-only when Convex unreachable. Optional local cache for last N facts so context can still be built offline.

**Implement:** Vault and checkpoint already support some local state; add “offline mode” or “degraded” flag when Convex fails; return partial context from cache when available.

---

### 13. **MCP server pattern (HTTP + token auth)**

**CASS:** `cm serve` runs MCP HTTP server; `MCP_HTTP_TOKEN` for auth.

**Engram today:** MCP over stdio; optional SSE server; no HTTP MCP in the same way.

**Extract:** Offer **HTTP MCP** (or document SSE as the “remote” option) so agents that only support HTTP can connect; optional token auth.

**Implement:** If not already present, add HTTP transport for MCP or document SSE + tool-call endpoint; env var for token.

---

### 14. **Doctor / health checks (cm doctor --json)**

**CASS:** `cm doctor` returns structured checks and recommendations.

**Engram today:** `memory_health` (or similar) and agent-health cron; no single “doctor” report with recommendations.

**Extract:** **Doctor** tool or CLI: run checks (e.g. Convex reachable, vault sync, stale agents, orphaned data); return list of issues + recommended actions (e.g. “run vault sync”, “re-register agent”).

**Implement:** `memory_doctor` or CLI `engram doctor` that aggregates health checks and returns `{ checks: [], recommendations: [] }` in JSON.

---

## Full Dashboard: 10 Views and Routing

For a **full dashboard** (~2000 lines, with routing and a graph library), the following **10 views** align CASS concepts with Engram’s existing data and tools:

| # | View | Description | Engram data / tools | CASS analogue |
|---|------|--------------|---------------------|---------------|
| 1 | **Live Event Stream** | Real-time event feed (facts, recalls, sessions) | SSE, event bus | Episodic activity |
| 2 | **Agent Stats & Health** | Per-agent stats, health, watermark, listeners | SSE health, Convex agents | — |
| 3 | **Version / Fact Timeline** | Version history for a fact (already exists) | VersionTimeline, fact-history API | — |
| 4 | **Rules / Playbook** | Facts by type, themes, golden principles; filter by maturity | `memory_search`, themes, crons (rules) | Procedural playbook |
| 5 | **Confidence & Decay** | Relevance/confidence over time; decay curve | Decay cron, importance scores; (new) confidence fields | Decay visualization |
| 6 | **Anti-patterns & Warnings** | Harmful-marked or inverted rules; trauma guard | Feedback, (new) anti-pattern facts | Anti-patterns, Trauma Guard |
| 7 | **Knowledge Graph** | Graph of facts, entities, themes (nodes + edges) | `memory_get_graph_neighbors`, `memory_export_graph` | — |
| 8 | **Sessions & Diary** | Session summaries, handoffs, structured diary fields | Session facts, handoffs, (new) structured summary | Working memory / diary |
| 9 | **Context / Recall** | What was recalled for a task; last N recalls | `record_recall`, feedback; (new) “last context” cache | Context response |
| 10 | **Coverage / Gaps** | Coverage by type, scope, or theme; gap suggestions | (New) coverage API or analytics | Onboard gaps, category status |

**Routing:** Use Next.js App Router (e.g. `dashboard/src/app/(dashboard)/` with routes for each view: `/`, `/events`, `/agents`, `/timeline`, `/rules`, `/decay`, `/antipatterns`, `/graph`, `/sessions`, `/context`, `/coverage`).

**Graph library:** For **Knowledge Graph** (view 7), use a library such as **react-force-graph**, **vis-network**, or **Cytoscape.js** to render nodes (facts, entities, themes) and edges (links). `memory_export_graph` already returns Obsidian-style JSON; adapt or add an API that returns nodes/edges for the chosen library.

---

## Priority / Dependencies (Sketch)

| Feature | Deps | Effort | Impact |
|---------|------|--------|--------|
| Confidence decay + half-life | None | Medium | High |
| Maturity (candidate/established/proven) | None | Small | Medium |
| Anti-patterns (harmful → warning) | Feedback | Medium | High |
| Structured session summary (diary) | None | Medium | Medium |
| Token budget / exclude types | None | Small | Medium |
| Suggested follow-up queries | None | Small | Medium |
| Evidence-gated validation | Maturity | Medium | Medium |
| Inline feedback parsing | None | Small | Medium |
| Session outcome recording | Feedback | Small | High |
| Gap/coverage + onboarding | None | Medium | Medium |
| Trauma Guard list | None | Small | High |
| Graceful degradation | Vault/cache | Medium | Medium |
| Doctor (health + recommendations) | None | Small | High |
| Dashboard 10 views + routing + graph | SSE, Convex, export_graph | Large (~2000 LOC) | High |

---

## Next Steps

1. **Decide scope:** Which CASS features align with Engram’s roadmap (e.g. Letta-style features, agent-native parity, security)? Prioritize confidence decay, anti-patterns, outcome recording, and doctor.
2. **Dashboard:** Implement routing and one or two new views (e.g. Rules/Playbook, Knowledge Graph with a graph library); expand to 10 views incrementally.
3. **Graph:** Choose a graph library (e.g. react-force-graph for 2D/3D) and add an API shape that returns nodes/edges from `memory_get_graph_neighbors` or `memory_export_graph` for the dashboard.
4. **DeepWiki:** When DeepWiki has coverage for this repo, re-run for architecture and MCP details; merge into this doc.
