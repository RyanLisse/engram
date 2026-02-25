# Editor Integrations

Engram provides first-class integration with multiple AI code editors through the Model Context Protocol (MCP).

## Supported Editors

| Editor | Status | Setup Time | Features | Documentation |
|--------|--------|------------|----------|---------------|
| **Claude Code** | ✅ Production | 2 min | Full automation with 8 lifecycle hooks | Built-in |
| **OpenCode** | ✅ Production | 2 min | MCP + lifecycle bridge plugin | [plugins/opencode/README.md](../plugins/opencode/README.md) |
| **Windsurf** | ✅ Production | 2 min | Full MCP server access (69 tools) | [plugins/windsurf/README.md](../plugins/windsurf/README.md) |
| **OpenClaw** | ✅ Production | 1 min | Native integration via tool registry | [skill/README.md](../skill/README.md) |
| **Cursor** | 🚧 Coming Soon | - | MCP server compatible | - |
| **Zed** | 🚧 Coming Soon | - | MCP server compatible | - |
| **Any MCP Client** | ✅ Compatible | 5 min | Standard MCP protocol | Manual config below |

## Quick Start by Editor

### Claude Code

**Automated Setup:**
```bash
cp plugins/claude-code/.mcp.json ~/.claude/settings.json
export ENGRAM_AGENT_ID="your-name"
```

**Features:**
- 8 lifecycle hooks (SessionStart, UserPromptSubmit, PostToolUse, etc.)
- Auto-recall memories on every prompt
- Passive observation recording
- Session checkpointing before compaction
- Desktop notifications for memory events

**Documentation:** Built into `.claude/settings.json`

### Windsurf

**Automated Setup:**
```bash
./plugins/windsurf/setup.sh
```

**Manual Setup:**
```bash
# 1. Build MCP server
cd mcp-server && npm install && npm run build

# 2. Add to ~/.codeium/windsurf/mcp_config.json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/absolute/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "windsurf",
        "COHERE_API_KEY": "your-key"
      }
    }
  }
}

# 3. Set environment variables
export CONVEX_URL="https://your-deployment.convex.cloud"
export COHERE_API_KEY="your-key"

# 4. Restart Windsurf
```

**Features:**
- Full access to 69 memory tools
- Semantic recall and search
- Agent-to-agent memory sharing
- Real-time event subscriptions
- Cross-device synchronization

**Documentation:** [plugins/windsurf/README.md](../plugins/windsurf/README.md)

### OpenClaw

**Setup:**
```bash
# Install the skill package
cd skill && ./install.sh
```

**Features:**
- Native TypeScript integration (no MCP overhead)
- Direct import of tool registry
- Optimized for OpenClaw's agent architecture
- Zero-config multi-agent coordination

**Documentation:** [skill/README.md](../skill/README.md)

### OpenCode

**Automated Setup:**
```bash
./plugins/opencode/setup.sh
```

**Features:**
- MCP registration attempt + fallback snippets
- Lifecycle bridge plugin installed to `.opencode/plugins/engram-memory.ts`
- Session/turn mapping into existing Engram automation scripts
- Fail-safe non-blocking hook routing

**Documentation:** [plugins/opencode/README.md](../plugins/opencode/README.md)

### Any MCP-Compatible Editor

**Generic Configuration:**

1. Build the MCP server:
   ```bash
   cd mcp-server && npm install && npm run build
   ```

2. Add to your editor's MCP settings:
   ```json
   {
     "mcpServers": {
       "engram": {
         "command": "node",
         "args": ["/absolute/path/to/engram/mcp-server/dist/index.js"],
         "env": {
           "CONVEX_URL": "https://your-deployment.convex.cloud",
           "ENGRAM_AGENT_ID": "your-editor-name",
           "COHERE_API_KEY": "your-cohere-key"
         }
       }
     }
   }
   ```

3. Restart your editor

## Environment Variables

All integrations require these environment variables:

| Variable | Required | Purpose | Example |
|----------|----------|---------|---------|
| `CONVEX_URL` | ✅ Yes | Convex deployment URL | `https://abc123.convex.cloud` |
| `ENGRAM_AGENT_ID` | ✅ Yes | Unique agent identifier | `windsurf-macbook-pro` |
| `COHERE_API_KEY` | ⚠️ Optional | Cohere API for embeddings | `abc123...` |
| `ENGRAM_SSE_PORT` | ⚠️ Optional | SSE server port | `3456` |
| `ENGRAM_SSE_WEBHOOKS` | ⚠️ Optional | Enable webhook endpoints | `true` |

