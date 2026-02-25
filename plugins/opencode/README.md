# Engram — OpenCode Integration

First-class OpenCode setup for Engram memory tooling.

## Quick Setup

```bash
./plugins/opencode/setup.sh
```

This setup script:
- Builds the MCP server (`mcp-server/dist/index.js`)
- Installs lifecycle bridge plugin at `.opencode/plugins/engram-memory.ts`
- Attempts `opencode mcp add engram -- node ...`
- Prints fallback config snippets for `.mcp.json` and `opencode.json`

## Lifecycle Mapping

The bridge plugin maps OpenCode events into existing Engram automation scripts via `plugins/opencode/hooks/router.sh`.

| OpenCode Event | Bridge Hook | Engram Script |
|---|---|---|
| `session.created` | `session-start` | `plugins/claude-code/hooks/scripts/session-start.sh` |
| `message.part.updated` (first user text part) | `turn-start` | `plugins/claude-code/hooks/scripts/auto-recall.sh` |
| `session.status` = `idle` | `turn-end` | `plugins/claude-code/hooks/scripts/pre-compact-checkpoint.sh` |
| `session.compacted` | `compaction` | `plugins/claude-code/hooks/scripts/pre-compact-checkpoint.sh` |
| `session.deleted` | `session-end` | `plugins/claude-code/hooks/scripts/session-end.sh` |

## Design Notes

- Router is fail-safe: hook failures are swallowed to avoid breaking OpenCode workflows.
- Reuse of existing hook scripts avoids behavior drift across editors.
- Turn-end uses sync execution in plugin to reduce event-loss risk on shutdown.
