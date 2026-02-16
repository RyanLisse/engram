#!/usr/bin/env bash
set -euo pipefail

TASK_TYPE="${1:-unknown}"
SUCCESS="${2:-true}"
METRICS_JSON="${3:-{}}"

npx tsx scripts/track-agent-performance.ts \
  --agent-id "${ENGRAM_AGENT_ID:-indy}" \
  --task-type "$TASK_TYPE" \
  --success "$SUCCESS" \
  --metrics "$METRICS_JSON"
