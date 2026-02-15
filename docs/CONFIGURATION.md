# Configuration

Engram uses a three-tier configuration system: Convex environment variables, system config table, and scope-specific policy overrides.

## Environment Variables

### Convex Dashboard (convex.dev)

Set these in **Settings → Environment Variables**:

```bash
COHERE_API_KEY=your-cohere-api-key  # Optional: enables real embeddings
```

### MCP Server (.env.local)

```bash
CONVEX_URL=https://your-deployment.convex.cloud  # Required
ENGRAM_AGENT_ID=your-agent-id                    # Required
COHERE_API_KEY=your-cohere-api-key               # Optional
VAULT_ROOT=/path/to/obsidian/vault               # Optional: for vault sync
```

## System Configuration (`system_config` table)

Global defaults for the memory system. Managed via `memory_config_get` / `memory_config_set` tools.

### Default Settings

| Key | Default | Description |
|-----|---------|-------------|
| `default_recall_limit` | `20` | Max facts returned by recall |
| `default_token_budget` | `4000` | Token budget for context injection |
| `forget_archive_threshold` | `0.7` | Forget score threshold for archiving |
| `prune_age_threshold_days` | `90` | Age threshold for pruning stale facts |
| `decay_rate_decision` | `0.001` | Daily decay for decision facts (slow) |
| `decay_rate_observation` | `0.01` | Daily decay for observations (fast) |
| `decay_rate_note` | `0.02` | Daily decay for notes (fastest) |
| `consolidation_similarity_threshold` | `0.85` | Cosine similarity for fact merging |

### Example: Update System Config

```typescript
// Set global recall limit to 50
await memory_config_set({
  key: "default_recall_limit",
  value: 50
})

// Get current configuration
const config = await memory_config_get({ key: "default_recall_limit" })
// Returns: { key: "default_recall_limit", value: 50 }
```

## Scope-Specific Policies (`memory_policies` table)

Override system defaults per scope. Allows different memory behaviors for different projects/teams.

### Available Policy Keys

All `system_config` keys can be overridden per scope:
- `recall_limit`
- `token_budget`
- `forget_threshold`
- `prune_age_days`
- `decay_rate_*`

### Example: Project-Specific Configuration

```typescript
// Make decisions permanent in "project-alpha" scope
await memory_policy_set({
  scopeId: "scope_123abc",  // or scope name: "project-alpha"
  policyKey: "decay_rate_decision",
  value: 0  // Never decay decisions in this scope
})

// Faster consolidation for research scope
await memory_policy_set({
  scopeId: "scope_research",
  policyKey: "consolidation_similarity_threshold",
  value: 0.75  // More aggressive merging
})
```

## Agent Configuration

### Agent Registration

Every agent must register on first use:

```typescript
await memory_register_agent({
  agentId: "indy",
  name: "Indy",
  capabilities: ["code-generation", "research", "debugging"],
  defaultScope: "private-indy",  // Auto-created if doesn't exist
  telos: "Help Ryan build amazing software",
  isInnerCircle: true  // Joins shared-personal scope
})
```

### Inner Circle Agents

Agents with `isInnerCircle: true` automatically join the `shared-personal` scope for cross-agent memory sharing. Ideal for personal agent ecosystems (e.g., Indy, Cammy, research agents).

## Scope Configuration

### Scope Types

| Type | Description | Access Control |
|------|-------------|----------------|
| `private` | Single agent only | Owner read/write |
| `shared` | Multiple agents | Explicit member list |
| `project` | Project-specific | Team members |
| `public` | All agents | Universal read, explicit write |

### Create Custom Scope

```typescript
await memory_scope_create({
  name: "project-xyz",
  type: "project",
  members: ["agent1", "agent2", "agent3"],
  readPolicy: "members",
  writePolicy: "members",
  retentionDays: 365  // Optional: auto-archive after 1 year
})
```

## Cron Job Configuration

Cron jobs run automatically on Convex. Schedules defined in `convex/crons.ts`.

### Current Schedule

| Job | Schedule | Configurable |
|-----|----------|--------------|
| Decay | Daily 2 AM UTC | ✅ (via system_config) |
| Forget | Daily 3 AM UTC | ✅ (via forget_threshold) |
| Compact | Daily 4 AM UTC | ❌ |
| Consolidate | Weekly Sun 1 AM | ✅ (via similarity threshold) |
| Rerank | Weekly Sun 2 AM | ❌ |
| Rules | Monthly 1st, 3 AM | ❌ |
| Cleanup | Daily 5 AM UTC | ✅ (via prune settings) |

### Disable Specific Cron

Edit `convex/crons.ts` and comment out the job:

```typescript
// crons.daily("decay", { hourUTC: 2 }, internal.crons.decay.decay)
```

Then deploy:
```bash
npx convex deploy
```

## Advanced Configuration

### Custom Embedding Model

By default, Engram uses Cohere Embed 4 (`embed-v4.0`, 1024 dimensions). To change:

1. Edit `convex/actions/embed.ts` and `mcp-server/src/lib/embeddings.ts`
2. Update embedding dimension in `convex/schema.ts` (default: 1024)
3. Redeploy: `npx convex deploy`
4. Re-embed existing facts: `await memory_admin_reembed_all()`

### LanceDB Local Cache (Future)

Configuration for local LanceDB sync daemon:

```bash
# .env.local
LANCE_DB_PATH=/path/to/.lance/engram.lance
LANCE_SYNC_INTERVAL_MS=60000  # 1 minute
LANCE_BATCH_SIZE=100
```

## Configuration Hierarchy

Precedence (highest to lowest):
1. **Tool call parameters** (e.g., `recall({ limit: 10 })`)
2. **Scope-specific policies** (`memory_policies` table)
3. **System config** (`system_config` table)
4. **Hardcoded defaults** (in code)

## Example: Complete Setup

```typescript
// 1. Register agent
await memory_register_agent({
  agentId: "researcher",
  name: "Research Agent",
  capabilities: ["research", "synthesis"],
  defaultScope: "private-researcher"
})

// 2. Set global defaults
await memory_config_set({ key: "default_recall_limit", value: 30 })

// 3. Create project scope
await memory_scope_create({
  name: "project-ai-research",
  type: "project",
  members: ["researcher", "writer", "reviewer"]
})

// 4. Override for project scope
await memory_policy_set({
  scopeId: "project-ai-research",
  policyKey: "recall_limit",
  value: 50  // More facts for research scope
})

// 5. Store fact in project scope
await memory_store_fact({
  content: "Found breakthrough paper on memory systems",
  scopeId: "project-ai-research"
})
```

## Troubleshooting

**Config changes not taking effect:**
- Convex functions cache aggressively. Redeploy: `npx convex deploy`
- Scope policies override system config. Check `memory_policies` table.

**Scope not found:**
- Use scope name (string) not ID in tool calls
- Scope creation is async. Wait 1-2 seconds before first use.

**Embedding errors:**
- Verify `COHERE_API_KEY` is set in Convex dashboard
- Check Cohere API quota/limits
- Fallback: System uses mock embeddings (zero vectors) if key missing

## Next Steps

- See [GETTING-STARTED.md](./GETTING-STARTED.md) for usage examples
- Read [PHILOSOPHY.md](./PHILOSOPHY.md) for design principles
- Review [API-REFERENCE.md](./API-REFERENCE.md) for all config tools
