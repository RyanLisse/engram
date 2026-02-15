#!/usr/bin/env bash
# Hook: PostToolUse — Record file edit observations
#
# Fires after local editing tools succeed.
# Records lightweight edit observations for memory continuity.
# Runs async to avoid blocking the active loop.
#
# Input (stdin): JSON with tool_name, tool_input, tool_output
# Output: none (async, fire-and-forget)

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // .toolName // ""')

# Only track editing tools
if [[ ! "$TOOL_NAME" =~ ^(Edit|Write|MultiEdit|apply_patch)$ ]]; then
  exit 0
fi

# Skip if no CONVEX_URL
if [ -z "${CONVEX_URL:-}" ]; then
  exit 0
fi

ENGRAM_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AGENT_ID="${ENGRAM_AGENT_ID:-claude-code}"
SCOPE_ID="private-${AGENT_ID}"

# Best-effort file path extraction by tool
FILE_PATH=$(echo "$INPUT" | jq -r '
  .tool_input.file_path //
  .tool_input.path //
  .tool_input.TargetFile //
  .tool_input.absolute_path //
  ""
')

# Build concise observation text
if [ -n "$FILE_PATH" ]; then
  OBSERVATION="Edited ${FILE_PATH} via ${TOOL_NAME}"
else
  OBSERVATION="Edited file via ${TOOL_NAME}"
fi

# Store as passive observation (fire-and-forget)
printf '%s' "{\"observation\":$(printf '%s' "$OBSERVATION" | jq -Rs .),\"scopeId\":$(printf '%s' "$SCOPE_ID" | jq -Rs .)}" \
  | (cd "$ENGRAM_ROOT" && npx mcporter call engram.memory_observe --json >/dev/null 2>&1) \
  || true
