#!/usr/bin/env bash
# Hook: SessionEnd — Create a durable checkpoint summary
#
# Fires when a Claude Code session terminates.
# Stores a session_summary checkpoint fact in the agent private scope.
#
# Input (stdin): JSON with session_id, reason
# Output: none (async, fire-and-forget)

set -euo pipefail

INPUT=$(cat)
REASON=$(echo "$INPUT" | jq -r '.reason // "other"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
NOW_TS=$(date +%s)
CWD=$(echo "$INPUT" | jq -r '.cwd // .workspace // "unknown"')

# Skip if no CONVEX_URL
if [ -z "${CONVEX_URL:-}" ]; then
  exit 0
fi

ENGRAM_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AGENT_ID="${ENGRAM_AGENT_ID:-claude-code}"

# Create a lightweight checkpoint at session boundary (best effort)
CHECKPOINT_NAME="session-end-${NOW_TS}"
CHECKPOINT_SUMMARY="Auto-checkpoint at session end (${REASON})"
printf '%s' "{\"name\":$(printf '%s' "$CHECKPOINT_NAME" | jq -Rs .),\"summary\":$(printf '%s' "$CHECKPOINT_SUMMARY" | jq -Rs .)}" \
  | (cd "$ENGRAM_ROOT" && npx mcporter call engram.memory_checkpoint --json >/dev/null 2>&1) \
  || true

# Persist checkpoint summary as a session_summary fact
node -e "
  const agentId = '$AGENT_ID';
  const sessionId = '$SESSION_ID';
  const reason = '$REASON';
  const cwd = '$CWD';

  import('$ENGRAM_ROOT/mcp-server/dist/lib/convex-client.js')
    .then(async (convex) => {
      try {
        const scope = await convex.getScopeByName('private-' + agentId);
        if (!scope?._id) {
          process.exit(0);
        }

        const now = new Date().toISOString();
        const content = [
          'Session checkpoint',
          `- agentId: ${agentId}`,
          `- sessionId: ${sessionId}`,
          `- reason: ${reason}`,
          `- cwd: ${cwd}`,
          `- timestamp: ${now}`,
        ].join('\n');

        await convex.storeFact({
          content,
          source: 'claude-hook-session-end',
          createdBy: agentId,
          scopeId: scope._id,
          factType: 'session_summary',
          tags: ['checkpoint', 'session-end', 'claude-hook'],
        });
        process.stderr.write('[engram] Session checkpoint stored\n');
      } catch (e) {
        // Silent fail — session is ending anyway
      }
    });
" 2>/dev/null || true
