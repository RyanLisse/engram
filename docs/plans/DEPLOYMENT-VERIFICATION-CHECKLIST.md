# Deployment Verification Checklist: Agent-Native Architecture Refactoring

**Production Deployment:** Engram v2.0 - Production-Ready Agent-Native Memory System
**PR Reference:** Production refactor plan (54 tools, system_config, memory_policies, memory_events)
**Date:** 2026-02-15
**Owner:** Deployment Engineering Team

---

## Overview

This checklist covers deployment of the agent-native architecture refactoring:
- **New Schema Tables:** system_config, memory_policies, memory_events
- **Config Migration:** Seed script extracts hardcoded values to database
- **Tool Registration:** 18 existing → 54 total tools (36 new primitives)
- **Data Invariants:** No existing facts/entities/agents modified
- **Rollback Capability:** Full rollback with config restoration

**Critical Dependencies:**
- Convex backend (schema deployment)
- MCP server (tool registration)
- LanceDB daemon (unaffected by changes)
- Cohere Embed 4 API (unchanged)

---

## 1. Define Invariants

State the specific data invariants that must remain true:

### Schema Invariants
- [ ] All existing facts remain queryable with same factIds
- [ ] All existing entities retain relationships and backlinks
- [ ] All existing agents retain scope memberships
- [ ] All existing scope memberships unchanged (global, private-indy, shared-personal)
- [ ] No NULL values introduced in existing non-optional fields

### Functional Invariants
- [ ] memory_recall returns identical results for same query (pre vs post deploy)
- [ ] memory_store_fact writes to same scopeId resolution logic
- [ ] memory_get_context returns same facts (before primitives decomposition)
- [ ] Agent registration still creates private scope automatically
- [ ] Enrichment pipeline still runs async (embeddings, importance scoring)

### Performance Invariants
- [ ] Tool response time <50ms (unchanged)
- [ ] Query latency <200ms p95 (before optimization phase)
- [ ] MCP server memory usage <100MB baseline
- [ ] Convex mutation latency <100ms p95

### Count Baselines (to be captured pre-deploy)
```sql
-- Record these values before deployment
SELECT COUNT(*) FROM facts;
-- Expected: N facts (record exact count)

SELECT lifecycleState, COUNT(*) FROM facts GROUP BY lifecycleState;
-- Expected: active=X, dormant=Y, merged=Z, archived=A, pruned=B

SELECT COUNT(*) FROM entities;
-- Expected: M entities

SELECT COUNT(*) FROM agents;
-- Expected: K agents

SELECT name, COUNT(members) FROM memory_scopes GROUP BY name;
-- Expected: global (0), private-indy (1), shared-personal (1+)
```

---

## 2. Pre-Deploy Audits (Read-Only)

### Schema State Verification

**Baseline Queries (run BEFORE deployment):**

```bash
# 1. Count all records in each table
npx convex run functions/seed:countAllRecords

# Expected output structure:
{
  facts: 1234,
  entities: 45,
  agents: 3,
  memory_scopes: 3,
  conversations: 12,
  sessions: 8,
  signals: 567,
  themes: 23,
  sync_log: 2,
  notifications: 89,
  recall_feedback: 234
}
```

**Check for Data That Might Cause Issues:**

```typescript
// Query 1: Facts missing required fields
npx convex run functions/facts:auditMissingFields

// Expected: 0 facts with NULL in required fields (content, timestamp, source, scopeId)

// Query 2: Orphaned entity references
npx convex run functions/entities:auditOrphanedReferences

// Expected: 0 entityIds in facts that don't exist in entities table

// Query 3: Scope membership consistency
npx convex run functions/scopes:auditMembershipConsistency

// Expected: All agent defaultScope values match existing scope names
```

**Verify Existing Config Values (Hardcoded Baselines):**

