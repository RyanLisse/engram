#!/usr/bin/env bash
# Engram MCP Preflight Library
# Source this from any client wrapper: source "$SCRIPT_DIR/lib/engram-preflight.sh"
#
# Functions:
#   engram_check_env       - Validate required environment variables
#   engram_check_reloaderoo - Validate reloaderoo CLI availability
#   engram_ensure_build    - Ensure MCP server is built
#   engram_health_check    - Run memory_health preflight check
#   engram_preflight       - Full preflight orchestration
#
# Exit codes: 0=pass, 1=config error (hard block), 2=transient (retryable)

# Validate required environment variables
engram_check_env() {
  local ok=0

  if [[ -z "${CONVEX_URL:-}" ]]; then
    echo "[engram] ERROR: CONVEX_URL is not set." >&2
    echo "[engram] Fix: export CONVEX_URL=https://your-deployment.convex.cloud" >&2
    ok=1
  fi

  if [[ -z "${ENGRAM_AGENT_ID:-}" ]]; then
    echo "[engram] ERROR: ENGRAM_AGENT_ID is not set." >&2
    echo "[engram] Fix: export ENGRAM_AGENT_ID=<your-agent-id>" >&2
    ok=1
  fi

  return "$ok"
}

# Validate reloaderoo CLI availability
engram_check_reloaderoo() {
  if ! command -v reloaderoo >/dev/null 2>&1; then
    echo "[engram] ERROR: reloaderoo is not installed." >&2
    echo "[engram] Fix: npm install -g reloaderoo" >&2
    return 1
  fi
  return 0
}

# Ensure MCP server is built
engram_ensure_build() {
  local root_dir="${1:?engram_ensure_build requires root_dir}"
  local entry="$root_dir/mcp-server/dist/index.js"

  if [[ ! -f "$entry" ]]; then
    echo "[engram] MCP server not built. Building..." >&2
    if ! (cd "$root_dir/mcp-server" && npm run build >/dev/null 2>&1); then
      echo "[engram] ERROR: MCP server build failed." >&2
      echo "[engram] Fix: cd $root_dir/mcp-server && npm run build" >&2
      return 1
    fi
    echo "[engram] Build complete." >&2
  fi

  return 0
}

# Run memory_health preflight check
# Returns: 0=pass, 1=config error, 2=transient error
engram_health_check() {
  local root_dir="${1:?engram_health_check requires root_dir}"
  local entry="$root_dir/mcp-server/dist/index.js"
  local timeout="${2:-5}"
  local retries="${3:-2}"

  local attempt=0
  local health_output=""

  echo "[engram] Running preflight health check..." >&2

  while [[ "$attempt" -le "$retries" ]]; do
    health_output="$(
      CONVEX_URL="$CONVEX_URL" \
      ENGRAM_AGENT_ID="$ENGRAM_AGENT_ID" \
      timeout "$timeout" \
      reloaderoo inspect call-tool memory_health --params '{}' -- node "$entry" 2>/dev/null || true
    )"

    if [[ "$health_output" == *'"ok":true'* ]] && [[ "$health_output" != *'"isError":true'* ]]; then
      return 0
    fi

    attempt=$((attempt + 1))
    if [[ "$attempt" -le "$retries" ]]; then
      echo "[engram] Health check attempt $attempt failed, retrying..." >&2
      sleep 1
    fi
  done

  # Distinguish config vs transient errors
  if [[ "$health_output" == *'"isError":true'* ]]; then
    echo "[engram] ERROR: Preflight health check returned an error." >&2
    echo "[engram] Output: $health_output" >&2
    echo "[engram] Fix: Verify CONVEX_URL and ENGRAM_AGENT_ID are correct" >&2
    return 1
  fi

  echo "[engram] ERROR: Preflight health check did not return ok=true after $((retries + 1)) attempts." >&2
  echo "[engram] Output: $health_output" >&2
  echo "[engram] Fix: Check network connectivity and Convex deployment status" >&2
  return 2
}

# Full preflight orchestration
engram_preflight() {
  local root_dir="${1:?engram_preflight requires root_dir}"

  # Support ENGRAM_ALLOW_OFFLINE bypass
  if [[ "${ENGRAM_ALLOW_OFFLINE:-}" == "1" ]]; then
    echo "[engram] WARNING: ENGRAM_ALLOW_OFFLINE=1 -- skipping preflight checks" >&2
    return 0
  fi

  engram_check_env || return 1
  engram_check_reloaderoo || return 1
  engram_ensure_build "$root_dir" || return 1
  engram_health_check "$root_dir" || return $?

  echo "[engram] Preflight passed." >&2
  return 0
}
