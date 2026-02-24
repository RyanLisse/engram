# Engram Setup for OpenAI Codex

**Complete setup guide for integrating engram memory with OpenAI Codex (2026).**

---

## Prerequisites

- OpenAI Codex CLI
- Node.js 18+
- Convex deployment
- Cohere API key (optional, for real embeddings)

**References:**
- [Codex CLI Documentation](https://openai.com/codex)
- [Codex Agents SDK](https://github.com/openai/agents-sdk)

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

Codex uses TOML configuration format in `~/.codex/config.toml`.

**Add MCP server configuration:**

```bash
codex mcp add engram node /absolute/path/to/engram/mcp-server/dist/index.js
```

**Manual configuration** (edit `~/.codex/config.toml`):

```toml
[mcp_servers.engram]
command = "node"
args = ["/absolute/path/to/engram/mcp-server/dist/index.js"]

[mcp_servers.engram.env]
CONVEX_URL = "https://your-deployment.convex.cloud"
ENGRAM_AGENT_ID = "codex-agent"
COHERE_API_KEY = "your-cohere-key"
```

**Replace:**
- `/absolute/path/to/engram` with your engram installation path
- `your-deployment.convex.cloud` with your Convex deployment URL
- `codex-agent` with your desired agent identifier
- `your-cohere-key` with your Cohere API key (or omit)

### 3. Start MCP Server

```bash
codex mcp-server
```

This starts the MCP server in the background and connects Codex to engram.

---

## Verification

### Test MCP Connection

```bash
# List available MCP servers
codex mcp list

# Should show:
# engram (running)

# Test memory operations
codex chat "Store this in engram: Today I configured engram with Codex"
codex chat "What do you remember about configuring engram?"
```

### Check Server Status

```bash
codex mcp status engram
```

---

## Codex-Specific Features

### Agents SDK Integration

Codex provides an Agents SDK for workflow orchestration. Engram integrates seamlessly:

```python
from openai import agents

# Create agent with engram memory
agent = agents.Agent(
    name="research-assistant",
    mcp_servers=["engram"],
    instructions="Use engram for persistent memory across sessions"
)

# Agent automatically uses engram memory tools
response = agent.run("Remember that the project deadline is March 15")
```

### CLI Commands

```bash
# Manage MCP servers
codex mcp add <name> <command> [args...]
codex mcp remove <name>
codex mcp list
codex mcp status <name>

# Start/stop MCP server
codex mcp start <name>
codex mcp stop <name>
```

### Workflow Automation

Codex workflows can use engram for state persistence:

```yaml
# .codex/workflows/research.yaml
name: research-workflow
steps:
  - name: store-context
    agent: researcher
    mcp_call:
      server: engram
      tool: memory_store_fact
      args:
        content: "Research context here"
        factType: "research"

  - name: recall-relevant
    agent: researcher
    mcp_call:
      server: engram
      tool: memory_recall
      args:
        query: "previous research findings"
```

---

## Configuration Examples

### Minimal Setup (Zero Embeddings)

```toml
[mcp_servers.engram]
command = "node"
args = ["/path/to/engram/mcp-server/dist/index.js"]

[mcp_servers.engram.env]
CONVEX_URL = "https://your-deployment.convex.cloud"
ENGRAM_AGENT_ID = "codex"
```

### Full Setup (With Embeddings + SSE)

```toml
[mcp_servers.engram]
command = "node"
args = ["/path/to/engram/mcp-server/dist/index.js"]

[mcp_servers.engram.env]
CONVEX_URL = "https://your-deployment.convex.cloud"
ENGRAM_AGENT_ID = "codex"
COHERE_API_KEY = "your-cohere-key"
ENGRAM_SSE_PORT = "8787"
ENGRAM_API_KEY = "optional-auth-key"
```

### Multi-Agent Setup

```toml
[mcp_servers.engram-personal]
command = "node"
args = ["/path/to/engram/mcp-server/dist/index.js"]

[mcp_servers.engram-personal.env]
CONVEX_URL = "https://personal.convex.cloud"
ENGRAM_AGENT_ID = "codex-personal"

[mcp_servers.engram-work]
command = "node"
args = ["/path/to/engram/mcp-server/dist/index.js"]

[mcp_servers.engram-work.env]
CONVEX_URL = "https://work.convex.cloud"
ENGRAM_AGENT_ID = "codex-work"
```

---

## Troubleshooting

### "MCP server failed to start"

**Check:**
1. Path to `index.js` is absolute and correct
2. MCP server was built (`npm run build`)
3. Node.js is in PATH
4. Config file has valid TOML syntax

**Debug:**
```bash
# Test manually
cd /path/to/engram/mcp-server
node dist/index.js

# Should output:
# [engram-mcp] Starting Engram MCP Server...
```

### "CONVEX_URL not set"

**Error:** Server starts but can't connect to Convex.

**Fix:** Add to `[mcp_servers.engram.env]` block in config.toml.

### Tools not appearing

**Check:**
```bash
codex mcp status engram  # Should show "running"
codex mcp list           # Should list engram
```

**Fix:** Restart MCP server:
```bash
codex mcp stop engram
codex mcp start engram
```

### "Rate limit exceeded"

**Cause:** More than 100 requests per minute.

**Fix:** Adjust rate limit in `mcp-server/src/index.ts` or use `memory_observe` (fire-and-forget) for high-frequency operations.

---

## Advanced Features

### Agents SDK Workflows

Use engram in Agents SDK for persistent memory:

```python
from openai import agents

# Define agent with engram
agent = agents.Agent(
    name="project-manager",
    mcp_servers=["engram"],
    tools=["memory_store_fact", "memory_recall", "memory_get_context"]
)

# Agent automatically uses engram for memory
agent.run("Store project deadline: March 15, 2026")
agent.run("What's the project deadline?")
```

### Environment Variables

Load from shell environment:

```toml
[mcp_servers.engram.env]
CONVEX_URL = "${CONVEX_URL}"
ENGRAM_AGENT_ID = "codex"
COHERE_API_KEY = "${COHERE_API_KEY}"
```

Then export in shell:
```bash
export CONVEX_URL="https://your-deployment.convex.cloud"
export COHERE_API_KEY="your-cohere-key"
```

### Security: API Key Authentication

Enable optional authentication:

```toml
[mcp_servers.engram.env]
ENGRAM_API_KEY = "secure-key-here"
ENGRAM_CLIENT_KEY = "secure-key-here"
```

Engram validates: `ENGRAM_CLIENT_KEY === ENGRAM_API_KEY`

---

## Features Available

All 72 engram memory tools work with Codex:

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
2. ✅ Start MCP server: `codex mcp-server`
3. ✅ Test memory operations
4. 📚 Read [API Reference](/docs/API-REFERENCE.md)
5. 🎯 Register your agent: `memory_register_agent`
6. 🔄 Set up scope-based access control
7. 📊 Monitor with `memory_get_activity_stats`

---

## Documentation

- **API Reference:** `/docs/API-REFERENCE.md` (all 73 tools)
- **Current State:** `/docs/CURRENT-STATE.md`
- **Architecture:** [README.md](../../README.md)

---

## Support

- **Repository:** https://github.com/RyanLisse/engram
- **Issues:** https://github.com/RyanLisse/engram/issues
- **Codex Docs:** https://openai.com/codex
- **Agents SDK:** https://github.com/openai/agents-sdk

---

**Sources:**
- [OpenAI Codex CLI Documentation](https://openai.com/codex)
- [Codex Agents SDK](https://github.com/openai/agents-sdk)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)