```bash
# Document current hardcoded values for comparison
grep -r "default_recall_limit\|decay_rate\|importance_weight" mcp-server/src/tools/ convex/actions/ convex/crons/

# Expected locations:
# mcp-server/src/tools/recall.ts:15       limit: 10
# mcp-server/src/tools/get-context.ts:14  tokenBudget: 4000
# mcp-server/src/tools/prune.ts:10        olderThanDays: 90
# convex/actions/importance.ts:24-34      factTypeScores: {decision: 0.8, ...}
# convex/crons/decay.ts:8-18              decayRates: {decision: 0.998, ...}
```

**Save Snapshot for Rollback:**

```bash
# Export entire database state
npx convex export --path ./backups/pre-v2-deploy-$(date +%Y%m%d-%H%M%S).jsonl

# Expected: JSONL file with all table data (~MB size depending on dataset)
```

### MCP Tool Registration State

```bash
# Current tool count
npm run dev --prefix mcp-server &
# Query via MCP: list_tools
# Expected: 18 tools

# Kill dev server
pkill -f "mcp-server"
```

---

## 3. Migration/Backfill Steps

### Phase 1: Schema Deployment (Zero Downtime)

| Step | Command | Estimated Runtime | Batching | Rollback |
|------|---------|-------------------|----------|----------|
| 1. Add new tables | `npx convex deploy` | < 1 min | N/A | Drop tables via schema revert |
| 2. Verify schema | `npx convex run functions/seed:verifySchema` | < 10 sec | N/A | N/A |

**Detailed Schema Deployment:**

```bash
# Step 1.1: Deploy schema with new tables (system_config, memory_policies, memory_events)
npx convex deploy

# Expected output:
# ✓ schema.ts deployed
# ✓ 3 new tables created: system_config, memory_policies, memory_events
# ✓ 0 existing tables modified
# ✓ functions redeployed

# Step 1.2: Verify new tables exist and are empty
npx convex run functions/seed:verifyNewTables
```

**Verification Query:**
```typescript
// functions/seed:verifyNewTables
export const verifyNewTables = internalQuery({
  handler: async (ctx) => {
    const systemConfigCount = await ctx.db.query("system_config").collect().then(r => r.length);
    const memoryPoliciesCount = await ctx.db.query("memory_policies").collect().then(r => r.length);
    const memoryEventsCount = await ctx.db.query("memory_events").collect().then(r => r.length);

    return {
      system_config: systemConfigCount,     // Expected: 0
      memory_policies: memoryPoliciesCount, // Expected: 0
      memory_events: memoryEventsCount,     // Expected: 0
      status: systemConfigCount === 0 && memoryPoliciesCount === 0 && memoryEventsCount === 0
        ? "PASS"
        : "FAIL"
    };
  }
});
```

### Phase 2: Config Migration (Populate system_config)

| Step | Command | Estimated Runtime | Batching | Rollback |
|------|---------|-------------------|----------|----------|
| 1. Seed system_config | `npx convex run functions/seed:seedSystemConfig` | < 5 sec | Single transaction | Delete all system_config records |
| 2. Verify config resolution | `npx convex run functions/seed:testConfigResolver` | < 5 sec | N/A | N/A |

**Seed Script Execution:**

```bash
# Step 2.1: Run seed migration to populate system_config
npx convex run functions/seed:seedSystemConfig

# Expected output:
{
  "inserted": 28,
  "categories": {
    "tool_defaults": 5,
    "importance_weights": 9,
    "decay_rates": 8,
    "routing": 3,
    "lifecycle": 3
  },
  "status": "SUCCESS"
}

# Step 2.2: Verify config resolver works
npx convex run functions/seed:testConfigResolver

# Expected:
{
  "default_recall_limit": 10,          // from system_config
  "importance_weights": {              // from system_config
    "decision": 0.8,
    "insight": 0.75,
    ...
  },
  "configSource": "database",
  "status": "PASS"
}
```

**Config Resolution Test:**
```typescript
// Verify getConfig utility retrieves values
import { getConfig } from "../lib/config-resolver";

export const testConfigResolver = internalQuery({
  handler: async (ctx) => {
    const limit = await getConfig(ctx, "default_recall_limit");
    const weights = await getConfig(ctx, "importance_weights");

    return {
      default_recall_limit: limit,    // Should be 10
      importance_weights: weights,     // Should be object with factType keys
      configSource: limit === 10 ? "database" : "fallback",
      status: limit === 10 && weights?.decision === 0.8 ? "PASS" : "FAIL"
    };
  }
});
```

