# Engram + PAI Integration

**Status**: ✅ **COMPLETE** — Engram fully integrated with PAI

Engram is now available as a unified memory system for all PAI agents, providing persistent semantic memory across sessions and devices.

---

## Installation Summary

### What Was Done

1. ✅ **Engram MCP Server** — Built and configured at `/Users/cortex-air/Tools/engram/mcp-server/dist/`
2. ✅ **PAI Integration** — Added to `~/.claude/settings.json` mcpServers
3. ✅ **Convex Backend** — Deployed at https://accurate-cardinal-287.convex.cloud
4. ✅ **Cohere Embeddings** — API key configured in Convex for real semantic search
5. ✅ **PAI Skill** — Created `~/.claude/skills/Engram/SKILL.md` with full documentation
6. ✅ **Agent ID** — Configured as "cammy" for Ryan's main agent

### Configuration

**PAI settings.json** (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/Users/cortex-air/Tools/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://accurate-cardinal-287.convex.cloud",
        "ENGRAM_AGENT_ID": "cammy"
      }
    }
  }
}
```

**Convex Environment**:
- `CONVEX_URL`: https://accurate-cardinal-287.convex.cloud
- `COHERE_API_KEY`: Configured for 1024-dim embeddings (Cohere Embed 4)

---

## Quick Start

### 1. Restart Claude Code

To load the Engram MCP server:
```bash
# Restart Claude Code
# The MCP server will auto-start when Claude Code launches
```

### 2. Register Your Agent

First time using Engram:
```typescript
mcp__engram__memory_register_agent({
  agentId: "cammy",
  name: "Cammy",
  capabilities: ["memory", "research", "coordination"],
  defaultScope: "private-cammy",
  telos: "Help Ryan build systems and manage knowledge"
})
```

### 3. Store Your First Fact

```typescript
mcp__engram__memory_store_fact({
  content: "Engram integrated with PAI on 2026-02-12. Provides 12 memory tools for persistent knowledge.",
  source: "installation",
  tags: ["engram", "pai", "memory-system"],
  factType: "event",
  scopeId: "private-cammy"
})
```

### 4. Recall Information

```typescript
mcp__engram__memory_recall({
  query: "What do I know about Engram?",
  limit: 10,
  scopeId: "private-cammy"
})
```

---

## 12 Available Tools

All tools are prefixed with `mcp__engram__`:

| Tool | Description |
|------|-------------|
| `memory_store_fact` | Store atomic knowledge (async enrichment) |
| `memory_recall` | Semantic search with vector embeddings |
| `memory_search` | Structured search (tags, dates, types) |
| `memory_link_entity` | Create entities and relationships |
| `memory_get_context` | Full context for warm starts |
| `memory_observe` | Fire-and-forget observations |
| `memory_register_agent` | Self-register with capabilities |
| `memory_query_raw` | Direct Convex queries |
| `memory_record_signal` | Rate facts and track sentiment |
| `memory_record_feedback` | Track recall usefulness |
| `memory_summarize` | Consolidate facts on a topic |
| `memory_prune` | Clean up stale facts |

---

## Architecture

```
┌──────────────────────┐
│   PAI Ecosystem      │
│  ┌────────────────┐  │
│  │ Indy (AI)      │  │
│  │ Cammy (Agent)  │  │
│  │ Other Agents   │  │
│  └────────┬───────┘  │
│           │          │
└───────────┼──────────┘
            │
            │ 12 MCP Tools
            ▼
┌──────────────────────┐
│  Engram MCP Server   │
│  (stdio, TypeScript) │
└──────────┬───────────┘
           │
           │ HTTP Client
           ▼
┌──────────────────────┐
│   Convex Backend     │
│  ┌────────────────┐  │
│  │ 10 Tables      │  │
│  │ 7 Cron Jobs    │  │
│  │ Vector Search  │  │
│  │ Async Pipeline │  │
│  └────────────────┘  │
└──────────────────────┘
           │
           │ Embeddings
           ▼
