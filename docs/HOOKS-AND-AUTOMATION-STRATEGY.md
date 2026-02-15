# Hooks and Automation Strategy for Engram

**Document Purpose:** Comprehensive strategy for automating engram memory operations using Claude Code hooks and Convex crons.

**Last Updated:** 2026-02-15

---

## Current Automation State

### ✅ Existing Convex Crons (11 jobs)

| Job | Schedule | Purpose | Status |
|-----|----------|---------|--------|
| **notification-cleanup** | Daily 1:30 UTC | Clean expired notifications | ✅ Active |
| **cleanup** | Daily 2:00 UTC | Garbage collection | ✅ Active |
| **dedup** | Daily 2:30 UTC | Cross-agent deduplication | ✅ Active |
| **decay** | Daily 3:00 UTC | Differential relevance decay | ✅ Active |
| **forget** | Daily 3:30 UTC | Active forgetting (archive stale facts) | ✅ Active |
| **compact** | Daily 4:00 UTC | Conversation compaction | ✅ Active |
| **consolidate** | Weekly Sunday 5:00 UTC | Fact consolidation into themes | ✅ Active |
| **rerank** | Weekly Sunday 6:00 UTC | Importance recalculation | ✅ Active |
| **rules** | Daily 7:00 UTC (monthly exec) | Steering rule extraction | ✅ Active |
| **vault-sync-heartbeat** | Every 5 min | Mirror sync heartbeat | ✅ Active |
| **vault-regenerate-indices** | Every 5 min | Vault index regeneration | ✅ Active |

### ✅ Existing Git Hooks (2 hooks)

| Hook | Purpose | Status |
|------|---------|--------|
| **pre-commit** | Flush beads changes to JSONL before commit | ✅ Active |
| **post-merge** | Import updated beads issues after merge | ✅ Active |

### ❌ Missing: Claude Code Hooks (0 configured)

**Critical Gap:** No automation during Claude's active work sessions. All memory operations require explicit Claude decisions.

---

## Proposed Claude Code Hooks Strategy

### 🎯 Design Principles

1. **Non-Blocking** — Hooks should never slow Claude down
2. **Fail-Safe** — Hook failures shouldn't break workflows
3. **Observable** — All hook activity should be loggable
4. **Composable** — Hooks should work together seamlessly
5. **Agent-Aware** — Use engram's agent identity system

---

## Priority 1: Session Management Hooks

### 🚀 SessionStart — Auto-Load Agent Context

**Purpose:** Prime Claude with relevant memories at session start.

**When:** Session begins (startup, resume, after compaction)

**Implementation:**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "npx mcporter call engram.memory_get_agent_context | jq -r '.result.systemPromptBlock // \"\"'"
          }
        ]
      }
    ]
  }
}
```

**What It Does:**
- Calls `memory_get_agent_context` to get agent identity + capabilities + health
- Extracts system prompt block
- Injects it into Claude's context automatically

**Benefits:**
- Claude always knows its agent identity
- Workspace awareness (other agents, shared scopes)
- Activity stats for context
- No manual context loading needed

---

### 🔄 SessionStart (After Compaction) — Restore Critical Context

**Purpose:** Re-inject critical facts after context compaction.

**When:** Session starts after compaction

**Implementation:**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "npx mcporter call engram.memory_recall query='current work session goals and blockers' limit=5 | jq -r '.result.facts[] | \"- \" + .content' | head -10"
          }
        ]
      }
    ]
  }
}
```

**What It Does:**
- Searches engram for recent session goals and blockers
- Formats as bullet list
- Injects into fresh context

**Benefits:**
- Continuity across compaction boundaries
- Critical context never lost
- Dynamic (adapts to current work)

---

### 💾 SessionEnd — Auto-Checkpoint Session State

**Purpose:** Preserve session state before termination.

**When:** Session ends (any reason)

