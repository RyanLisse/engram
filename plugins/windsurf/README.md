# Engram for Windsurf

Integrate Engram's multi-agent memory system into Windsurf IDE.

## Prerequisites

1. **Windsurf IDE** installed ([windsurf.ai](https://windsurf.ai))
2. **Engram MCP server** built:
   ```bash
   cd mcp-server && npm install && npm run build
   ```
3. **Environment variables** set:
   - `CONVEX_URL` — Your Convex deployment URL
   - `COHERE_API_KEY` — Cohere API key for embeddings (optional)

## Quick Setup (Automated)

```bash
# Run from the engram repository root
./plugins/windsurf/setup.sh
```

This will:
1. Build the MCP server if needed
2. Copy configuration to Windsurf's settings directory
3. Update your environment variables
4. Verify the installation

## Manual Setup

### 1. Build the MCP Server

```bash
cd mcp-server
npm install
npm run build
```

### 2. Configure Windsurf

Windsurf uses MCP server configuration in one of these locations:

**macOS/Linux:**
```bash
~/.codeium/windsurf/mcp_config.json
```

**Windows:**
```
%APPDATA%\Codeium\Windsurf\mcp_config.json
```

> **Note:** Windsurf is built on Codeium's infrastructure, so configuration files are stored in the `.codeium` directory.

Add the Engram server configuration:

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
      }
    }
  }
}
```

**Important:** Replace `/absolute/path/to/engram` with the actual path to your Engram repository.

### 3. Set Environment Variables

Add to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export CONVEX_URL="https://your-deployment.convex.cloud"
export COHERE_API_KEY="your-cohere-key"
export ENGRAM_AGENT_ID="windsurf"
```

Then reload:
```bash
source ~/.zshrc  # or ~/.bashrc
```

### 4. Restart Windsurf

Close and reopen Windsurf to load the new MCP server.

## Verification

1. Open Windsurf
2. Check the MCP server status in settings/preferences
3. Try a memory operation:
   - Ask Windsurf: "Store a fact: Engram is working in Windsurf"
   - Then: "Recall memories about Engram"

## Available Tools (69 Total)

Engram provides 69 memory tools organized into categories:

### Core Operations
- `memory_store_fact` — Store atomic facts with auto-enrichment
- `memory_recall` — Semantic search across memories
- `memory_search` — Full-text + structured search
- `memory_observe` — Passive observation recording
- `memory_link_entity` — Entity graph management
- `memory_get_context` — Token-aware context injection

### Agent Identity
- `memory_register_agent` — Register agent with capabilities
- `memory_get_agent_info` — Agent identity and scopes
- `memory_get_agent_context` — Full context for system prompt
- `memory_build_system_prompt` — Complete system prompt block

### Real-Time Events
- `memory_subscribe` — Subscribe to memory events
- `memory_poll_subscription` — Poll buffered events
- `memory_get_notifications` — Unread notifications
- `memory_mark_notifications_read` — Mark as read

### Memory Lifecycle
- `memory_update_fact` — Modify fact content/tags
- `memory_archive_fact` — Soft delete (recoverable)
- `memory_boost_relevance` — Boost importance score
- `memory_summarize` — Consolidate related facts
- `memory_prune` — Cleanup stale facts

### Configuration
- `memory_get_config` — Get system config value
- `memory_set_config` — Update system config
- `memory_list_configs` — List all configurations

### And 50+ more...

See [docs/API-REFERENCE.md](../../docs/API-REFERENCE.md) for complete reference.

## Usage Examples

### Store a Memory
```
User: Remember that I prefer TypeScript over JavaScript for all new projects.
Windsurf: [calls memory_store_fact with content="User prefers TypeScript..."]
```

### Recall Context
```
User: What do you know about my coding preferences?
Windsurf: [calls memory_recall with query="coding preferences"]
```

### Agent-to-Agent Sharing
```
User: Share my project architecture decisions with the team scope.
Windsurf: [calls memory_store_fact with scopeId="team-core"]
```

## Troubleshooting

### MCP Server Not Loading

1. **Check paths:** Ensure the `args` path points to the actual `index.js` location
2. **Build status:** Run `npm run build` in `mcp-server/`
3. **Logs:** Check Windsurf's developer console for errors
4. **Environment:** Verify `CONVEX_URL` and other env vars are set

### Connection Errors

```bash
# Test the MCP server directly
cd mcp-server
npm start

# Should output MCP server initialization messages
```

### Memory Operations Failing

1. **Convex deployment:** Ensure your Convex project is deployed
2. **API keys:** Verify `COHERE_API_KEY` is valid (if using embeddings)
3. **Agent ID:** Check `ENGRAM_AGENT_ID` is set and unique

## Advanced Configuration

### Custom Agent ID

Change `ENGRAM_AGENT_ID` to identify this Windsurf instance:

```json
{
  "mcpServers": {
    "engram": {
      "env": {
        "ENGRAM_AGENT_ID": "windsurf-macbook-pro"
      }
    }
  }
}
```

### Enable SSE Streaming

For real-time event streaming:

```json
{
  "mcpServers": {
    "engram": {
      "env": {
        "ENGRAM_SSE_PORT": "3456",
        "ENGRAM_SSE_WEBHOOKS": "true"
      }
    }
  }
}
```

### Multiple Agents

You can run multiple Engram-connected agents with different IDs:

```json
{
  "mcpServers": {
    "engram-main": {
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "ENGRAM_AGENT_ID": "windsurf-main"
      }
    },
    "engram-research": {
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "ENGRAM_AGENT_ID": "windsurf-research"
      }
    }
  }
}
```

## Integration with PAI (Personal AI Infrastructure)

If you're using PAI, Engram can integrate with your existing workflow:

1. **Shared memory:** All PAI agents see the same memories
2. **Cross-editor:** Memories created in Claude Code appear in Windsurf
3. **Persistent context:** Sessions survive editor restarts

See [PAI documentation](https://github.com/danielmiessler/PAI) for details.

## Support

- **Issues:** [github.com/your-username/engram/issues](https://github.com/your-username/engram/issues)
- **Discussions:** [github.com/your-username/engram/discussions](https://github.com/your-username/engram/discussions)
- **Documentation:** [Full API Reference](../../docs/API-REFERENCE.md)

## License

Same as parent Engram project.
