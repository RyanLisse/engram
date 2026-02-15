# Engram Multi-Platform Setup Guide

**Complete reference for integrating engram memory across all supported IDEs and AI platforms.**

---

## Supported Platforms (8 Total)

| Platform | Config File | Format | Hook Support | Status |
|----------|-------------|--------|--------------|--------|
| **Claude Code** | `~/.claude/mcp.json` | `mcpServers` | ✅ Full (8 events) | Production |
| **Cursor IDE** | `~/.cursor/mcp.json` | `mcpServers` | ❌ Not yet | Production |
| **Windsurf IDE** | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | ❌ Not yet | Production |
| **Zed Editor** | Zed `settings.json` | `context_servers` | ❌ Not yet | Production |
| **OpenAI Codex** | `~/.codex/config.toml` | `[mcp_servers.*]` | 🔄 Via Agents SDK | Production |
| **Google Gemini** | Gemini CLI config | FastMCP | 🔄 Via FastMCP | Production |
| **Factory Droid** | `/mcp` command | Interactive UI | 🔄 Via hooks | Production |
| **OpenCode** | `opencode.json` | `mcp` object | ❌ Not yet | Production |

---

## Quick Start by Platform

### Claude Code
```bash
# Config: ~/.claude/mcp.json
cp .claude/settings.json.example .claude/settings.json
export ENGRAM_AGENT_ID="claude-code"
claude
```
📚 [Full Setup Guide](./CLAUDE-CODE-SETUP.md)

### Cursor IDE
```bash
# Config: ~/.cursor/mcp.json or .cursor/mcp.json
echo '{"mcpServers":{"engram":{...}}}' > ~/.cursor/mcp.json
# Restart Cursor
```
📚 [Full Setup Guide](./CURSOR-IDE-SETUP.md)

### Windsurf IDE
```bash
# Config: ~/.codeium/windsurf/mcp_config.json
# Or use MCP Marketplace UI in Cascade panel
```
⚠️ **100-tool limit** - Select priority tools
📚 [Full Setup Guide](./WINDSURF-IDE-SETUP.md)

### Zed Editor
```json
// Zed settings.json
{"context_servers": {"engram": {...}}}
```
📚 [Full Setup Guide](./ZED-EDITOR-SETUP.md)

### OpenAI Codex
```bash
# Run MCP server
codex mcp add engram node /path/to/engram/mcp-server/dist/index.js
codex mcp-server
```
📚 [Full Setup Guide](./CODEX-SETUP.md)

### Google Gemini
```bash
# Install via FastMCP
fastmcp install gemini-cli
# Configure in gemini config
```
📚 [Full Setup Guide](./GEMINI-SETUP.md)

### Factory Droid
```
# Interactive UI
/mcp
> Add from Registry
> Or add custom server
```
📚 [Full Setup Guide](./FACTORY-DROID-SETUP.md)

### OpenCode
```json
// opencode.json
{"mcp": {"engram": {"type": "local", ...}}}
```
📚 [Full Setup Guide](./OPENCODE-SETUP.md)

---

## Common Configuration Template

**Environment Variables (All Platforms):**
```bash
export CONVEX_URL="https://your-deployment.convex.cloud"
export ENGRAM_AGENT_ID="platform-name"
export COHERE_API_KEY="your-cohere-key"  # Optional
export ENGRAM_SSE_PORT="8787"            # Optional (real-time)
```

See also: [Shared Agent ID Pattern](./SHARED-AGENT-ID-PATTERN.md)

**MCP Server Command (Most Platforms):**
```json
{
  "command": "node",
  "args": ["/absolute/path/to/engram/mcp-server/dist/index.js"],
  "env": {
    "CONVEX_URL": "...",
    "ENGRAM_AGENT_ID": "..."
  }
}
```

---

## Feature Comparison

| Feature | Claude Code | Cursor | Windsurf | Zed | Codex | Gemini | Factory | OpenCode |
|---------|-------------|--------|----------|-----|-------|--------|---------|----------|
| **Tool Count** | 69 | 69 | 69 (limit 100) | 69 | 69 | 69 | 69 | 69 |
| **Hooks/Automation** | ✅ 8 events | ❌ | ❌ | ❌ | 🔄 SDK | 🔄 FastMCP | 🔄 Droid | ❌ |
| **Real-Time Events** | ✅ SSE | ✅ SSE | ✅ SSE | ✅ SSE | ✅ SSE | ✅ SSE | ✅ HTTP | ✅ SSE |
| **OAuth Support** | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Dynamic Reload** | ✅ | ✅ (2026) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Multi-Server** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Status Indicator** | ❌ | ❌ | ✅ Green/Red | ✅ Dot | ❌ | ❌ | ✅ | ❌ |

---

## Installation Prerequisites (All Platforms)

