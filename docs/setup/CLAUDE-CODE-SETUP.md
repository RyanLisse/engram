# Claude Code Setup Guide

This guide configures Engram as an MCP server for Claude Code.

## Prerequisites

- Node.js 18+
- Convex deployment URL
- Optional Cohere API key

## 1) Build Engram MCP server

```bash
cd /Users/cortex-air/Tools/engram
npm install
cd mcp-server
bun install
bun run build
```

## 2) Configure MCP server entry

Add this to your Claude Code MCP config (`.mcp.json` in project root or user config):

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/Users/cortex-air/Tools/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://YOUR_DEPLOYMENT.convex.cloud",
        "ENGRAM_AGENT_ID": "indy",
        "COHERE_API_KEY": "",
        "ENGRAM_API_KEY": "",
        "ENGRAM_CLIENT_KEY": ""
      }
    }
  }
}
```

Notes:
- If `ENGRAM_API_KEY` is set, `ENGRAM_CLIENT_KEY` must match.
- Keep `ENGRAM_API_KEY` unset if you do not need key-based client auth.

## 3) Verify

1. Restart Claude Code.
2. Run a tool call like `memory_health`.
3. Run `memory_store_fact` then `memory_recall` to validate write/read.

## 4) Expected capability

Current build exposes 52 `memory_*` tools (wrappers + primitives + admin/event/health).

## Troubleshooting

- `CONVEX_URL environment variable is required`: set `CONVEX_URL` in MCP env.
- `ENGRAM_CLIENT_KEY does not match ENGRAM_API_KEY`: either set both to same value or clear `ENGRAM_API_KEY`.
- No tools visible: confirm `args` path points to existing `mcp-server/dist/index.js`.
