#!/usr/bin/env bash
#
# Engram for Windsurf — Automated Setup
#
# This script:
# 1. Builds the MCP server
# 2. Configures Windsurf settings
# 3. Verifies installation
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Detect OS for config path
get_windsurf_config_path() {
    # Windsurf uses Codeium's infrastructure, so config is in .codeium directory
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "$HOME/.codeium/windsurf/mcp_config.json"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "$HOME/.codeium/windsurf/mcp_config.json"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
        echo "$APPDATA/Codeium/Windsurf/mcp_config.json"
    else
        print_error "Unsupported OS: $OSTYPE"
        exit 1
    fi
}

# Get absolute path to engram repo
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGRAM_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MCP_SERVER_DIR="$ENGRAM_ROOT/mcp-server"
WINDSURF_CONFIG_PATH="$(get_windsurf_config_path)"

print_header "Engram for Windsurf Setup"

# Step 1: Check prerequisites
print_info "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    print_error "Node.js not found. Please install Node.js 18+ first."
    exit 1
fi
print_success "Node.js found: $(node --version)"

if ! command -v npm &> /dev/null; then
    print_error "npm not found. Please install npm first."
    exit 1
fi
print_success "npm found: $(npm --version)"

# Step 2: Build MCP server
print_info "Building MCP server..."

cd "$MCP_SERVER_DIR"
if [ ! -d "node_modules" ]; then
    print_info "Installing dependencies..."
    npm install
fi

if [ ! -f "dist/index.js" ]; then
    print_info "Building TypeScript..."
    npm run build
fi
print_success "MCP server built successfully"

# Step 3: Check environment variables
print_info "Checking environment variables..."

if [ -z "$CONVEX_URL" ]; then
    print_warning "CONVEX_URL not set. You'll need to set this manually."
    echo -e "  ${YELLOW}Add to your ~/.zshrc or ~/.bashrc:${NC}"
    echo -e "  ${BLUE}export CONVEX_URL=\"https://your-deployment.convex.cloud\"${NC}"
else
    print_success "CONVEX_URL is set"
fi

if [ -z "$COHERE_API_KEY" ]; then
    print_warning "COHERE_API_KEY not set. Embeddings will use mock mode."
    echo -e "  ${YELLOW}Add to your ~/.zshrc or ~/.bashrc:${NC}"
    echo -e "  ${BLUE}export COHERE_API_KEY=\"your-cohere-key\"${NC}"
else
    print_success "COHERE_API_KEY is set"
fi

# Step 4: Create Windsurf config directory
WINDSURF_DIR="$(dirname "$WINDSURF_CONFIG_PATH")"
if [ ! -d "$WINDSURF_DIR" ]; then
    print_info "Creating Windsurf config directory: $WINDSURF_DIR"
    mkdir -p "$WINDSURF_DIR"
fi

# Step 5: Configure Windsurf
print_info "Configuring Windsurf MCP settings..."

# Generate config with actual paths
cat > "$WINDSURF_CONFIG_PATH" <<EOF
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["$ENGRAM_ROOT/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "\${CONVEX_URL}",
        "ENGRAM_AGENT_ID": "windsurf",
        "COHERE_API_KEY": "\${COHERE_API_KEY}",
        "ENGRAM_API_KEY": "",
        "ENGRAM_CLIENT_KEY": ""
      }
    }
  }
}
EOF

print_success "Windsurf config written to: $WINDSURF_CONFIG_PATH"

# Step 6: Verify installation
print_info "Verifying installation..."

if [ -f "$ENGRAM_ROOT/mcp-server/dist/index.js" ]; then
    print_success "MCP server binary found"
else
    print_error "MCP server binary not found"
    exit 1
fi

if [ -f "$WINDSURF_CONFIG_PATH" ]; then
    print_success "Windsurf config file created"
else
    print_error "Windsurf config file not created"
    exit 1
fi

# Step 7: Final instructions
print_header "Setup Complete!"

echo -e "${GREEN}✓ MCP server built${NC}"
echo -e "${GREEN}✓ Windsurf configured${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo -e "  1. ${YELLOW}Restart Windsurf${NC} to load the new MCP server"
echo ""
echo -e "  2. ${YELLOW}Set environment variables${NC} (if not already set):"
echo -e "     ${BLUE}export CONVEX_URL=\"https://your-deployment.convex.cloud\"${NC}"
echo -e "     ${BLUE}export COHERE_API_KEY=\"your-cohere-key\"${NC}"
echo ""
echo -e "  3. ${YELLOW}Test the integration${NC} in Windsurf:"
echo -e "     Ask: ${BLUE}\"Store a fact: Engram is working in Windsurf\"${NC}"
echo -e "     Then: ${BLUE}\"Recall memories about Engram\"${NC}"
echo ""
echo -e "${BLUE}Configuration file:${NC} $WINDSURF_CONFIG_PATH"
echo -e "${BLUE}MCP server location:${NC} $ENGRAM_ROOT/mcp-server/dist/index.js"
echo ""
echo -e "${BLUE}Available tools:${NC} 72 memory operations"
echo -e "${BLUE}Documentation:${NC} $ENGRAM_ROOT/docs/API-REFERENCE.md"
echo ""
print_success "Setup complete! Happy memory-making! 🐘"
