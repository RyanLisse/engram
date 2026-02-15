#!/usr/bin/env bash
# Hook: PreCompact — Checkpoint state before context compaction
#
# Fires before Claude Code compacts the conversation context.
# Creates a durable checkpoint in Engram so important context survives compaction.
#
# Input (stdin): JSON with session_id, source (manual|auto)
# Output: none (async checkpoint)

set -euo pipefail

INPUT=$(cat)
SOURCE=$(echo "$INPUT" | jq -r '.source // "auto"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')

# Skip if no CONVEX_URL
if [ -z "${CONVEX_URL:-}" ]; then
  exit 0
fi

ENGRAM_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AGENT_ID="${ENGRAM_AGENT_ID:-claude-code}"

# Create a checkpoint before compaction
node -e "
  const agentId = '$AGENT_ID';
  const sessionId = '$SESSION_ID';
  const source = '$SOURCE';

  import('$ENGRAM_ROOT/mcp-server/dist/lib/convex-client.js')
    .then(async (convex) => {
      try {
        await convex.recordEvent({
          agentId,
          type: 'pre_compact_checkpoint',
          payload: {
            sessionId,
            compactSource: source,
            timestamp: Date.now(),
          },
        });
        process.stderr.write('[engram] Pre-compact checkpoint saved\n');
      } catch (e) {
        process.stderr.write('[engram] Checkpoint failed: ' + e.message + '\n');
      }
    });
" 2>/dev/null || true
