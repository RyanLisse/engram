# Installation

Complete guide for setting up Engram from scratch.

## Prerequisites

- **Node.js** ≥ 18.x (for Convex and MCP server)
- **bun** ≥ 1.0 (optional, for faster builds)
- **npm** ≥ 9.x (alternative to bun)
- **Convex account** (free tier available at convex.dev)
- **Cohere API key** (optional, for best-quality embeddings)
- **Ollama** (optional, local fallback — `ollama pull mxbai-embed-large`)

## Quick Install

```bash
# Clone repository
git clone https://github.com/yourusername/engram.git
cd engram

# Install dependencies
npm install
cd mcp-server && npm install && cd ..

# Deploy Convex backend
npx convex dev  # First time: creates new project
# OR
npx convex deploy --prod  # For production deployment

# Build MCP server
cd mcp-server
npm run build
cd ..
```

## Configuration

### 1. Convex Environment Variables

Set these in your Convex dashboard (Settings → Environment Variables):

```bash
COHERE_API_KEY=your-cohere-api-key-here  # Optional but recommended
```

### 2. MCP Server Environment

Create `.env.local` in the project root (already gitignored):

```bash
CONVEX_URL=https://your-deployment.convex.cloud
ENGRAM_AGENT_ID=your-agent-name
COHERE_API_KEY=your-cohere-api-key  # Optional: best-quality embeddings
# Embedding fallback chain: Cohere → Ollama (mxbai-embed-large) → zero vector
# If Ollama is running locally, it will be used automatically when Cohere is unavailable
```

### 3. MCP Client Configuration

**For Claude Code** (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/absolute/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "your-agent-id"
      }
    }
  }
}
```

**For OpenClaw** (`.mcp.json`):

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "{{ agentId }}"
      }
    }
  }
}
```

## Verification

### Test MCP Server

```bash
./scripts/test-engram.sh
```

Expected output:
```
✅ Engram MCP server initialized successfully!
```

### Test Memory Storage

```bash
# In Claude Code or OpenClaw
mcp__engram__memory_store_fact({
  content: "Test fact for verification",
  source: "installation-test"
})
```

Expected: Returns `{ factId: "...", status: "stored" }`

### Test Memory Recall

```bash
mcp__engram__memory_recall({
  query: "test fact"
})
```

Expected: Returns the stored fact.

## Platform-Specific Setup

### macOS / Linux

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Add to PATH (optional)
echo 'export PATH="$PATH:/path/to/engram/scripts"' >> ~/.zshrc
source ~/.zshrc
```

### Windows (WSL recommended)

```bash
# Use WSL2 for best compatibility
wsl --install

# Then follow Linux instructions above
```

## Deployment Options

### Option 1: Personal (Recommended for Development)

```bash
npx convex dev
# Starts local dev deployment with hot reload
```

### Option 2: Production

```bash
npx convex deploy --prod
# Deploys to production Convex deployment
```

### Option 3: Team Deployment

```bash
# Configure team in convex.json
npx convex deploy --team your-team-name
```

## Troubleshooting

**"Command not found: convex"**
```bash
npm install -g convex
# OR
npx convex --version  # Uses npx
```

**"Module not found" errors**
```bash
# Regenerate Convex types
npx convex dev --once
# OR
npm run convex:codegen
```

**MCP server won't start**
```bash
# Check build output
cd mcp-server
npm run build
# Look for TypeScript errors
```

**Empty recall results**
- Verify agent has registered: `mcp__engram__memory_register_agent`
- Check scope permissions: Agent must have access to the scope where facts are stored
- Confirm Convex deployment is active

## Next Steps

- Read [GETTING-STARTED.md](./GETTING-STARTED.md) for usage patterns
- See [docs/setup/CLAUDE-CODE-SETUP.md](./setup/CLAUDE-CODE-SETUP.md) for Claude Code integration
- See [docs/setup/OPENCLAW-SETUP.md](./setup/OPENCLAW-SETUP.md) for OpenClaw integration
- Review [API-REFERENCE.md](./API-REFERENCE.md) for all available tools
