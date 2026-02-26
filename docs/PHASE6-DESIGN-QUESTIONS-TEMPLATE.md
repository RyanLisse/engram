# Phase 6: Critical Design Questions — Template for Decisions

**Purpose:** Capture all unanswered design questions that block Phase 6 implementation
**Status:** PENDING APPROVAL
**Created:** 2026-02-25

---

## Section 1: Bootstrap Pipeline (engram-7g0)

### Q1.1: Deduplication Cosine Similarity Threshold

**Question:**
What exact cosine similarity threshold should trigger deduplication when bootstrap processes multiple sessions?

**Options:**
- Option A: 0.75 (aggressive dedup, fewer final facts, higher risk of false merges)
- Option B: 0.85 (current code, balanced)
- Option C: 0.95 (conservative dedup, more unique facts, fewer merges)
- Option D: Configurable (per-scope setting)

**Example Scenario:**
- Session A: "Chose TypeScript for the CLI"
- Session B: "Selected TypeScript over Python for better types"
- Cosine similarity between embeddings: 0.87

**Decision Required:** Which option?
- Selected: [ ] A [ ] B [ ] C [ ] D
- Rationale: ___________________________________________

**Acceptance Criteria:**
- [ ] Bootstrap test explicitly verifies threshold behavior
- [ ] Test includes boundary cases (0.86, 0.87, 0.88 similarity)
- [ ] Dedup behavior documented in code

---

### Q1.2: Target Scope for Bootstrap Facts

**Question:**
Which Convex scope should bootstrap-ingested facts be stored in?

**Options:**
- Option A: Create temporary scope `bootstrap-{timestamp}`, user reviews and moves after
- Option B: User specifies target scope as parameter: `bootstrap(..., targetScope="project:engram")`
- Option C: Store in `private-bootstrap` (read-only system scope), user manually moves
- Option D: Create one scope per session file: `private-bootstrap-session1`, etc.

**Why It Matters:**
- Scope controls access, permissions, and dedup boundaries
- Wrong scope = facts not discoverable, or over-accessible

**Decision Required:** Which option?
- Selected: [ ] A [ ] B [ ] C [ ] D
- Rationale: ___________________________________________

**Acceptance Criteria:**
- [ ] Bootstrap function signature matches chosen option
- [ ] Scope is created if needed (idempotent)
- [ ] Test verifies facts end up in correct scope

---

### Q1.3: Enrichment Blocking Behavior

**Question:**
Should `bootstrap()` block until enrichment (embeddings, importance scoring, entity linking) completes, or return immediately?

**Options:**
- Option A: **Blocking** — Return only after all facts have embeddings, importance, entities linked
  - Pro: Test assertions straightforward
  - Con: Slow (embedding 1000 facts = 10+ minutes)

- Option B: **Async (fire-and-forget)** — Return immediately, enrichment runs in background
  - Pro: Fast (user sees "1800 facts ingested" immediately)
  - Con: Test must poll Convex to verify enrichment completed

