#!/usr/bin/env bash

set -uo pipefail

SERVER_CMD=(node mcp-server/dist/index.js)
MIN_TOOL_COUNT=77

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

run_step() {
  local label="$1"
  shift

  echo "==> ${label}"
  local output
  if ! output="$("$@" 2>&1)"; then
    echo "${output}" >&2
    fail "${label} failed"
  fi
  printf '%s\n' "${output}"
}

extract_json_payload() {
  awk 'BEGIN { capture=0 } /^\{/ { capture=1 } capture { print }'
}

count_tools() {
  node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      try {
        const parsed = JSON.parse(input);
        const count = Array.isArray(parsed.tools) ? parsed.tools.length : 0;
        if (count <= 0) {
          console.error("No tools found in list-tools response");
          process.exit(2);
        }
        console.log(count);
      } catch (error) {
        console.error(`Failed to parse list-tools JSON: ${error.message}`);
        process.exit(3);
      }
    });
  '
}

if [[ -z "${CONVEX_URL:-}" ]]; then
  fail "CONVEX_URL is required"
fi

if [[ -z "${ENGRAM_AGENT_ID:-}" ]]; then
  fail "ENGRAM_AGENT_ID is required"
fi

if [[ ! -f "mcp-server/dist/index.js" ]]; then
  run_step "Build mcp-server" bash -lc 'cd mcp-server && npm run build'
fi

run_step "Inspect server-info" reloaderoo inspect server-info -- "${SERVER_CMD[@]}" >/dev/null

list_tools_output="$(run_step "Inspect list-tools" reloaderoo inspect list-tools -- "${SERVER_CMD[@]}")" || fail "Inspect list-tools failed"
list_tools_json="$(printf '%s\n' "${list_tools_output}" | extract_json_payload)"

if [[ -z "${list_tools_json}" ]]; then
  fail "Could not extract JSON payload from list-tools output"
fi

tool_count="$(printf '%s\n' "${list_tools_json}" | count_tools 2>&1)"
if [[ $? -ne 0 ]]; then
  fail "${tool_count}"
fi

if [[ ! "${tool_count}" =~ ^[0-9]+$ ]]; then
  fail "Tool count is not numeric: ${tool_count}"
fi

if (( tool_count < MIN_TOOL_COUNT )); then
  fail "Tool count ${tool_count} is below required minimum ${MIN_TOOL_COUNT}"
fi

echo "Tool count check passed: ${tool_count} >= ${MIN_TOOL_COUNT}"

run_step "Call memory_health" reloaderoo inspect call-tool memory_health --params '{}' -- "${SERVER_CMD[@]}" >/dev/null

echo "MCP smoke test passed"
exit 0