**Implementation:**

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"name\":\"session-end-$(date +%s)\",\"summary\":\"Auto-checkpoint at session end\"}' | npx mcporter call engram.memory_checkpoint --json"
          }
        ]
      }
    ]
  }
}
```

**What It Does:**
- Creates named checkpoint with timestamp
- Stores current session state
- Enables future session restoration with `memory_wake`

**Benefits:**
- Never lose session context
- Easy session restoration
- Time-based checkpoint naming

---

## Priority 2: Memory Persistence Hooks

### 📝 PostToolUse — Auto-Store File Edit Observations

**Purpose:** Automatically record observations about file changes.

**When:** After `Edit` or `Write` tool calls

**Implementation:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '{observation: (\"Edited \" + .tool_input.file_path), scopeId: \"private-\" + env.ENGRAM_AGENT_ID}' | npx mcporter call engram.memory_observe --json"
          }
        ]
      }
    ]
  }
}
```

**What It Does:**
- Extracts file path from tool input
- Creates observation with file edit info
- Stores via `memory_observe` (fire-and-forget)

**Benefits:**
- Automatic work tracking
- Never forget what was changed
- Zero overhead (async storage)

---

### 🛑 Stop — Verify Memory Persistence

**Purpose:** Ensure critical facts were stored before declaring work done.

**When:** Claude finishes responding

**Implementation:**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "Check if any important facts from this work session should be stored in engram memory. If critical information wasn't persisted, respond with {\"ok\": false, \"reason\": \"Store [specific facts] in memory first\"}. Otherwise {\"ok\": true}.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**What It Does:**
- Spawns verification agent at end of work
- Agent checks if memory storage happened
- Blocks completion if critical facts weren't stored
- Provides specific instructions on what to store

**Benefits:**
- Never lose important work
- Ensures memory discipline
- Self-correcting workflow

---

### 📊 TaskCompleted — Store Task Completion Facts

**Purpose:** Record completed tasks as facts in engram.

**When:** Task marked as completed

**Implementation:**

```json
{
  "hooks": {
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '{content: (\"Completed task: \" + .task.subject + \" - \" + .task.description), factType: \"decision\", tags: [\"task-completion\"], scopeId: \"private-\" + env.ENGRAM_AGENT_ID}' | npx mcporter call engram.memory_store_fact --json"
          }
        ]
      }
    ]
  }
}
```

**What It Does:**
- Captures task subject + description
- Stores as "decision" type fact (slow decay)
- Tags for easy retrieval
- Scoped to agent's private memory

**Benefits:**
- Permanent record of completed work
- Searchable task history
- Feeds into consolidation/themes

---

## Priority 3: Validation and Safety Hooks

### 🔒 PreToolUse — Validate Memory Operations

**Purpose:** Prevent destructive memory operations without confirmation.

**When:** Before `memory_delete_*` or `memory_prune` tools

**Implementation:**

```bash
#!/bin/bash
# .claude/hooks/validate-memory-ops.sh

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# Destructive memory operations
DESTRUCTIVE_TOOLS=(
  "memory_delete_fact"
  "memory_delete_entity"
  "memory_delete_scope"
  "memory_delete_conversation"
  "memory_delete_session"
  "memory_prune"
)

for tool in "${DESTRUCTIVE_TOOLS[@]}"; do
  if [[ "$TOOL_NAME" == "$tool" ]]; then
    echo "⚠️  WARNING: $TOOL_NAME is a destructive operation." >&2
    echo "Review the operation carefully. Memory deletion is permanent." >&2
    # Exit 0 to allow but warn, or exit 2 to block and require approval
    exit 0
  fi
done

exit 0
```