- Option C: **Hybrid** — Return after storage (no async error), enrich in background
  - Pro: Fast, safe (can't lose facts)
  - Con: Similar complexity to Option B

**Decision Required:** Which option?
- Selected: [ ] A [ ] B [ ] C
- Rationale: ___________________________________________

**Acceptance Criteria:**
- [ ] `bootstrap()` return type documents blocking behavior
- [ ] If async: test includes polling mechanism (checkEnrichmentStatus, max retries)
- [ ] Performance test verifies SLA (blocking: <5min for 1800 facts, async: <10s return)

---

### Q1.4: Resume from Checkpoint

**Question:**
How should the bootstrap pipeline detect and resume from partial failure?

**Example Scenario:**
- User bootstrap 50 sessions (1000 facts extracted) ✓
- User bootstrap 50 new sessions (day later)
- System should NOT re-process the first 50
- Only ingest the new 100 facts from day 2 sessions

**Options:**
- Option A: **Explicit checkpoint file** — Write JSON checkpoint after each session
  ```json
  {
    "sessionId": "session_50.jsonl",
    "processedAt": 1740422400000,
    "factCount": 20,
    "lastFactId": "abc123"
  }
  ```
  - Pro: Explicit tracking, easy to resume
  - Con: Requires file I/O, checkpoint management

- Option B: **Convex dedup tracking** — Query Convex for `source="bootstrap"` facts with highest timestamp
  - Pro: No extra files, database is source of truth
  - Con: Harder to determine which session was last processed

- Option C: **SHA hash of session files** — Hash entire session content, skip if hash exists
  - Pro: Works with any change to sessions
  - Con: O(n) hashing on every run

- Option D: **No checkpoint** — Reprocess all, rely on dedup to merge duplicates
  - Pro: Simplest
  - Con: Redundant work, potential for dedup failures to create duplicates

**Decision Required:** Which option?
- Selected: [ ] A [ ] B [ ] C [ ] D
- Rationale: ___________________________________________

**Acceptance Criteria:**
- [ ] Resume test demonstrates recovery after simulated failure (session 25/50)
- [ ] No duplicate facts created from resumed run
- [ ] Checkpoint mechanism (if chosen) is idempotent

---

## Section 2: Filesystem Mirror Sync (engram-wxn)

### Q1.5: File Deletion Semantics

**Question:**
When user deletes a `.md` file in the vault, what should happen to the corresponding Convex fact?

**Example Scenario:**
- Fact exists in Convex: "Chose TypeScript"
- Exported to vault: `vault/decisions/chose-typescript-abc123.md`
- User opens file and deletes it: `rm vault/decisions/chose-typescript-abc123.md`
- Watcher detects deletion

**Options:**
- Option A: **Auto-delete** — Automatically delete corresponding fact in Convex
  - Pro: Keeps vault and DB in sync
  - Con: User accidentally deletes file, loses fact forever
  - Safety: Medium risk

- Option B: **Create orphan** — File deleted, fact remains in Convex (orphaned)
  - Pro: Safest (no data loss)
  - Con: Vault and DB diverge, orphans accumulate
  - Safety: High (reversible)

- Option C: **Archive file** — Detect deletion, restore file with `.archived` suffix
  - Pro: User can recover
  - Con: Confusing UX (file reappears)
  - Safety: Medium

- Option D: **No deletion support** — Ignore deletions, document as limitation
  - Pro: Simple, safe
  - Con: User confusion if they expect sync both ways
  - Safety: High (safest)

**Current Implementation Status:**
- vault-reconciler.ts does NOT handle file deletions
- Assumption: Option B or D is current behavior

**Decision Required:** Which option?
- Selected: [ ] A [ ] B [ ] C [ ] D
- Rationale: ___________________________________________

**Acceptance Criteria:**
- [ ] Design choice documented in code comment
- [ ] Test explicitly verifies expected behavior
- [ ] User documentation mentions deletion behavior

---

### Q1.6: Watcher Event Deduplication

**Question:**
If user edits a vault file multiple times in quick succession, how many times should `reconcileFileEdit()` be called?

**Example Scenario:**
- User saves file at T=0: changes "TypeScript" → "TypeScript for CLI"
- Watcher detects change, queues reconcile
- User saves file again at T=100ms: changes "for CLI" → "for CLI and tests"
- Second save queued

**Options:**
- Option A: **No dedup** — Call reconcileFileEdit for EACH file change event
  - Current behavior (no debounce in vault-sync.ts)
  - Calls: 2 reconciles → 2 Convex updates
  - Pro: Simple, no buffering
  - Con: Database churn, redundant updates

- Option B: **Debounce 500ms** — Batch changes into single reconcile
  - Calls: 2 events → 1 reconcile (after 500ms quiet)
  - Pro: Reduces DB updates, cleaner history
  - Con: Adds latency

- Option C: **Track file mtime** — Skip reconcile if file hasn't changed since last sync
  - Calls: 2 events → 1 reconcile (only if mtime advanced)
  - Pro: Effective dedup, no latency
  - Con: More complex logic

**Decision Required:** Which option?
- Selected: [ ] A [ ] B [ ] C
- Rationale: ___________________________________________

**Test Scenario:**
- User makes 3 edits in 200ms window
- Assert: [ ] 3 DB updates (Option A) [ ] 1 DB update (B or C) [ ] N updates

**Acceptance Criteria:**
- [ ] Test verifies dedup behavior explicitly
- [ ] fact_versions records match expected count
- [ ] Performance test confirms no excessive database churn

---

## Section 3: Git Integration (engram-1vt)

### Q5.1: Git Library Choice

**Question:**
Should git integration use an npm library or shell out to git CLI?

**Options:**
- Option A: **simple-git npm** (https://www.npmjs.com/package/simple-git)
  - Pros: Type-safe, consistent error handling, cross-platform
  - Cons: Extra dependency, learning curve
  - Recommendation: ✓ PREFERRED
  - Size: 50KB, actively maintained

- Option B: **child_process spawn** (`git` CLI directly)
  - Pros: No dependency, direct control
  - Cons: Platform-specific, error handling verbose, shell injection risk
  - Recommendation: Not recommended for production
  - Size: None (relies on system git)

- Option C: **isomorphic-git** (pure JS implementation)
  - Pros: No system dependency, pure JS
  - Cons: Incomplete feature set, heavyweight for our use case
  - Recommendation: Overkill

**Decision Required:** Which option?
- Selected: [ ] A (simple-git) [ ] B (CLI) [ ] C (isomorphic-git)
- Rationale: ___________________________________________

**Acceptance Criteria:**
- [ ] Library installed and added to package.json
- [ ] Helper functions abstracted (allow future swaps)
- [ ] Error handling consistent across all git operations

---

### Q5.2: Agent → Git Author Mapping

**Question:**
How to map Convex agent IDs (e.g., "indy") to git author format (e.g., "Indy User <indy@example.com>")?

**Options:**
- Option A: **Read from agents table in Convex**
  ```typescript
  // agents table has fields: name, email
  author = `${agent.name} <${agent.email}>`  // "Indy User <indy@example.com>"
  ```
  - Pro: Centralized, flexible
  - Con: Requires Convex query on every commit
  - Recommendation: ✓ PREFERRED

- Option B: **Config file in vault folder**
  ```yaml
  # vault/.engram/git-authors.yaml
  indy: "Indy <indy@localhost>"
  claude: "Claude AI <claude@localhost>"
  ```
  - Pro: Local, fast, user-controlled
  - Con: Manual setup, duplication

- Option C: **Environment variable / CLI flag**
  ```bash
  ENGRAM_GIT_AUTHOR="Indy <indy@localhost>" engram bootstrap
  ```
  - Pro: Simple, no config files
  - Con: Inconvenient per-session, error-prone

- Option D: **Fallback chain**
  1. Try `agents[agentId].name + email`
  2. Fall back to `git config user.name` and `user.email`
  3. Fall back to `agentId <agentId@localhost>`
  - Pro: Flexible, graceful degradation
  - Con: Multiple code paths to test

**Decision Required:** Which option?
- Selected: [ ] A [ ] B [ ] C [ ] D
- Rationale: ___________________________________________

**Example Execution:**
```typescript
const author = await resolveGitAuthor("indy");
// Should return: "Indy <indy@example.com>"
```

**Acceptance Criteria:**
- [ ] Author resolution function handles all cases
- [ ] Test verifies author format is valid (RFC 5322)
- [ ] Fallback chain works if agents table missing

---

### Q5.3: Dirty Working Tree Handling

**Question:**
If user has uncommitted changes when system tries to auto-commit, what should happen?

**Example Scenario:**
- User created manual notes: `vault/personal/notes.md` (uncommitted)
- System creates new fact: `vault/decisions/chose-typescript.md` (via bootstrap)
- System tries to `git add decisions/chose-typescript.md && git commit`
- But `git status` shows BOTH files dirty

**Options:**
- Option A: **Stash + commit + unstash** (automatic recovery)
  ```bash
  git stash  # Save user notes
  git add decisions/chose-typescript.md
  git commit
  git stash pop  # Restore user notes
  ```
  - Pro: Automatic, keeps commit clean
  - Con: Dangerous if stash pop fails or conflicts
  - Risk: MEDIUM

- Option B: **Warn + skip** (safe, manual)
  ```
  WARNING: Dirty working tree detected. Skipping git commit.
  User must manually commit after cleanup.
  ```
  - Pro: Safe, explicit, reversible
  - Con: Requires user intervention
  - Risk: LOW

- Option C: **Commit everything** (simple but messy)
  ```bash
  git add -A
  git commit  # Commits both fact and user notes
  ```
  - Pro: Simple
  - Con: Commits unwanted files, pollutes history
  - Risk: HIGH

- Option D: **Fail + rollback** (strict, safe)
  ```
  ERROR: Cannot commit with dirty working tree.
  Rollback memory operation.
  ```
  - Pro: Explicitly fails, prevents silent issues
  - Con: Blocks memory operations on git errors
  - Risk: HIGH (violates "memory is primary" principle)

**Current Philosophy:**
Memory operations should NEVER be blocked by git errors.

**Decision Required:** Which option?
- Selected: [ ] A [ ] B [ ] C [ ] D
- Rationale: ___________________________________________

**Recommendation:** Option B (warn + skip)
- Keeps memory primary
- Safe for users
- Clear messaging

**Acceptance Criteria:**
- [ ] Dirty tree detection implemented
- [ ] Test verifies chosen behavior
- [ ] User warning message clear and actionable
- [ ] Memory operation NOT blocked

---

### Q5.4: Merge/Rebase Handling

**Question:**
If user is in the middle of a git merge or rebase, what should auto-commit do?

**Example Scenario:**
- User: `git pull origin main` (merge conflict occurs)
- User resolves conflicts but hasn't completed merge: `.git/MERGE_HEAD` exists
- System tries to auto-commit new fact
- Git state is unstable

**Options:**
- Option A: **Skip + warn** (safe, manual)
  ```
  WARNING: Merge in progress. Skipping auto-commit.
  Please complete merge, then memory operations will resume.
  ```
  - Pro: Safe, explicit
  - Con: User must remember to retry

- Option B: **Abort merge + commit** (dangerous)
  ```bash
  git merge --abort
  git add chosen_file.md
  git commit
  ```
  - Pro: Automatic, unblocked memory
  - Con: Destroys user's in-progress work
  - Risk: CRITICAL (never do this)

- Option C: **Commit + complete merge** (complex)
  ```bash
  git add chosen_file.md
  git commit  # Commits fact while merge in progress
  # This is actually invalid state
  ```
  - Pro: Unblocked memory
  - Con: Corrupts git state
  - Risk: CRITICAL (invalid)

- Option D: **Detect + retry** (optimistic)
  ```bash
  while .git/MERGE_HEAD exists:
    wait 10s
    retry commit
  ```
  - Pro: Eventually succeeds
  - Con: Blocks other operations, polling antipattern
  - Risk: MEDIUM

**Decision Required:** Which option?
- Selected: [ ] A (skip + warn) [ ] B (abort) [ ] C (commit anyway) [ ] D (retry)
- Rationale: ___________________________________________

**Recommendation:** Option A (skip + warn)
- Only safe option
- Memory operations unblocked
- User must complete merge manually

**Acceptance Criteria:**
- [ ] Detect `.git/MERGE_HEAD` and `.git/rebase-merge`
- [ ] Test verifies warning is logged
- [ ] Memory operation proceeds (commit skipped)

---

### Q5.5: Commit Message Format

**Question:**
What format should auto-commit messages use?

**Example Facts:**
1. Decision: "Chose TypeScript for type safety"
2. Observation: "Server runs on port 3000"
3. Lesson: "Node.js memory leaks require monitoring"

**Options:**
- Option A: **Simple** (brief, fact-focused)
  ```
  Memory: Chose TypeScript
  Memory: Server runs on port 3000
  Memory: Node.js memory leaks require monitoring
  ```
  - Max length: 50-72 chars
  - Pro: Clean, scannable
  - Con: Reason lost, hard to distinguish edits from creates

- Option B: **With reason/agent** (medium detail)
  ```
  Memory: Chose TypeScript (type safety) — indy
  Memory: Server runs on port 3000 (observation) — claude
  Memory: Memory leaks require monitoring (lesson) — system
  ```
  - Max length: 80 chars
  - Pro: Shows agent + reason
  - Con: Longer, may truncate in log UI

- Option C: **Full metadata** (detailed)
  ```
  [decision] Chose TypeScript (type safety, confidence=0.9)
  Author: indy
  Tags: typescript, architecture
  Entities: tool:typescript, project:engram
  ```
  - Multi-line format
  - Pro: Searchable, metadata-rich
  - Con: Verbose, violates git commit message best practices

- Option D: **Minimal** (system-only)
  ```
  Update vault: chose-typescript-abc123
  Update vault: server-port-3000-def456
  ```
  - Max length: 50 chars
  - Pro: Short, consistent
  - Con: Loses semantic meaning

**Git Best Practices:**
- First line: ≤50 characters, imperative mood
- Blank line
- Body: ≤72 characters per line, detailed explanation

**Decision Required:** Which option?
- Selected: [ ] A [ ] B [ ] C [ ] D
- Rationale: ___________________________________________

**Recommendation:** Option A (simple)
- Follows git conventions
- Searchable in history
- Can add metadata in future via commit hooks

**Acceptance Criteria:**
- [ ] All commit messages < 72 characters
- [ ] Fact content preserved in message (not truncated)
- [ ] Test verifies message format for each factType
- [ ] Edge case: very long fact content (truncate with ellipsis)

---

## Summary: Decisions Needed Before Implementation

| Question | Owner | Priority | Due Date | Approval |
|----------|-------|----------|----------|----------|
| Q1.1: Dedup threshold | Architecture | P0 | 2026-02-26 | [ ] |
| Q1.2: Bootstrap scope | Design | P0 | 2026-02-26 | [ ] |
| Q1.3: Enrichment blocking | Tech Lead | P0 | 2026-02-26 | [ ] |
| Q1.4: Resume checkpoint | Design | P0 | 2026-02-26 | [ ] |
| Q1.5: Delete semantics | Product | P1 | 2026-02-26 | [ ] |
| Q1.6: Watcher dedup | Architecture | P1 | 2026-02-26 | [ ] |
| Q5.1: Git library | Tech Lead | P0 | 2026-02-26 | [ ] |
| Q5.2: Author mapping | Design | P0 | 2026-02-26 | [ ] |
| Q5.3: Dirty tree | Product | P0 | 2026-02-26 | [ ] |
| Q5.4: Merge handling | Architecture | P0 | 2026-02-26 | [ ] |
| Q5.5: Commit format | Design | P1 | 2026-02-26 | [ ] |

---

## Next Steps

1. **Review this document** with team
2. **Fill in selected options** for each question
3. **Add rationale** for each decision
4. **Create implementation PR** with decisions documented as code comments
5. **Link this decision doc** in each task card (engram-7g0, engram-wxn, engram-1vt)

---

**Created:** 2026-02-25
**Status:** PENDING DECISIONS
**Review Meeting:** [Schedule]
**Approval By:** [Project sponsor name]
