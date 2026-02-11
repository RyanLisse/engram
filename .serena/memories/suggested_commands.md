# Suggested Commands

## Project Status (Planning Phase)
No implementation code yet. These are the commands that will be used once build begins.

## Convex (Phase 1+)
```bash
npx create-convex           # Initialize Convex project
npx convex dev              # Start Convex dev server (hot reload)
npx convex run functions/facts:storeFact  # Test mutations
npx convex dashboard        # Open Convex dashboard
```

## MCP Server (Phase 2+)
```bash
npx tsx mcp-server/src/index.ts              # Run MCP server
npx @modelcontextprotocol/inspector npx tsx mcp-server/src/index.ts  # Test with MCP Inspector
```

## Git
```bash
git status
git add <file>
git commit -m "message"
git push origin master
```

## System (macOS / Darwin)
```bash
ls -la                      # List files
find . -name "*.ts"         # Find TypeScript files
grep -r "pattern" .         # Search content
```

## Node.js
```bash
npm install                 # Install dependencies
npm test                    # Run tests (not configured yet)
```
