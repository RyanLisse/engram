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

# Perform lightweight recall via Node
RESULT=$(node -e "
  const prompt = $(echo "$PROMPT" | jq -Rs .);
  const agentId = '$AGENT_ID';

  import('$ENGRAM_ROOT/mcp-server/dist/lib/convex-client.js')
    .then(async (convex) => {
      try {
        // Quick vector search — top 3 facts only for speed
        const results = await convex.vectorSearch({
          query: prompt,
          agentId,
          limit: 3,
        });

        if (!results || !results.results || results.results.length === 0) {
          process.exit(0);
        }

        const facts = results.results
          .filter(r => r.score > 0.3)
          .map(r => '- ' + (r.content || '').substring(0, 200))
          .join('\n');

        if (!facts) { process.exit(0); }

        const context = '## Relevant Memories (auto-recalled)\n' + facts;

        console.log(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: context
          }
        }));
      } catch (e) {
        process.stderr.write('[engram] Auto-recall failed: ' + e.message + '\n');
        process.exit(0);
      }
    });
" 2>/dev/null) || true

if [ -n "$RESULT" ]; then
  echo "$RESULT"
fi
