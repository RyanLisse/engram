# Shared Agent Identity Pattern

**How to use the same agent identity across multiple platforms for unified memory.**

---

## The Problem

When using engram across multiple platforms (Claude Code, Cursor, Windsurf, Zed, etc.), each platform typically gets its own agent ID:

```bash
# Different agent IDs = fragmented memory
claude-code:   ENGRAM_AGENT_ID="claude-agent"
cursor:        ENGRAM_AGENT_ID="cursor-agent"
windsurf:      ENGRAM_AGENT_ID="windsurf-agent"
```

This creates **isolated memory silos**. Each agent can only see its own memories and cannot benefit from work done in other platforms.

---

## The Solution: Shared Agent ID

**Use the same `ENGRAM_AGENT_ID` across all platforms** to create a unified memory space.

### Benefits

1. **Unified Memory** — All platforms share the same fact stream
2. **Cross-Platform Context** — Work in Claude Code, continue in Cursor
3. **Single Identity** — Agent appears as one entity in Convex
4. **Shared Scope Access** — Same private scope across all platforms
5. **Consolidated Activity** — Single view in dashboard

---

## Implementation

### Step 1: Choose Your Agent ID

Pick a single agent identifier to use everywhere:

```bash
# Example: Use your username
ENGRAM_AGENT_ID="ryan"

# Or: Use a project name
ENGRAM_AGENT_ID="project-alpha"

# Or: Use a generic name
ENGRAM_AGENT_ID="main-agent"
```

### Step 2: Set Environment Variable

**Add to your shell profile** (`~/.zshrc` or `~/.bashrc`):

```bash
export ENGRAM_AGENT_ID="your-chosen-id"
export CONVEX_URL="https://your-deployment.convex.cloud"
export COHERE_API_KEY="your-cohere-key"  # Optional
```

Reload shell:
```bash
source ~/.zshrc
```

### Step 3: Configure All Platforms

Update each platform's config to use the environment variable instead of a hardcoded value.

---

## Platform-Specific Configuration

### Claude Code (~/.claude/mcp.json)

```json
{
  "mcpServers": {
    "engram": {
      "command": "bash",
      "args": [
        "-c",
        "source ~/.zshrc && node /path/to/engram/mcp-server/dist/index.js"
      ],
      "env": {}
    }
  }
}
```

**Note:** The `bash -c "source ~/.zshrc && ..."` pattern loads environment variables from your shell profile.

### Cursor IDE (~/.cursor/mcp.json)

```json
{
  "mcpServers": {
    "engram": {
      "command": "bash",
      "args": [
        "-c",
        "source ~/.zshrc && node /path/to/engram/mcp-server/dist/index.js"
      ],
      "env": {}
    }
  }
}
```

### Windsurf IDE (~/.codeium/windsurf/mcp_config.json)

```json
{
  "mcpServers": {
    "engram": {
      "command": "bash",
      "args": [
        "-c",
        "source ~/.zshrc && node /path/to/engram/mcp-server/dist/index.js"
      ],
      "env": {},
      "type": "stdio"
    }
  }
}
```

### Zed Editor (Zed settings.json)

```json
{
  "context_servers": {
    "engram": {
      "source": "custom",
      "command": "bash",
      "args": [
        "-c",
        "source ~/.zshrc && node /path/to/engram/mcp-server/dist/index.js"
      ],
      "env": {}
    }
  }
}
```

### OpenAI Codex (~/.codex/config.toml)

```toml
[mcp_servers.engram.env]
CONVEX_URL = "${CONVEX_URL}"
ENGRAM_AGENT_ID = "${ENGRAM_AGENT_ID}"
COHERE_API_KEY = "${COHERE_API_KEY}"
```

### Google Gemini (FastMCP config.yaml)

```yaml
servers:
  engram:
    command: bash
    args:
      - "-c"
      - "source ~/.zshrc && node /path/to/engram/mcp-server/dist/index.js"
    env: {}
```

### Factory Droid (Custom Server Config)

```json
{
  "name": "engram",
  "command": "bash",
  "args": [
    "-c",
    "source ~/.zshrc && node /path/to/engram/mcp-server/dist/index.js"
  ],
  "env": {}
}
```

