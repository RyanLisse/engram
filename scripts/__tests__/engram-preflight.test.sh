#!/usr/bin/env bash
set -euo pipefail

PASS=0; FAIL=0; TESTS=0

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
LIB="$REPO_ROOT/scripts/lib/engram-preflight.sh"

assert_exit() {
  local desc=$1 expected=$2 actual=$3
  TESTS=$((TESTS + 1))
  if [[ "$expected" == "$actual" ]]; then
    echo "  ✓ $desc"; PASS=$((PASS + 1))
  else
    echo "  ✗ $desc (expected $expected, got $actual)"; FAIL=$((FAIL + 1))
  fi
}

run_subshell() {
  local script=$1
  set +e
  bash -c "set -euo pipefail; $script"
  local rc=$?
  set -e
  echo "$rc"
}

echo "Testing scripts/lib/engram-preflight.sh"

actual="$(run_subshell "export CONVEX_URL='https://example.convex.cloud' ENGRAM_AGENT_ID='agent-1'; source '$LIB'; engram_check_env >/dev/null 2>&1")"
assert_exit "engram_check_env returns 0 when CONVEX_URL and ENGRAM_AGENT_ID are set" 0 "$actual"

actual="$(run_subshell "unset CONVEX_URL; export ENGRAM_AGENT_ID='agent-1'; source '$LIB'; engram_check_env >/dev/null 2>&1")"
assert_exit "engram_check_env returns 1 when CONVEX_URL is unset" 1 "$actual"

actual="$(run_subshell "export CONVEX_URL='https://example.convex.cloud'; unset ENGRAM_AGENT_ID; source '$LIB'; engram_check_env >/dev/null 2>&1")"
assert_exit "engram_check_env returns 1 when ENGRAM_AGENT_ID is unset" 1 "$actual"

actual="$(run_subshell "tmp=\$(mktemp -d); printf '#!/usr/bin/env bash\nexit 0\n' > \"\$tmp/reloaderoo\"; chmod +x \"\$tmp/reloaderoo\"; export PATH=\"\$tmp:\$PATH\"; source '$LIB'; engram_check_reloaderoo >/dev/null 2>&1")"
assert_exit "engram_check_reloaderoo returns 0 with mock reloaderoo in PATH" 0 "$actual"

actual="$(run_subshell "PATH=''; source '$LIB'; engram_check_reloaderoo >/dev/null 2>&1")"
assert_exit "engram_check_reloaderoo returns 1 when PATH is empty" 1 "$actual"

actual="$(run_subshell "unset CONVEX_URL ENGRAM_AGENT_ID; PATH=''; export ENGRAM_ALLOW_OFFLINE=1; source '$LIB'; engram_preflight '$REPO_ROOT' >/dev/null 2>&1")"
assert_exit "ENGRAM_ALLOW_OFFLINE=1 makes engram_preflight return 0 without deps" 0 "$actual"

actual="$(run_subshell "unset CONVEX_URL ENGRAM_AGENT_ID ENGRAM_ALLOW_OFFLINE; source '$LIB'; engram_preflight '$REPO_ROOT' >/dev/null 2>&1")"
assert_exit "engram_preflight returns 1 for config errors" 1 "$actual"

echo
echo "Results: $PASS passed, $FAIL failed, $TESTS total"
if ((FAIL > 0)); then
  exit 1
fi
exit 0