**Hook Configuration:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "memory_delete_.*|memory_prune",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/validate-memory-ops.sh"
          }
        ]
      }
    ]
  }
}
```

**Benefits:**
- Prevents accidental memory deletion
- Warns about destructive operations
- Can be configured to block vs warn

---

### 🚨 PreToolUse — Scope Permission Check

**Purpose:** Ensure agent has permission to operate on requested scope.

**When:** Before any `memory_*` tool that takes `scopeId` parameter

**Implementation:**

```bash
#!/bin/bash
# .claude/hooks/check-scope-permission.sh

INPUT=$(cat)
SCOPE_ID=$(echo "$INPUT" | jq -r '.tool_input.scopeId // empty')

if [[ -z "$SCOPE_ID" ]]; then
  exit 0  # No scope specified, allow
fi

# Check if agent has access to this scope
AGENT_SCOPES=$(npx mcporter call engram.memory_get_agent_info | jq -r '.result.scopes[]')

if echo "$AGENT_SCOPES" | grep -q "$SCOPE_ID"; then
  exit 0  # Agent has access
else
  echo "Blocked: Agent does not have access to scope '$SCOPE_ID'" >&2
  exit 2  # Block the operation
fi
```

**Hook Configuration:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "memory_.*",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/check-scope-permission.sh"
          }
        ]
      }
    ]
  }
}
```

**Benefits:**
- Enforces scope-based access control
- Prevents unauthorized memory access
- Real-time permission validation

---

## Priority 4: Notification and Monitoring Hooks

### 🔔 Notification — Desktop Alerts for Memory Events

**Purpose:** Get notified when engram needs attention.

**When:** Claude Code sends notifications

**Implementation (macOS):**

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Engram memory system needs attention\" with title \"Engram\"'"
          }
        ]
      }
    ]
  }
}
```

**Implementation (Linux):**

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "notify-send 'Engram' 'Memory system needs attention'"
          }
        ]
      }
    ]
  }
}
```

**Benefits:**
- Never miss memory-related prompts
- Work in other apps while Claude processes
- Platform-native notifications

---

### 📈 SubagentStop — Log Subagent Memory Usage

**Purpose:** Track which subagents use memory system.

**When:** Subagent finishes

**Implementation:**

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"$(date -Iseconds) Subagent completed: $(jq -r '.agent_type')\" >> ~/.claude/engram-subagent-log.txt"
          }
        ]
      }
    ]
  }
}
```

**Benefits:**
- Observability into subagent patterns
- Debug memory access issues
- Audit trail for memory operations

---

## Advanced Patterns

### 🧠 Prompt-Based Hook — Smart Context Injection

**Purpose:** Use AI to decide which memories to inject based on user's question.

**When:** User submits a prompt

**Implementation:**

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Analyze this user prompt: '$PROMPT'. Determine if it requires historical context from engram. If yes, respond with {\"ok\": true, \"additionalContext\": \"<recall query>\"}. If no, respond with {\"ok\": true}.",
            "model": "haiku"
          }
        ]
      }
    ]
  }
}
```

**Benefits:**
- Context-aware memory recall
- Only fetch relevant memories
- Low latency (Haiku model)

---

### 🔍 Agent-Based Hook — Deep Memory Verification

**Purpose:** Use subagent to verify memory consistency.

**When:** After major memory operations

