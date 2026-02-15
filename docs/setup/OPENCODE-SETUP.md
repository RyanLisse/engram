# Engram Setup for OpenCode

**Complete setup guide for integrating engram memory with OpenCode (2026).**

---

## Prerequisites

- OpenCode IDE
- Node.js 18+
- Convex deployment
- Cohere API key (optional, for real embeddings)

**References:**
- [OpenCode Documentation](https://opencode.dev)
- [OpenCode MCP Integration](https://opencode.dev/docs/mcp)

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

OpenCode uses `opencode.json` for MCP configuration.

**Create or edit `opencode.json` in your project root:**

```json
{
  "mcp": {
    "engram": {
      "type": "local",
      "command": "node",
      "args": ["/absolute/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "opencode-agent",
        "COHERE_API_KEY": "your-cohere-key"
      }
    }
  }
}
```

**Replace:**
- `/absolute/path/to/engram` with your engram installation path
- `your-deployment.convex.cloud` with your Convex deployment URL
- `opencode-agent` with your desired agent identifier
- `your-cohere-key` with your Cohere API key (or omit)

### 3. Restart OpenCode

Close and reopen OpenCode for the configuration to take effect.

---

## Verification

### Test MCP Connection

```bash
# List MCP servers
opencode mcp list

# Should show:
# engram (active)

# Test memory operations
opencode mcp call engram memory_store_fact \
  --content "Today I configured engram with OpenCode" \
  --factType "configuration"

# Recall memories
opencode mcp call engram memory_recall \
  --query "configuring engram" \
  --limit 5
```

### Test via IDE

1. Open OpenCode
2. Open the MCP panel (View → MCP Servers)
3. You should see "engram" with a green status indicator
4. Test in chat: "Store this in engram: Test memory from OpenCode"

---

## OpenCode-Specific Features

### CLI Commands

```bash
# Manage MCP servers
opencode mcp list                    # List all configured servers
opencode mcp status <name>           # Check server status
opencode mcp restart <name>          # Restart a server
opencode mcp logs <name>             # View server logs

# Call MCP tools directly
opencode mcp call <server> <tool> [args...]
opencode mcp tools <server>          # List available tools

# Authentication
opencode mcp auth <server>           # Authenticate with OAuth server
opencode mcp logout <server>         # Clear authentication
```

### Project-Specific Configuration

OpenCode supports both global and project-specific MCP configs:

**Global:** `~/.opencode/mcp.json` (available in all projects)
**Project:** `./opencode.json` (project-specific)

Project configs override global configs for the same server name.

### Server Types

OpenCode supports three server types:

```json
{
  "mcp": {
    "engram-local": {
      "type": "local",
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"]
    },
    "engram-remote": {
      "type": "remote",
      "url": "https://engram.your-domain.com/mcp"
    },
    "engram-docker": {
      "type": "docker",
      "image": "engram/mcp-server:latest",
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud"
      }
    }
  }
}
```

### Workspace Integration

OpenCode can trigger MCP tools from workspace events:

```json
{
  "workspace": {
    "events": {
      "onSave": [
        {
          "mcp": "engram",
          "tool": "memory_observe",
          "args": {
            "observation": "File saved: {{file.path}}",
            "scopeId": "private-opencode"
          }
        }
      ],
      "onGitCommit": [
        {
          "mcp": "engram",
          "tool": "memory_store_fact",
          "args": {
            "content": "Committed: {{commit.message}}",
            "factType": "version_control"
          }
        }
      ]
    }
  }
}
```

---

## Configuration Examples

### Minimal Setup (Zero Embeddings)

```json
{
  "mcp": {
    "engram": {
      "type": "local",
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "opencode"
      }
    }
  }
}
```

### Full Setup (With Embeddings + SSE)

```json
{
  "mcp": {
    "engram": {
      "type": "local",
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "opencode",
        "COHERE_API_KEY": "your-cohere-key",
        "ENGRAM_SSE_PORT": "8787",
        "ENGRAM_API_KEY": "optional-auth-key"
      }
    }
  }
}
```

### Remote Server Setup

```json
{
  "mcp": {
    "engram": {
      "type": "remote",
      "url": "https://engram.your-domain.com/mcp",
      "auth": {
        "type": "bearer",
        "token": "${ENGRAM_AUTH_TOKEN}"
      }
    }
  }
}
```

### Multi-Environment Setup

```json
{
  "mcp": {
    "engram-dev": {
      "type": "local",
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://dev.convex.cloud",
        "ENGRAM_AGENT_ID": "opencode-dev"
      }
    },
    "engram-prod": {
      "type": "local",
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://prod.convex.cloud",
        "ENGRAM_AGENT_ID": "opencode-prod"
      }
    }
  }
}
```

---

## Troubleshooting

### "Server failed to start"

**Check:**
1. Path to `index.js` is absolute (not relative)
2. MCP server was built (`npm run build`)
3. Node.js is in PATH
4. `opencode.json` has valid JSON syntax

**Debug:**
```bash
# Test manually
cd /path/to/engram/mcp-server
node dist/index.js

# Should output:
# [engram-mcp] Starting Engram MCP Server...

# Check OpenCode logs
opencode mcp logs engram
```

### "CONVEX_URL not set"

**Error:** Server starts but can't connect to Convex.

**Fix:** Add to `env` block in opencode.json.

### Tools not appearing

**Check:**
```bash
opencode mcp status engram  # Should show "active"
opencode mcp tools engram   # Should list all 69 tools
```

**Fix:** Restart server:
```bash
opencode mcp restart engram
```

### "Relative path error"

**Error:** `Error: MCP server paths must be absolute`

**Fix:** Use absolute paths in opencode.json:
```json
"args": ["/absolute/path/to/engram/mcp-server/dist/index.js"]
```

**Not:** `"args": ["./mcp-server/dist/index.js"]`

### "Rate limit exceeded"

**Cause:** More than 100 requests per minute.

**Fix:** Adjust rate limit in `mcp-server/src/index.ts` or use `memory_observe` (fire-and-forget).

---

## Advanced Features

### Docker Deployment

Run engram MCP server in Docker:

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY mcp-server/package*.json ./
RUN npm install
COPY mcp-server/ ./
RUN npm run build
ENV PORT=8080
CMD ["node", "dist/index.js"]
```

**opencode.json:**
```json
{
  "mcp": {
    "engram": {
      "type": "docker",
      "image": "engram-mcp:latest",
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "opencode"
      }
    }
  }
}
```

### OAuth Authentication

For remote engram servers with OAuth:

```json
{
  "mcp": {
    "engram": {
      "type": "remote",
      "url": "https://engram.your-domain.com/mcp",
      "auth": {
        "type": "oauth",
        "provider": "custom",
        "clientId": "your-client-id",
        "scopes": ["memory.read", "memory.write"]
      }
    }
  }
}
```

Authenticate via CLI:
```bash
opencode mcp auth engram
```

### Environment Variables

Load from shell environment:

```json
{
  "mcp": {
    "engram": {
      "type": "local",
      "command": "bash",
      "args": [
        "-c",
        "source ~/.zshrc && node /path/to/engram/mcp-server/dist/index.js"
      ]
    }
  }
}
```

Or reference in config:
```json
{
  "env": {
    "CONVEX_URL": "${CONVEX_URL}",
    "COHERE_API_KEY": "${COHERE_API_KEY}"
  }
}
```

---

## Features Available

All 69 engram memory tools work with OpenCode:

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
2. ✅ Test via CLI: `opencode mcp call engram ...`
3. ✅ Test in IDE MCP panel
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
- **OpenCode Docs:** https://opencode.dev
- **OpenCode MCP:** https://opencode.dev/docs/mcp

---

**Sources:**
- [OpenCode Documentation](https://opencode.dev)
- [OpenCode MCP Integration](https://opencode.dev/docs/mcp)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)
