#!/usr/bin/env bash
# Hook: SessionEnd — Auto-end session with handoff summary
#
# Fires when a Claude Code session terminates.
# Calls memory_end_session to store a handoff summary for the next agent.
#
# Input (stdin): JSON with session_id, reason
# Output: none (async)

set -euo pipefail

INPUT=$(cat)
REASON=$(echo "$INPUT" | jq -r '.reason // "other"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')

# Skip if no CONVEX_URL
if [ -z "${CONVEX_URL:-}" ]; then
  exit 0
fi

ENGRAM_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AGENT_ID="${ENGRAM_AGENT_ID:-claude-code}"

# End the session in Engram with reason
node -e "
  const agentId = '$AGENT_ID';
  const sessionId = '$SESSION_ID';
  const reason = '$REASON';

  import('$ENGRAM_ROOT/mcp-server/dist/lib/convex-client.js')
    .then(async (convex) => {
      try {
        await convex.endSession({
          agentId,
          summary: 'Session ended: ' + reason,
        });
        process.stderr.write('[engram] Session ended: ' + reason + '\n');
      } catch (e) {
        // Silent fail — session is ending anyway
      }
    });
" 2>/dev/null || true