### Phase 3: MCP Tool Registration (Additive, No Breaking Changes)

| Step | Command | Estimated Runtime | Batching | Rollback |
|------|---------|-------------------|----------|----------|
| 1. Deploy MCP server | `npm run build --prefix mcp-server` | < 30 sec | N/A | Deploy previous version |
| 2. Restart MCP server | Restart via Claude Desktop | < 5 sec | N/A | Restart with old binary |
| 3. Verify tool count | Query `list_tools` | < 1 sec | N/A | N/A |

**Tool Registration Verification:**

```bash
# Step 3.1: Build new MCP server with 54 tools
cd mcp-server
npm run build

# Expected output:
# ✓ TypeScript compilation successful
# ✓ 18 existing tools + 36 new primitives registered

# Step 3.2: Restart MCP server (via Claude Desktop config or manual)
# - Update claude_desktop_config.json to point to new build
# - Restart Claude Desktop application

# Step 3.3: Verify tool registration
# Via Claude: "List all Engram tools"
# Expected: 54 tools listed
```

**Manual Tool Count Check:**
```bash
# Query MCP server tool list
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  npx engram-mcp-server | \
  grep -c "memory_"

# Expected output: 54
```

---

## 4. Post-Deploy Verification (Within 5 Minutes)

### Data Integrity Checks

```bash
# Check 1: Verify no data loss
npx convex run functions/seed:compareRecordCounts

# Expected output:
{
  "facts": { "before": 1234, "after": 1234, "delta": 0 },
  "entities": { "before": 45, "after": 45, "delta": 0 },
  "agents": { "before": 3, "after": 3, "delta": 0 },
  "status": "PASS"
}

# Check 2: Verify config resolution doesn't break existing tools
npx convex run functions/facts:testStoreFact --args '{"content":"Post-deploy test fact","source":"verification"}'

# Expected: Returns factId and importanceScore (no errors)

# Check 3: Verify memory_recall uses config
# Via MCP: memory_recall query="test"
# Check logs for: "[engram-mcp] Using config: default_recall_limit=10"
```

### Functional Verification Queries

```typescript
// Query 1: Verify memory_recall returns same results
export const testRecallConsistency = internalAction({
  handler: async (ctx) => {
    const query = "agent architecture patterns";

    // Recall with default settings (should use system_config now)
    const results = await ctx.runQuery("functions/facts:vectorSearch", {
      query,
      limit: 10,
    });

    return {
      factCount: results.length,
      usingDatabaseConfig: true,
      status: results.length > 0 ? "PASS" : "FAIL"
    };
  }
});

// Query 2: Verify scope resolution unchanged
export const testScopeResolution = internalQuery({
  handler: async (ctx) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agent_id", q => q.eq("agentId", "indy"))
      .first();

    const scopeName = agent?.defaultScope; // Should be "private-indy"
    const scope = await ctx.db
      .query("memory_scopes")
      .withIndex("by_name", q => q.eq("name", scopeName!))
      .first();

    return {
      agentId: agent?.agentId,
      scopeName,
      scopeId: scope?._id,
      status: scope !== null ? "PASS" : "FAIL"
    };
  }
});
```

### MCP Tool Verification

```bash
# Test existing tools still work (backwards compatibility)
# 1. memory_store_fact
# 2. memory_recall
# 3. memory_get_context

# Via Claude or MCP test script:
npm run test:integration --prefix mcp-server

# Expected: 18 existing tool tests pass
```

