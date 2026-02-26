# Brainstorm: What to Extract from Entire CLI (OpenCode Section)

**Source:** [entireio/cli README – OpenCode](https://github.com/entireio/cli?tab=readme-ov-file#opencode)  
**Date:** 2026-02-25

---

## What Entire Does (Relevant Bits)

- **Session capture:** Hooks into Git + agent (Claude Code, Gemini, **OpenCode**) to capture prompts, responses, files modified, timestamps.
- **Checkpoints:** Snapshot at each commit; stored on a **shadow branch** `entire/checkpoints/v1` so main branch stays clean.
- **Rewind:** Restore repo state to a previous checkpoint (file-level).
- **Resume:** Restore latest checkpointed session metadata for a branch and print command(s) to continue.
- **Explain:** Explain a session or commit (narrative from transcript).
- **OpenCode integration:** Hook installed at `.opencode/plugins/entire.ts` (TypeScript plugin); enable via `entire enable --agent opencode`.

---

## What We Can Extract and Implement in Engram

### 1. **Commit-linked session metadata (traceability)**

**Idea:** Persist an explicit link between a git commit and the active session/checkpoint so we can answer “what session produced this commit?” and “what commit did this session produce?”.

**Engram today:** Session facts, handoffs, `memory_checkpoint` / `memory_wake`; no first-class commit SHA or branch.

**Extract:**
- Store a fact or session field with `commitSha`, `branch`, optional `commitMessage` when the agent (or user) commits.
- Use existing `onGitCommit`-style workspace events (see OPENCODE-SETUP) to call a new tool or extend `memory_store_fact` / session-end flow with commit context.

**Implement:**  
- Optional `memory_record_commit` (or extend session-end/checkpoint) that takes `commitSha`, `branch`, `message` and either stores a fact or updates session metadata.  
- Later: “explain commit” = recall facts + handoffs for that commit/session.

---

### 2. **Resume = wake + “command to continue”**

**Idea:** Entire’s `entire resume` restores session metadata and prints the command to continue (e.g. “run `claude` to continue”).

**Engram today:** `memory_wake` restores context from a checkpoint; we don’t emit a suggested next command.

**Extract:**
- After wake, optionally return or display a short “resume hint”: e.g. “Continue with: `claude`” or “Session: X, last checkpoint: Y”.
- Could be a small addition to `memory_wake` response or a thin wrapper tool `memory_resume` that calls wake + builds the hint.

**Implement:**  
- Add optional `resumeHint` or `suggestedCommand` to checkpoint payload and to `memory_wake` result.  
- CLI or plugin can print it after restore.

---

### 3. **Explain session / explain commit**

**Idea:** Entire’s `entire explain` gives a narrative for a session or commit.

**Engram today:** We have facts, handoffs, session summaries, and recall; no dedicated “explain” tool.

**Extract:**
- **Explain session:** Recall session summary facts + handoffs for session X; optionally use a small prompt to format as narrative (or return structured data for UI to render).
- **Explain commit:** If we add commit-linked metadata (above), recall by `commitSha` (or session that contains it) and same narrative flow.

**Implement:**  
- New tool e.g. `memory_explain_session` / `memory_explain_commit` (or one tool with `type: "session" | "commit"` and id/sha).  
- Implementation: query facts + handoffs by session or commit, return summary + optional LLM-generated narrative (or keep narrative client-side).

---

### 4. **OpenCode plugin as first-class artifact (`.opencode/plugins/engram.ts`)**

**Idea:** Entire installs a TypeScript plugin at `.opencode/plugins/entire.ts` so OpenCode users run `entire enable --agent opencode` and get hooks in one shot.

**Engram today:** We document MCP + `opencode.json` and workspace events in OPENCODE-SETUP; no installable OpenCode plugin that wraps our MCP or API.

**Extract:**
- Provide a small `.opencode/plugins/engram.ts` (or similar) that:
  - Registers or configures the Engram MCP server for OpenCode, and/or
  - Subscribes to OpenCode lifecycle (session start/end, commit) and calls our tools (e.g. store_fact, checkpoint, record_commit).
- Document “enable Engram for OpenCode” as: copy plugin + opencode.json snippet (or `npx engram enable --agent opencode` if we add a CLI).

**Implement:**  
- Add `plugins/opencode/` (or under existing `plugins/`) with `engram.ts` and a short README.  
- Plugin can call MCP via OpenCode’s API or shell out to our CLI if we have one.

---

### 5. **Auto-summary at “commit time” (not only session end)**

**Idea:** Entire can generate AI summaries at commit time (intent, outcome, learnings, friction, open items).

**Engram today:** We have session-end checkpoint and crons; summaries are session-scoped, not commit-scoped.

**Extract:**
- On commit (e.g. via workspace `onGitCommit`), optionally run a small summary step and store a “commit summary” fact (or append to session summary) with: commitSha, branch, message, and a short summary.

**Implement:**  
- Use existing `onGitCommit` in OPENCODE-SETUP to call a new tool e.g. `memory_summarize_commit` (commitSha, message, optional sessionId).  
- Backend: store fact with type like `commit_summary` and link to session/conversation; optional LLM pass for summary text.

---

### 6. **“Doctor” / cleanup for stuck sessions**

**Idea:** Entire has `entire doctor` (fix stuck sessions) and `entire reset` (delete shadow branch and session state for current HEAD).

**Engram today:** We have agent-health cron and cleanup crons; no user-facing “session doctor” or “reset this session” primitive.

**Extract:**
- **Doctor:** Tool or CLI that checks for inconsistent or stuck session state (e.g. session marked active but no activity for N hours) and either reports or auto-fixes (e.g. mark session ended, cleanup orphaned checkpoints).
- **Reset:** Tool that deletes or archives session/checkpoint data for a given scope or session (with safety checks).

**Implement:**  
- `memory_session_doctor` (or CLI `engram doctor`) that runs checks and returns report + optional fix.  
- `memory_reset_session` or `memory_archive_session` with clear semantics and guardrails (e.g. require scope/session id, no bulk delete by default).

---

### 7. **Secrets redaction before persist**

**Idea:** Entire redacts detected secrets when writing to the shadow branch.

**Engram today:** We don’t redact fact content or observation text before storing.

**Extract:**
- Before persisting fact content or observation text, run a best-effort redaction pass (e.g. API keys, tokens, known patterns) and store redacted version. Optionally make it configurable (on/off, patterns).

**Implement:**  
- Redaction in the storage path (e.g. in Convex mutation or in MCP handler before calling backend).  
- Config flag e.g. `redact_secrets: true` in config; document as best-effort.

---

### 8. **Multi-agent “enable” story (documentation + optional CLI)**

**Idea:** Entire supports multiple agents via different hook locations; `entire enable --agent opencode` is one entry point.

**Engram today:** We support multiple agents via MCP and docs (Claude Code, OpenCode, etc.); no single “enable for agent X” command.

**Extract:**
- Document one “enable Engram for OpenCode” path: opencode.json + optional `.opencode/plugins/engram.ts`, and optionally a small CLI or script that writes the right config (e.g. `npx engram-opencode enable` or similar).

**Implement:**  
- Consolidate OPENCODE-SETUP and any OpenCode plugin into a single “Enable for OpenCode” section.  
- Optional: add a small script or CLI that generates opencode.json and installs the plugin.

---

## Priority / dependency sketch

| Item                         | Deps        | Effort | Impact |
|-----------------------------|------------|--------|--------|
| Commit-linked metadata      | None       | Small  | High (traceability) |
| Resume hint in wake         | None       | Small  | Medium |
| Explain session/commit      | (1)        | Medium | High |
| OpenCode plugin artifact    | None       | Medium | High (adoption) |
| Auto-summary at commit      | (1)        | Medium | Medium |
| Session doctor / reset      | None       | Medium | Medium |
| Secrets redaction           | None       | Medium | High (security) |
| Multi-agent “enable” docs   | (4)        | Small  | Medium |

---

## Next steps

1. **Decide scope:** Which of these align with current Engram goals (e.g. agent-native parity, Letta-style features, security)?  
2. **Commit linkage first:** Adding optional commit fields to session/checkpoint or a dedicated `memory_record_commit` unblocks “explain commit” and “auto-summary at commit.”  
3. **OpenCode plugin:** Add `plugins/opencode/engram.ts` and a one-page “Enable for OpenCode” flow.  
4. **Security:** Plan a small redaction layer and config flag before storing free-text content.
