---
name: engram
description: Unified multi-agent memory system. Store facts, recall context, share knowledge.
version: 1.0.0
---

# Engram Memory

## MCP Server Configuration

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["PATH_TO_ENGRAM/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://cautious-shrimp-108.convex.cloud",
        "ENGRAM_AGENT_ID": "YOUR_AGENT_ID",
        "COHERE_API_KEY": "YOUR_COHERE_KEY"
      }
    }
  }
}
```

## Available Tools

### Core Memory
- **memory_store_fact** — Store an atomic fact with scope, entities, and tags
- **memory_recall** — Semantic search across permitted scopes (primary retrieval)
- **memory_search** — Full-text + structured filters for precise lookups
- **memory_observe** — Fire-and-forget passive observation storage

### Knowledge Graph
- **memory_link_entity** — Create/update entities and relationships
- **memory_get_context** — Warm start with facts + entities + themes

### Agent Management
- **memory_register_agent** — Self-register with capabilities and scope
- **memory_query_raw** — Escape hatch for direct Convex queries (read-only)

### Feedback & Learning
- **memory_record_signal** — Record ratings/sentiment feedback on facts
- **memory_record_feedback** — Post-recall usefulness tracking

### Memory Maintenance
- **memory_summarize** — Consolidate facts on a topic
- **memory_prune** — Agent-initiated cleanup of stale facts

## Usage Pattern

1. Register your agent: `memory_register_agent`
2. Store facts as you work: `memory_store_fact` or `memory_observe`
3. Recall when needed: `memory_recall` with semantic query
4. Get full context: `memory_get_context` for warm starts
5. Provide feedback: `memory_record_signal` on helpful facts
