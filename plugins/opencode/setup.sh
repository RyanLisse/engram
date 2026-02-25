#!/usr/bin/env bash
#
# Engram for OpenCode CLI — Automated Setup
#
# This script:
# 1. Builds the MCP server
# 2. Installs OpenCode lifecycle bridge plugin in .opencode/plugins
# 3. Attempts MCP registration (if OpenCode CLI supports it)
# 4. Prints project config snippets for OpenCode-compatible setups
#
# Usage:
#   ./setup.sh
#   CONVEX_URL=... ENGRAM_AGENT_ID=opencode ./setup.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() { echo -e "\n${BLUE}═══════════════════════════════════════════════════${NC}\n${BLUE}  $1${NC}\n${BLUE}═══════════════════════════════════════════════════${NC}\n"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error()   { echo -e "${RED}✗ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_info()    { echo -e "${BLUE}ℹ $1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGRAM_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MCP_SERVER_DIR="$ENGRAM_ROOT/mcp-server"
OPENCODE_PLUGIN_DIR="$ENGRAM_ROOT/.opencode/plugins"
OPENCODE_PLUGIN_FILE="$OPENCODE_PLUGIN_DIR/engram-memory.ts"
PLUGIN_TEMPLATE="$ENGRAM_ROOT/plugins/opencode/opencode-plugin.template.ts"
ROUTER_SCRIPT="$ENGRAM_ROOT/plugins/opencode/hooks/router.sh"

print_header "Engram for OpenCode Setup"

print_info "Checking prerequisites..."
if ! command -v node &>/dev/null; then
  print_error "Node.js not found. Install Node.js 18+ first."
  exit 1
fi
print_success "Node.js: $(node --version)"

if ! command -v opencode &>/dev/null; then
  print_warning "OpenCode CLI not found in PATH."
  print_info "Install OpenCode from: https://opencode.ai/docs/cli/"
  print_info "Continuing anyway — setup still prints ready-to-paste config."
fi

print_info "Building MCP server..."
cd "$MCP_SERVER_DIR"
[ ! -d "node_modules" ] && npm install --silent
[ ! -f "dist/index.js" ] && npm run build
print_success "MCP server built"

if [ ! -f "$PLUGIN_TEMPLATE" ] || [ ! -f "$ROUTER_SCRIPT" ]; then
  print_error "OpenCode lifecycle bridge assets missing in plugins/opencode/"
  exit 1
fi

print_info "Installing OpenCode lifecycle bridge plugin..."
mkdir -p "$OPENCODE_PLUGIN_DIR"
escaped_router=$(printf '%s' "$ROUTER_SCRIPT" | sed 's/[\/&]/\\&/g')
sed "s/__ENGRAM_ROUTER__/$escaped_router/g" "$PLUGIN_TEMPLATE" > "$OPENCODE_PLUGIN_FILE"
print_success "Installed lifecycle bridge plugin at .opencode/plugins/engram-memory.ts"

if [ -z "${CONVEX_URL:-}" ]; then
  for envfile in "$ENGRAM_ROOT/.env" "$MCP_SERVER_DIR/.env"; do
    if [ -f "$envfile" ]; then
      url=$(grep -E '^CONVEX_URL=' "$envfile" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
      if [ -n "$url" ]; then
        CONVEX_URL="$url"
        print_success "Found CONVEX_URL in $envfile"
        break
      fi
    fi
  done
fi

if [ -z "${CONVEX_URL:-}" ]; then
  echo ""
  read -rp "Enter your CONVEX_URL: " CONVEX_URL
fi

if [ -z "$CONVEX_URL" ]; then
  print_error "CONVEX_URL is required."
  exit 1
fi

AGENT_ID="${ENGRAM_AGENT_ID:-opencode}"

if command -v opencode &>/dev/null; then
  print_info "Attempting MCP registration via OpenCode CLI..."
  if opencode mcp add engram -- node "$ENGRAM_ROOT/mcp-server/dist/index.js" >/dev/null 2>&1; then
    print_success "Registered engram MCP server via 'opencode mcp add'"
  else
    print_warning "Could not auto-register MCP via OpenCode CLI."
    print_info "Using the manual config snippets below instead."
  fi
fi

MCP_JSON=$(cat <<EOF2
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["$ENGRAM_ROOT/mcp-server/dist/index.js"],
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
EOF2
)

OPENCODE_JSON=$(cat <<EOF2
{
  "\$schema": "https://opencode.ai/config.json",
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["$ENGRAM_ROOT/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "$CONVEX_URL",
        "ENGRAM_AGENT_ID": "$AGENT_ID",
        "COHERE_API_KEY": "${COHERE_API_KEY:-}"
      }
    }
  }
}
EOF2
)

print_header "Setup Complete"
echo -e "${GREEN}✓ MCP server built${NC}"
echo -e "${GREEN}✓ OpenCode lifecycle bridge installed${NC}"
echo ""
echo -e "${BLUE}Option A: Generic project .mcp.json${NC}"
echo "$MCP_JSON"
echo ""
echo -e "${BLUE}Option B: OpenCode project config (opencode.json)${NC}"
echo "$OPENCODE_JSON"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Add one of the config snippets above"
echo -e "  2. Restart OpenCode"
echo -e "  3. Test by calling: memory_health"
echo ""
print_success "Ready"