**Sample Test Script:**
```typescript
// mcp-server/test/integration/post-deploy.test.ts
import { storeFact } from "../../src/tools/store-fact";
import { recall } from "../../src/tools/recall";
import { getContext } from "../../src/tools/get-context";

test("memory_store_fact works post-deploy", async () => {
  const result = await storeFact({
    content: "Post-deploy integration test fact",
    source: "test",
    factType: "observation"
  }, "indy");

  expect(result.factId).toBeDefined();
  expect(result.importanceScore).toBeGreaterThan(0);
});

test("memory_recall uses system_config", async () => {
  const result = await recall({
    query: "deployment verification",
    // limit not specified - should default to system_config value (10)
  }, "indy");

  expect(result.facts.length).toBeLessThanOrEqual(10);
  expect(result.recallId).toBeDefined();
});
```

---

## 5. Rollback Plan

### Can we roll back?

- [x] **Yes - Schema changes are additive** (new tables only, no modifications to existing tables)
- [x] **Yes - Config migration is reversible** (delete system_config records, code falls back to hardcoded defaults)
- [x] **Yes - Tool registration is backwards compatible** (old tools remain as wrappers, new primitives are additive)
- [x] **Yes - Database backup exists** (JSONL export from pre-deploy audit)

### Rollback Triggers

**Execute rollback if ANY of these conditions met:**

1. **Data Integrity Failure:**
   - Record counts differ by >0 (facts/entities/agents)
   - Existing factIds become unqueryable
   - Scope resolution returns NULL for existing agents

2. **Functional Regression:**
   - memory_recall returns 0 results for known queries
   - memory_store_fact fails to write to database
   - MCP server fails to start
   - Error rate >5% of requests sustained for 5 minutes

3. **Performance Degradation:**
   - Query latency >500ms p95 (2.5x slower than baseline)
   - MCP server memory usage >500MB (5x baseline)
   - Enrichment pipeline stops processing (queue backup >100 facts)

4. **Critical Bug Reports:**
   - Agents report missing facts that existed pre-deploy
   - Config changes not taking effect (still using hardcoded values)
   - New tools return errors on valid input

### Rollback Steps

**Step 1: Immediate Rollback (< 5 minutes)**

```bash
# 1. Revert to previous Convex deployment
npx convex rollback

# Expected: Schema reverts to previous version (drops new tables)
# Note: system_config data will be lost but unused

# 2. Deploy previous MCP server version
cd mcp-server
git checkout HEAD~1  # Previous commit before tool additions
npm run build
# Restart Claude Desktop to reload MCP server

# 3. Verify rollback successful
npx convex run functions/seed:countAllRecords
# Expected: Same counts as pre-deploy baseline
```

**Step 2: Restore from Backup (if needed)**

```bash
# Only needed if data corruption detected (rare)
npx convex import --path ./backups/pre-v2-deploy-YYYYMMDD-HHMMSS.jsonl --replace

# Expected: All records restored to pre-deploy state
# WARNING: Loses any data written after deployment
```

**Step 3: Post-Rollback Verification**

```bash
# 1. Verify record counts match pre-deploy baseline
npx convex run functions/seed:compareRecordCounts

# 2. Verify MCP tools count reverted to 18
# Via Claude: "List all Engram tools"
# Expected: 18 tools

# 3. Spot check facts are queryable
npx convex run functions/facts:getFactById --args '{"factId":"<known-fact-id>"}'
# Expected: Returns fact object
```

**Step 4: Incident Report**

```markdown
# Rollback Incident Report Template

**Date:** YYYY-MM-DD HH:MM
**Rollback Trigger:** [Data Integrity | Functional Regression | Performance | Critical Bug]
**Time to Rollback:** X minutes
**Data Loss:** [None | <description>]

**Root Cause:**
<What caused the deployment to fail>

**Rollback Actions Taken:**
1. Reverted Convex schema
2. Reverted MCP server binary
3. [Restored from backup] (if applicable)

**Verification:**
- Record counts: [PASS | FAIL]
- Tool count: [PASS | FAIL]
- Functional tests: [PASS | FAIL]

**Post-Mortem Actions:**
1. Fix root cause in staging
2. Add regression test for failure scenario
3. Re-deploy with enhanced monitoring
```

---

## 6. Post-Deploy Monitoring (First 24 Hours)

### Metrics & Alerts

