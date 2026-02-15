# Setting Up Claude Code Hooks for Engram

**Quick setup guide for enabling automated memory operations.**

---

## Prerequisites

- Claude Code CLI installed and configured
- Engram MCP server running
- `jq` installed for JSON processing (`brew install jq` on macOS)
- `mcporter` available (`npm install` in engram root)

---

## Setup Steps

### 1. Copy Configuration

```bash
cd /path/to/engram
cp .claude/settings.json.example .claude/settings.json
```

### 2. Set Environment Variables

Hooks need `ENGRAM_AGENT_ID` to scope memory operations:

**Option A: Global (recommended)**
Add to `~/.zshrc` or `~/.bashrc`:
```bash
export ENGRAM_AGENT_ID="your-agent-name"
```

**Option B: Project-specific**
Create `.claude/.env`:
```bash
ENGRAM_AGENT_ID=your-agent-name
```

### 3. Verify Hook Scripts

```bash
# Check scripts exist
ls -lah .claude/hooks/

# Should show:
# -rwxr-xr-x validate-memory-ops.sh
# -rwxr-xr-x check-scope-permission.sh

# If not executable:
chmod +x .claude/hooks/*.sh
```

### 4. Test Hooks Manually

```bash
# Test SessionStart hook
npx mcporter call engram.memory_get_agent_context

# Test file edit hook (requires ENGRAM_AGENT_ID)
echo '{"tool_input":{"file_path":"test.ts"}}' | \
  jq -r '{observation: "Edited " + .tool_input.file_path, scopeId: "private-'$ENGRAM_AGENT_ID'"}'

# Test scope permission hook
.claude/hooks/check-scope-permission.sh <<< '{
  "tool_name": "memory_store_fact",
  "tool_input": {"scopeId": "private-'$ENGRAM_AGENT_ID'"}
}'
```

### 5. Enable in Claude Code

```bash
# Start Claude Code in engram directory
cd /path/to/engram
claude

# In Claude Code, type:
/hooks

# You should see all configured hooks listed
```

---

## Platform-Specific Configuration

### macOS (Default)
No changes needed. Uses `osascript` for notifications.

### Linux
Edit `.claude/settings.json`, find the `Notification` hook and change command to:
```json
"command": "notify-send 'Engram' 'Memory system needs attention'"
```

### Windows
Edit `.claude/settings.json`, find the `Notification` hook and change command to:
```json
"command": "powershell.exe -Command \"[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('Engram memory system needs attention', 'Engram')\""
```

---

## Customization

### Disable Specific Hooks

To disable a hook, remove its entire block from `.claude/settings.json` or comment it out.

**Example: Disable Stop Hook**
The `Stop` hook adds verification time (~10-30s). To disable:
```json
{
  "hooks": {
    "Stop": []  // Empty array = no hooks
  }
}
```

### Adjust Hook Timeouts

Default timeout is 10 minutes for `command` hooks, 30s for `prompt` hooks, 60s for `agent` hooks.

**Change timeout:**
```json
{
  "type": "agent",
  "prompt": "...",
  "timeout": 120  // 2 minutes
}
```

### Block Destructive Operations

By default, `validate-memory-ops.sh` warns but allows destructive operations.

**To block instead:**
1. Edit `.claude/hooks/validate-memory-ops.sh`
2. Change `exit 0` (line 26) to `exit 2`
3. Save and test

---

## Verification

### Check Hooks Are Active

In Claude Code:
1. Type `/hooks`
2. Verify all expected hooks are listed
3. Check matchers and commands are correct

### Test Hook Execution

1. **SessionStart**: Restart Claude Code session, check for context injection
2. **PostToolUse**: Edit a file, check observation is stored (use `/memory recall`)
3. **Stop**: Complete a task, verify persistence check runs
4. **Notification**: Trigger a permission prompt, check desktop notification appears

### Debug Issues