### OpenCode (opencode.json)

```json
{
  "mcp": {
    "engram": {
      "type": "local",
      "command": "bash",
      "args": [
        "-c",
        "source ~/.zshrc && node /path/to/engram/mcp-server/dist/index.js"
      ],
      "env": {}
    }
  }
}
```

---

## Verification

After configuring all platforms with the shared agent ID:

### 1. Check Agent Identity

In any platform, run:
```
"What's my agent ID?"
```

All platforms should respond with the same `ENGRAM_AGENT_ID`.

### 2. Store a Fact in One Platform

In Claude Code:
```
"Store in engram: Testing shared agent ID from Claude Code"
```

### 3. Recall from Another Platform

In Cursor IDE:
```
"Recall memories about testing shared agent ID"
```

You should see the fact stored in Claude Code.

### 4. View in Dashboard

Open the engram dashboard (`dashboard/`) and check that all activity appears under a single agent identity.

---

## Advanced: Per-Project Agent IDs

For project-specific memory isolation, use **project-based agent IDs**:

```bash
# In project A
export ENGRAM_AGENT_ID="ryan-project-a"

# In project B
export ENGRAM_AGENT_ID="ryan-project-b"
```

Each project gets its own private scope while maintaining shared access to team/public scopes.

---

## Troubleshooting

### "Agent ID still different"

**Cause:** Platform not loading environment variables.

**Fix:** Verify the `bash -c "source ~/.zshrc && ..."` wrapper is in the config.

### "Can't find memories from other platform"

**Cause:** Different scope IDs or agent IDs.

**Fix:** Check agent info in each platform:
```
"Run memory_get_agent_info"
```

Verify `agentId` and `scopes` match.

### "Environment variables not loading"

**Cause:** Shell profile not sourced.

**Debug:**
```bash
# Test if env vars are set
echo $ENGRAM_AGENT_ID

# Test if MCP server sees them
bash -c "source ~/.zshrc && env | grep ENGRAM"
```

---

## Security Considerations

### API Keys

**Never hardcode API keys in config files.** Use environment variables:

```bash
# In ~/.zshrc or ~/.bashrc
export COHERE_API_KEY="sk-..."
export ENGRAM_API_KEY="secure-key"
```

### Scope Access Control

Even with shared agent IDs, memories are still protected by scope:
- **Private scope** (`private-{agentId}`) — Only this agent
- **Team scope** (`team-{teamId}`) — All team members
- **Project scope** (`project-{projectId}`) — All project contributors

### Agent Registration

Register the shared agent once with capabilities:

```bash
# In any platform
"Run memory_register_agent with:
- agentId: ryan
- name: Ryan's Multi-Platform Agent
- capabilities: [coding, research, planning, debugging]
- defaultScope: private-ryan
- isInnerCircle: true"
```

---

## Best Practices

1. **Choose a stable agent ID** — Don't change it frequently
2. **Use environment variables** — Keep config files clean
3. **Register agent early** — Set capabilities on first use
4. **Monitor activity** — Use dashboard to verify unified view
5. **Document your choice** — Note agent ID in project README

---

## Alternative: Multi-Agent Strategy

If you **want** separate agents per platform, use descriptive IDs:

```bash
CLAUDE_AGENT="ryan-claude"
CURSOR_AGENT="ryan-cursor"
WINDSURF_AGENT="ryan-windsurf"
```

Then use **team scopes** to share memories:

```bash
# Each agent joins the same team scope
scopeId: "team-ryan-dev"
```

This gives platform-specific private memory while maintaining shared team knowledge.

---

## Summary

| Approach | Pros | Cons |
|----------|------|------|
| **Shared Agent ID** | Unified memory, single identity, simpler | No platform-specific isolation |
| **Per-Platform Agent IDs** | Platform isolation, granular control | Fragmented memory, more complex |
| **Hybrid (Team Scopes)** | Best of both worlds | Requires scope management |

**Recommendation:** Start with **Shared Agent ID** for simplicity. Add per-platform isolation later if needed.

---

**Last Updated:** 2026-02-15