| Metric/Log | Alert Condition | Dashboard Link | Check Frequency |
|------------|-----------------|----------------|-----------------|
| Error rate (MCP tools) | > 1% for 5 min | `/logs/mcp-errors` | Real-time |
| Query latency p95 | > 300ms for 5 min | `/metrics/convex-queries` | Every 5 min |
| system_config reads | < 1 read/min (indicates fallback to hardcoded) | `/metrics/config-access` | Every 15 min |
| MCP server memory | > 200MB | `/metrics/mcp-memory` | Every 5 min |
| Enrichment queue depth | > 50 pending facts | `/metrics/enrichment-lag` | Every 10 min |
| New tool usage | 0 calls to new primitives (indicates adoption issue) | `/metrics/tool-usage` | Every 1 hour |
| User error reports | Any report mentioning "missing facts" or "can't recall" | Support queue | Real-time |

### Monitoring Commands

**1 Hour After Deploy:**

```bash
# Check system health
npx convex logs --tail 100 | grep -i "error\|fatal\|exception"
# Expected: 0 errors related to config, schema, or tools

# Check config usage
npx convex run functions/seed:auditConfigAccess
# Expected: >100 reads from system_config table
# If 0 reads: Config resolver is broken, investigate immediately

# Check MCP tool usage
grep "Tool called:" ~/.local/state/engram-mcp-server/logs/mcp-server.log | \
  awk '{print $5}' | sort | uniq -c | sort -rn
# Expected: All 18 existing tools have >0 calls
# New tools may have 0 calls (adoption lag acceptable)
```

**4 Hours After Deploy:**

```bash
# Spot check facts created post-deploy
npx convex run functions/facts:listRecentFacts --args '{"limit":10}'
# Expected: 10 facts with post-deploy timestamps, no errors

# Check enrichment pipeline health
npx convex run functions/facts:auditEnrichmentStatus
# Expected: <10 facts pending enrichment (queue is processing)

# Verify new primitives work (if any agents using them)
# Via logs: grep "memory_vector_search\|memory_text_search" logs
# If found: Verify no errors
```

**24 Hours After Deploy:**

```bash
# Final health check
npx convex run functions/seed:fullHealthCheck

# Expected output:
{
  "recordCounts": { "status": "PASS", "deltas": {...} },
  "configUsage": { "status": "PASS", "reads": 12543 },
  "toolErrors": { "status": "PASS", "errorRate": 0.0012 },
  "enrichmentLag": { "status": "PASS", "p95": 2.3 },
  "overallStatus": "HEALTHY"
}
```

### Sample Console Verification (24h post-deploy)

```bash
# Verify config changes are persisted and in-use
npx convex run functions/seed:getConfig --args '{"key":"default_recall_limit"}'
# Expected: { "value": 10, "source": "database" }

# Verify memory lifecycle unchanged
npx convex run functions/facts:auditLifecycleDistribution
# Expected: Similar distribution as pre-deploy (active ~80%, dormant ~15%, etc)

# Spot check random facts for data integrity
npx convex run functions/facts:sampleRandomFacts --args '{"count":20}'
# Expected: 20 facts with all required fields populated, no NULLs
```

---

## 7. Success Criteria

### Deployment Considered Successful If:

#### Data Integrity (Required)
- [x] **Zero data loss** - All pre-deploy record counts match post-deploy
- [x] **Zero NULL corruption** - No existing non-optional fields became NULL
- [x] **Scope integrity** - All agent scope memberships preserved
- [x] **Entity graph intact** - All relationships and backlinks preserved

#### Functional Correctness (Required)
- [x] **Tool backwards compatibility** - 18 existing tools return expected results
- [x] **Config resolution working** - system_config table has >100 reads in first hour
- [x] **Enrichment pipeline running** - Queue depth <50 facts sustained
- [x] **MCP server stable** - Error rate <1% sustained

#### Performance (Required)
- [x] **No latency regression** - Query latency p95 <300ms (within 1.5x baseline)
- [x] **Memory usage healthy** - MCP server <200MB sustained
- [x] **Throughput maintained** - Can handle 100 req/min without errors

