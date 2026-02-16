#!/bin/bash
# Quick test of Engram MCP server.
# Runs server with one initialize request then kills it (server does not exit on stdin close).

set -euo pipefail

export CONVEX_URL="${CONVEX_URL:-https://your-deployment.convex.cloud}"
export ENGRAM_AGENT_ID="${ENGRAM_AGENT_ID:-test-$(date +%s)}"
export ENGRAM_DISABLE_EVENT_BUS="${ENGRAM_DISABLE_EVENT_BUS:-1}"

echo "Testing Engram MCP Server..."
echo "Agent ID: $ENGRAM_AGENT_ID"
echo ""

SERVER_CMD="node mcp-server/dist/index.js"
if [ -x "mcp-server/node_modules/.bin/tsx" ]; then
  SERVER_CMD="mcp-server/node_modules/.bin/tsx mcp-server/src/index.ts"
fi

INIT_JSON='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

echo "Test 1: Initialize MCP server"
# Server stays alive (setInterval). Send init, capture first stdout line; cap wait so CI never hangs.
OUT=$(mktemp)
cleanup() { rm -f "$OUT"; }
trap cleanup EXIT

# Linux CI: timeout caps runtime. macOS: no timeout, fixed wait then exit (shell cleans up background job on exit).
if command -v timeout >/dev/null 2>&1; then
  timeout 12 env INIT_JSON="$INIT_JSON" OUT="$OUT" SERVER_CMD="$SERVER_CMD" bash -c '( echo "$INIT_JSON"; sleep 1 ) | $SERVER_CMD 2>/dev/null | head -n1 > "$OUT"' || true
else
  ( echo "$INIT_JSON"; sleep 1 ) | $SERVER_CMD 2>/dev/null | head -n1 > "$OUT" &
  sleep 10
  # Do not wait $! — it can block on the whole pipeline (server never exits)
fi

if [ -s "$OUT" ] && grep -qE '"result"|"jsonrpc"' "$OUT" 2>/dev/null; then
  echo "✅ Engram MCP server initialized successfully!"
else
  echo "❌ No valid initialize result (server may have failed to start)"
  exit 1
fi
echo ""
echo "To use Engram in Claude Code:"
echo "1. Restart Claude Code to load the new MCP server"
echo "2. Use mcp__engram__ tools for memory operations"
echo "3. See ~/.claude/skills/Engram/SKILL.md for usage examples"
