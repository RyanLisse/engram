# @engram/cli

Interactive CLI for Engram — store, recall, search, and manage multi-agent memory from the terminal.

## Setup

```bash
cd cli
npm install
npm run build
```

Set your Convex URL (or create a `.env` file):

```bash
export CONVEX_URL=https://your-deployment.convex.cloud
export ENGRAM_AGENT_ID=cli-user  # optional, defaults to "cli-user"
```

## Commands

### Store a fact

```bash
engram store "TypeScript 5.7 supports --module nodenext"
engram store "Convex uses optimistic updates" --type decision --tags "convex,architecture"
engram store "User prefers dark mode" --scope shared --emotion "preference"
```

### Recall (semantic search)

```bash
engram recall "how does authentication work"
engram recall "convex schema" --limit 5 --scope shared
engram recall "deployment process" --type decision
```

### Search (full-text + filters)

```bash
engram search "vector search"
engram search --tags "architecture,decisions" --type insight
```

### Context (warm start)

```bash
engram context "project architecture"
engram context "authentication" --max-facts 30 --scope shared
```

### Agents

```bash
engram agents list
engram agents register my-agent "My Agent" --capabilities "memory,search" --telos "Code assistant"
engram agents info my-agent
```

### Scopes

```bash
engram scopes list
engram scopes create team-shared --description "Team knowledge base" --members "agent-a,agent-b"
engram scopes facts shared
```

### Entities

```bash
engram entities search "convex"
engram entities create convex-db "Convex" --type tool
```

### Status

```bash
engram status
```

### Interactive REPL

```bash
engram repl
```

Inside the REPL:

```
engram> store TypeScript 5.7 supports --module nodenext
  ✓ Stored (a1b2c3d4)

engram> recall authentication
  1. [decision] ★0.85 Use JWT tokens for API auth #security
  2. [observation] ★0.72 Auth middleware validates tokens on every request

engram> agents
  • Cascade (cascade) 142 facts memory, search, code

engram> exit
```

Any unrecognized input in the REPL is treated as a recall query.

## Development

```bash
# Run directly without building
npx tsx src/index.ts recall "test query"

# Link globally
npm link
engram --help
```
