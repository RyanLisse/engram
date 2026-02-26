# Engram Agent Dashboard

Real-time agent memory monitoring dashboard. Connects to the Engram MCP server's SSE endpoint for live event streaming.

## Setup

```bash
cd dashboard
npm install
```

## Configuration

Set `ENGRAM_SSE_PORT=3940` on the MCP server to enable the SSE endpoint, then:

```bash
# Optional: override SSE URL (defaults to http://localhost:3940)
export NEXT_PUBLIC_ENGRAM_SSE_URL=http://localhost:3940
```

## Run

```bash
npm run dev    # http://localhost:3939
```

## Features

- **Live Event Stream** — SSE-connected real-time event feed
- **Agent Stats** — Facts stored, recalls, subscriptions, uptime
- **Agent Selector** — Switch between monitored agents
- **Version Timeline** — Per-fact version history via `GET /api/fact-history/:factId`
- **Health Monitoring** — Watermark tracking, listener counts
- **Dark UI** — Tailwind CSS with zinc dark theme

## Architecture

```
Dashboard (Next.js :3939)
    ↓ SSE
MCP SSE Server (:3940)
    ↓ Event Bus
Convex Polling (2s interval)
    ↓
Convex Cloud
```
