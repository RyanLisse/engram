#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/engram-preflight.sh"

export ENGRAM_AGENT_ID="${ENGRAM_AGENT_ID:-gemini-cli}"
engram_preflight "$SCRIPT_DIR/.."

echo "[engram] Launching Gemini CLI..." >&2
exec gemini "$@"
