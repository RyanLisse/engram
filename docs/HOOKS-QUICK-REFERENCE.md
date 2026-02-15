# Hooks Quick Reference

**One-page cheat sheet for engram Claude Code hooks.**

---

## Setup (3 Steps)

```bash
# 1. Copy config
cp .claude/settings.json.example .claude/settings.json

# 2. Set agent ID
export ENGRAM_AGENT_ID="your-agent-name"

# 3. Test
claude
/hooks  # Should list all configured hooks
```

---

## Hook Events

| Event | Fires When | Use For |
|-------|-----------|---------|
| `SessionStart` | Session begins/resumes | Load context, restore after compaction |
| `UserPromptSubmit` | User sends message | Smart context injection |
| `PreToolUse` | Before tool executes | Validation, permission checks, blocking |
| `PostToolUse` | After tool succeeds | Auto-formatting, observations, logging |
| `Stop` | Claude finishes work | Verify persistence, check completeness |
| `SessionEnd` | Session terminates | Checkpointing, cleanup |
| `Notification` | Claude needs attention | Desktop alerts |
| `TaskCompleted` | Task marked done | Store as memory fact |

---

## Matchers

**Tool Name Matching:**
```json
"matcher": "Edit|Write"        // Match multiple tools
"matcher": "Bash"               // Match single tool
"matcher": "memory_.*"          // Regex pattern
"matcher": "mcp__engram__.*"    // Match MCP tools
```

**Event-Specific:**
```json
// SessionStart
"matcher": "startup|resume|compact"

// SessionEnd
"matcher": "clear|logout"

// Notification
"matcher": "permission_prompt|idle_prompt"
```

---

## Hook Types

### Command Hook (Fast)
```json
{
  "type": "command",
  "command": "echo 'hello' | jq",
  "timeout": 10  // seconds
}
```

### Prompt Hook (AI Decision)
```json
{
  "type": "prompt",
  "prompt": "Decide if... Respond with {\"ok\": true/false, \"reason\": \"...\"}",
  "model": "haiku",
  "timeout": 30
}
```

### Agent Hook (Deep Verification)
```json
{
  "type": "agent",
  "prompt": "Verify by reading files... $ARGUMENTS",
  "timeout": 60
}
```

---

## Common Commands

### Store Memory
```bash
# Store fact
npx mcporter call engram.memory_store_fact content="Text" factType="note"

# Store observation (async)
echo '{"observation":"Edited file.ts"}' | \
  npx mcporter call engram.memory_observe --json
```

### Recall Memory
```bash
# Semantic search
npx mcporter call engram.memory_recall query="project goals" limit=5

# Get agent context
npx mcporter call engram.memory_get_agent_context

# Load context for topic
npx mcporter call engram.memory_get_context topic="authentication" maxFacts=10
```

### Checkpointing
```bash
# Create checkpoint
echo '{"name":"checkpoint-name","summary":"State description"}' | \
  npx mcporter call engram.memory_checkpoint --json

# Restore checkpoint
npx mcporter call engram.memory_wake checkpointId="checkpoint-id"
```

---

## Environment Variables

```bash
# Required
CONVEX_URL="https://your-deployment.convex.cloud"
ENGRAM_AGENT_ID="your-agent-name"

# Optional
COHERE_API_KEY="your-key"           # Enable real embeddings
ENGRAM_SSE_PORT="8787"              # Enable SSE streaming
```

---

## Hook Input/Output

### Reading Hook Input
```bash
INPUT=$(cat)                                    # Read from stdin
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path')
```

### Hook Exit Codes
```bash
exit 0   # Allow action (stdout → Claude's context)
exit 2   # Block action (stderr → Claude's feedback)
exit 1   # Error (logged, action proceeds)
```

### JSON Output (Advanced)
```json
{
  "decision": "block",
  "reason": "Explanation",
  "hookSpecificOutput": {
    "permissionDecision": "deny"
  }
}
```

---

## Testing Hooks

```bash
# Test SessionStart hook
npx mcporter call engram.memory_get_agent_context

# Test PostToolUse hook (file edit)
echo '{"tool_input":{"file_path":"test.ts"}}' | \
  jq '{observation: "Edited " + .tool_input.file_path}'

# Test PreToolUse hook (validation)
echo '{"tool_name":"memory_delete_fact"}' | \
  .claude/hooks/validate-memory-ops.sh

# Test scope permission
echo '{"tool_input":{"scopeId":"private-test"}}' | \
  .claude/hooks/check-scope-permission.sh
```

---

## Common Patterns

### Auto-Store After Edit
```json
{
  "PostToolUse": [{
    "matcher": "Edit|Write",
    "hooks": [{
      "type": "command",
      "command": "jq '{observation: \"Edited \" + .tool_input.file_path}' | npx mcporter call engram.memory_observe --json"
    }]
  }]
}
```

### Block Destructive Ops
```json
{
  "PreToolUse": [{
    "matcher": "memory_delete_.*",
    "hooks": [{
      "type": "command",
      "command": ".claude/hooks/validate-memory-ops.sh"
    }]
  }]
}
```

### Desktop Notification (macOS)
```json
{
  "Notification": [{
    "matcher": "*",
    "hooks": [{
      "type": "command",
      "command": "osascript -e 'display notification \"Engram alert\" with title \"Engram\"'"
    }]
  }]
}
```

### Verify Before Stopping
```json
{
  "Stop": [{
    "hooks": [{
      "type": "agent",
      "prompt": "Check if memory was persisted. Respond {\"ok\": false, \"reason\": \"...\"} if not.",
      "timeout": 30
    }]
  }]
}
```

---

## Debugging

```bash
# Check hook config
jq empty .claude/settings.json

# View hooks in Claude Code
/hooks

# Enable verbose output
# In Claude Code: Ctrl+O

# Test with timeout
timeout 10s npx mcporter call engram.memory_health

# Check script permissions
ls -lah .claude/hooks/
# Should show: -rwxr-xr-x

# Re-apply if needed
chmod +x .claude/hooks/*.sh
```

---

## Performance Targets

| Hook Type | Target Time | Timeout Default |
|-----------|-------------|-----------------|
| Command (fast) | <100ms | 10 min |
| Command (async) | <1s | 10 min |
| Prompt | <5s | 30s |
| Agent | <30s | 60s |

**Tip:** Use `memory_observe` (async) instead of `memory_store_fact` (sync) in hot paths.

---

## Scope Naming

```bash
# Private scope (auto-created for agent)
"scopeId": "private-${ENGRAM_AGENT_ID}"

# Team scope
"scopeId": "team-engineering"

# Project scope
"scopeId": "project-frontend"

# Public scope
"scopeId": "public"
```

---

## Documentation

- **Full Strategy:** `docs/HOOKS-AND-AUTOMATION-STRATEGY.md`
- **Setup Guide:** `docs/SETUP-HOOKS.md`
- **API Reference:** `docs/API-REFERENCE.md`
- **Claude Hooks:** https://code.claude.com/docs/en/hooks-guide

---

## Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Hook not firing | Check `/hooks` menu, verify matcher, test manually |
| Timeout | Increase `timeout` field, optimize command |
| Permission denied | `chmod +x .claude/hooks/*.sh` |
| JSON error | Wrap profile `echo` in `if [[ $- == *i* ]]; then` |
| jq not found | `brew install jq` (macOS) or `apt-get install jq` (Linux) |
| mcporter not found | `npm install` in engram root |

---

**Updated:** 2026-02-15
