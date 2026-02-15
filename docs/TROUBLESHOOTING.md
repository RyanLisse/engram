# Troubleshooting

Common issues and solutions for Engram.

## Installation Issues

### "Command not found: convex"

**Problem:** Convex CLI not installed.

**Solution:**
```bash
npm install -g convex
# OR use npx (no global install needed)
npx convex dev
```

### "Module not found" errors after Convex deploy

**Problem:** Convex generated types are out of sync.

**Solution:**
```bash
npx convex dev --once  # Regenerate types
# OR
npm run convex:codegen
```

### TypeScript errors in MCP server build

**Problem:** Missing dependencies or outdated types.

**Solution:**
```bash
cd mcp-server
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Runtime Issues

### MCP server won't start

**Symptoms:** Error when launching MCP server, Claude Code can't connect.

**Diagnosis:**
```bash
# Test server directly
node mcp-server/dist/index.js

# Check for errors in output
```

**Common causes:**
1. **Build failed:** Run `cd mcp-server && npm run build`
2. **Missing env vars:** Check `CONVEX_URL` and `ENGRAM_AGENT_ID`
3. **Wrong Node version:** Requires Node ≥ 18.x

**Solution:**
```bash
# Verify environment
echo $CONVEX_URL
echo $ENGRAM_AGENT_ID

# Rebuild from scratch
cd mcp-server
rm -rf dist
npm run build
cd ..

# Test again
./scripts/test-engram.sh
```

### Empty recall results

**Symptoms:** `memory_recall` returns no facts despite storing data.

**Common causes:**
1. **Agent not registered:** Facts stored before agent registration
2. **Scope mismatch:** Facts in different scope than query
3. **Embedding not generated:** Async enrichment hasn't completed

**Solution:**
```bash
# 1. Register agent first
await memory_register_agent({
  agentId: "your-agent-id",
  name: "Your Agent",
  defaultScope: "private-your-agent-id"
})

# 2. Verify scope access
await memory_scope_list()  # Check available scopes

# 3. Query specific scope
await memory_recall({
  query: "your query",
  scopeId: "private-your-agent-id"
})

# 4. Check if facts exist
await memory_search({
  text: "",  # Empty text = return all
  scopeId: "private-your-agent-id"
})
```

### Facts stored but embeddings missing

**Symptoms:** Vector search (`memory_recall`) returns nothing, but text search (`memory_search`) works.

**Cause:** Cohere API key not configured or enrichment action failing.

**Solution:**
```bash
# 1. Verify Cohere key in Convex dashboard
# Settings → Environment Variables → COHERE_API_KEY

# 2. Check enrichment logs in Convex dashboard
# Logs → Filter by "enrich" action

# 3. Force re-embed existing facts
await memory_admin_reembed_all()  # Re-runs embedding for all facts
```

## Convex Issues

### "Invalid Convex deployment URL"

**Problem:** `CONVEX_URL` format is incorrect.

**Solution:**
```bash
# Correct format
CONVEX_URL=https://your-deployment.convex.cloud

# NOT:
# CONVEX_URL=your-deployment.convex.cloud  (missing https://)
# CONVEX_URL=https://your-deployment.convex.site  (wrong domain)
```

Get your URL from:
```bash
npx convex dashboard
# URL shown in terminal and dashboard
```

### Convex functions timeout

**Symptoms:** Operations take >10 seconds, then fail.

**Common causes:**
1. **Large batch operations:** Storing 100+ facts at once
2. **Complex queries:** Deep entity graph traversal
3. **Cold start:** First invocation after long idle

**Solution:**
```bash
# 1. Batch operations properly
# BAD: 100 individual stores
# GOOD: Use batch store (future feature)

# 2. Simplify queries
# Instead of deep entity traversal, use direct ID lookups

# 3. Warm up deployment
# First query may be slow (cold start), subsequent fast
```

## Memory Behavior Issues

### Facts decay too quickly

**Problem:** Important facts disappear from recall results.

**Solution:**
```typescript
// Option 1: Slow decay for specific fact type
await memory_config_set({
  key: "decay_rate_decision",
  value: 0.0001  # Very slow decay
})

// Option 2: Disable decay for scope
await memory_policy_set({
  scopeId: "important-project",
  policyKey: "decay_rate_decision",
  value: 0  # Never decay
})

// Option 3: Boost importance via signals
await memory_record_signal({
  factId: "fact_xyz",
  signalType: "rating",
  value: 10,  # Max rating
  context: "critical-decision"
})
```

### Too many old facts clogging recall

**Problem:** Recall returns outdated information.

**Solution:**
```typescript
// Option 1: Manual pruning
await memory_prune({
  olderThanDays: 30,
  maxForgetScore: 0.5,
  dryRun: false  # Actually prune
})

