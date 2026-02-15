#!/usr/bin/env bash
# Hook: Stop — Auto-store conversation insights when Claude finishes responding
#
# Fires when Claude finishes a response. Captures key decisions/insights
# from the current turn and stores them as observations.
# Only fires on substantive responses (not quick answers).
#
# Input (stdin): JSON with session_id, transcript_path, stop_reason
# Output: none (async observation)

set -euo pipefail

INPUT=$(cat)
STOP_REASON=$(echo "$INPUT" | jq -r '.stop_reason // "end_turn"')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""')

# Skip if no CONVEX_URL
if [ -z "${CONVEX_URL:-}" ]; then
  exit 0
fi

# Skip if no transcript available
if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

ENGRAM_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AGENT_ID="${ENGRAM_AGENT_ID:-claude-code}"

# Extract last assistant message from transcript (JSONL format)
# Only process if the response was substantive (>100 chars)
LAST_MSG=$(tail -1 "$TRANSCRIPT_PATH" 2>/dev/null | jq -r '.message.content // "" | if type == "array" then map(select(.type == "text") | .text) | join(" ") else . end' 2>/dev/null || echo "")

if [ ${#LAST_MSG} -lt 100 ]; then
  exit 0
fi

# Store as an observation (fire-and-forget, async)
node -e "
  const agentId = '$AGENT_ID';
  const stopReason = '$STOP_REASON';

  // Read last ~500 chars of the response for a compact observation
  const response = $(echo "$LAST_MSG" | head -c 500 | jq -Rs .);

  import('$ENGRAM_ROOT/mcp-server/dist/lib/convex-client.js')
    .then(async (convex) => {
      try {
        // Record as a lightweight observation, not a full fact
        await convex.recordEvent({
          agentId,
          type: 'turn_completed',
          payload: {
            stopReason,
            responseLength: response.length,
            timestamp: Date.now(),
          },
        });
      } catch (e) {
        // Silent fail
      }
    });
" 2>/dev/null || true
