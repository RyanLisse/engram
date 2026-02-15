# Engram Cron Jobs

Scheduled jobs that keep the memory system healthy, current, and useful.

---

## Convex Scheduled Functions (Server-Side)

These run inside Convex — no external cron needed, no model costs.

| Function | Schedule | Description |
|----------|----------|-------------|
| `decay:relevance` | Daily 5:00 AM | `relevanceScore *= 0.99` for facts > 7 days. Floor: 0.1. Corrections floor: 0.5 |
| `decay:importance` | Weekly Sun 4:00 AM | Recompute entity PageRank from relationship graph. Update fact importance from linked entities |
| `cleanup:expired` | Daily 4:00 AM | Delete facts in expired scopes (`retentionDays` exceeded) |
| `cleanup:archive` | Weekly Sun 3:00 AM | Move conversations > 90 days to archive table |
| `backfill:embeddings` | Daily 3:00 AM | Find facts missing embeddings, generate via OpenAI action |
| `stats:daily` | Daily 11:59 PM | Snapshot: total facts, entities, active agents, sync health |
| `quality-scan` | Daily 4:30 AM | Golden principles enforcement: embedding coverage, scope bloat, stale agents, theme freshness |
| `learning-synthesis` | Weekly Sun 7:30 AM | Aggregate recall feedback, boost high-value facts, generate weekly learning report |

---

## OpenClaw Cron Jobs (Agent-Side)

These run as OpenClaw cron jobs, using free/cheap models.

### Sidecar Extract
```
Schedule: 0 */2 * * *  (every 2 hours)
Model: free-air
```
Read last 2 hours of session logs. Extract:
- Decisions made
- Corrections received  
- Patterns discovered
- New entities mentioned
- Errors encountered

Store each as atomic fact via `memory_store_fact`.

---

### Contradiction Scan
```
Schedule: 0 6 * * *  (daily 6 AM)
Model: free-air
```
Query recent facts (last 7 days). For each:
1. Find semantically similar older facts (cosine > 0.85)
2. Check if content conflicts
3. Flag contradictions for review
4. Send summary if conflicts found

---

### Memory Digest
```
Schedule: 0 9 * * 0  (weekly Sunday 9 AM)
Model: free-air
```
Generate "This Week in Memory" report:
- New entities discovered (count + list)
- Top 10 facts by importance
- Decaying facts that may need refreshing (accessed often but decaying)
- Agent activity breakdown (who stored what)
- Knowledge gaps (topics referenced in queries but few facts stored)
- Memory health: total facts, sync lag, embedding coverage

Send via Telegram.

---

### Entity Graph Refresh
```
Schedule: 0 4 * * 3  (weekly Wednesday 4 AM)
Model: free-air
```
Rebuild entity relationship graph:
1. Scan all facts for entity co-occurrence
2. Discover implicit relationships (entities frequently mentioned together)
3. Update entity `importanceScore` via PageRank
4. Prune orphaned entities (no facts, no relationships)
5. Report new connections found

---

### Warm Start Cache
```
Schedule: 0 */6 * * *  (every 6 hours)
Model: free-air
```
Pre-compute context summaries for active projects:
1. Identify active scopes (writes in last 24h)
2. For each: generate a <2000 token context summary
3. Cache in session table for instant warm start
4. Avoids cold-start latency on session begin

---

### Sync Reconcile
```
Schedule: */5 * * * *  (every 5 minutes)
Model: none (daemon)
```
Per-node LanceDB sync:
1. Check `sync_log` for facts newer than `lastSyncTimestamp`
2. Pull new facts from Convex
3. Generate local embeddings if not present
4. Update local LanceDB index
5. Update `sync_log` with new timestamp

**Note:** This is a lightweight daemon, not an LLM job.

---

### Memory Health Check
```
Schedule: 0 */2 * * *  (every 2 hours, alongside heartbeat)
Model: none (script)
```
Check and alert if:
- Convex unreachable for > 10 min
- Sync lag > 30 min on any node
- No new facts stored in 24h (memory system might be disconnected)
- Embedding backlog > 100 facts
- Any agent hasn't checked in for 48h

Integrates with existing HEARTBEAT.md system.

---

### Duplicate Detector
```
Schedule: 0 2 * * *  (daily 2 AM)
Model: none (vector similarity)
```
Find and merge duplicate facts:
1. For each fact stored in last 24h
2. Find existing facts with cosine similarity > 0.95
3. If found: merge (keep higher importance, combine tags, increment access count)
4. Log merges for audit trail

---

## Cron Summary

| Job | Frequency | Model Cost | Purpose |
|-----|-----------|------------|---------|
| Sidecar Extract | 2h | free | Auto-capture knowledge |
| Relevance Decay | daily | none | Keep relevance scores current |
| Importance Rerank | weekly | none | Recompute entity PageRank |
| Garbage Collect | daily | none | Clean expired scopes |
| Embedding Backfill | daily | OpenAI (~$0.01/day) | Fill missing embeddings |
| Contradiction Scan | daily | free | Detect conflicting facts |
| Memory Digest | weekly | free | "This Week in Memory" report |
| Entity Graph Refresh | weekly | free | Discover implicit connections |
| Warm Start Cache | 6h | free | Pre-compute context summaries |
| Sync Reconcile | 5min | none | Keep local LanceDB current |
| Memory Health Check | 2h | none | Alert on issues |
| Duplicate Detector | daily | none | Merge duplicate facts |
| Archive Old Convos | weekly | none | Move old conversations to cold storage |
| Daily Stats | daily | none | Snapshot metrics |
| Quality Scan | daily | none | Golden principles enforcement |
| Learning Synthesis | weekly | none | Feedback aggregation + fact boosting |
