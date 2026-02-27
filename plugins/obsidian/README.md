# Engram Memory for Obsidian

Connect your Obsidian vault to [Engram](https://github.com/anthropics/engram) — a unified multi-agent memory system.

## What it does

- Shows Engram connection status in the status bar
- Connects to the Engram SSE server for real-time event streaming
- Provides health check commands

## Requirements

- Engram MCP server running with `ENGRAM_SSE_PORT` set (default: 3940)

## Installation

### Manual (sideload)

1. Build the plugin:
   ```bash
   cd plugins/obsidian
   npm install
   npm run build
   ```

2. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/engram-memory/` directory.

3. Enable the plugin in Obsidian Settings > Community Plugins.

### BRAT (Beta Reviewers Auto-update Tester)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the Community Plugin Browser.
2. Add `anthropics/engram` as a beta plugin via BRAT settings.
3. Enable the plugin.

## Configuration

Open Settings > Engram Memory:

| Setting | Default | Description |
|---------|---------|-------------|
| SSE Server URL | `http://localhost:3940` | Engram SSE server address |
| Agent ID | `obsidian` | Identity of this Obsidian instance |
| Auto-connect | `true` | Connect on plugin load |
| Show status bar | `true` | Display connection status |
| Health check interval | `30s` | How often to poll /health |

## Commands

- **Toggle Engram connection** — Connect/disconnect the SSE stream
- **Check Engram health** — Show server health in a notice

## Development

```bash
cd plugins/obsidian
npm install
npm run dev    # Watch mode
npm run build  # Production build
```
