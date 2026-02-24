# Engram Windsurf Plugin

**Status:** ✅ Production Ready
**Version:** 1.0.0
**Last Updated:** 2026-02-15

## Overview

Complete Windsurf IDE integration for Engram's multi-agent memory system. Provides automated setup, configuration management, and full MCP server access (73 tools).

## Files

| File | Size | Purpose |
|------|------|---------|
| `README.md` | 6.5KB | Complete setup guide with troubleshooting |
| `setup.sh` | 5.4KB | Automated installation script |
| `windsurf_mcp_config.json` | 358B | MCP server configuration template |
| `PLUGIN.md` | This file | Plugin metadata and changelog |

## Quick Start

```bash
# From engram repository root
./plugins/windsurf/setup.sh
```

**Or manually:** See [README.md](README.md) for step-by-step instructions.

## Features

### Core Capabilities
- ✅ Full access to 73 memory tools
- ✅ Semantic search and recall
- ✅ Entity relationship graphs
- ✅ Real-time event subscriptions
- ✅ Cross-device synchronization
- ✅ Agent-to-agent memory sharing

### Setup Features
- ✅ Automated MCP server build
- ✅ Config file generation with absolute paths
- ✅ Environment variable validation
- ✅ Installation verification
- ✅ Clear error messages with solutions

### Configuration
- ✅ Respects `$CONVEX_URL` environment variable
- ✅ Respects `$COHERE_API_KEY` for embeddings
- ✅ Custom agent ID per instance
- ✅ Optional SSE streaming support

## Architecture

```
Windsurf IDE
    ↓ (stdio transport)
MCP Server (Node.js)
    ↓ (HTTP client)
Convex Cloud Backend
    ↓ (WebSocket sync)
All Devices
```

**Transport:** stdio (standard input/output)
**Protocol:** MCP (Model Context Protocol) v1.x
**Backend:** Convex cloud database with vector search
**Embeddings:** Cohere Embed 4 (1024-dim, multimodal)

## Requirements

- **Windsurf IDE** (any version with MCP support)
- **Node.js** 18+ (for MCP server runtime)
- **npm** (for dependency management)
- **Convex Account** (cloud backend, free tier available)
- **Cohere API Key** (optional, for real embeddings)

## Configuration Files

### User Config Location

**macOS/Linux:** `~/.windsurf/mcp_settings.json`
**Windows:** `%APPDATA%\Windsurf\mcp_settings.json`

### Template Format

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "${CONVEX_URL}",
        "ENGRAM_AGENT_ID": "windsurf",
        "COHERE_API_KEY": "${COHERE_API_KEY}"
      }
    }
  }
}
```

**Note:** `setup.sh` automatically replaces paths with your actual installation directory.

## Tool Categories (72 Total)

### Core (6 tools)
`memory_store_fact`, `memory_recall`, `memory_search`, `memory_observe`, `memory_link_entity`, `memory_get_context`

### Agent Identity (5 tools)
`memory_register_agent`, `memory_end_session`, `memory_get_agent_info`, `memory_get_agent_context`, `memory_build_system_prompt`

### Lifecycle (6 tools)
`memory_update_fact`, `memory_archive_fact`, `memory_boost_relevance`, `memory_list_stale_facts`, `memory_mark_facts_merged`, `memory_mark_facts_pruned`

### Real-Time Events (7 tools)
`memory_subscribe`, `memory_unsubscribe`, `memory_poll_subscription`, `memory_list_subscriptions`, `memory_poll_events`, `memory_get_notifications`, `memory_mark_notifications_read`

### Retrieval Primitives (11 tools)
`memory_vector_search`, `memory_text_search`, `memory_rank_candidates`, `memory_bump_access`, `memory_get_observations`, `memory_get_entities`, `memory_get_themes`, `memory_get_handoffs`, `memory_search_facts`, `memory_search_entities`, `memory_search_themes`

### Context Composition (7 tools)
`memory_resolve_scopes`, `memory_load_budgeted_facts`, `memory_search_daily_notes`, `memory_get_graph_neighbors`, `memory_get_activity_stats`, `memory_get_workspace_info`, `memory_get_system_prompt`

### Vault Operations (9 tools)
`memory_vault_sync`, `memory_vault_export`, `memory_vault_import`, `memory_vault_list_files`, `memory_vault_reconcile`, `memory_query_vault`, `memory_export_graph`, `memory_checkpoint`, `memory_wake`

### And more...

See [docs/API-REFERENCE.md](../../docs/API-REFERENCE.md) for complete reference with examples.

## Testing

### Verify Installation

1. **Start Windsurf** — MCP server should load automatically
2. **Check connection** — Look for "Engram" in MCP server status
3. **Test storage:**
   ```
   Ask Windsurf: "Store a fact: Engram plugin is working in Windsurf"
   ```
4. **Test recall:**
   ```
   Ask Windsurf: "Recall memories about Engram"
   ```

### Manual Testing

```bash
# Test MCP server directly
node mcp-server/dist/index.js

