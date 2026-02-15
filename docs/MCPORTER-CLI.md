# Using MCPorter with Engram

[MCPorter](https://github.com/steipete/mcporter) lets you call Engram's MCP tools from the command line or from TypeScript—without launching an AI client.

## Prerequisites

- Convex backend running (`npx convex dev`)
- MCP server built (`cd mcp-server && npm run build`)
- Environment: `CONVEX_URL`, `ENGRAM_AGENT_ID` (optional: `COHERE_API_KEY`)

## Quick Start

```bash
# List all 52 Engram tools with TypeScript signatures
npm run mcp:list

# Or with explicit env
CONVEX_URL=https://your-deployment.convex.cloud npm run mcp:list
```

## Call Tools

```bash
# Store a fact
npx mcporter call engram.memory_store_fact content="My preferred language is TypeScript"

# Semantic recall
npx mcporter call engram.memory_recall query="programming preferences"

# Health check
npx mcporter call engram.memory_health
```

With env (if not in `.env` or shell):

```bash
CONVEX_URL=https://your-deployment.convex.cloud ENGRAM_AGENT_ID=indy \
  npx mcporter call engram.memory_store_fact content="Remember this"
```

## Configuration

MCPorter reads `config/mcporter.json`, which defines the Engram stdio server. It uses `${CONVEX_URL}` and `${ENGRAM_AGENT_ID}` from the environment.

To use a different config:

```bash
npx mcporter --config path/to/mcporter.json list engram
```

## Generate Standalone CLI

Create a self-contained CLI for Engram:

```bash
npm run mcp:generate-cli
# Outputs: dist/engram-cli.js
# Run: node dist/engram-cli.js memory_store_fact content="..."
```

## Use from TypeScript

```typescript
import { createRuntime, createServerProxy } from "mcporter";

const runtime = await createRuntime();
const engram = createServerProxy(runtime, "engram");

const result = await engram.memoryStoreFact({ content: "Test fact" });
console.log(result.json());

await runtime.close();
```

## Related

- [MCPorter docs](https://mcporter.dev)
- [Engram GETTING-STARTED](./GETTING-STARTED.md)
- [Claude Code setup](./setup/CLAUDE-CODE-SETUP.md)