**Without Cohere:** Engram falls back to mock embeddings (deterministic hashing). Semantic search still works but with reduced quality.

## Feature Comparison

| Feature | Claude Code | OpenCode | Windsurf | OpenClaw | Generic MCP |
|---------|-------------|----------|----------|----------|-------------|
| Memory store/recall | ✅ | ✅ | ✅ | ✅ | ✅ |
| Semantic search | ✅ | ✅ | ✅ | ✅ | ✅ |
| Entity graphs | ✅ | ✅ | ✅ | ✅ | ✅ |
| Real-time events | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lifecycle hooks | ✅ 8 hooks | ✅ Bridge | ❌ | ✅ Native | ❌ |
| Auto-recall | ✅ | ✅ (turn-start) | ❌ Manual | ✅ | ❌ |
| Session checkpoints | ✅ | ✅ (turn/session bridge) | ✅ | ✅ | ✅ |
| Desktop notifications | ✅ | ❌ | ❌ | ✅ | ❌ |
| Passive observation | ✅ Auto | ✅ via bridge | ✅ Manual | ✅ Auto | ✅ Manual |
| Tool count | 69 | 69 | 69 | 69 | 69 |
| Setup time | 2 min | 2 min | 2 min | 1 min | 5 min |

## Architecture Differences

### Claude Code (Hooks-Based)
- **Mechanism:** Shell scripts triggered by lifecycle events
- **Automation:** Fully automated (SessionStart, Stop, PreCompact, etc.)
- **Performance:** ~50-500ms per hook (async for heavy ops)
- **Best For:** Users who want zero-config "it just works" memory

### Windsurf (MCP-Only)
- **Mechanism:** Standard MCP server via stdio transport
- **Automation:** Manual tool calls by AI or user
- **Performance:** <50ms per tool call
- **Best For:** Users who want explicit control over memory operations

### OpenClaw (Native Integration)
- **Mechanism:** Direct TypeScript imports, no MCP
- **Automation:** Built into agent runtime
- **Performance:** <10ms (no transport overhead)
- **Best For:** OpenClaw users building custom agents

### OpenCode (Bridge Integration)
- **Mechanism:** OpenCode plugin events routed through `plugins/opencode/hooks/router.sh`
- **Automation:** Session + turn lifecycle mapped to existing Engram scripts
- **Performance:** Async by default; sync for shutdown-sensitive events
- **Best For:** OpenCode users wanting automation parity without duplicating logic

## Troubleshooting

### MCP Server Not Loading

**Symptoms:** Editor doesn't recognize `memory_*` tools

**Solutions:**
1. Verify build: `ls mcp-server/dist/index.js`
2. Check paths: Ensure `args` points to correct location
3. Check logs: Look for errors in editor console
4. Test manually: `node mcp-server/dist/index.js` (should start without errors)

### Connection Errors

**Symptoms:** "Failed to connect to Convex" errors

**Solutions:**
1. Verify `CONVEX_URL` is set and correct
2. Check network connectivity
3. Ensure Convex project is deployed
4. Test Convex directly: `curl $CONVEX_URL`

### Memory Operations Failing

**Symptoms:** Tools execute but don't store/recall properly

**Solutions:**
1. Check agent registration: `memory_get_agent_info`
2. Verify scope access: `memory_resolve_scopes`
3. Check embeddings: Set `COHERE_API_KEY` or accept mock mode
4. Review Convex logs in dashboard

### Performance Issues

**Symptoms:** Slow recall or search operations

**Solutions:**
1. Enable Cohere embeddings (much faster than mock)
2. Reduce `maxFacts` in `memory_get_context` calls
3. Use `memory_vector_search` for targeted queries
4. Check Convex function logs for bottlenecks

## Contributing New Integrations

Want to add support for a new editor? Follow these steps:

1. **Create plugin directory:** `plugins/your-editor/`
2. **Add config file:** Editor-specific MCP settings
3. **Write setup script:** Automated installation
4. **Document features:** README with setup and usage
5. **Test thoroughly:** Verify all 69 tools work
6. **Submit PR:** Include examples and troubleshooting

**Template:** See `plugins/windsurf/` as a reference implementation.

## Support

- **Issues:** [github.com/your-username/engram/issues](https://github.com/your-username/engram/issues)
- **Discussions:** [github.com/your-username/engram/discussions](https://github.com/your-username/engram/discussions)
- **Documentation:** [Full API Reference](API-REFERENCE.md)

## License

Same as parent Engram project.