#### Adoption (Optional, 24h window)
- [ ] **New tools discovered** - At least 1 agent queries new primitive tools
- [ ] **Config edits attempted** - Admin updates at least 1 system_config value
- [ ] **No rollback requests** - Zero user reports of critical issues

### If ANY Required Criteria FAIL:

1. **Immediately trigger rollback** (see Section 5)
2. **Notify deployment team** via incident channel
3. **Freeze further deployments** until root cause fixed
4. **Conduct post-mortem** within 24 hours

---

## 8. Deployment Timeline

### Expected Timeline (assumes no issues)

| Time | Milestone | Expected Duration | Verification |
|------|-----------|-------------------|--------------|
| T+0 | **Pre-deploy audit complete** | 10 min | Baseline counts saved |
| T+10 | **Schema deployed** | 1 min | New tables exist and empty |
| T+11 | **Config migration complete** | 5 sec | system_config has 28 records |
| T+11 | **MCP server deployed** | 30 sec | 54 tools registered |
| T+12 | **Initial verification** | 5 min | All post-deploy checks pass |
| T+17 | **Monitoring enabled** | Ongoing | Real-time alerts active |
| T+1h | **First health check** | 5 min | No errors, config in-use |
| T+4h | **Mid-term health check** | 5 min | Enrichment healthy, tools working |
| T+24h | **Final health check** | 10 min | All success criteria met |

**Total Deployment Window:** ~17 minutes (T+0 to T+17)
**Monitoring Window:** 24 hours
**Rollback Time:** <5 minutes (if needed)

---

## 9. Pre-Flight Checklist

### Before Starting Deployment

#### Environment Verification
- [ ] Convex deployment URL confirmed: `process.env.CONVEX_URL`
- [ ] Cohere API key valid: `process.env.COHERE_API_KEY`
- [ ] MCP server agent ID set: `process.env.ENGRAM_AGENT_ID`
- [ ] Backup directory exists: `./backups/`
- [ ] Staging deployment tested successfully
- [ ] All team members notified of deployment window

#### Code Verification
- [ ] Git branch is clean (no uncommitted changes)
- [ ] All tests pass: `npm run test --prefix mcp-server`
- [ ] TypeScript compilation succeeds: `npm run build --prefix mcp-server`
- [ ] Convex schema validates: `npx convex deploy --dry-run`
- [ ] Seed script linted: `npx convex lint`

#### Documentation Verification
- [ ] This checklist reviewed by 2+ team members
- [ ] Rollback plan tested in staging
- [ ] Incident response team on-call
- [ ] Monitoring dashboards accessible
- [ ] Communication channels ready (Slack, email)

#### Stakeholder Communication
- [ ] Users notified of maintenance window (if applicable)
- [ ] Support team briefed on potential issues
- [ ] Rollback decision-makers identified
- [ ] Post-deployment demo scheduled (24h after)

---

## 10. Go/No-Go Decision Gate

### Final Authorization Required Before Deployment

**Deployment Lead:** [Name]
**Technical Reviewer:** [Name]
**Stakeholder Approval:** [Name]

**Go/No-Go Criteria:**

| Criteria | Status | Notes |
|----------|--------|-------|
| Pre-deploy audit complete | [ ] PASS | Record counts saved |
| Backup created | [ ] PASS | JSONL export verified |
| Staging tests pass | [ ] PASS | All 18 tools functional |
| Team on-call available | [ ] PASS | Incident response ready |
| Rollback plan verified | [ ] PASS | Tested in staging |
| No blocking issues in backlog | [ ] PASS | Zero P0 bugs |

**Deployment Authorization:**

- [ ] **GO** - Proceed with deployment
- [ ] **NO-GO** - Delay deployment, address blockers

**Authorized By:** ________________ **Date:** _______ **Time:** _______

---

## Appendix A: Tool Registration Manifest

### Existing Tools (18) - Backwards Compatible