┌──────────────────────┐
│   Cohere Embed 4     │
│  (1024-dim vectors)  │
└──────────────────────┘
```

---

## Memory Scopes

Engram uses scope-based access control:

| Scope | Purpose | Who Can Access |
|-------|---------|----------------|
| `private-cammy` | Ryan's private memory | Cammy agent only |
| `private-indy` | Indy's private memory | Indy agent only |
| `team-pai` | Shared PAI knowledge | All PAI agents |
| `project-openclaw` | OpenClaw project | Project-specific agents |
| `project-engram` | Engram project | Engram contributors |
| `public` | Public knowledge | Everyone |

Scopes are created automatically on first use via `memory_register_agent`.

---

## Integration with PAI Systems

### PAI Memory System

Engram complements PAI's existing memory system:

**PAI MEMORY/** (Session history):
- Raw session logs (JSONL)
- Session summaries
- Learning captures
- Rating signals

**Engram** (Semantic knowledge):
- Atomic facts with embeddings
- Entity relationships
- Consolidated themes
- Cross-session recall

**Best Practice**: Use PAI MEMORY for session logs, Engram for knowledge persistence.

### PAI Hooks Integration

Engram can integrate with PAI hooks:

**SessionStart Hook**:
```typescript
// Load recent context
const context = await mcp__engram__memory_get_context({
  topic: "recent work and decisions",
  maxFacts: 20,
  scopeId: "private-cammy"
})
```

**SessionEnd Hook**:
```typescript
// Store session summary
await mcp__engram__memory_store_fact({
  content: sessionSummary,
  source: "session-end",
  tags: ["session-summary", date],
  factType: "observation",
  scopeId: "private-cammy"
})
```

**ImplicitSentimentCapture Hook**:
```typescript
// Record sentiment signals
await mcp__engram__memory_record_signal({
  signalType: "sentiment",
  value: sentimentScore,  // -1 to 1
  context: "user-message-reaction"
})
```

---

## OpenClaw Integration

For multi-agent OpenClaw workflows:

### Agent Coordination Pattern

**Agent A** stores decision:
```typescript
await mcp__engram__memory_store_fact({
  content: "Use mesh topology for agent coordination",
  source: "architecture-decision",
  tags: ["openclaw", "architecture", "multi-agent"],
  factType: "decision",
  scopeId: "team-openclaw"
})
```

**Agent B** recalls decisions:
```typescript
const decisions = await mcp__engram__memory_recall({
  query: "architecture decisions for multi-agent coordination",
  scopeId: "team-openclaw",
  factType: "decision"
})
```

### Work Pattern Tracking

Store patterns from Peter Steinberger's workflows:
```typescript
await mcp__engram__memory_store_fact({
  content: "Elite developers return to short prompts after complex experimentation (agentic trap pattern)",
  source: "openclaw-interview",
  tags: ["pattern", "prompting", "agent-development"],
  factType: "insight",
  scopeId: "project-openclaw",
  emotionalContext: "key-insight"
})
```

---

## Usage Examples

### Example 1: Track Technology Decisions

```typescript
// Store decision
const { factId } = await mcp__engram__memory_store_fact({
  content: "Decided to use TypeScript + bun for PAI tooling",
  source: "tech-stack-decision",
  tags: ["typescript", "bun", "pai", "tech-stack"],
  factType: "decision",
  scopeId: "team-pai"
})

// Link to entities
await mcp__engram__memory_link_entity({
  entityId: "tech:typescript",
  name: "TypeScript",
  type: "tool",
  metadata: { category: "language" },
  relationships: [
    {
      toEntityId: "project:pai",
      relationType: "used-in",
      metadata: { decisionFactId: factId }
    }
  ]
})
```

### Example 2: Warm Start Before Work

```typescript
// Get full context before starting OpenClaw work
const context = await mcp__engram__memory_get_context({
  topic: "OpenClaw development patterns and learnings",
  maxFacts: 30,
  includeEntities: true,
  includeThemes: true,
  scopeId: "project-openclaw"
})

