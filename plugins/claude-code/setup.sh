#!/usr/bin/env bash
# Setup Engram MCP server for Claude Code
#
# Usage:
#   ./setup.sh                        # Interactive prompts
#   CONVEX_URL=... ./setup.sh         # Non-interactive

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🧠 Engram — Claude Code Plugin Setup"
echo ""

# 1. Build MCP server if needed
if [ ! -f "$ROOT_DIR/mcp-server/dist/index.js" ]; then
  echo "Building MCP server..."
  cd "$ROOT_DIR/mcp-server"
  npm install --silent
  npm run build
  echo "✓ MCP server built"
else
  echo "✓ MCP server already built"
fi

# 2. Resolve CONVEX_URL
if [ -z "${CONVEX_URL:-}" ]; then
  # Try to read from .env files
  for envfile in "$ROOT_DIR/.env" "$ROOT_DIR/mcp-server/.env"; do
    if [ -f "$envfile" ]; then
      url=$(grep -E '^CONVEX_URL=' "$envfile" | head -1 | cut -d= -f2-)
      if [ -n "$url" ]; then
        CONVEX_URL="$url"
        echo "✓ Found CONVEX_URL in $envfile"
        break
      fi
    fi
  done
fi

if [ -z "${CONVEX_URL:-}" ]; then
  echo ""
  read -rp "Enter your CONVEX_URL: " CONVEX_URL
fi

# 3. Agent ID
AGENT_ID="${ENGRAM_AGENT_ID:-claude-code}"

# 4. Generate .mcp.json for project
MCP_JSON=$(cat <<EOF
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["$ROOT_DIR/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "$CONVEX_URL",
        "ENGRAM_AGENT_ID": "$AGENT_ID",
        "COHERE_API_KEY": "${COHERE_API_KEY:-}",
        "ENGRAM_API_KEY": "",
        "ENGRAM_CLIENT_KEY": ""
      }
    }
  }
}
EOF
)

echo ""
echo "Generated .mcp.json:"
echo "$MCP_JSON"
echo ""
echo "To install, copy the above into your project's .mcp.json"
echo "or run: echo '$MCP_JSON' > /path/to/your/project/.mcp.json"
echo ""
echo "Then restart Claude Code. Verify with: memory_health"
