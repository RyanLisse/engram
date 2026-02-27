#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/engram-preflight.sh"

export ENGRAM_AGENT_ID="${ENGRAM_AGENT_ID:-opencode}"
engram_preflight "$SCRIPT_DIR/.."

echo "[engram] Launching OpenCode..." >&2
exec opencode "$@"
