# Engram Setup for Cursor IDE

**Complete setup guide for integrating engram memory with Cursor IDE (2026).**

---

## Prerequisites

- Cursor IDE v0.4.5.9+ (MCP support shipped in this version)
- Node.js 18+
- Convex deployment
- Cohere API key (optional, for real embeddings)

**References:**
- [Cursor MCP Setup Guide](https://claudefa.st/blog/tools/mcp-extensions/cursor-mcp-setup)
- [Cursor Documentation](https://docs.cursor.com)

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

Cursor uses the same MCP configuration format as Claude Code.

**Option A: Global Configuration** (available across all projects)

Create or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/absolute/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "cursor-agent",
        "COHERE_API_KEY": "your-cohere-key"
      }
    }
  }
}
```

**Option B: Project-Specific Configuration** (only for current project)

Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["../../engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "cursor-agent",
        "COHERE_API_KEY": "your-cohere-key"
      }
    }
  }
}
```

**Replace:**
- Path with your engram installation location
- `your-deployment.convex.cloud` with your Convex URL
- `cursor-agent` with your desired agent identifier
- `your-cohere-key` with your Cohere API key (or omit for zero vectors)

### 3. Restart Cursor

Close and reopen Cursor for the configuration to take effect.

---

## Verification

### Test MCP Connection

1. Open Cursor
2. Open the AI assistant panel
3. Type: "List all available engram memory tools"
4. You should see 69 memory tools available

### Test Memory Operations

```
# Store a fact
"Store this in engram: Today I configured engram with Cursor IDE"

# Recall memories
"What do you remember about configuring engram?"
```

---

## Features Available in Cursor

All 69 engram memory tools are available:

- **Store & Recall** — `memory_store_fact`, `memory_recall`, `memory_search`
- **Entity Linking** — `memory_link_entity` for knowledge graphs
- **Agent Identity** — `memory_register_agent`, `memory_get_agent_context`
- **Session Management** — `memory_checkpoint`, `memory_wake`
- **Real-Time Events** — `memory_subscribe`, `memory_poll_events`
- **Configuration** — `memory_get_config`, `memory_set_config`
- **Vault Sync** — `memory_vault_sync`, `memory_query_vault`

Full API reference: `/docs/API-REFERENCE.md`

---

## Cursor-Specific Notes

### Dynamic Context Loading (Jan 2026 Update)

Cursor's January 2026 update improved multi-server handling. Tool descriptions are now loaded dynamically on demand instead of all at once, improving performance with large MCP servers like engram.

### Tool Usage

Tools appear as `memory_*` in the assistant interface. Cursor's AI will automatically choose the right tool based on your query.

### Multiple MCP Servers

You can run engram alongside other MCP servers. Cursor handles coordination automatically.

```json
{
  "mcpServers": {
    "engram": { ... },
    "github": { ... },
    "brave-search": { ... }
  }
}
```

---

## Hooks Integration (Optional)

Cursor does not currently support Claude Code-style hooks. For automated memory operations, use:

1. **Workspace scripts** — Add npm scripts that call engram tools
2. **Git hooks** — Use pre-commit/post-commit to trigger memory storage
3. **Task automation** — Use Task or Make to coordinate memory operations

Example `package.json` script:

```json
{
  "scripts": {
    "memory:store": "npx mcporter call engram.memory_store_fact"
  }
}
```

---

## Troubleshooting

### "MCP server not found"

**Check:**
1. Path to `index.js` is absolute and correct
2. MCP server was built (`npm run build` in mcp-server/)
3. `~/.cursor/mcp.json` has valid JSON (no trailing commas)

**Fix:**
```bash
cd /path/to/engram/mcp-server
npm run build
# Verify dist/index.js exists
ls dist/index.js
```

### "CONVEX_URL not set"

**Error:** Server starts but can't connect to Convex.

**Fix:** Add `CONVEX_URL` to the `env` block in mcp.json.

### Tools not appearing

**Check:**
1. Restart Cursor after config changes
2. Open AI assistant panel
3. Check Cursor's developer console (Help → Toggle Developer Tools)
4. Look for MCP connection errors in console

### "Rate limit exceeded"

**Cause:** More than 100 requests per minute.

**Fix:** Engram has built-in rate limiting (100 req/min). For higher limits, adjust `RATE_LIMIT_PER_MIN` in `mcp-server/src/index.ts`.

---

## Performance Tips

### Reduce Initial Load Time

Use project-specific config instead of global to only load engram when needed.

### Optimize Tool Selection

Cursor's dynamic context loading means all 69 tools won't slow down your editor. The AI loads tool descriptions on demand.

### Use Async Operations

Prefer `memory_observe` (fire-and-forget) over `memory_store_fact` in high-frequency operations.

---

## Configuration Examples

### Minimal Setup (Zero Embeddings)

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "cursor"
      }
    }
  }
}
```

### Full Setup (With Embeddings + SSE)

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "cursor",
        "COHERE_API_KEY": "your-cohere-key",
        "ENGRAM_SSE_PORT": "8787",
        "ENGRAM_API_KEY": "optional-auth-key"
      }
    }
  }
}
```

### Multi-Agent Setup

```json
{
  "mcpServers": {
    "engram-personal": {
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://personal.convex.cloud",
        "ENGRAM_AGENT_ID": "cursor-personal"
      }
    },
    "engram-work": {
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://work.convex.cloud",
        "ENGRAM_AGENT_ID": "cursor-work"
      }
    }
  }
}
```

---

## Next Steps

1. ✅ Install and configure engram
2. ✅ Test memory storage and recall
3. 📚 Read [Engram API Reference](/docs/API-REFERENCE.md)
4. 🎯 Set up scope-based access control for team memory
5. 📊 Monitor usage with `memory_get_activity_stats`
6. 🔄 Configure automated cron jobs for memory maintenance

---

## Documentation

- **API Reference:** `/docs/API-REFERENCE.md` (all 69 tools)
- **Current State:** `/docs/CURRENT-STATE.md` (accurate counts)
- **Hooks Strategy:** `/docs/HOOKS-AND-AUTOMATION-STRATEGY.md` (automation ideas)
- **Architecture:** [README.md](../../README.md)

---

## Support

- **Repository:** https://github.com/RyanLisse/engram
- **Issues:** https://github.com/RyanLisse/engram/issues
- **Cursor MCP Guide:** https://claudefa.st/blog/tools/mcp-extensions/cursor-mcp-setup

---

**Sources:**
- [Cursor MCP Servers Setup Guide](https://claudefa.st/blog/tools/mcp-extensions/cursor-mcp-setup)
- [Cursor MCP Configuration](https://docs.cursor.com)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)
