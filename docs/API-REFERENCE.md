# Engram API Reference

> Auto-generated from `mcp-server/src/lib/tool-registry.ts` — 98 tools
> Generated: 2026-02-25

## Table of Contents

- [Core](#core)
- [Agent](#agent)
- [Composition](#composition)
- [Signals](#signals)
- [Other](#other)
- [Vault](#vault)
- [Events](#events)
- [Config](#config)
- [Subscriptions](#subscriptions)
- [Fact Lifecycle](#fact-lifecycle)
- [Delete](#delete)
- [Retrieval](#retrieval)
- [Context](#context)
- [Health](#health)
- [Discovery](#discovery)

## Core

### `memory_store_fact`

Store an atomic fact with async enrichment (embeddings, compression, entity extraction). Returns factId, importanceScore, and deterministic (true when auto-classified as a KV-style fact).

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
| `tokenBudget` | number |  | Max tokens to return (soft limit). |
| `maxTokens` | number |  | Token budget ceiling — stops accumulating facts once budget is reached. Response includes tokenUsage: { used, budget, truncated }. |

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

Store a session handoff summary for cross-agent continuity. Auto-generates a structured session_summary fact from recent activity, or uses a caller-supplied contextSummary.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `summary` | string | ✓ | Session summary for the next agent |
| `conversationId` | string |  | Optional conversation ID to link handoff to |
| `contextSummary` | string |  | Optional agent-supplied context summary. When provided, used as the session_summary fact content instead of auto-generation. |

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

## Other

### `memory_om_status`

Return observation window state: pending tokens, summary tokens, thresholds, compression level, buffer status, last run times.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeId` | string |  | Scope ID or name (defaults to agent's private scope) |

### `memory_observe_compress`

Manually trigger Observer compression for a scope. Compresses raw observations into a dense summary.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeId` | string |  | Scope ID or name (defaults to agent's private scope) |
| `compressionLevel` | number |  | Compression level 0-3 (default: auto from session) |

### `memory_reflect`

Manually trigger Reflector condensation for a scope. Condenses observation summaries into a dense digest with optional depth and time window control.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeId` | string |  | Scope ID or name (defaults to agent's private scope) |
| `depth` | string |  | Reflection depth: shallow=6h recent only, standard=1 week, deep=30 days full history |
| `timeWindow` | number |  | Custom time window in hours (overrides depth preset) |
| `focusEntities` | array |  | Entity IDs to focus reflection on (filters observations by entity) |

### `memory_forget`

Intentionally forget facts by ID or query match (soft-archive + event log).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `factId` | string |  | Fact ID to forget (direct) |
| `query` | string |  | Find and forget facts matching this query |
| `reason` | string | ✓ | Why this fact should be forgotten |
| `limit` | number |  | Max facts to forget when using query (default: 1, max: 10) |

### `memory_pin`

Pin a fact to always-loaded context (max 20 per scope).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `factId` | string | ✓ | Fact ID to pin |
| `scopeId` | string |  | Scope for pin limit enforcement |

### `memory_unpin`

Remove pin from a fact.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `factId` | string | ✓ | Fact ID to unpin |

### `memory_history`

Retrieve version history for a fact (all edits, archives, merges).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `factId` | string | ✓ | Fact ID to get history for |
| `limit` | number |  | Maximum versions to return (default: 20) |

### `memory_rollback`

Restore a fact to a previous version from its edit history.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `factId` | string | ✓ | Fact ID to rollback |
| `versionId` | string |  | Version ID to restore to (defaults to most recent) |
| `reason` | string |  | Reason for rollback |

### `memory_defrag`

Defragment a memory scope: merge near-duplicate facts and archive low-value dormant facts.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeId` | string |  | Scope to defrag (defaults to agent's private scope) |
| `dryRun` | boolean |  | If true, report what would be defragged without making changes (default: true) |
| `mergeThreshold` | number |  | Jaccard similarity threshold for merging (0.5-0.9, default: 0.7) |
| `archiveOlderThanDays` | number |  | Archive dormant facts older than N days (default: 90) |

### `memory_hierarchical_recall`

PageIndex-inspired graph traversal retrieval. Traverses entity→fact backlinks→relationships→temporal links for structured knowledge retrieval. Falls back to text search when no entities match.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✓ | Search query — matched against entity names and fact content |
| `scopeId` | string |  | Scope ID or name to filter results |
| `entityTypes` | array |  | Filter root entities by type (person|project|tool|concept|company) |
| `maxDepth` | number |  | Max traversal depth (0=entities only, 1=+relationships, 2=+temporal links, default: 2) |
| `limit` | number |  | Maximum facts to return (default: 15) |

### `memory_get_manifest`

Progressive Disclosure: returns a tiered overview of agent memory — pinned facts (always-loaded tier) plus a category distribution by factType with counts and recent snippets. Use this first to understand what's in memory, then call memory_recall to load specific categories on-demand.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeId` | string |  | Scope ID or name (defaults to agent's private scope) |
| `includePinnedContent` | boolean |  | Include full content of pinned facts (default: true). Set false to receive summaries only. |

### `memory_chain_recall`

Multi-hop QA retrieval using reasoning chains. Hop 1: QA index search on the query. Hop 2: entity expansion — facts sharing entities with hop 1 results. Hop 3: causal traversal via temporalLinks. Each fact is annotated with _hopDepth (0=direct, 1=entity, 2=causal). Deduplication keeps the shallowest path.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✓ | Initial query to start the chain |
| `maxHops` | number |  | Maximum reasoning hops 1–5 (default: 3) |
| `scopeId` | string |  | Scope to search within (defaults to all permitted scopes) |
| `limit` | number |  | Max facts per hop (default: 10) |

### `memory_create_episode`

Create an episode grouping related facts into a coherent unit (e.g., a debugging session, a planning cycle). Triggers async embedding.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `title` | string | ✓ | Episode title (e.g., 'Debugging auth timeout') |
| `factIds` | array | ✓ | Fact IDs to include |
| `scopeId` | string |  | Scope ID or name |
| `startTime` | number |  | Start timestamp (ms). Defaults to now. |
| `endTime` | number |  | End timestamp (ms). Omit for ongoing. |
| `tags` | array |  | Tags for categorization |
| `importanceScore` | number |  | Importance 0-1 (default 0.5) |
| `summary` | string |  | Brief summary |

### `memory_get_episode`

Retrieve a single episode by ID, including its fact IDs, summary, tags, and embedding status.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `episodeId` | string | ✓ | Episode ID to retrieve |

### `memory_recall_episodes`

Recall episodes via semantic and/or temporal queries. Uses vector search when query is provided, with text fallback.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string |  | Semantic query (optional for temporal-only recall) |
| `scopeId` | string |  | Scope to search within |
| `startAfter` | number |  | Return episodes with startTime >= timestamp (ms) |
| `startBefore` | number |  | Return episodes with startTime < timestamp (ms) |
| `limit` | number |  | Maximum results (default 10) |

### `memory_search_episodes`

Semantic search over episodes. Tries vector search first, falls back to text matching on title/summary/tags.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✓ | Search query |
| `scopeId` | string |  | Scope to search within |
| `limit` | number |  | Maximum results (default 10) |

### `memory_link_facts_to_episode`

Add fact IDs to an existing episode. Deduplicates against already-linked facts.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `episodeId` | string | ✓ | Episode ID |
| `factIds` | array | ✓ | Fact IDs to link |

### `memory_close_episode`

Close an episode by setting its endTime. Optionally attach a final summary.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `episodeId` | string | ✓ | Episode ID to close |
| `endTime` | number |  | End timestamp (ms). Defaults to now. |
| `summary` | string |  | Final summary for the episode |

### `memory_kv_set`

Upsert a key-value pair in a scope. Values are stored as strings — use JSON.stringify() for structured data. Ideal for agent preferences, config flags, identity facts, and tool state that needs deterministic (non-semantic) lookup.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `key` | string | ✓ | Key to store. Use dotted namespacing (e.g. 'ui.theme', 'feature.beta_enabled'). |
| `value` | string | ✓ | Value to store. Use JSON.stringify() for structured data. |
| `scopeId` | string |  | Scope ID or name (defaults to agent's private scope). |
| `category` | string |  | Category for grouping and filtering entries. |
| `metadata` | object |  | Optional provenance metadata. |

### `memory_kv_get`

Retrieve a value by exact key from a scope. Returns the value string, category, and updatedAt timestamp. Returns found: false when the key does not exist.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `key` | string | ✓ | Exact key to look up. |
| `scopeId` | string |  | Scope ID or name (defaults to agent's private scope). |

### `memory_kv_delete`

Remove a key-value pair from a scope. Returns deleted: true if the key existed, false if it was already absent.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `key` | string | ✓ | Key to delete. |
| `scopeId` | string |  | Scope ID or name (defaults to agent's private scope). |

### `memory_kv_list`

List key-value entries in a scope. Supports prefix filtering (e.g. prefix='ui.' returns all ui.* keys) and category filtering. Returns entries array with key, value, category, and updatedAt.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeId` | string |  | Scope ID or name (defaults to agent's private scope). |
| `prefix` | string |  | Filter keys by prefix (e.g. 'ui.' returns all ui.* keys). |
| `category` | string |  | Filter by category. |
| `limit` | number |  | Max entries to return (default: 100, max: 500). |

### `memory_block_read`

Read a memory block by label. Blocks are named, character-limited text slots (e.g. persona, human, project_status) used for system prompt injection. Returns value, version, characterLimit, and length.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `label` | string | ✓ | Block label (e.g. 'persona', 'human', 'project_status'). |
| `scopeId` | string |  | Scope ID or name (defaults to agent's private scope). |

### `memory_block_write`

Append to or replace a memory block. Enforces character limit; versions are snapshotted. Use createIfMissing and characterLimit to create a new block if it does not exist.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `label` | string | ✓ | Block label (e.g. 'persona', 'human'). |
| `mode` | string | ✓ | Append to existing content or replace entirely. |
| `content` | string | ✓ | Text to append or new full content. |
| `scopeId` | string |  | Scope ID or name (defaults to agent's private scope). |
| `characterLimit` | number |  | Max characters (required when createIfMissing is true). |
| `createIfMissing` | boolean |  | If true, create the block when it does not exist (requires characterLimit). |
| `expectedVersion` | number |  | Optimistic lock: write only if current version matches. |
| `reason` | string |  | Optional reason stored in version history. |

### `memory_create_subspace`

Create a knowledge subspace from a set of fact IDs. Auto-computes SVD centroid and principal components.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | ✓ | Name for the subspace |
| `description` | string |  | Description of the semantic cluster |
| `factIds` | array | ✓ | Fact IDs to include |
| `scopeId` | string |  | Scope ID or name |
| `k` | number |  | Number of principal components (default: 3) |

### `memory_get_subspace`

Retrieve a knowledge subspace by ID.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `subspaceId` | string | ✓ | Subspace ID |

### `memory_list_subspaces`

List knowledge subspaces for an agent or scope.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | string |  | Filter by agent ID |
| `scopeId` | string |  | Scope ID or name |
| `limit` | number |  | Max results (default: 50) |

### `memory_consolidate_embeddings`

Trigger SVD recomputation for a subspace. Recomputes centroid and principal components from current fact embeddings.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `subspaceId` | string | ✓ | Subspace ID to recompute |
| `k` | number |  | Number of principal components (default: 3) |

### `memory_query_subspace`

Semantic search across subspaces. Embeds your query and ranks subspaces by cosine similarity to their centroids.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | ✓ | Semantic search query |
| `scopeId` | string |  | Scope ID or name |
| `limit` | number |  | Max subspaces to return (default: 5) |

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

### Prompt-Native Config Keys (Seeded Defaults)

Use `memory_get_config`, `memory_list_configs`, and `memory_set_config` with these keys:

| Key | Default | Category | Purpose |
|-----|---------|----------|---------|
| `auto_recall_limit` | `3` | `prompt_native` | Top-K memories fetched by auto-recall hooks |
| `auto_recall_rrf_k` | `60` | `prompt_native` | RRF k value for hybrid recall ranking |
| `auto_recall_strategy` | `"hybrid"` | `prompt_native` | Recall strategy (`hybrid` or `vector-only`) |
| `system_prompt_sections` | `null` | `prompt_native` | Optional JSON string controlling prompt section order/titles |
| `recall_ranking_weights` | `null` | `prompt_native` | Optional JSON string overriding ranking blend weights |
| `budget_compact_threshold_ratio` | `0.7` | `prompt_native` | Budget ratio threshold to switch to compact mode |
| `budget_offload_threshold_ratio` | `2` | `prompt_native` | Budget ratio threshold to switch to offload mode |
| `intent_detection_threshold` | `0.6` | `prompt_native` | Intent routing sensitivity threshold |

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

## Fact Lifecycle

### `memory_update_fact`

Update a fact's content, tags, type, pinned status, or summary.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `factId` | string | ✓ | — |
| `content` | string |  | — |
| `tags` | array |  | — |
| `factType` | string |  | — |
| `pinned` | boolean |  | — |
| `summary` | string |  | — |

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

Primitive: hybrid ranking of candidate facts. Scores = 0.40×semantic + 0.15×lexical + 0.20×importance + 0.10×freshness + 0.10×outcome + 0.05×emotional.

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

## Health

### `memory_health`

Runtime health check with event lag measurement.

**Parameters:** None

## Discovery

### `memory_list_capabilities`

Discovery: list all available memory tools with descriptions, grouped by category.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string |  | Filter by category (core, lifecycle, signals, agent, events, config, retrieval, delete, observation, composition, vault, health, context, blocks, discovery) |
| `format` | string |  | Output format (default: list) |

---

*98 tools across 15 categories*
