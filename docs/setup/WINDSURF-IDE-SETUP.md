# Engram Setup for Windsurf IDE

**Complete setup guide for integrating engram memory with Windsurf IDE (2026).**

---

## Prerequisites

- Windsurf IDE (latest version)
- Node.js 18+
- Convex deployment
- Cohere API key (optional, for real embeddings)

**References:**
- [Windsurf MCP Documentation](https://docs.windsurf.com/windsurf/cascade/mcp)
- [Windsurf MCP Setup Tutorial](https://windsurf.com/university/tutorials/configuring-first-mcp-server)

---

## Installation

### 1. Install Engram

```bash
git clone https://github.com/RyanLisse/engram.git
cd engram
npm install

# Build MCP server
cd mcp-server
npm install
npm run build
cd ..

# Deploy Convex backend
npx convex dev
```

### 2. Configure MCP Server

Windsurf uses `mcp_config.json` for MCP configuration.

**Method A: Using MCP Marketplace (Recommended)**

1. Open Windsurf
2. Click the **MCP icon** in the top right menu of the Cascade panel
3. Or go to: **Windsurf Settings → Cascade → MCP Servers**
4. Click **"Add Custom MCP Server"**
5. Fill in the configuration:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/engram/mcp-server/dist/index.js"],
  "env": {
    "CONVEX_URL": "https://your-deployment.convex.cloud",
    "ENGRAM_AGENT_ID": "windsurf-agent",
    "COHERE_API_KEY": "your-cohere-key"
  }
}
```

**Method B: Manual Configuration**

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/absolute/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "windsurf",
        "COHERE_API_KEY": "your-cohere-key"
      },
      "transportType": "stdio"
    }
  }
}
```

**Replace:**
- Path with your engram installation location
- `your-deployment.convex.cloud` with your Convex URL
- `windsurf-agent` with your desired agent identifier
- `your-cohere-key` with your Cohere API key (or omit for zero vectors)

### 3. Restart Windsurf

Restart Windsurf or reload the MCP configuration for changes to take effect.

---

## Verification

### Test MCP Connection

1. Open Windsurf
2. Open Cascade (AI assistant panel)
3. Check the MCP status indicator (should be green if connected)
4. Type: "List all available engram memory tools"

### Test Memory Operations

```
# Store a fact
"Store this in engram: Today I configured engram with Windsurf IDE"

# Recall memories
"What do you remember about configuring engram?"
```

---

## Windsurf-Specific Features

### Tool Limit (100 Tools Max)

Cascade has a limit of **100 total tools** across all MCP servers. Engram provides 69 tools, leaving room for additional servers.

**To manage tools:**
1. Go to MCP settings page
2. Toggle specific tools on/off
3. Prioritize the tools you use most frequently

**Recommended engram tools to enable:**
- `memory_store_fact` (core storage)
- `memory_recall` (semantic search)
- `memory_get_agent_context` (session context)
- `memory_checkpoint` / `memory_wake` (session restore)
- `memory_link_entity` (knowledge graph)

### Transport Types

Windsurf supports three transport types:
- **stdio** (default, recommended for engram)
- **Streamable HTTP**
- **SSE** (Server-Sent Events)

For real-time features, enable SSE by adding `ENGRAM_SSE_PORT` to env.

### OAuth Support

Windsurf supports OAuth for MCP servers. Engram can use optional API key authentication:

```json
"env": {
  "ENGRAM_API_KEY": "your-auth-key",
  "ENGRAM_CLIENT_KEY": "matching-key"
}
```

### Enterprise Controls

**Team Admins:**
- Toggle MCP access for entire team
- Whitelist approved MCP servers
- Block non-whitelisted servers

**To whitelist engram:**
1. Go to Team Settings → MCP Servers
2. Add engram to whitelist
3. Users can now install engram from approved list

---

## Troubleshooting

### "MCP server not responding"

**Check:**
1. Path to `index.js` is absolute and correct
2. MCP server was built (`npm run build`)
3. `mcp_config.json` has valid JSON

**Fix:**
```bash
cd /path/to/engram/mcp-server
npm run build
ls dist/index.js  # Verify exists
```

### "CONVEX_URL not set"

Add to `env` block in `mcp_config.json`:
```json
"env": {
  "CONVEX_URL": "https://your-deployment.convex.cloud"
}
```

### Tools not appearing

**Possible causes:**
1. Hit 100-tool limit (disable other tools)
2. MCP server not started (check Cascade MCP status)
3. Configuration syntax error (validate JSON)

**Check MCP status:**
- Green indicator = connected
- Red indicator = error (check logs)
- Yellow indicator = loading

### "Tool execution failed"

**Check:**
- Convex deployment is accessible
- Environment variables are set correctly
- Rate limit not exceeded (100 req/min)

---

## Configuration Examples

### Minimal Setup

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "windsurf"
      },
      "transportType": "stdio"
    }
  }
}
```

### Full Setup (SSE + OAuth)

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "windsurf",
        "COHERE_API_KEY": "your-cohere-key",
        "ENGRAM_SSE_PORT": "8787",
        "ENGRAM_API_KEY": "your-auth-key",
        "ENGRAM_CLIENT_KEY": "matching-key"
      },
      "transportType": "sse"
    }
  }
}
```

