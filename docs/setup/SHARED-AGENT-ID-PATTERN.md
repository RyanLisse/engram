# Shared Agent ID Pattern

Use **stable, platform-scoped agent IDs** so memory behavior is predictable across tools.

## Recommended IDs

- `claude-code`
- `windsurf`
- `cursor`
- `zed`
- `openclaw-agent`

## Why this pattern works

1. **Stable ownership**: each client keeps a consistent private scope lineage.
2. **Cross-session continuity**: session checkpoints and observations map to one identity.
3. **Safer automation**: hook/cron logic can target known IDs.
4. **Team clarity**: shared scopes are explicit, private scopes remain isolated.

## Practical rules

- Do **not** change IDs per session.
- Use one ID per client/runtime.
- Share via scopes, not by reusing one global agent ID.
- Keep `ENGRAM_AGENT_ID` set in MCP config and shell env for local scripts.

## Example

```json
{
  "env": {
    "CONVEX_URL": "https://your-deployment.convex.cloud",
    "ENGRAM_AGENT_ID": "windsurf",
    "COHERE_API_KEY": "<optional>"
  }
}
```
