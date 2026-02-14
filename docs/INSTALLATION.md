# Installation

1. Install dependencies: `bun install` and `npm install`.
2. Set env vars: `CONVEX_URL`, `ENGRAM_AGENT_ID`, optional `COHERE_API_KEY`.
3. Deploy Convex: `npm run convex:codegen` then `npx convex deploy`.
4. Build MCP server: `cd mcp-server && bun run build`.
5. Configure MCP client to launch `mcp-server/dist/index.js`.
