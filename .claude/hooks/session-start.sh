#!/usr/bin/env bash
# Hook: SessionStart — Inject agent context at session boundary
#
# Fires when a Claude Code session begins or resumes.
# Injects full agent context (identity, scopes, notifications) as hidden context.
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
CONVEX_CLIENT="$ENGRAM_ROOT/mcp-server/dist/lib/convex-client.js"

# Check if MCP client is built
if [ ! -f "$CONVEX_CLIENT" ]; then
  echo "Engram MCP server not built" >&2
  exit 0  # Non-blocking: don't fail the session
fi

# Build context payload via Convex client
CONTEXT=$(node -e "
  process.env.CONVEX_URL = process.env.CONVEX_URL || '';
  if (!process.env.CONVEX_URL) process.exit(0);

  const agentId = process.env.ENGRAM_AGENT_ID || 'claude-code';

  import('$ENGRAM_ROOT/mcp-server/dist/lib/convex-client.js').then(async (convex) => {
    try {
      const [agent, scopes, notifications] = await Promise.all([
        convex.getAgentByAgentId(agentId).catch(() => null),
        convex.getPermittedScopes(agentId).catch(() => []),
        convex.getUnreadNotifications({ agentId, limit: 5 }).catch(() => []),
      ]);

      const lines = [
        '## Engram Agent Context (SessionStart)',
        `- sessionId: $SESSION_ID`,
        `- agentId: ${agent?.agentId || agentId}`,
        `- name: ${agent?.name || '(unregistered)'}`,
        `- capabilities: ${(agent?.capabilities || []).join(', ') || '(none)'}`,
        `- defaultScope: ${agent?.defaultScope || '(none)'}`,
        `- factCount: ${agent?.factCount || 0}`,
        `- permittedScopes: ${Array.isArray(scopes) ? scopes.length : 0}`,
        `- unreadNotifications: ${Array.isArray(notifications) ? notifications.length : 0}`,
      ];

      if (Array.isArray(scopes) && scopes.length > 0) {
        lines.push('');
        lines.push('### Scopes');
        for (const s of scopes.slice(0, 10)) {
          lines.push(`- ${s.name} (r:${s.readPolicy} w:${s.writePolicy})`);
        }
      }

      if (Array.isArray(notifications) && notifications.length > 0) {
        lines.push('');
        lines.push('### Unread Notifications');
        for (const n of notifications) {
          const reason = n.reason || n.type || 'notification';
          lines.push(`- [${reason}] fact:${n.factId || 'n/a'}`);
        }
      }

      const context = lines.join('\n');
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: context,
        }
      }));
    } catch (e) {
      process.stderr.write('[engram] SessionStart context failed: ' + e.message + '\n');
      process.exit(0);
    }
  });
" 2>/dev/null) || true

if [ -n "$CONTEXT" ]; then
  echo "$CONTEXT"
else
  # Fallback: plain text context
  echo "[Engram] Memory system active. Session: $SESSION_ID ($SESSION_SOURCE)"
fi
