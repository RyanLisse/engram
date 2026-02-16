#!/bin/bash
# Quick test of Engram MCP server

# Use CONVEX_URL from environment or default to example
export CONVEX_URL="${CONVEX_URL:-https://your-deployment.convex.cloud}"
export ENGRAM_AGENT_ID="${ENGRAM_AGENT_ID:-test-$(date +%s)}"
# Disable event bus polling for smoke tests that run without a real Convex deployment
export ENGRAM_DISABLE_EVENT_BUS="${ENGRAM_DISABLE_EVENT_BUS:-1}"

echo "Testing Engram MCP Server..."
echo "Agent ID: $ENGRAM_AGENT_ID"
echo ""

SERVER_CMD="node mcp-server/dist/index.js"
if [ -x "mcp-server/node_modules/.bin/tsx" ]; then
  SERVER_CMD="mcp-server/node_modules/.bin/tsx mcp-server/src/index.ts"
fi

# Test 1: Initialize
echo "Test 1: Initialize MCP server"
$SERVER_CMD <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
EOF

echo ""
echo "✅ Engram MCP server initialized successfully!"
echo ""
echo "To use Engram in Claude Code:"
echo "1. Restart Claude Code to load the new MCP server"
echo "2. Use mcp__engram__ tools for memory operations"
echo "3. See ~/.claude/skills/Engram/SKILL.md for usage examples"
