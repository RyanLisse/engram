# Event-Driven Hooks Pattern

## Principle
Hooks are fire-and-forget. They observe and record, never block the main thread.

## Architecture
```
Agent Action → Claude Code Hook → Shell Script → MCP Tool Call (async)
                                                        ↓
                                               Convex mutation
                                                        ↓
                                               memory_events table
                                                        ↓
                                         Event bus → SSE → Subscribers
```

## Hook Lifecycle
| Event | Hook | Blocks Agent? | Purpose |
|-------|------|---------------|---------|
| SessionStart | session-start.sh | No | Inject agent context |
| UserPromptSubmit | auto-recall.sh | No | Pre-fetch relevant memories |
| PostToolUse | post-tool-observe.sh | No | Record file edit observations |
| Stop | auto-handoff.sh | No | Record turn completion |
| PreCompact | pre-compact-checkpoint.sh | No | Checkpoint before compaction |
| SessionEnd | session-end.sh | No | Create durable checkpoint |

## Event Propagation
1. **Mutation emits event** → `functions/events:emit` writes to `memory_events` table
2. **Event bus polls** → MCP server polls Convex every 2s for new events
3. **Subscribers notified** → Event bus routes to matching subscriptions
4. **SSE broadcast** → If SSE server enabled, streams to connected clients

## Implementation
- `.claude/hooks/` — Shell scripts for Claude Code
- `mcp-server/src/lib/event-bus.ts` — Internal pub/sub
- `mcp-server/src/lib/subscription-manager.ts` — Agent subscription tracking
- `mcp-server/src/lib/sse-server.ts` — HTTP SSE server + webhooks

## Key Rule
Hooks MUST exit quickly. Long operations should use `memory_observe` (fire-and-forget) or schedule async work via Convex actions.