1. memory_store_fact
2. memory_recall
3. memory_search
4. memory_link_entity
5. memory_get_context
6. memory_observe
7. memory_register_agent
8. memory_end_session
9. memory_query_raw
10. memory_record_signal
11. memory_record_feedback
12. memory_summarize
13. memory_prune
14. memory_vault_sync
15. memory_query_vault
16. memory_export_graph
17. memory_checkpoint
18. memory_wake

### New Primitives (36) - Phase 2 Deployment

**Recall Decomposition (4):**
19. memory_vector_search
20. memory_text_search
21. memory_bump_access
22. memory_record_recall

**Context Decomposition (8):**
23. memory_get_observations
24. memory_get_entities
25. memory_get_themes
26. memory_get_handoffs
27. memory_get_notifications
28. memory_mark_notifications_read
29. memory_get_vault_notes
30. memory_get_graph_neighbors

**Lifecycle Primitives (3):**
31. memory_list_facts
32. memory_list_stale_facts
33. memory_mark_facts_merged

**Scope Management (5):**
34. memory_create_scope
35. memory_update_scope
36. memory_add_scope_member
37. memory_remove_scope_member
38. memory_list_scopes

**Conversation & Session (4):**
39. memory_create_conversation
40. memory_add_fact_to_conversation
41. memory_list_conversations
42. memory_create_session

**Fact Lifecycle (4):**
43. memory_update_fact
44. memory_archive_fact
45. memory_boost_relevance
46. memory_create_theme

**Config & Identity (7):**
47. memory_get_config
48. memory_set_config
49. memory_set_scope_policy
50. memory_list_configs
51. memory_get_agent_info
52. memory_update_agent
53. memory_get_system_prompt

**Real-Time (1):**
54. memory_poll_events

---

## Appendix B: Config Migration Values

### system_config Records to Insert (28 total)

**Tool Defaults (5):**
- `default_recall_limit`: 10
- `default_token_budget`: 4000
- `default_search_limit`: 20
- `prune_age_threshold_days`: 90
- `prune_max_forget_score`: 0.3

**Importance Weights (9):**
- `importance_weight_decision`: 0.8
- `importance_weight_error`: 0.7
- `importance_weight_insight`: 0.75
- `importance_weight_correction`: 0.7
- `importance_weight_steering_rule`: 0.85
- `importance_weight_plan`: 0.65
- `importance_weight_observation`: 0.5
- `importance_weight_note`: 0.4
- `importance_weight_session_summary`: 0.75

**Decay Rates (8):**
- `decay_rate_decision`: 0.998
- `decay_rate_insight`: 0.997
- `decay_rate_plan`: 0.995
- `decay_rate_observation`: 0.99
- `decay_rate_note`: 0.98
- `decay_rate_error`: 0.996
- `decay_rate_steering_rule`: 0.999
- `decay_rate_session_summary`: 0.997

**Lifecycle (3):**
- `forget_archive_threshold`: 0.7
- `consolidation_threshold`: 0.85
- `dedup_threshold`: 0.95

**Routing (3):**
- `notification_expiry_days`: 7
- `handoff_max_age_days`: 30
- `theme_min_fact_count`: 5

---

## Appendix C: Emergency Contacts

**Deployment Team:**
- Deployment Lead: [Name] - [Phone] - [Email]
- Convex Expert: [Name] - [Phone] - [Email]
- MCP Server Maintainer: [Name] - [Phone] - [Email]

**Escalation Path:**
1. Deployment Lead (first 30 minutes)
2. Technical Architect (if rollback needed)
3. CTO (if data loss detected)

**Incident Channel:** #engram-production-incidents (Slack)
**Status Page:** https://status.engram.example.com

---

**Checklist Version:** 1.0
**Last Updated:** 2026-02-15
**Next Review:** Before Phase 2 deployment (tool primitives)

---

**Deployment Sign-Off:**

This deployment verification checklist has been reviewed and approved by:

- [ ] Deployment Lead: ________________ Date: _______
- [ ] Technical Reviewer: ________________ Date: _______
- [ ] Product Owner: ________________ Date: _______
- [ ] Security Reviewer: ________________ Date: _______

**Post-Deployment Retrospective Scheduled:** [Date + 24h after deployment]
