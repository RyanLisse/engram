#!/bin/bash
set -e

echo "Installing Engram MCP Server..."

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Node.js is required"; exit 1; }

# Install dependencies
cd "$(dirname "$0")/../mcp-server"
npm install

# Build
npm run build

echo "Engram MCP Server installed successfully!"
echo ""
echo "Add to your Claude Code MCP settings:"
echo "  command: node"
echo "  args: [\"$(pwd)/dist/index.js\"]"
echo "  env: CONVEX_URL, ENGRAM_AGENT_ID, COHERE_API_KEY"