# Should output initialization messages without errors
```

### Common Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| "Memory tools not found" | MCP server not loaded | Check Windsurf MCP settings |
| "Connection failed" | Invalid `CONVEX_URL` | Verify environment variable |
| "Build errors" | Missing dependencies | Run `npm install` in `mcp-server/` |
| "Command not found" | Wrong path in config | Use absolute paths, not relative |

## Comparison with Claude Code

| Feature | Claude Code | Windsurf |
|---------|-------------|----------|
| Setup time | 2 minutes | 2 minutes |
| Tool count | 72 | 72 |
| Automation | 8 lifecycle hooks | Manual tool calls |
| Auto-recall | ✅ Every prompt | ❌ Manual |
| Session checkpoints | ✅ Auto | ✅ Manual |
| Desktop notifications | ✅ | ❌ |
| Real-time events | ✅ | ✅ |
| Performance | ~50-500ms/hook | <50ms/tool |

**Windsurf Advantage:** Explicit control over memory operations
**Claude Code Advantage:** Zero-config automation with hooks

## Performance

- **Tool call latency:** <50ms (local MCP server)
- **Vector search:** <200ms (Convex backend)
- **Fact storage:** <50ms (async enrichment)
- **Memory footprint:** ~50MB (Node.js + MCP server)
- **Startup time:** <1 second (MCP server initialization)

## Security

- **Local-first:** MCP server runs on your machine
- **Encrypted transport:** All Convex connections use TLS
- **API key isolation:** Environment variables never logged
- **Scope-based access:** Private/team/project/public isolation
- **No telemetry:** Zero tracking or analytics

## Changelog

### v1.0.0 (2026-02-15)
- ✅ Initial release
- ✅ Automated setup script with validation
- ✅ Complete documentation with troubleshooting
- ✅ MCP configuration template with absolute paths
- ✅ Environment variable detection and warnings
- ✅ Multi-OS support (macOS, Linux, Windows)

## Roadmap

### Planned Features
- 🔲 Windsurf-specific lifecycle hooks (if supported)
- 🔲 GUI configuration tool
- 🔲 One-click Convex deployment
- 🔲 Plugin marketplace listing

### Future Improvements
- 🔲 Auto-update mechanism
- 🔲 Built-in diagnostics dashboard
- 🔲 Interactive tutorial
- 🔲 Template library for common workflows

## Support

- **Documentation:** [README.md](README.md)
- **Issues:** [github.com/your-username/engram/issues](https://github.com/your-username/engram/issues)
- **Discussions:** [github.com/your-username/engram/discussions](https://github.com/your-username/engram/discussions)

## Contributing

Improvements welcome! See [docs/EDITOR-INTEGRATIONS.md](../../docs/EDITOR-INTEGRATIONS.md) for integration guidelines.

## License

Same as parent Engram project.
