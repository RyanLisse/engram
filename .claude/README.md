# Engram Claude Code Configuration

This directory contains Claude Code hooks and configuration for automated memory operations.

## Quick Start

1. **Copy the example settings:**
   ```bash
   cp .claude/settings.json.example .claude/settings.json
   ```

2. **Review and customize hooks:**
   - Edit `.claude/settings.json` to enable/disable hooks
   - Modify hook scripts in `.claude/hooks/` for custom behavior

3. **Test hooks:**
   - Open Claude Code in this project
   - Run `/hooks` to see configured hooks
   - Trigger events to test (e.g., edit a file, complete a task)

## Available Hooks

### Session Management
- **SessionStart** — Auto-load agent context and restore memory after compaction
- **SessionEnd** — Create checkpoint on session termination

### Memory Operations
- **PostToolUse** — Auto-store observations for file edits
- **PreToolUse** — Validate destructive operations and scope permissions
- **Stop** — Verify memory persistence before finishing work
- **TaskCompleted** — Store completed tasks as memory facts

### Notifications
- **Notification** — Desktop alerts when memory system needs attention

## Hook Scripts

### `validate-memory-ops.sh`
Warns about destructive memory operations (delete, prune, etc.)

**Customize:** Change `exit 0` to `exit 2` to block instead of warn.

### `check-scope-permission.sh`
Validates agent has permission to access requested memory scope.

**Customize:** Add scope whitelist/blacklist logic if needed.

## Platform-Specific Notes

### macOS
Uses `osascript` for desktop notifications (built-in).

### Linux
Replace notification hook command with:
```bash
notify-send 'Engram' 'Memory system needs attention'
```

### Windows
Replace notification hook command with:
```bash
powershell.exe -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('Engram memory system needs attention', 'Engram')"
```

## Advanced Configuration

### Enable Stop Hook
The `Stop` hook spawns an agent to verify memory persistence. This adds ~10-30s to completion time.

**Disable if:** You want faster completions and manually manage memory storage.

### Scope Permission Enforcement
The `PreToolUse` hook checks scope permissions. This requires `memory_get_agent_info` to work.

**Disable if:** You're using a single agent and don't need scope isolation.

### Auto-Checkpointing
The `SessionEnd` hook creates checkpoints automatically.

**Disable if:** You prefer manual checkpointing with `/checkpoint` command.

## Debugging

### Hook Not Running
1. Check `/hooks` menu — hook should appear
2. Verify JSON syntax (no trailing commas)
3. Test script manually: `echo '{}' | .claude/hooks/script.sh`

### Hook Timing Out
1. Increase timeout in settings: `"timeout": 60`
2. Check mcporter is installed: `npm run mcp:list`
3. Verify Convex deployment is accessible

### Permission Errors
1. Make scripts executable: `chmod +x .claude/hooks/*.sh`
2. Check `$CLAUDE_PROJECT_DIR` is set correctly
3. Use absolute paths if relative paths fail

## Monitoring

### Hook Activity Log
Enable verbose mode in Claude Code (`Ctrl+O`) to see hook output.

### Manual Testing
```bash
# Test SessionStart hook
npx mcporter call engram.memory_get_agent_context

# Test file edit observation
echo '{"tool_input":{"file_path":"test.ts"}}' | \
  jq -r '{observation: "Edited " + .tool_input.file_path}'

# Test scope permission check
.claude/hooks/check-scope-permission.sh <<< '{"tool_input":{"scopeId":"test-scope"}}'
```

## Documentation

- **Full Strategy:** `/docs/HOOKS-AND-AUTOMATION-STRATEGY.md`
- **Hook Reference:** https://code.claude.com/docs/en/hooks-guide
- **Engram API:** `/docs/API-REFERENCE.md`

## Support

File issues at: https://github.com/RyanLisse/engram/issues
