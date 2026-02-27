#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_ENTRY="$ROOT_DIR/mcp-server/dist/index.js"

if [[ -z "${CONVEX_URL:-}" ]]; then
  echo "ERROR: CONVEX_URL is required." >&2
  echo "Set it before launching Codex: export CONVEX_URL=..." >&2
  exit 1
fi

if [[ -z "${ENGRAM_AGENT_ID:-}" ]]; then
  echo "ERROR: ENGRAM_AGENT_ID is required." >&2
  echo "Set it before launching Codex: export ENGRAM_AGENT_ID=..." >&2
  exit 1
fi

if ! command -v reloaderoo >/dev/null 2>&1; then
  echo "ERROR: reloaderoo is required for MCP preflight checks." >&2
  echo "Install with: npm install -g reloaderoo" >&2
  exit 1
fi

if [[ ! -f "$MCP_ENTRY" ]]; then
  echo "Building MCP server..." >&2
  (cd "$ROOT_DIR/mcp-server" && npm run build >/dev/null)
fi

echo "Running Engram MCP preflight (memory_health)..." >&2
HEALTH_OUTPUT="$(
  CONVEX_URL="$CONVEX_URL" \
  ENGRAM_AGENT_ID="$ENGRAM_AGENT_ID" \
  reloaderoo inspect call-tool memory_health --params '{}' -- node "$MCP_ENTRY" 2>/dev/null || true
)"

if [[ "$HEALTH_OUTPUT" != *'"ok":true'* ]] || [[ "$HEALTH_OUTPUT" == *'"isError":true'* ]]; then
  echo "ERROR: Engram preflight failed. memory_health did not return ok=true." >&2
  echo "Output:" >&2
  echo "$HEALTH_OUTPUT" >&2
  exit 1
fi

echo "Engram preflight passed. Launching Codex..." >&2
exec codex "$@"
