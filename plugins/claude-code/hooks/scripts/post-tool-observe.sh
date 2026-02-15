#!/usr/bin/env bash
# Hook: PostToolUse — Track engram MCP tool usage patterns
#
# Fires after any engram MCP tool call succeeds.
# Records tool usage as an observation for ALMA feedback loop.
# Runs async to avoid blocking the agentic loop.
#
# Input (stdin): JSON with tool_name, tool_input, tool_output
# Output: none (async, fire-and-forget)

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

# Only track engram tools (mcp__engram__memory_*)
if [[ "$TOOL_NAME" != mcp__engram__* ]]; then
  exit 0
fi

# Skip if no CONVEX_URL
if [ -z "${CONVEX_URL:-}" ]; then
  exit 0
fi

ENGRAM_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AGENT_ID="${ENGRAM_AGENT_ID:-claude-code}"

# Extract the short tool name (memory_recall → recall)
SHORT_NAME="${TOOL_NAME#mcp__engram__}"

# Record tool usage as a lightweight event
node -e "
  const agentId = '$AGENT_ID';
  const toolName = '$SHORT_NAME';

  import('$ENGRAM_ROOT/mcp-server/dist/lib/convex-client.js')
    .then(async (convex) => {
      try {
        await convex.recordEvent({
          agentId,
          type: 'tool_used',
          payload: { tool: toolName, timestamp: Date.now() },
        });
      } catch (e) {
        // Silent fail — don't disrupt the session
      }
    });
" 2>/dev/null || true
