# Engram Setup for Google Gemini

**Complete setup guide for integrating engram memory with Google Gemini (2026).**

---

## Prerequisites

- Google Gemini CLI or API access
- FastMCP (for CLI integration)
- Node.js 18+
- Convex deployment
- Cohere API key (optional, for real embeddings)

**References:**
- [Google Gemini Documentation](https://ai.google.dev/gemini-api)
- [FastMCP Integration](https://github.com/google/fastmcp)

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

### 2. Install FastMCP

FastMCP enables MCP integration with Gemini:

```bash
pip install fastmcp
```

### 3. Configure MCP Server

**Method A: Using FastMCP (Recommended)**

Create `~/.fastmcp/config.yaml`:

```yaml
servers:
  engram:
    command: node
    args:
      - /absolute/path/to/engram/mcp-server/dist/index.js
    env:
      CONVEX_URL: "https://your-deployment.convex.cloud"
      ENGRAM_AGENT_ID: "gemini-agent"
      COHERE_API_KEY: "your-cohere-key"
```

**Method B: Gemini CLI Configuration**

If using Gemini CLI directly, add to Gemini config:

```bash
gemini config mcp add engram \
  --command "node" \
  --args "/path/to/engram/mcp-server/dist/index.js" \
  --env CONVEX_URL="https://your-deployment.convex.cloud" \
  --env ENGRAM_AGENT_ID="gemini"
```

**Replace:**
- Path with your engram installation location
- `your-deployment.convex.cloud` with your Convex URL
- `gemini-agent` with your desired agent identifier
- `your-cohere-key` with your Cohere API key (or omit)

### 4. Start MCP Server

```bash
# Via FastMCP
fastmcp start engram

# Via Gemini CLI
gemini mcp start
```

---

## Verification

### Test MCP Connection

```python
# Python example using Gemini API
import google.generativeai as genai
from fastmcp import MCPClient

# Connect to engram via FastMCP
mcp = MCPClient("engram")

# Store a fact
mcp.call_tool("memory_store_fact", {
    "content": "Today I configured engram with Gemini",
    "factType": "configuration"
})

# Recall memories
result = mcp.call_tool("memory_recall", {
    "query": "configuring engram",
    "limit": 5
})
print(result)
```

### Test via CLI

```bash
# Store a fact
fastmcp call engram memory_store_fact \
  --content "Test fact from Gemini" \
  --factType "test"

# Recall memories
fastmcp call engram memory_recall \
  --query "test fact" \
  --limit 3
```

---

## Gemini-Specific Features

### FastMCP Integration

FastMCP provides lifecycle hooks for Gemini integration:

```python
from fastmcp import MCPClient, lifecycle

@lifecycle.on_start
async def init_memory(mcp: MCPClient):
    """Initialize agent context on startup"""
    await mcp.call_tool("memory_register_agent", {
        "agentId": "gemini-agent",
        "name": "Gemini Assistant",
        "capabilities": ["research", "analysis", "summarization"]
    })

@lifecycle.on_query
async def recall_context(mcp: MCPClient, query: str):
    """Auto-recall relevant memories for each query"""
    result = await mcp.call_tool("memory_recall", {
        "query": query,
        "limit": 3
    })
    return result["facts"]
```

### Google Cloud MCP Servers

Gemini integrates with Google Cloud MCP servers for enhanced functionality:

- **Google Maps API** — Location data integration
- **BigQuery** — Large-scale data analysis
- **Cloud Run** — Serverless MCP hosting

```yaml
# ~/.fastmcp/config.yaml
servers:
  engram:
    command: node
    args: ["/path/to/engram/mcp-server/dist/index.js"]
    env:
      CONVEX_URL: "https://your-deployment.convex.cloud"

  google-maps:
    command: fastmcp
    args: ["google-maps"]
    env:
      GOOGLE_MAPS_API_KEY: "your-key"
```

### Gemini API Integration

Use engram directly with Gemini API:

```python
import google.generativeai as genai
from fastmcp import MCPClient

genai.configure(api_key="your-gemini-api-key")
mcp = MCPClient("engram")

model = genai.GenerativeModel('gemini-pro')

# Store context
mcp.call_tool("memory_store_fact", {
    "content": "User prefers detailed explanations",
    "factType": "preference"
})

# Generate with memory context
memory = mcp.call_tool("memory_recall", {
    "query": "user preferences",
    "limit": 5
})

response = model.generate_content(
    f"Based on these user preferences:\n{memory}\n\nAnswer: {user_query}"
)
```

---

## Configuration Examples

### Minimal Setup (Zero Embeddings)

```yaml
# ~/.fastmcp/config.yaml
servers:
  engram:
    command: node
    args:
      - /path/to/engram/mcp-server/dist/index.js
    env:
      CONVEX_URL: "https://your-deployment.convex.cloud"
      ENGRAM_AGENT_ID: "gemini"
```

### Full Setup (With Embeddings + SSE)

```yaml
servers:
  engram:
    command: node
    args:
      - /path/to/engram/mcp-server/dist/index.js
    env:
      CONVEX_URL: "https://your-deployment.convex.cloud"
      ENGRAM_AGENT_ID: "gemini"
      COHERE_API_KEY: "your-cohere-key"
      ENGRAM_SSE_PORT: "8787"
      ENGRAM_API_KEY: "optional-auth-key"
```

### Multi-Environment Setup

```yaml
servers:
  engram-dev:
    command: node
    args: ["/path/to/engram/mcp-server/dist/index.js"]
    env:
      CONVEX_URL: "https://dev.convex.cloud"
      ENGRAM_AGENT_ID: "gemini-dev"

  engram-prod:
    command: node
    args: ["/path/to/engram/mcp-server/dist/index.js"]
    env:
      CONVEX_URL: "https://prod.convex.cloud"
      ENGRAM_AGENT_ID: "gemini-prod"
```

---

## Troubleshooting

### "FastMCP connection failed"

**Check:**
1. FastMCP is installed: `pip show fastmcp`
2. Config file exists: `~/.fastmcp/config.yaml`
3. Path to `index.js` is absolute and correct
4. MCP server was built (`npm run build`)

**Debug:**
```bash
# Test FastMCP
fastmcp list

# Should show engram

# Test manually
cd /path/to/engram/mcp-server
node dist/index.js
```

### "CONVEX_URL not set"

**Error:** Server starts but can't connect to Convex.

**Fix:** Add to `env` block in config.yaml.

### Tools not appearing

**Check:**
```bash
fastmcp status engram  # Should show "running"
fastmcp tools engram   # Should list all 73 tools
```

**Fix:** Restart MCP server:
```bash
fastmcp stop engram
fastmcp start engram
```

### "Rate limit exceeded"

**Cause:** More than 100 requests per minute.

**Fix:** Use `memory_observe` (fire-and-forget) for high-frequency operations.

---

## Advanced Features

### Cloud Run Deployment

Deploy engram MCP server to Google Cloud Run:

```bash
# Create Dockerfile
cat > Dockerfile <<EOF
FROM node:18-alpine
WORKDIR /app
COPY mcp-server/package*.json ./
RUN npm install
COPY mcp-server/ ./
RUN npm run build
ENV PORT=8080
CMD ["node", "dist/index.js"]
EOF

# Deploy to Cloud Run
gcloud run deploy engram-mcp \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars CONVEX_URL="https://your-deployment.convex.cloud"
```

### BigQuery Integration

Use engram with BigQuery for large-scale analysis:

```python
from google.cloud import bigquery
from fastmcp import MCPClient

bq = bigquery.Client()
mcp = MCPClient("engram")

# Query BigQuery
query = """
  SELECT * FROM `project.dataset.table`
  WHERE date >= '2026-01-01'
"""
results = bq.query(query).result()

# Store insights in engram
for row in results:
    mcp.call_tool("memory_store_fact", {
        "content": f"Insight: {row.insight}",
        "factType": "analytics",
        "entityIds": [f"data-point-{row.id}"]
    })
```

### Environment Variables

Load from shell environment:

```yaml
servers:
  engram:
    command: node
    args: ["/path/to/engram/mcp-server/dist/index.js"]
    env:
      CONVEX_URL: "${CONVEX_URL}"
      ENGRAM_AGENT_ID: "gemini"
      COHERE_API_KEY: "${COHERE_API_KEY}"
```

---

## Features Available

All 72 engram memory tools work with Gemini:

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

1. ✅ Install FastMCP and engram
2. ✅ Configure MCP server in config.yaml
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
- **Gemini Docs:** https://ai.google.dev/gemini-api
- **FastMCP:** https://github.com/google/fastmcp

---

**Sources:**
- [Google Gemini API Documentation](https://ai.google.dev/gemini-api)
- [FastMCP Integration Guide](https://github.com/google/fastmcp)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)