**Implementation:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "memory_summarize|memory_prune",
        "hooks": [
          {
            "type": "agent",
            "prompt": "Verify the memory operation succeeded by checking engram health and querying recent facts. Confirm no data loss occurred. $ARGUMENTS",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

**Benefits:**
- Deep verification with tool access
- Can inspect actual memory state
- Self-healing on detection of issues

---

## Complete Hook Configuration

### Recommended `.claude/settings.json`

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "npx mcporter call engram.memory_get_agent_context | jq -r '.result.systemPromptBlock // \"\"'"
          }
        ]
      },
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "npx mcporter call engram.memory_recall query='current work session goals and blockers' limit=5 | jq -r '.result.facts[] | \"- \" + .content' | head -10"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '{observation: (\"Edited \" + .tool_input.file_path), scopeId: \"private-\" + env.ENGRAM_AGENT_ID}' | npx mcporter call engram.memory_observe --json"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "memory_delete_.*|memory_prune",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/validate-memory-ops.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "Check if any important facts from this work session should be stored in engram memory. If critical information wasn't persisted, respond with {\"ok\": false, \"reason\": \"Store [specific facts] in memory first\"}. Otherwise {\"ok\": true}.",
            "timeout": 30
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"name\":\"session-end-$(date +%s)\",\"summary\":\"Auto-checkpoint at session end\"}' | npx mcporter call engram.memory_checkpoint --json"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Engram memory system needs attention\" with title \"Engram\"'"
          }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '{content: (\"Completed task: \" + .task.subject + \" - \" + .task.description), factType: \"decision\", tags: [\"task-completion\"], scopeId: \"private-\" + env.ENGRAM_AGENT_ID}' | npx mcporter call engram.memory_store_fact --json"
          }
        ]
      }
    ]
  }
}
```

---

## Cron Enhancement Opportunities

### 🔄 Proposed New Crons

#### 1. Memory Health Check (Every 30 min)

**Purpose:** Monitor memory system health and alert on issues.

**Implementation:**

```typescript
// convex/crons/health-check.ts
import { cronJobs } from "convex/server";
import { internal } from "../_generated/api";

crons.interval(
  "health-check",
  { minutes: 30 },
  internal.crons.healthCheck.runHealthCheck
);
```

**What to Check:**
- Embedding queue backlog
- Failed enrichment jobs
- Stale notifications
- Scope permission anomalies
- Vector index freshness

---

#### 2. Cross-Agent Sync Verification (Hourly)

**Purpose:** Verify all agents have consistent memory state.

**Schedule:** Every hour

**Implementation:** Check `sync_log` table for stale entries, verify vault mirror freshness.

---

#### 3. Memory Metrics Export (Daily)

**Purpose:** Export memory usage statistics for analysis.

**Schedule:** Daily at 6:00 UTC (after rerank)

**Metrics to Export:**
- Total facts per agent
- Memory churn rate (stored vs pruned)
- Average importance scores
- Recall patterns
- Theme growth

---

### 🎯 Cron Optimization Ideas

#### Decay Job — Dynamic Scheduling

**Current:** Runs daily at 3:00 UTC

**Enhancement:** Run more frequently for high-activity agents, less for dormant ones.

**Implementation:** Use agent activity stats to determine decay frequency per scope.

---

#### Consolidate Job — Context-Aware Triggers

**Current:** Runs weekly on Sunday

**Enhancement:** Trigger consolidation when fact count reaches threshold.

**Implementation:** Add fact count check, trigger consolidation at 500+ facts per theme.

---

## Implementation Roadmap

### Phase 1: Core Session Hooks (Week 1)
- [ ] SessionStart agent context injection
- [ ] SessionEnd checkpoint creation
- [ ] PostToolUse file edit observations
- [ ] Notification desktop alerts

### Phase 2: Safety Hooks (Week 2)
- [ ] PreToolUse memory operation validation
- [ ] PreToolUse scope permission checks
- [ ] Stop memory persistence verification

### Phase 3: Advanced Hooks (Week 3)
- [ ] TaskCompleted fact storage
- [ ] Agent-based deep verification
- [ ] Prompt-based smart context injection

### Phase 4: Cron Enhancements (Week 4)
- [ ] Health check cron
- [ ] Cross-agent sync verification
- [ ] Memory metrics export
- [ ] Dynamic decay scheduling

---

## Testing Strategy

### Hook Testing Checklist

For each hook:
1. **Isolation Test** — Run hook script manually with sample JSON
2. **Integration Test** — Trigger hook in Claude Code session
3. **Failure Test** — Verify graceful degradation on errors
4. **Performance Test** — Ensure hook completes within timeout
5. **Observability Test** — Verify logging and error reporting

### Example Test Commands

```bash
# Test SessionStart hook
echo '{"session_id":"test","cwd":"/tmp","hook_event_name":"SessionStart"}' | \
  npx mcporter call engram.memory_get_agent_context

