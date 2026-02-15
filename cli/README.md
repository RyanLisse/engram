# @engram/cli

Agent-native CLI for Engram — atomic primitives for multi-agent memory, not workflow wrappers.

Built on the [Agent-Native Architecture](../docs/plans/2026-02-14-refactor-mcp-tools-agent-native-architecture-plan.md) principles:

1. **Tools as Primitives** — Each command is a single atomic operation. Agents compose them.
2. **Prompt-Native Config** — All weights, rates, and thresholds tunable via `engram config` without code changes.
3. **Action Parity** — Full CRUD on all 7 entity types. Agents can do everything users can.
4. **Agent Identity Context** — `engram whoami` returns capabilities, scopes, and health for system prompt injection.
5. **Real-Time Events** — Watermark-based event polling for near-real-time state awareness.

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

## Primitives

### Store a fact

```bash
engram store "TypeScript 5.7 supports --module nodenext"
engram store "Convex uses optimistic updates" --type decision --tags "convex,architecture"
engram store "User prefers dark mode" --scope shared --emotion "preference"
```

### Fact lifecycle

```bash
engram facts get <factId>                    # Get a single fact
engram facts update <factId> -c "new text"   # Update content/tags/type
engram facts archive <factId>                # Soft delete
engram facts bump <factId>                   # Bump access count (ALMA signal)
engram facts boost <factId> -v 0.2           # Boost relevance score
engram facts stale --days 30 --scope shared  # Find pruning candidates
engram facts prune <id1> <id2> <id3>         # Batch archive
engram facts merge <target> <src1> <src2>    # Mark facts as merged
engram facts signals <factId>                # View signals on a fact
```

### Signal (ALMA feedback loop)

```bash
engram signal <factId> useful                # Record positive signal
engram signal <factId> outdated -v -1        # Record negative signal
engram signal <factId> wrong -c "Incorrect"  # With comment
```

### Search

```bash
engram search "vector search"
engram search --tags "architecture,decisions" --type insight
```

### Recall (composition helper)

```bash
engram recall "how does authentication work"
engram recall "convex schema" --limit 5 --scope shared
```

### Context (composition helper)

```bash
engram context "project architecture"
engram context "authentication" --max-facts 30 --scope shared
```

## Agent Identity

```bash
engram whoami              # Full identity context (human-readable)
engram whoami --json       # JSON for agent consumption / system prompt injection
```

## Config (Prompt-Native)

```bash
engram config list                                    # All system configs
engram config list -c decay_rates                     # By category
engram config get decay_rate_decision                 # Single value
engram config set decay_rate_decision 0.997 -c decay_rates  # Update
engram config policies shared                         # Scope overrides
engram config set-policy shared retention_days 90     # Set scope policy
```

## Events (Real-Time)

```bash
engram events poll                          # Poll from beginning
engram events poll -w 42                    # Poll since watermark 42
engram events poll -s shared --json         # Filter by scope, JSON output
engram events notifications                 # Unread notifications
engram events notifications --mark-read     # Mark as read after display
```

## Management

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

### Sessions

```bash
engram sessions list
engram sessions create "Starting code review session"
engram sessions delete <sessionId>
```

### Conversations & Handoffs

```bash
engram conversations create <sessionId> "Debugging auth issue" --participants "cascade,indy"
engram conversations add-fact <conversationId> <factId>
engram conversations handoff <conversationId> indy "Handing off auth debugging"
engram conversations delete <conversationId>
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

## Interactive REPL

```bash
engram repl
```

Inside the REPL — all primitives available via shorthand:

```
engram> store TypeScript 5.7 supports --module nodenext
  ✓ Stored (a1b2c3d4)

engram> recall authentication
  1. [decision] ★0.85 Use JWT tokens for API auth #security

engram> get j57abcd1234ef5678
  ID: j57abcd1234ef5678
  Content: Use JWT tokens for API auth
  Type: decision

engram> bump j57abcd1234ef5678
  ✓ Bumped ef5678

engram> signal j57abcd1234ef5678 useful
  ✓ Signal "useful" on ef5678

engram> whoami
  Agent: Cascade
  Telos: Code assistant
  Capabilities: memory, search, code
  Scopes: private-cascade, shared
  Facts: 142

engram> config decay_rate_decision
  decay_rate_decision: 0.998

engram> notifications
  • [handoff] Indy handed off auth debugging

engram> exit
```

## Development

```bash
npx tsx src/index.ts recall "test query"   # Run without building
npm link                                   # Link globally
engram --help
```
