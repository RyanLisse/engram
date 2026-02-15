#!/usr/bin/env bash
# Hook: SessionStart — Auto-register agent + inject memory context
#
# Fires when a Claude Code session begins or resumes.
# Calls memory_build_system_prompt via the MCP server to inject
# full agent context (identity, activity, config, workspace, notifications).
#
# Input (stdin): JSON with session_id, source, model, cwd
# Output (stdout): JSON with additionalContext for Claude

set -euo pipefail

INPUT=$(cat)
SESSION_SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')

# Only inject full context on startup/resume, not on clear/compact
if [[ "$SESSION_SOURCE" == "clear" ]]; then
  exit 0
fi

ENGRAM_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MCP_SERVER="$ENGRAM_ROOT/mcp-server/dist/index.js"

# Check if MCP server is built
if [ ! -f "$MCP_SERVER" ]; then
  echo "Engram MCP server not built" >&2
  exit 0  # Non-blocking: don't fail the session
fi

# Build system prompt context via a lightweight Node script
CONTEXT=$(node -e "
  process.env.CONVEX_URL = process.env.CONVEX_URL || '';
  if (!process.env.CONVEX_URL) { process.exit(0); }

  import('$ENGRAM_ROOT/mcp-server/dist/tools/system-prompt-builder.js')
    .then(async (mod) => {
      try {
        const agentId = process.env.ENGRAM_AGENT_ID || 'claude-code';
        const result = await mod.buildFullSystemPrompt({
          format: 'markdown',
          includeNotifications: true,
          includeHandoffs: true,
        }, agentId);
        const prompt = result.systemPrompt || '';
        if (prompt) {
          console.log(JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'SessionStart',
              additionalContext: prompt
            }
          }));
        }
      } catch (e) {
        process.stderr.write('[engram] System prompt build failed: ' + e.message + '\n');
      }
    });
" 2>/dev/null) || true

if [ -n "$CONTEXT" ]; then
  echo "$CONTEXT"
else
  # Fallback: plain text context
  echo "[Engram] Memory system active. Session: $SESSION_ID ($SESSION_SOURCE)"
fi