# Test PostToolUse hook
echo '{"tool_name":"Edit","tool_input":{"file_path":"test.ts"}}' | \
  jq -r '{observation: ("Edited " + .tool_input.file_path)}'

# Test PreToolUse validation hook
echo '{"tool_name":"memory_delete_fact","tool_input":{"factId":"test"}}' | \
  .claude/hooks/validate-memory-ops.sh
```

---

## Performance Considerations

### Hook Execution Budget

| Hook Type | Timeout | When to Use |
|-----------|---------|-------------|
| `command` | 10s default | Fast shell scripts |
| `prompt` | 30s default | Single-turn AI decisions |
| `agent` | 60s default | Multi-turn verification |

**Rule:** Keep `command` hooks under 1s for non-blocking UX.

### Async vs Sync Hooks

**Async Hooks (Recommended):**
- `memory_observe` (fire-and-forget)
- `memory_store_fact` (async enrichment)
- Notification hooks

**Sync Hooks (Use Sparingly):**
- Validation gates
- Permission checks
- Memory verification before stopping

---

## Monitoring and Observability

### Hook Activity Dashboard

Track:
- Hook execution count per event type
- Average execution time
- Failure rate
- Memory operations triggered by hooks

### Logging Strategy

```bash
# Hook log format
# ~/.claude/engram-hook-log.jsonl

{"timestamp":"2026-02-15T10:30:00Z","hook":"SessionStart","event":"context_loaded","duration_ms":45}
{"timestamp":"2026-02-15T10:35:12Z","hook":"PostToolUse","event":"observation_stored","file":"server.ts","duration_ms":12}
{"timestamp":"2026-02-15T10:42:33Z","hook":"Stop","event":"verification_passed","facts_stored":3,"duration_ms":1205}
```

---

## Security Considerations

### Hook Script Permissions

- Store hooks in `.claude/hooks/` directory
- Make scripts executable: `chmod +x .claude/hooks/*.sh`
- Use `$CLAUDE_PROJECT_DIR` for project-relative paths
- Never hardcode credentials in hooks

### Scope Isolation

- Always include `scopeId` in memory operations
- Use `private-{agentId}` for agent-private memories
- Validate scope permissions before operations

### Audit Trail

- Log all destructive operations
- Track who accessed what scopes
- Preserve deletion history

---

## Troubleshooting

### Hook Not Firing

1. Check `/hooks` menu — hook should appear under event
2. Verify matcher pattern (case-sensitive)
3. Test hook script manually with sample JSON
4. Check `~/.claude/settings.json` syntax (no trailing commas!)

### Hook Execution Timeout

1. Check hook timeout setting (default 10 minutes)
2. Use `npx mcporter call` for faster execution than full MCP
3. Consider splitting into multiple hooks
4. Use `memory_observe` instead of `memory_store_fact` for async

### JSON Parsing Errors

1. Wrap `echo` statements in shell profile: `if [[ $- == *i* ]]; then`
2. Use `jq` for JSON validation before piping
3. Check hook script has proper stdout/stderr separation

---

## References

- Claude Code Hooks Guide: https://code.claude.com/docs/en/hooks-guide
- Engram API Reference: `/Users/cortex-air/Tools/engram/docs/API-REFERENCE.md`
- MCPorter CLI Usage: `/Users/cortex-air/Tools/engram/docs/MCPORTER-CLI.md`
- Convex Crons: https://docs.convex.dev/scheduling/cron-jobs

---

**Next Steps:**
1. Review this strategy document
2. Implement Phase 1 hooks (core session management)
3. Test in development environment
4. Deploy to production with monitoring
5. Iterate based on usage patterns