// Option 2: Adjust forget threshold
await memory_config_set({
  key: "forget_archive_threshold",
  value: 0.5  # Archive more aggressively (lower = more forgetting)
})

// Option 3: Consolidate into themes
await memory_summarize({
  topic: "project-alpha",
  maxFacts: 100
})
```

### Duplicate facts appearing

**Problem:** Same information stored multiple times.

**Cause:** Consolidation cron hasn't run or similarity threshold too high.

**Solution:**
```typescript
// Lower similarity threshold for more aggressive merging
await memory_config_set({
  key: "consolidation_similarity_threshold",
  value: 0.75  # Default: 0.85
})

// Manually consolidate
await memory_summarize({
  topic: "duplicate-topic",
  maxFacts: 50
})
```

## Scope & Permission Issues

### "Scope not found" error

**Problem:** Tool call references non-existent scope.

**Solution:**
```typescript
// List available scopes
const scopes = await memory_scope_list()
console.log(scopes)

// Create scope if needed
await memory_scope_create({
  name: "my-scope",
  type: "private",
  members: ["agent-id"]
})
```

### Agent can't access scope

**Problem:** Facts exist but agent can't recall them.

**Solution:**
```typescript
// Check scope membership
const scope = await memory_scope_get({ scopeId: "scope-name" })
console.log("Members:", scope.members)

// Add agent to scope
await memory_scope_update({
  scopeId: "scope-name",
  addMembers: ["agent-id"]
})
```

## Vault Sync Issues

### "Vault root not found"

**Problem:** `VAULT_ROOT` environment variable not set or path invalid.

**Solution:**
```bash
# Set in .env.local
VAULT_ROOT=/absolute/path/to/obsidian/vault

# Verify path exists
ls "$VAULT_ROOT"
```

### Vault sync not creating files

**Problem:** Export runs but no `.md` files appear.

**Common causes:**
1. **No write permissions:** Check vault directory permissions
2. **Sync direction wrong:** Using `import` instead of `export`
3. **No facts match filter:** Scope/date filters too restrictive

**Solution:**
```bash
# Test export
await memory_vault_sync({
  direction: "export",
  dryRun: true  # Preview what will be exported
})

# Check permissions
ls -la "$VAULT_ROOT"  # Should be writable

# Export with no filters
await memory_vault_sync({
  direction: "export",
  scopeId: null  # All scopes
})
```

## Performance Issues

### Slow recall (<1s expected, >5s actual)

**Common causes:**
1. **Too many facts:** 10,000+ facts in scope
2. **No embeddings:** Falling back to text search only
3. **Complex entity graph:** Deep relationship traversal

**Solution:**
```typescript
// 1. Prune old facts
await memory_prune({ olderThanDays: 90 })

// 2. Verify embeddings exist
await memory_admin_check_embeddings()

// 3. Simplify query
await memory_recall({
  query: "specific term",  # More specific = faster
  limit: 10  # Lower limit = faster
})
```

### High Convex costs

**Problem:** Unexpected Convex usage/billing.

**Common causes:**
1. **Cron jobs running too frequently:** Default schedule is reasonable
2. **Aggressive consolidation:** Weekly consolidation on large datasets
3. **Re-embedding all facts:** `memory_admin_reembed_all` is expensive

**Solution:**
```bash
# Review cron schedule in convex/crons.ts
# Adjust or disable expensive jobs:

// Disable consolidation temporarily
// crons.weekly("consolidate", {...}, internal.crons.consolidate.consolidate)

# Monitor usage in Convex dashboard
# Dashboard → Usage
```

## Getting Help

### Enable Debug Logging

```bash
# In MCP server
DEBUG=engram:* node mcp-server/dist/index.js

# In Convex functions (add to code)
console.log("Debug:", { factId, query, result })
```

### Check Logs

**Convex logs:**
1. Go to convex.dev dashboard
2. Click "Logs" tab
3. Filter by function name or error level

**MCP server logs:**
- Check Claude Code console output
- Or run server directly: `node mcp-server/dist/index.js`

### Common Log Patterns

**"No embedding found for fact"** → Cohere key missing or enrichment failed
**"Scope access denied"** → Agent not in scope members list
**"Rate limit exceeded"** → Cohere API quota hit (upgrade plan or reduce frequency)
**"Serialization error"** → Data type mismatch (check schema)

## Report a Bug

If issue persists:
1. Collect logs (Convex + MCP server)
2. Document repro steps
3. Open issue at: [GitHub Issues](https://github.com/yourusername/engram/issues)

Include:
- Engram version/commit
- Node version (`node --version`)
- Error messages (full stack trace)
- Minimal reproduction case
