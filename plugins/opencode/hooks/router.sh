#!/usr/bin/env bash
# OpenCode lifecycle router for Engram memory automation.
#
# Maps OpenCode bridge events to existing Engram hook scripts to avoid logic drift.
# Input payload is JSON on stdin.

set -euo pipefail

HOOK_NAME="${1:-}"
if [ -z "$HOOK_NAME" ]; then
  exit 0
fi

INPUT_JSON=$(cat)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CLAUDE_SCRIPTS="$REPO_ROOT/plugins/claude-code/hooks/scripts"

run_script() {
  local script_name="$1"
  if [ ! -x "$CLAUDE_SCRIPTS/$script_name" ]; then
    exit 0
  fi
  printf '%s' "$INPUT_JSON" | "$CLAUDE_SCRIPTS/$script_name" >/dev/null 2>&1 || true
}

case "$HOOK_NAME" in
  session-start)
    run_script "session-start.sh"
    ;;
  turn-start)
    run_script "auto-recall.sh"
    ;;
  turn-end)
    # Turn-end checkpoint signal.
    run_script "pre-compact-checkpoint.sh"
    ;;
  compaction)
    run_script "pre-compact-checkpoint.sh"
    ;;
  session-end)
    run_script "session-end.sh"
    ;;
  *)
    ;;
esac
