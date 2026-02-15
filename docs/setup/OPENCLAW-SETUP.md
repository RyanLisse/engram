# OpenClaw Setup Guide

This guide covers running Engram with OpenClaw.

## Integration Modes

- `Mode A (ready now)`: OpenClaw consumes Engram via MCP server process.
- `Mode B (not yet implemented in this repo)`: native in-process OpenClaw extension package.

Mode A is production-ready now.

## Mode A: MCP-based OpenClaw integration (recommended)

1. Build Engram MCP server.

```bash
cd /Users/cortex-air/Tools/engram
npm install
cd mcp-server
bun install
bun run build
```

2. Register Engram server in your OpenClaw MCP server config (same command/env shape used by other MCP clients):

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/Users/cortex-air/Tools/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://YOUR_DEPLOYMENT.convex.cloud",
        "ENGRAM_AGENT_ID": "openclaw-agent",
        "COHERE_API_KEY": "",
        "ENGRAM_API_KEY": "",
        "ENGRAM_CLIENT_KEY": ""
      }
    }
  }
}
```

3. Restart OpenClaw and verify tools are discoverable.

## Mode B: Native OpenClaw plugin packaging (gap)

Per OpenClaw plugin docs (`https://docs.openclaw.ai/tools/plugin`), native distribution expects:

- A plugin package with `package.json` containing `openclaw.extensions` entrypoints
- Entrypoint that registers tools/resources/prompts/services via OpenClaw plugin API
- Install path through `openclaw plugins install <npm-spec>`

Current repository status:

- Engram is implemented as a standalone MCP server.
- This repo does **not** currently ship a dedicated `openclaw.extensions` package entrypoint.

If you want native in-process plugin mode, create a separate package (for example `@openclaw/engram`) that wraps Engram transport and registers the same tool surface.
Starter template: `/Users/cortex-air/Tools/engram/docs/setup/OPENCLAW-NATIVE-PLUGIN-TEMPLATE.md`

## OpenClaw docs used

- Plugin architecture and extension packaging: https://docs.openclaw.ai/tools/plugin
- Agent tools overview: https://docs.openclaw.ai/tools/plugin-agent-tools
