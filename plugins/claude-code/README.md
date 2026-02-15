# Engram — Claude Code Plugin

Agent-native memory for Claude Code. 52 MCP tools as atomic primitives.

## Quick Setup

```bash
cd plugins/claude-code
chmod +x setup.sh
./setup.sh
```

Or manually add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/path/to/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "claude-code",
        "COHERE_API_KEY": "your-key"
      }
    }
  }
}
```

## Tool Categories (52 tools)

### Core (6)
| Tool | Use When |
|------|----------|
| `memory_store_fact` | Storing any atomic fact, decision, observation, or insight |
| `memory_recall` | Semantic search — primary retrieval path |
| `memory_search` | Precise lookups with text + structured filters |
| `memory_observe` | Fire-and-forget passive observation (non-blocking) |
| `memory_link_entity` | Creating/updating entities and relationships |
| `memory_get_context` | Warm-starting a session with topic context |

### Fact Lifecycle (6)
| Tool | Use When |
|------|----------|
| `memory_update_fact` | Correcting or enriching a fact's content/tags/type |
| `memory_archive_fact` | Soft-deleting a fact (recoverable) |
| `memory_boost_relevance` | Promoting a fact's relevance score |
| `memory_list_stale_facts` | Finding pruning candidates |
| `memory_mark_facts_merged` | Recording fact consolidation |
| `memory_mark_facts_pruned` | Batch-archiving stale facts |

### Signals & Feedback (3)
| Tool | Use When |
|------|----------|
| `memory_record_signal` | Recording ratings/sentiment on facts |
| `memory_record_feedback` | Post-recall usefulness tracking (ALMA) |
| `memory_record_recall` | Tracking which facts were returned |

### Agent Management (3)
| Tool | Use When |
|------|----------|
| `memory_register_agent` | Self-registering with capabilities and scopes |
| `memory_end_session` | Storing handoff summary for next agent |
| `memory_get_agent_info` | Getting agent identity and scopes |

### Agent Identity (2)
| Tool | Use When |
|------|----------|
| `memory_get_agent_context` | Full identity context for system prompt injection |
| `memory_get_system_prompt` | Generate formatted system prompt block |

### Events & Notifications (3)
| Tool | Use When |
|------|----------|
| `memory_poll_events` | Watermark-based event stream polling |
| `memory_get_notifications` | Checking unread notifications |
| `memory_mark_notifications_read` | Acknowledging notifications |

### Config (4)
| Tool | Use When |
|------|----------|
| `memory_get_config` | Reading a tunable parameter |
| `memory_list_configs` | Listing all system configs |
| `memory_set_config` | Updating a config value |
| `memory_set_scope_policy` | Setting scope-specific policy overrides |

### Retrieval Primitives (10)
| Tool | Use When |
|------|----------|
| `memory_vector_search` | Direct vector recall by query + scopes |
| `memory_text_search` | Direct text recall by query + scopes |
| `memory_bump_access` | Signaling fact usefulness to ALMA |
| `memory_get_observations` | Fetching observations by scope/tier |
| `memory_get_entities` | Searching entities |
| `memory_get_themes` | Getting themes for a scope |
| `memory_get_handoffs` | Getting recent handoff summaries |
| `memory_search_facts` | Searching facts across scopes |
| `memory_search_entities` | Searching entities by query/type |
| `memory_search_themes` | Searching themes by scope |

### Delete Operations (5)
| Tool | Use When |
|------|----------|
| `memory_delete_entity` | Removing an entity |
| `memory_delete_scope` | Removing a scope |
| `memory_delete_conversation` | Removing a conversation |
| `memory_delete_session` | Removing a session |
| `memory_delete_theme` | Removing a theme |

### Composition (4)
| Tool | Use When |
|------|----------|
| `memory_summarize` | Consolidating facts on a topic |
| `memory_prune` | Agent-initiated stale fact cleanup |
| `memory_create_theme` | Creating thematic clusters |
| `memory_query_raw` | Escape hatch for direct Convex queries |

### Vault & Checkpoint (4)
| Tool | Use When |
|------|----------|
| `memory_vault_sync` | Syncing with Obsidian vault |
| `memory_query_vault` | Querying vault files directly |
| `memory_export_graph` | Exporting Obsidian graph JSON |
| `memory_checkpoint` | Creating durable session snapshots |
| `memory_wake` | Restoring from checkpoint |

### Health (1)
| Tool | Use When |
|------|----------|
| `memory_health` | Checking system health and event lag |

## Usage Pattern

```
Session Start  → memory_get_agent_context (inject identity)
               → memory_get_context (warm start on topic)

During Work    → memory_store_fact (capture decisions/insights)
               → memory_observe (passive observations)
               → memory_recall / memory_search (retrieve)
               → memory_record_signal (feedback loop)

Session End    → memory_end_session (handoff summary)
```

## Verify

After setup, restart Claude Code and call `memory_health`. Expected:

```json
{ "ok": true, "now": 1739..., "eventLagMs": 42 }
```
