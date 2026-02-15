# Engram Setup for Zed Editor

**Complete setup guide for integrating engram memory with Zed Editor (2026).**

---

## Prerequisites

- Zed Editor (latest version with MCP support)
- Node.js 18+
- Convex deployment
- Cohere API key (optional, for real embeddings)

**References:**
- [Zed MCP Documentation](https://zed.dev/docs/ai/mcp)
- [Zed MCP Extensions](https://zed.dev/docs/extensions/mcp-extensions)

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

Zed uses **`context_servers`** (not `mcpServers`) in `settings.json`.

**Edit Zed settings:**

1. Open Zed
2. Go to: **Zed → Settings** (or press `Cmd+,`)
3. Add to `settings.json`:

```json
{
  "context_servers": {
    "engram": {
      "source": "custom",
      "command": "node",
      "args": ["/absolute/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "zed-agent",
        "COHERE_API_KEY": "your-cohere-key"
      }
    }
  }
}
```

**Replace:**
- `/absolute/path/to/engram` with your engram installation path
- `your-deployment.convex.cloud` with your Convex deployment URL
- `zed-agent` with your desired agent identifier
- `your-cohere-key` with your Cohere API key (or omit)

### 3. Restart Zed

Close and reopen Zed for the configuration to take effect.

---

## Verification

### Check Server Status

1. Open Zed
2. Open the **Agent Panel** (View → Agent Panel)
3. Go to the **Settings view**
4. Check the indicator dot next to "engram"
   - **Green dot** = Server is active ✅
   - **Red dot** = Server failed to start ❌
   - **Yellow dot** = Server is starting 🟡

### Test Memory Operations

```
# In Zed's agent panel:
"Store this in engram: Today I configured engram with Zed editor"

# Recall memories:
"What do you remember about configuring engram?"
```

---

## Zed-Specific Features

### Tool Naming Convention

Zed uses the format: **`mcp:<server>:<tool_name>`**

Examples:
- `mcp:engram:memory_store_fact`
- `mcp:engram:memory_recall`
- `mcp:engram:memory_get_agent_context`

### Dynamic Tool Reload

Zed handles the `notifications/tools/list_changed` notification from MCP servers. If engram adds, removes, or modifies tools at runtime, Zed automatically reloads the tool list without requiring a server restart.

### Tools and Prompts Support

Zed currently supports MCP's:
- ✅ **Tools** — All 69 engram memory tools
- ✅ **Prompts** — Custom prompt templates

Resources feature is not yet supported.

---

## Configuration Examples

### Minimal Setup (Zero Embeddings)

```json
{
  "context_servers": {
    "engram": {
      "source": "custom",
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "zed"
      }
    }
  }
}
```

### Full Setup (With Embeddings + SSE)

```json
{
  "context_servers": {
    "engram": {
      "source": "custom",
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "zed",
        "COHERE_API_KEY": "your-cohere-key",
        "ENGRAM_SSE_PORT": "8787",
        "ENGRAM_API_KEY": "optional-auth-key"
      }
    }
  }
}
```

### Multi-Server Configuration

```json
{
  "context_servers": {
    "engram": {
      "source": "custom",
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "zed"
      }
    },
    "github": {
      "source": "npm",
      "package": "@modelcontextprotocol/server-github",
      "env": {
        "GITHUB_TOKEN": "your-github-token"
      }
    }
  }
}
```

---

## Troubleshooting

### Red Indicator Dot

**Cause:** Server failed to start.

**Check:**
1. Path to `index.js` is absolute and correct
2. MCP server was built: `npm run build` in `mcp-server/`
3. Node.js is in PATH
4. Convex URL is valid

**Debug:**
```bash
# Test manually
cd /path/to/engram/mcp-server
node dist/index.js

# Should output:
# [engram-mcp] Starting Engram MCP Server...
```

### "CONVEX_URL not set"

**Error in logs:** `ERROR: CONVEX_URL environment variable is required`

**Fix:** Add to `env` block in settings.json:
```json
"env": {
  "CONVEX_URL": "https://your-deployment.convex.cloud"
}
```

### Tools Not Appearing

**Check:**
1. Server indicator is green
2. Restart Zed after config changes
3. Check Zed's console for errors (View → Debug → Console)

**Verify tools:**
Look for `mcp:engram:*` tools in the agent panel.

### Performance Issues

**Symptoms:** Slow tool responses, timeout errors.

**Check:**
- Convex deployment is responsive: `curl $CONVEX_URL/_system/metadata`
- Network connectivity
- Rate limits (100 req/min default)

**Optimize:**
- Use `memory_observe` for async operations
- Enable local caching
- Upgrade Convex plan if needed

---

## Advanced Configuration

### Custom Zed Extension

For tighter integration, create a Zed extension:

```
zed-extensions/engram/
  extension.toml
  src/
    engram.rs
```

See [Zed Extension Guide](https://zed.dev/docs/extensions/mcp-extensions) for details.

### Environment Variables

Load from `.env` file:

```json
{
  "context_servers": {
    "engram": {
      "source": "custom",
      "command": "bash",
      "args": [
        "-c",
        "source ~/.zshrc && node /path/to/engram/mcp-server/dist/index.js"
      ]
    }
  }
}
```

### Security: API Key Authentication

Enable optional authentication:

```json
"env": {
  "ENGRAM_API_KEY": "secure-key-here",
  "ENGRAM_CLIENT_KEY": "secure-key-here"
}
```

Engram validates: `ENGRAM_CLIENT_KEY === ENGRAM_API_KEY`

---

## Features Available

All 69 engram memory tools work in Zed:

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
2. ✅ Verify green indicator in Agent Panel
3. ✅ Test memory storage and recall
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
- **Zed MCP Docs:** https://zed.dev/docs/ai/mcp
- **Zed Extensions:** https://zed.dev/docs/extensions/mcp-extensions

---

**Sources:**
- [Zed Model Context Protocol Documentation](https://zed.dev/docs/ai/mcp)
- [Zed MCP Server Extensions](https://zed.dev/docs/extensions/mcp-extensions)
- [The Context Outside the Code — Zed Blog](https://zed.dev/blog/mcp)