### Multi-Environment Setup

```json
{
  "mcpServers": {
    "engram-dev": {
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://dev.convex.cloud",
        "ENGRAM_AGENT_ID": "windsurf-dev"
      }
    },
    "engram-prod": {
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://prod.convex.cloud",
        "ENGRAM_AGENT_ID": "windsurf-prod"
      }
    }
  }
}
```

---

## Tool Selection Strategy

With the 100-tool limit, prioritize engram tools based on your workflow:

### Core Memory (Always Enable)
- `memory_store_fact`
- `memory_recall`
- `memory_search`

### Agent Identity (Recommended)
- `memory_register_agent`
- `memory_get_agent_context`
- `memory_get_system_prompt`

### Session Management (High Value)
- `memory_checkpoint`
- `memory_wake`
- `memory_end_session`

### Knowledge Graph (Power Users)
- `memory_link_entity`
- `memory_get_graph_neighbors`

### Optional (Enable as Needed)
- `memory_vault_sync` (if using Obsidian)
- `memory_subscribe` (if using real-time features)
- `memory_prune` (for cleanup)

---

## Performance Tips

### Optimize Tool Count

Disable unused tools to stay under 100-tool limit:
1. Go to MCP settings
2. Toggle off rarely-used tools
3. Focus on core memory operations

### Use Async Operations

Prefer `memory_observe` for fire-and-forget operations to avoid blocking Cascade.

### Enable SSE for Real-Time

For live notifications and events, enable SSE transport:
```json
"transportType": "sse",
"env": {
  "ENGRAM_SSE_PORT": "8787"
}
```

---

## Next Steps

1. ✅ Install and configure engram
2. ✅ Test memory operations
3. 🎯 Select and enable priority tools (stay under 100)
4. 📚 Read [API Reference](/docs/API-REFERENCE.md)
5. 🔄 Set up team whitelist (if enterprise)
6. 📊 Monitor with `memory_get_activity_stats`

---

## Documentation

- **API Reference:** `/docs/API-REFERENCE.md` (all 69 tools)
- **Current State:** `/docs/CURRENT-STATE.md`
- **Tool Selection:** `/docs/HOOKS-AND-AUTOMATION-STRATEGY.md`

---

## Support

- **Repository:** https://github.com/RyanLisse/engram
- **Issues:** https://github.com/RyanLisse/engram/issues
- **Windsurf Docs:** https://docs.windsurf.com/windsurf/cascade/mcp
- **Windsurf University:** https://windsurf.com/university/tutorials/configuring-first-mcp-server

---

**Sources:**
- [Cascade MCP Integration](https://docs.windsurf.com/windsurf/cascade/mcp)
- [Windsurf MCP Tutorial](https://windsurf.com/university/tutorials/configuring-first-mcp-server)
- [Windsurf MCP Setup Guide (Natoma)](https://natoma.ai/blog/how-to-enabling-mcp-in-windsurf)
- [Windsurf MCP Complete Guide (BrainGrid)](https://www.braingrid.ai/blog/windsurf-mcp)
