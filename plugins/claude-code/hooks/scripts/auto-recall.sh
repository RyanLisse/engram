#!/usr/bin/env bash
# Hook: UserPromptSubmit — Auto-recall relevant memories for each prompt
#
# Fires when the user submits a prompt, before Claude processes it.
# Performs a lightweight memory recall and injects relevant facts as context.
# This gives Claude automatic access to relevant memories without explicit tool calls.
#
# Input (stdin): JSON with prompt, session_id
# Output (stdout): JSON with additionalContext

set -euo pipefail

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""')

# Skip empty prompts or very short ones (likely commands)
if [ ${#PROMPT} -lt 20 ]; then
  exit 0
fi

# Skip if no CONVEX_URL configured
if [ -z "${CONVEX_URL:-}" ]; then
  exit 0
fi

ENGRAM_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AGENT_ID="${ENGRAM_AGENT_ID:-claude-code}"

# Perform hybrid recall (vector + text + RRF) via Node
RESULT=$(node -e "
  const prompt = $(echo "$PROMPT" | jq -Rs .);
  const agentId = '$AGENT_ID';

  import('$ENGRAM_ROOT/mcp-server/dist/recall-for-hook.js')
    .then(async (m) => {
      try {
        const result = await m.recallForHook(prompt, agentId, 3);
        if (!result.ok || result.facts.length === 0) {
          process.exit(0);
        }
        const facts = result.facts
          .map(f => '- ' + (f.content || '').substring(0, 200))
          .join('\n');
        const context = '## Relevant Memories (auto-recalled, hybrid + RRF)\n' + facts;
        console.log(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: context
          }
        }));
      } catch (e) {
        process.stderr.write('[engram] Auto-recall failed: ' + (e.message || e) + '\n');
        process.exit(0);
      }
    });
" 2>/dev/null) || true

if [ -n "$RESULT" ]; then
  echo "$RESULT"
fi
