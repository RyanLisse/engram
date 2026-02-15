#!/usr/bin/env bash
# Hook: Notification — Desktop alert on Claude notifications (macOS)
#
# Fires when Claude needs attention.
# Best-effort: never block workflow on notification failures.

set -euo pipefail

INPUT=$(cat)

TITLE=$(echo "$INPUT" | jq -r '.title // "Engram"')
MESSAGE=$(echo "$INPUT" | jq -r '.message // .text // "Memory system needs attention"')

# Optional kill switch for CI/testing
if [ "${ENGRAM_DISABLE_DESKTOP_ALERT:-0}" = "1" ]; then
  exit 0
fi

# macOS notification
if command -v osascript >/dev/null 2>&1; then
  ESCAPED_TITLE=$(printf '%s' "$TITLE" | sed 's/\\/\\\\/g; s/"/\\"/g')
  ESCAPED_MESSAGE=$(printf '%s' "$MESSAGE" | sed 's/\\/\\\\/g; s/"/\\"/g')
  osascript -e "display notification \"${ESCAPED_MESSAGE}\" with title \"${ESCAPED_TITLE}\"" >/dev/null 2>&1 || true
fi

exit 0