// Use context.facts, context.entities, context.themes
// to inform your work
```

### Example 3: Store Workflow Learnings

```typescript
// After completing work
await mcp__engram__memory_store_fact({
  content: "Voice development workflow: 80% voice, 20% keyboard. Peter lost his voice from overuse.",
  source: "openclaw-research",
  tags: ["workflow", "voice-development", "openclaw"],
  factType: "pattern",
  scopeId: "project-openclaw",
  emotionalContext: "important-lesson"
})
```

### Example 4: Track Person Relationships

```typescript
// Create person entity
await mcp__engram__memory_link_entity({
  entityId: "person:peter-steinberger",
  name: "Peter Steinberger",
  type: "person",
  metadata: {
    role: "Developer",
    expertise: ["iOS", "AI", "OpenClaw"]
  },
  relationships: [
    {
      toEntityId: "project:openclaw",
      relationType: "creator",
      metadata: { role: "original-author" }
    },
    {
      toEntityId: "person:ryan",
      relationType: "mentor",
      metadata: { context: "AI development" }
    }
  ]
})
```

---

## Automatic Background Jobs

Engram runs 7 cron jobs automatically:

| Job | Schedule | Purpose |
|-----|----------|---------|
| **Decay** | Daily 2 AM | Reduce relevance of old facts |
| **Forget** | Daily 3 AM | Archive high-forget-score facts |
| **Compact** | Daily 4 AM | Compress conversations |
| **Consolidate** | Weekly Sun 5 AM | Merge facts into themes |
| **Rerank** | Weekly Sun 6 AM | Recalculate importance |
| **Rules** | Monthly 1st 7 AM | Extract steering rules |
| **Cleanup** | Daily 8 AM | Garbage collection |

No manual intervention needed. Check Convex dashboard to monitor.

---

## Testing Engram

### Manual Test

```bash
cd /Users/cortex-air/Tools/engram
./test-engram.sh
```

### In Claude Code

After restart:
```typescript
// Test registration
mcp__engram__memory_register_agent({
  agentId: "test-agent",
  name: "Test Agent",
  capabilities: ["testing"],
  defaultScope: "private-test"
})

// Test storage
mcp__engram__memory_store_fact({
  content: "This is a test fact",
  source: "test",
  tags: ["test"],
  factType: "observation"
})

// Test recall
mcp__engram__memory_recall({
  query: "test fact",
  limit: 5
})
```

---

## Documentation

**PAI Skill**: `~/.claude/skills/Engram/SKILL.md`
**Project Files**:
- Architecture: `/Users/cortex-air/Tools/engram/CLAUDE.md`
- Implementation Plan: `/Users/cortex-air/Tools/engram/PLAN.md`
- Cron Jobs: `/Users/cortex-air/Tools/engram/CRONS.md`
- Research: `/Users/cortex-air/Tools/engram/docs/research/`

**Repository**: https://github.com/RyanLisse/engram

---

## Troubleshooting

### MCP Server Won't Start

```bash
# Check server manually
node /Users/cortex-air/Tools/engram/mcp-server/dist/index.js

# Verify environment
cat ~/.claude/settings.json | jq '.mcpServers.engram'
```

### Facts Not Storing

1. Check Convex dashboard: https://dashboard.convex.dev
2. Verify agent is registered: `memory_register_agent`
3. Check scope exists (created automatically on registration)

### Recall Returns Nothing

1. **Embeddings issue**: Wait for async enrichment (< 5 seconds)
2. **Scope mismatch**: Check scopeId matches stored facts
3. **Try memory_search**: Use text/tag filters instead

### Convex Deployment Issues

```bash
cd /Users/cortex-air/Tools/engram
npx convex dev  # Redeploy backend
```

---

## Next Steps

### Immediate

1. **Restart Claude Code** to load Engram MCP server
2. **Register agents** using `memory_register_agent`
3. **Start storing facts** from your work sessions

### Future Enhancements

1. **PAI Hook Integration** — Auto-store session summaries
2. **OpenClaw Skill** — Package Engram for OpenClaw agents
3. **Dashboard** — Visual memory explorer
4. **Export** — Markdown/Obsidian export for backup
5. **Multi-Device Sync** — LanceDB local cache layer

---

## Summary

**Engram is now live in PAI!**

✅ 12 memory tools available via `mcp__engram__` prefix
✅ Semantic search with Cohere Embed 4 (1024-dim)
✅ Agent ID "cammy" for Ryan's agent
✅ Convex backend with 7 automated cron jobs
✅ PAI skill documentation at `~/.claude/skills/Engram/SKILL.md`
✅ Ready for multi-agent coordination

**Start using it**: Restart Claude Code and call `mcp__engram__memory_register_agent`!

---

*Integration completed: 2026-02-12*
*Installation location: `/Users/cortex-air/Tools/engram`*
*Convex deployment: https://accurate-cardinal-287.convex.cloud*
