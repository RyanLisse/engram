# Engram API Reference

> Auto-generated from `mcp-server/src/lib/tool-registry.ts` — 69 tools
> Generated: 2026-02-15

## Table of Contents

- [Core](#core)
- [Agent](#agent)
- [Composition](#composition)
- [Signals](#signals)
- [Vault](#vault)
- [Events](#events)
- [Config](#config)
- [Fact Lifecycle](#fact-lifecycle)
- [Delete](#delete)
- [Retrieval](#retrieval)
- [Context](#context)
- [Subscriptions](#subscriptions)
- [Discovery](#discovery)
- [Health](#health)

## Core

### `memory_store_fact`

Store an atomic fact with async enrichment (embeddings, compression, entity extraction). Returns factId and importanceScore.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `content` | string | ✓ | The fact content to store |
| `source` | string |  | Source of the fact (e.g., conversation, observation) |
| `entityIds` | array |  | Entity IDs related to this fact |
| `tags` | array |  | Tags for categorization |
| `factType` | string |  | Type of fact (e.g., decision, observation, insight) |
| `scopeId` | string |  | Scope ID or name (defaults to agent's private scope) |
| `emotionalContext` | string |  | Emotional context or sentiment |

### `memory_recall`

Semantic search for facts (primary retrieval). Returns facts and a recallId for feedback tracking.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✓ | Search query for semantic recall |
| `limit` | number |  | Maximum number of facts to return (default: 10) |
| `scopeId` | string |  | Scope ID or name to search within |
| `factType` | string |  | Filter by fact type |
| `minImportance` | number |  | Minimum importance score (0-1) |
| `searchStrategy` | string |  | Recall strategy |

### `memory_search`

Full-text + structured filters for precise lookups. Supports text, tags, factType, agentId, dateRange, scopeId filters.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `text` | string |  | Full-text search query |
| `tags` | array |  | Filter by tags |
| `factType` | string |  | Filter by fact type |
| `agentId` | string |  | Filter by creator agent ID |
| `dateRange` | object |  | Filter by creation date range |
| `scopeId` | string |  | Scope ID or name to search within |
| `limit` | number |  | Maximum results (default: 20) |

### `memory_observe`

Fire-and-forget passive observation storage. Records observation as a fact without blocking.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `observation` | string | ✓ | Observation to record |
| `emotionalContext` | string |  | Emotional context or sentiment |
| `scopeId` | string |  | Scope to store in (defaults to agent's private scope) |

### `memory_link_entity`

Create/update entities and relationships. Returns entity object and created flag.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `entityId` | string | ✓ | Unique entity ID (e.g., person:john, project:engram) |
| `name` | string | ✓ | Human-readable name |
| `type` | string | ✓ | Entity type (person, project, company, concept, tool) |
| `metadata` | object |  | Additional entity metadata |
| `relationships` | array |  | Relationships to create/update |

### `memory_get_context`

Warm start with token-aware injection. Returns facts, entities, themes, and a summary for a given topic.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `topic` | string | ✓ | Topic to gather context about |
| `maxFacts` | number |  | Maximum facts to include (default: 20) |
| `tokenBudget` | number |  | Token budget for context loading (default: 4000) |
| `profile` | string |  | Context profile |
| `includeEntities` | boolean |  | Include related entities (default: true) |
| `includeThemes` | boolean |  | Include thematic clusters (default: true) |
| `scopeId` | string |  | Scope to search within |

## Agent

### `memory_register_agent`

Agent self-registration with capabilities and scopes. Creates private scope if needed.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string | ✓ | Unique agent identifier |
| `name` | string | ✓ | Human-readable agent name |
| `capabilities` | array |  | Agent capabilities/skills |
| `defaultScope` | string |  | Default scope name (will create if not exists) |
| `telos` | string |  | Agent's telos/purpose |
| `isInnerCircle` | boolean |  | If true, agent joins shared-personal scope |

### `memory_end_session`

Store a session handoff summary for cross-agent continuity.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `summary` | string | ✓ | Session summary for the next agent |
| `conversationId` | string |  | Optional conversation ID to link handoff to |

### `memory_get_agent_info`

Get agent identity context and accessible scopes.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string |  | — |

### `memory_get_agent_context`

Get full agent identity context with capabilities, scope policies, and system health for system prompt injection.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string |  | — |

### `memory_get_system_prompt`

Generate agent-native system prompt context block for injection.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string |  | — |

## Composition

### `memory_query_raw`

Escape hatch for direct Convex queries (read-only). Query any table.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `table` | string | ✓ | Table to query (facts, entities, agents, scopes, sessions, conversations, signals, themes, sync_log) |
| `filter` | object |  | Filter conditions |
| `limit` | number |  | Maximum results (default: 50) |

### `memory_summarize`

Consolidate facts on a topic (AgeMem SUMMARY pattern). Returns summaryFactId and consolidatedCount.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `topic` | string | ✓ | Topic to summarize |
| `scopeId` | string |  | Scope to search within |
| `maxFacts` | number |  | Maximum facts to consolidate (default: 50) |

### `memory_prune`

Agent-initiated cleanup of stale facts (AgeMem FILTER pattern). Returns prunedCount.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeId` | string |  | Scope to prune (defaults to agent's private scope) |
| `olderThanDays` | number |  | Prune facts older than N days (default: 90) |
| `maxForgetScore` | number |  | Maximum forget score (0-1) to prune (default: 0.3) |
| `dryRun` | boolean |  | If true, only report what would be pruned (default: true) |

### `memory_create_theme`

Create a thematic cluster grouping related facts and entities.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | ✓ | — |
| `description` | string | ✓ | — |
| `factIds` | array | ✓ | — |
| `entityIds` | array | ✓ | — |
| `scopeId` | string | ✓ | — |
| `importance` | number |  | — |

## Signals

### `memory_record_signal`

Record ratings/sentiment feedback on facts (PAI pattern). Returns signalId.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `factId` | string |  | Fact ID to signal about |
| `signalType` | string | ✓ | Signal type: rating, sentiment, usefulness, correctness, or failure |
| `value` | number | ✓ | Signal value (e.g., 1-10 for rating, -1 to 1 for sentiment) |
| `comment` | string |  | Optional comment |
| `context` | string |  | Context in which signal was generated |

### `memory_record_feedback`

Post-recall usefulness tracking (ALMA pattern). Records which facts were actually useful.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `recallId` | string | ✓ | Recall ID from memory_recall response |
| `usedFactIds` | array | ✓ | Fact IDs that were useful |
| `unusedFactIds` | array |  | Fact IDs that were not useful |

### `memory_record_recall`

Primitive: record which facts were returned for a recall.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `recallId` | string | ✓ | — |
| `factIds` | array | ✓ | — |

## Vault

### `memory_vault_sync`

Sync Convex facts with Obsidian vault files (export/import/both).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `direction` | string |  | — |
| `force` | boolean |  | — |
| `dryRun` | boolean |  | — |
| `scopeId` | string |  | — |

### `memory_query_vault`

Query markdown vault files directly for local-first retrieval.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✓ | — |
| `limit` | number |  | — |

### `memory_export_graph`

Export Obsidian graph JSON from wiki-links in vault notes.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `includeContent` | boolean |  | — |

### `memory_checkpoint`

Create a durable checkpoint snapshot for session wake/resume.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string |  | — |
| `scopeId` | string |  | — |
| `summary` | string |  | — |

### `memory_wake`

Restore context from a previously stored checkpoint.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `checkpointId` | string | ✓ | — |

### `memory_vault_export`

Primitive: export unmirrored facts to vault markdown files.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeId` | string |  | Scope to export (omit for all) |
| `force` | boolean |  | Force large batch (up to 1000) |
| `dryRun` | boolean |  | Preview only |

### `memory_vault_import`

Primitive: import vault markdown files into Convex facts.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `dryRun` | boolean |  | Preview only |
| `maxFiles` | number |  | Max files to process (default: 200) |

### `memory_vault_list_files`

Primitive: list all markdown files in vault.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `maxFiles` | number |  | Max files to list (default: 50) |

### `memory_vault_reconcile`

Primitive: reconcile a single vault file edit with Convex (conflict detection + merge).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `filePath` | string | ✓ | Absolute path to vault markdown file |

## Events

### `memory_poll_events`

Poll memory event stream with watermark support for near-real-time state awareness.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `watermark` | number |  | — |
| `agentId` | string |  | — |
| `scopeId` | string |  | — |
| `limit` | number |  | — |

### `memory_get_notifications`

Get unread notifications for current agent.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number |  | — |

### `memory_mark_notifications_read`

Mark notifications as read.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `notificationIds` | array | ✓ | — |

## Config

### `memory_get_config`

Get system config value by key. All weights, rates, thresholds tunable without code changes.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `key` | string | ✓ | — |

### `memory_list_configs`

List all system configs, optionally by category.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string |  | — |

### `memory_set_config`

Set a system config value.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `key` | string | ✓ | — |
| `value` | any | ✓ | — |
| `category` | string | ✓ | — |
| `description` | string | ✓ | — |

### `memory_set_scope_policy`

Set a scope-specific policy override.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeId` | string | ✓ | — |
| `policyKey` | string | ✓ | — |
| `policyValue` | any | ✓ | — |
| `priority` | number |  | — |

## Fact Lifecycle

### `memory_update_fact`

Update a fact's content, tags, or type.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `factId` | string | ✓ | — |
| `content` | string |  | — |
| `tags` | array |  | — |
| `factType` | string |  | — |

### `memory_archive_fact`

Archive a fact (soft delete, recoverable).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `factId` | string | ✓ | — |

### `memory_boost_relevance`

Boost a fact's relevance score.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `factId` | string | ✓ | — |
| `boost` | number |  | — |

### `memory_list_stale_facts`

List stale facts candidates for pruning or summarization.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeId` | string |  | — |
| `olderThanDays` | number |  | — |
| `limit` | number |  | — |

### `memory_mark_facts_merged`

Mark source facts as merged into a target fact.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sourceFactIds` | array | ✓ | — |
| `targetFactId` | string | ✓ | — |

### `memory_mark_facts_pruned`

Mark facts as pruned (batch archive).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `factIds` | array | ✓ | — |

## Delete

### `memory_delete_entity`

Delete or archive an entity.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `entityId` | string | ✓ | — |
| `hardDelete` | boolean |  | — |

### `memory_delete_scope`

Delete or archive a scope.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeId` | string | ✓ | — |
| `hardDelete` | boolean |  | — |
| `force` | boolean |  | — |

### `memory_delete_conversation`

Delete or archive a conversation.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `conversationId` | string | ✓ | — |
| `hardDelete` | boolean |  | — |

### `memory_delete_session`

Delete or archive a session.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sessionId` | string | ✓ | — |
| `hardDelete` | boolean |  | — |

### `memory_delete_theme`

Delete or archive a theme.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `themeId` | string | ✓ | — |
| `hardDelete` | boolean |  | — |

## Retrieval

### `memory_vector_search`

Primitive: vector-only recall by query + scope IDs.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✓ | — |
| `scopeIds` | array | ✓ | — |
| `limit` | number |  | — |

### `memory_text_search`

Primitive: text-only recall by query + scope IDs.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✓ | — |
| `scopeIds` | array | ✓ | — |
| `limit` | number |  | — |
| `factType` | string |  | — |

### `memory_bump_access`

Primitive: bump access count for fact IDs (ALMA signal).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `factIds` | array | ✓ | — |

### `memory_get_observations`

Primitive: fetch observations by scope, optionally filtered by tier.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeIds` | array | ✓ | — |
| `tier` | string |  | — |
| `limit` | number |  | — |

### `memory_get_entities`

Primitive: search entities by query, type, and limit.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✓ | — |
| `limit` | number |  | — |
| `type` | string |  | — |

### `memory_get_themes`

Primitive: get themes for a scope.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeId` | string | ✓ | — |
| `limit` | number |  | — |

### `memory_get_handoffs`

Primitive: get recent handoff summaries across scopes.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeIds` | array | ✓ | — |
| `limit` | number |  | — |

### `memory_search_facts`

Primitive: search facts by query across scopes.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✓ | — |
| `scopeIds` | array | ✓ | — |
| `limit` | number |  | — |
| `factType` | string |  | — |

### `memory_search_entities`

Primitive: search entities by query and type.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✓ | — |
| `limit` | number |  | — |
| `type` | string |  | — |

### `memory_search_themes`

Primitive: search themes by scope.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeId` | string | ✓ | — |
| `limit` | number |  | — |

### `memory_rank_candidates`

Primitive: hybrid ranking of candidate facts. Scores = 0.45×semantic + 0.15×lexical + 0.20×importance + 0.10×freshness + 0.10×outcome.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✓ | Query for lexical scoring |
| `candidates` | array | ✓ | Candidate facts to rank |
| `limit` | number |  | Max results (default: 10) |

## Context

### `memory_resolve_scopes`

Primitive: resolve scope name→ID or get all permitted scopes for agent. Use before any scoped search.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeId` | string |  | Scope name or ID to resolve (omit for all permitted) |
| `agentId` | string |  | Agent ID (defaults to current) |

### `memory_load_budgeted_facts`

Primitive: token-budget-aware fact loading with query intent detection. Profiles: default, planning, incident, handoff.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✓ | Topic or search query |
| `tokenBudget` | number |  | Max token budget (default: 4000) |
| `scopeId` | string |  | Scope ID to search within |
| `maxFacts` | number |  | Max facts to load (default: 20) |
| `profile` | string |  | Context profile |

### `memory_search_daily_notes`

Primitive: search vault daily notes for matching text.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✓ | Text to search for |
| `maxFiles` | number |  | Max files to scan (default: 5) |
| `snippetLength` | number |  | Max snippet chars (default: 160) |

### `memory_get_graph_neighbors`

Primitive: find facts connected via shared entity IDs (knowledge graph traversal).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `entityIds` | array | ✓ | Entity IDs to find connected facts for |
| `scopeIds` | array |  | Scope IDs to search within |
| `limit` | number |  | Max results (default: 20) |

### `memory_get_activity_stats`

Primitive: agent activity tracking — factsStored, recalls, signals, handoffs in a period.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string |  | Agent ID (defaults to current) |
| `periodHours` | number |  | Lookback period in hours (default: 24) |

### `memory_get_workspace_info`

Primitive: workspace awareness — other agents, their capabilities, shared scopes and member counts.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string |  | Agent ID (defaults to current) |

### `memory_build_system_prompt`

Aggregator: build a complete system prompt context block with identity, activity, config, workspace, notifications, and handoffs.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string |  | Agent ID (defaults to current) |
| `includeActivity` | boolean |  | Include activity stats (default: true) |
| `includeConfig` | boolean |  | Include config context (default: true) |
| `includeWorkspace` | boolean |  | Include workspace info (default: true) |
| `includeNotifications` | boolean |  | Include notifications (default: true) |
| `includeHandoffs` | boolean |  | Include recent handoffs (default: true) |
| `format` | string |  | Output format (default: markdown) |

## Subscriptions

### `memory_subscribe`

Subscribe to real-time events. Returns subscriptionId for polling or SSE streaming.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `eventTypes` | array |  | Event types to watch (e.g., fact_stored, recall, signal_recorded) |
| `scopeIds` | array |  | Scope IDs to watch |
| `bufferSize` | number |  | Max events to buffer (default: 50) |

### `memory_unsubscribe`

Remove a real-time event subscription.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `subscriptionId` | string | ✓ | Subscription ID to remove |

### `memory_list_subscriptions`

List active event subscriptions and their buffered event counts.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string |  | Filter by agent ID |

### `memory_poll_subscription`

Poll buffered events from a subscription. Use memory_subscribe first to create one.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `subscriptionId` | string | ✓ | Subscription ID to poll |
| `limit` | number |  | Max events to return (default: 20) |
| `flush` | boolean |  | Clear returned events from buffer (default: true) |

## Discovery

### `memory_list_capabilities`

Discovery: list all available memory tools with descriptions, grouped by category.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string |  | Filter by category (core, lifecycle, signals, agent, events, config, retrieval, delete, composition, vault, health, context, discovery) |
| `format` | string |  | Output format (default: list) |

## Health

### `memory_health`

Runtime health check with event lag measurement.

**Parameters:** None

---

*69 tools across 14 categories*