# Engram Setup for Factory Droid

**Complete setup guide for integrating engram memory with Factory Droid (2026).**

---

## Prerequisites

- Factory Droid account
- Node.js 18+
- Convex deployment
- Cohere API key (optional, for real embeddings)

**References:**
- [Factory Droid Documentation](https://factory.bot)
- [Factory Droid MCP Registry](https://factory.bot/mcp)

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

Factory Droid uses an interactive UI for MCP server configuration.

**Method A: Add from Registry (Recommended)**

1. Open Factory Droid
2. Type `/mcp` in the chat
3. Select **"Add from Registry"**
4. Search for "engram"
5. Click **"Install"**

**Method B: Add Custom Server**

1. Open Factory Droid
2. Type `/mcp` in the chat
3. Select **"Add Custom Server"**
4. Fill in the configuration:

```json
{
  "name": "engram",
  "command": "node",
  "args": ["/absolute/path/to/engram/mcp-server/dist/index.js"],
  "env": {
    "CONVEX_URL": "https://your-deployment.convex.cloud",
    "ENGRAM_AGENT_ID": "factory-droid",
    "COHERE_API_KEY": "your-cohere-key"
  },
  "type": "stdio"
}
```

5. Click **"Add Server"**

**Replace:**
- Path with your engram installation location
- `your-deployment.convex.cloud` with your Convex URL
- `factory-droid` with your desired agent identifier
- `your-cohere-key` with your Cohere API key (or omit)

---

## Verification

### Test MCP Connection

1. Type `/mcp` in Factory Droid
2. Select **"List Servers"**
3. You should see "engram" with a green status indicator

### Test Memory Operations

```
# In Factory Droid chat:
"Store this in engram: Today I configured engram with Factory Droid"

# Then:
"What do you remember about configuring engram?"
```

---

## Factory Droid-Specific Features

### Interactive MCP Management

Factory Droid provides a full UI for MCP operations:

- **`/mcp`** — Open MCP management panel
- **`/mcp list`** — List all configured servers
- **`/mcp status <name>`** — Check server status
- **`/mcp tools <name>`** — List available tools for a server
- **`/mcp remove <name>`** — Remove a server

### OAuth Integration

Factory Droid supports OAuth for MCP servers requiring authentication:

1. Add server with OAuth config
2. Factory Droid will prompt for authorization
3. Browser window opens for OAuth flow
4. Tokens are securely stored

```json
{
  "name": "engram",
  "command": "node",
  "args": ["/path/to/engram/mcp-server/dist/index.js"],
  "oauth": {
    "provider": "custom",
    "clientId": "your-client-id",
    "scopes": ["memory.read", "memory.write"]
  }
}
```

### Workflow Automation

Factory Droid supports workflow hooks for memory automation:

```yaml
# .factory/workflows/memory-capture.yaml
name: memory-capture
on:
  - message_sent
steps:
  - name: store-context
    mcp:
      server: engram
      tool: memory_observe
      args:
        observation: "{{message.content}}"
        scopeId: "private-factory-droid"
```

### Multi-Server Coordination

Factory Droid can coordinate multiple MCP servers:

```json
{
  "servers": [
    {
      "name": "engram",
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"]
    },
    {
      "name": "github",
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"]
    },
    {
      "name": "brave-search",
      "command": "npx",
      "args": ["@modelcontextprotocol/server-brave-search"]
    }
  ]
}
```

---

## Configuration Examples

### Minimal Setup (Zero Embeddings)

```json
{
  "name": "engram",
  "command": "node",
  "args": ["/path/to/engram/mcp-server/dist/index.js"],
  "env": {
    "CONVEX_URL": "https://your-deployment.convex.cloud",
    "ENGRAM_AGENT_ID": "factory-droid"
  },
  "type": "stdio"
}
```

### Full Setup (With Embeddings + SSE)

```json
{
  "name": "engram",
  "command": "node",
  "args": ["/path/to/engram/mcp-server/dist/index.js"],
  "env": {
    "CONVEX_URL": "https://your-deployment.convex.cloud",
    "ENGRAM_AGENT_ID": "factory-droid",
    "COHERE_API_KEY": "your-cohere-key",
    "ENGRAM_SSE_PORT": "8787",
    "ENGRAM_API_KEY": "optional-auth-key"
  },
  "type": "sse"
}
```

### Multi-Environment Setup

```json
{
  "servers": [
    {
      "name": "engram-dev",
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://dev.convex.cloud",
        "ENGRAM_AGENT_ID": "factory-droid-dev"
      }
    },
    {
      "name": "engram-prod",
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://prod.convex.cloud",
        "ENGRAM_AGENT_ID": "factory-droid-prod"
      }
    }
  ]
}
```

---

## Troubleshooting

### "Server not responding"

**Check:**
1. Path to `index.js` is absolute and correct
2. MCP server was built (`npm run build`)
3. Configuration JSON is valid

**Fix:**
```bash
cd /path/to/engram/mcp-server
npm run build
ls dist/index.js  # Verify exists
```

### "CONVEX_URL not set"

**Error:** Server starts but can't connect to Convex.

**Fix:** Add to `env` block in server configuration.

### Tools not appearing

**Check via `/mcp` command:**
- Type `/mcp status engram`
- Should show "running" with green indicator

**Fix:** Restart server:
- Type `/mcp remove engram`
- Re-add server with `/mcp` → "Add Custom Server"

### OAuth popup blocked

**Cause:** Browser blocking Factory Droid's OAuth window.

**Fix:**
1. Allow popups from factory.bot
2. Retry OAuth flow
3. Check browser console for errors

---

## Advanced Features

### Registry Submission

Submit engram to Factory Droid's public MCP registry:

1. Create `engram-mcp.yaml`:
```yaml
name: engram
description: Unified multi-agent memory system with 69 tools
author: RyanLisse
repository: https://github.com/RyanLisse/engram
command: node
args: ["{{install_path}}/mcp-server/dist/index.js"]
env:
  required:
    - CONVEX_URL
    - ENGRAM_AGENT_ID
  optional:
    - COHERE_API_KEY
    - ENGRAM_SSE_PORT
tools: 69
categories: ["memory", "knowledge-graph", "multi-agent"]
```

2. Submit via Factory Droid:
```
/mcp submit engram-mcp.yaml
```

### Webhook Integration

Factory Droid can push events to engram via webhooks:

```json
{
  "webhooks": [
    {
      "event": "message.created",
      "url": "http://localhost:8787/webhook/memory/observe",
      "method": "POST",
      "headers": {
        "Authorization": "Bearer {{ENGRAM_API_KEY}}"
      }
    }
  ]
}
```

### Environment Variables

Load from shell environment:

```json
{
  "name": "engram",
  "command": "bash",
  "args": [
    "-c",
    "source ~/.zshrc && node /path/to/engram/mcp-server/dist/index.js"
  ]
}
```

---

## Features Available

All 69 engram memory tools work with Factory Droid:

### Core Memory
- `memory_store_fact` — Store atomic facts
- `memory_recall` — Semantic search
- `memory_search` — Full-text + filters
- `memory_observe` — Fire-and-forget observations

### Agent Identity
- `memory_register_agent` — Register with capabilities
- `memory_get_agent_context` — Full identity context
- `memory_get_system_prompt` — System prompt block

### Session Management
- `memory_checkpoint` — Save session state
- `memory_wake` — Restore from checkpoint
- `memory_end_session` — Clean session handoff

### Knowledge Graph
- `memory_link_entity` — Create entities & relationships
- `memory_get_graph_neighbors` — Traverse connections

### Real-Time Events
- `memory_subscribe` — Subscribe to event streams
- `memory_poll_events` — Poll for new events
- `memory_get_notifications` — Agent notifications

### Configuration
- `memory_get_config` — Runtime config
- `memory_set_config` — Prompt-native tuning
- `memory_list_capabilities` — Tool introspection

Full API: `/docs/API-REFERENCE.md`

---

## Next Steps

1. ✅ Install and configure engram
2. ✅ Test via `/mcp` commands
3. ✅ Test memory operations in chat
4. 📚 Read [API Reference](/docs/API-REFERENCE.md)
5. 🎯 Register your agent: `memory_register_agent`
6. 🔄 Set up scope-based access control
7. 📊 Monitor with `memory_get_activity_stats`

---

## Documentation

- **API Reference:** `/docs/API-REFERENCE.md` (all 69 tools)
- **Current State:** `/docs/CURRENT-STATE.md`
- **Architecture:** [README.md](../../README.md)

---

## Support

- **Repository:** https://github.com/RyanLisse/engram
- **Issues:** https://github.com/RyanLisse/engram/issues
- **Factory Droid Docs:** https://factory.bot
- **MCP Registry:** https://factory.bot/mcp

---

**Sources:**
- [Factory Droid Documentation](https://factory.bot)
- [Factory Droid MCP Integration](https://factory.bot/mcp)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)
