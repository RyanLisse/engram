#!/usr/bin/env bash
#
# Engram for Google Gemini CLI — Automated Setup
#
# This script:
# 1. Builds the MCP server
# 2. Configures Gemini CLI MCP settings
# 3. Verifies installation
#
# Usage:
#   ./setup.sh                        # Interactive
#   CONVEX_URL=... ./setup.sh         # Non-interactive

set -e

# Colors
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

print_header "Engram for Google Gemini CLI Setup"

# ── Prerequisites ─────────────────────────────────────
print_info "Checking prerequisites..."

if ! command -v node &>/dev/null; then
  print_error "Node.js not found. Install Node.js 18+ first."
  exit 1
fi
print_success "Node.js: $(node --version)"

if ! command -v gemini &>/dev/null; then
  print_warning "Gemini CLI not found. Install: npm install -g @anthropic-ai/gemini-cli"
  print_info "Or see: https://github.com/google-gemini/gemini-cli"
  print_info "Continuing anyway — you can install Gemini CLI later."
fi

# ── Build MCP Server ──────────────────────────────────
print_info "Building MCP server..."
cd "$MCP_SERVER_DIR"
[ ! -d "node_modules" ] && npm install --silent
[ ! -f "dist/index.js" ] && npm run build
print_success "MCP server built"

# ── Resolve CONVEX_URL ────────────────────────────────
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

AGENT_ID="${ENGRAM_AGENT_ID:-gemini}"

# ── Configure Gemini CLI ──────────────────────────────
print_info "Configuring Gemini CLI MCP..."

# Gemini CLI uses ~/.gemini/settings.json for MCP config
GEMINI_CONFIG_DIR="$HOME/.gemini"
GEMINI_SETTINGS="$GEMINI_CONFIG_DIR/settings.json"
mkdir -p "$GEMINI_CONFIG_DIR"

# Build the engram MCP entry
ENGRAM_ENTRY=$(cat <<EOF
{
  "command": "node",
  "args": ["$ENGRAM_ROOT/mcp-server/dist/index.js"],
  "env": {
    "CONVEX_URL": "$CONVEX_URL",
    "ENGRAM_AGENT_ID": "$AGENT_ID",
    "COHERE_API_KEY": "${COHERE_API_KEY:-}"
  }
}
EOF
)

if [ -f "$GEMINI_SETTINGS" ]; then
  # Check if file has content and is valid JSON
  if [ -s "$GEMINI_SETTINGS" ] && node -e "JSON.parse(require('fs').readFileSync('$GEMINI_SETTINGS','utf8'))" 2>/dev/null; then
    # Merge engram into existing settings using Node
    node -e "
      const fs = require('fs');
      const settings = JSON.parse(fs.readFileSync('$GEMINI_SETTINGS', 'utf8'));
      if (!settings.mcpServers) settings.mcpServers = {};
      settings.mcpServers.engram = $ENGRAM_ENTRY;
      fs.writeFileSync('$GEMINI_SETTINGS', JSON.stringify(settings, null, 2) + '\n');
    "
    print_success "Added engram to existing Gemini settings"
  else
    # File exists but empty/invalid — overwrite
    cat > "$GEMINI_SETTINGS" <<EOF
{
  "mcpServers": {
    "engram": $ENGRAM_ENTRY
  }
}
EOF
    print_success "Created new Gemini settings with engram"
  fi
else
  # Create new settings file
  cat > "$GEMINI_SETTINGS" <<EOF
{
  "mcpServers": {
    "engram": $ENGRAM_ENTRY
  }
}
EOF
  print_success "Created Gemini settings at: $GEMINI_SETTINGS"
fi

# ── Verify ────────────────────────────────────────────
print_info "Verifying installation..."

if [ -f "$ENGRAM_ROOT/mcp-server/dist/index.js" ]; then
  print_success "MCP server binary found"
else
  print_error "MCP server binary not found"
  exit 1
fi

if [ -f "$GEMINI_SETTINGS" ]; then
  print_success "Gemini settings file: $GEMINI_SETTINGS"
else
  print_error "Gemini settings file not created"
  exit 1
fi

# ── Summary ───────────────────────────────────────────
print_header "Setup Complete!"

echo -e "${GREEN}✓ MCP server built${NC}"
echo -e "${GREEN}✓ Gemini CLI configured${NC}"
echo ""
echo -e "${BLUE}Config written to:${NC} $GEMINI_SETTINGS"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo -e "  1. ${YELLOW}Restart Gemini CLI${NC} to pick up the new MCP server"
echo ""
echo -e "  2. ${YELLOW}Set environment variables${NC} (if not in config):"
echo -e "     ${BLUE}export CONVEX_URL=\"$CONVEX_URL\"${NC}"
echo -e "     ${BLUE}export COHERE_API_KEY=\"your-cohere-key\"${NC}"
echo ""
echo -e "  3. ${YELLOW}Test:${NC} gemini \"Store a fact: Engram works with Gemini\""
echo ""
echo -e "${BLUE}Available:${NC} 72 memory tools"
echo -e "${BLUE}Docs:${NC} $ENGRAM_ROOT/docs/API-REFERENCE.md"
echo ""
print_success "Ready! 🧠"