**Hook not firing:**
```bash
# Check settings syntax
jq empty .claude/settings.json

# View hooks in verbose mode
# In Claude Code: Ctrl+O (toggle verbose)
```

**Hook timing out:**
```bash
# Test manually with timeout
timeout 10s npx mcporter call engram.memory_get_agent_context

# If fails, check Convex deployment
curl $CONVEX_URL/_system/metadata
```

**Permission denied:**
```bash
# Re-apply executable permissions
chmod +x .claude/hooks/*.sh

# Check script runs
.claude/hooks/validate-memory-ops.sh <<< '{}'
```

---

## What Each Hook Does

| Hook | When | What | Performance Impact |
|------|------|------|-------------------|
| **SessionStart** | Session begins | Loads agent context | ~50-200ms |
| **SessionStart (compact)** | After compaction | Restores recent facts | ~100-500ms |
| **PostToolUse (Edit/Write)** | After file edits | Stores observation | ~10-50ms (async) |
| **PreToolUse (delete/prune)** | Before destructive ops | Warns/validates | <5ms |
| **PreToolUse (scope check)** | Before memory ops | Validates permissions | ~50-200ms |
| **Stop** | Work completed | Verifies persistence | ~10-30s (agent spawn) |
| **SessionEnd** | Session ends | Creates checkpoint | ~100-500ms |
| **Notification** | Claude waits | Desktop alert | <10ms |
| **TaskCompleted** | Task marked done | Stores as fact | ~20-100ms (async) |

---

## Advanced Setup

### Multi-Agent Configuration

For multiple agents sharing one engram instance:

1. Set different `ENGRAM_AGENT_ID` per agent
2. Use scope-based access control
3. Configure agent registry:
   ```bash
   npx mcporter call engram.memory_register_agent \
     agentId="agent-name" \
     name="Display Name" \
     capabilities='["coding","research"]'
   ```

### Custom Hook Scripts

Create new hooks in `.claude/hooks/`:
```bash
#!/bin/bash
# .claude/hooks/my-custom-hook.sh

INPUT=$(cat)
# ... process input
exit 0  # or exit 2 to block
```

Register in `.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/my-custom-hook.sh"
          }
        ]
      }
    ]
  }
}
```

### Logging Hook Activity

Add logging to any hook:
```bash
#!/bin/bash
LOG_FILE="$HOME/.claude/engram-hooks.log"
echo "$(date -Iseconds) Hook executed: $0" >> "$LOG_FILE"

# ... rest of hook
```

---

## Troubleshooting

### Common Issues

**"jq: command not found"**
```bash
# macOS
brew install jq

# Linux (Debian/Ubuntu)
sudo apt-get install jq

# Linux (RHEL/Fedora)
sudo dnf install jq
```

**"mcporter: command not found"**
```bash
# Install dependencies
cd /path/to/engram
npm install

# Verify
npx mcporter list engram
```

**"Convex deployment not accessible"**
```bash
# Check environment
echo $CONVEX_URL

# Test connection
curl $CONVEX_URL/_system/metadata

# If empty, set in .claude/.env or globally
```

**Hooks running but no effect**
```bash
# Check hook output in verbose mode (Ctrl+O in Claude Code)
# Or test manually:
echo '{"tool_input":{"file_path":"test.ts"}}' | \
  npx mcporter call engram.memory_observe --json
```

---

## Next Steps

1. ✅ Complete setup
2. ✅ Test all hooks manually
3. ✅ Run Claude Code and verify hooks fire
4. 📖 Read full strategy: `docs/HOOKS-AND-AUTOMATION-STRATEGY.md`
5. 🎯 Customize for your workflow
6. 📊 Monitor hook performance and adjust

---

## Support

- **Documentation:** `/docs/HOOKS-AND-AUTOMATION-STRATEGY.md`
- **Issues:** https://github.com/RyanLisse/engram/issues
- **Claude Code Hooks Guide:** https://code.claude.com/docs/en/hooks-guide
