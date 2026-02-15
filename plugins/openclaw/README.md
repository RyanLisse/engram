# Engram — OpenClaw Native Plugin

Agent-native memory for OpenClaw agents. 52 tools registered as native extensions.

## Install

### Mode A: MCP Server (recommended, works now)

Add to your OpenClaw MCP config:

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "openclaw-agent",
        "COHERE_API_KEY": "your-key"
      }
    }
  }
}
```

### Mode B: Native Plugin

```bash
openclaw plugins install @engram/openclaw-plugin
```

Or for development:

```bash
cd plugins/openclaw
npm install
npm run build
```

## Programmatic Usage

```ts
import { callTool, listTools } from "@engram/openclaw-plugin";

// List all 52 tools
const tools = listTools();

// Call any tool directly
const result = await callTool("memory_recall", { query: "authentication" });
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CONVEX_URL` | Yes | — | Convex deployment URL |
| `ENGRAM_AGENT_ID` | No | `openclaw-agent` | Agent identifier |
| `COHERE_API_KEY` | No | — | Cohere API key for embeddings |

## Architecture

This plugin imports the shared tool registry from `mcp-server/src/lib/tool-registry.ts`.
Both the MCP server and this plugin use the same tool definitions and handlers — zero drift.

```
┌─────────────────────────────────────┐
│        tool-registry.ts             │  ← Single source of truth
│  52 tools × (schema + handler)      │
└──────────┬──────────┬───────────────┘
           │          │
    ┌──────▼──┐  ┌────▼──────────┐
    │ MCP     │  │ OpenClaw      │
    │ Server  │  │ Native Plugin │
    │ (stdio) │  │ (in-process)  │
    └─────────┘  └───────────────┘
```