```bash
# 1. Install Engram
git clone https://github.com/RyanLisse/engram.git
cd engram
npm install

# 2. Build MCP Server
cd mcp-server
npm install
npm run build
cd ..

# 3. Deploy Convex
npx convex dev

# 4. Set Environment Variables
export CONVEX_URL="https://your-deployment.convex.cloud"
export ENGRAM_AGENT_ID="platform-name"
export COHERE_API_KEY="your-cohere-key"

# 5. Verify
node mcp-server/dist/index.js
# Should output: [engram-mcp] Starting Engram MCP Server...
```

---

## Platform-Specific Notes

### Claude Code
- **Best integration** - Full hook support (8 lifecycle events)
- Auto-context loading, memory recall, session checkpointing
- Setup: `cp .claude/settings.json.example .claude/settings.json`

### Cursor
- Same config format as Claude Code
- Dynamic context loading (Jan 2026 update)
- No hooks yet - use workspace scripts

### Windsurf
- **Tool limit: 100** across all MCP servers
- MCP Marketplace UI for easy setup
- OAuth support for enterprise
- Toggle tools on/off per server

### Zed
- Uses `context_servers` (not `mcpServers`)
- Tool format: `mcp:engram:tool_name`
- Green/red indicator for server status
- Dynamic tool reload without restart

### OpenAI Codex
- CLI-based management
- Agents SDK for workflow orchestration
- MCP server via `codex mcp-server`
- TOML config format

### Google Gemini
- FastMCP integration
- Managed Google Cloud MCP servers
- Maps, BigQuery, Cloud Run support coming
- Install via `fastmcp install gemini-cli`

### Factory Droid
- Interactive `/mcp` command
- 40+ pre-configured servers in registry
- HTTP and stdio support
- OAuth browser prompts

### OpenCode
- `opencode.json` configuration
- Local and remote server types
- CLI commands: `opencode mcp list`, `opencode mcp auth`
- Absolute paths required for local servers

---

## Troubleshooting by Platform

### Common Issues

**"MCP server not found"**
- Check absolute path to `index.js`
- Verify `npm run build` completed
- Check Node.js is in PATH

**"CONVEX_URL not set"**
- Add to `env` block in config
- Or export globally: `export CONVEX_URL="..."`

**"Rate limit exceeded"**
- Default: 100 requests/minute
- Adjust in `mcp-server/src/index.ts`

### Platform-Specific

| Platform | Issue | Solution |
|----------|-------|----------|
| **Cursor** | Tools not appearing after config | Restart Cursor, check developer console |
| **Windsurf** | Hit 100-tool limit | Disable unused tools in MCP settings |
| **Zed** | Red indicator dot | Check path, verify build, test manually |
| **Codex** | MCP server won't start | Check config.toml syntax, run `codex mcp list` |
| **Gemini** | FastMCP not found | Install: `pip install fastmcp` |
| **Factory** | OAuth prompt not appearing | Check browser isn't blocking popups |
| **OpenCode** | Relative path error | Use absolute paths in config |

---

## Hooks and Automation

| Platform | Hook Support | Workaround |
|----------|--------------|------------|
| **Claude Code** | ✅ Full (8 events) | Native support |
| **Cursor** | ❌ Not yet | Use workspace scripts + git hooks |
| **Windsurf** | ❌ Not yet | Use workspace scripts + git hooks |
| **Zed** | ❌ Not yet | Use workspace scripts + git hooks |
| **Codex** | 🔄 Via Agents SDK | Use OpenAI Agents SDK workflows |
| **Gemini** | 🔄 Via FastMCP | Use FastMCP lifecycle hooks |
| **Factory** | 🔄 Via Droid hooks | Use `/mcp` interactive commands |
| **OpenCode** | ❌ Not yet | Use CLI scripts |

**Workaround for platforms without hooks:**

```json
// package.json
{
  "scripts": {
    "engram:store": "npx mcporter call engram.memory_store_fact",
    "engram:recall": "npx mcporter call engram.memory_recall",
    "engram:checkpoint": "npx mcporter call engram.memory_checkpoint"
  }
}
```

**Git hooks (all platforms):**
```bash
# .git/hooks/post-commit
#!/bin/bash
npx mcporter call engram.memory_observe observation="Committed changes"
```

---

## Next Steps

1. ✅ Choose your platform(s)
2. ✅ Follow platform-specific setup guide
3. ✅ Verify engram tools are available
4. 📚 Read [API Reference](/docs/API-REFERENCE.md)
5. 🎯 Register agent: `memory_register_agent`
6. 🔄 Set up scopes for team/project memory
7. 📊 Monitor with `memory_get_activity_stats`

---

## Documentation

- **API Reference:** `/docs/API-REFERENCE.md` (all 69 tools)
- **Current State:** `/docs/CURRENT-STATE.md` (accurate counts)
- **Hooks Strategy:** `/docs/HOOKS-AND-AUTOMATION-STRATEGY.md`
- **Platform Guides:** `/docs/setup/` directory

---

## Support

- **Repository:** https://github.com/RyanLisse/engram
- **Issues:** https://github.com/RyanLisse/engram/issues
- **MCP Spec:** https://modelcontextprotocol.io

---

**Last Updated:** 2026-02-15
