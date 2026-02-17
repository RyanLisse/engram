# Architecture

```mermaid
flowchart LR
    Agent1[Agent 1] --> MCP[MCP Server\n69 tools]
    Agent2[Agent 2] --> MCP
    Agent3[Agent N] --> MCP
    OpenClaw[OpenClaw Runtime] -.native plugin path.- Plugin[OpenClaw Native Plugin]
    Plugin -.shared tool registry.- MCP
    MCP --> Convex[Convex Cloud\n16 Tables]
    MCP --> Lance[LanceDB Local\nidle backoff]
    Convex --> VI[Vector Index\n1024-dim Cohere]
    Convex --> SI[Search Index]
    Convex --> Crons[14 Crons\nEnrichment Pipeline]
    Lance --> LR[Local Recall\nsub-10ms]
```

# Hybrid Recall Flow

```mermaid
flowchart TD
    Query --> ResolveScopes
    ResolveScopes -->|scope_memberships join table\nO memberships not O all scopes| ScopeIds[Permitted Scope IDs]
    ScopeIds --> GenEmbed[Generate Embedding\nCohere Embed 4]
    GenEmbed --> VR[vectorRecallAction\nParallel Promise.all per scope]
    ScopeIds --> FT[Full-Text Recall\nsearchFactsMulti]
    VR --> Merge[Merge Results]
    FT --> Merge
    Merge --> Rank[Weighted Rank\nobservationTier + importanceScore]
    Rank --> Bump[bumpAccessBatch\n1 round-trip for all facts]
    Bump --> Return[Return + RecallId]
```

# Enrichment Pipeline

```mermaid
flowchart TD
    StoreFact[storeFact mutation] --> Schedule[scheduler.runAfter 0]
    Schedule --> Enrich[enrichFact action]
    Enrich --> GetFact[runQuery: getFactInternal]
    GetFact -->|idempotency check| EmbedCheck{embedding exists?}
    EmbedCheck -->|yes| Skip[Skip - already enriched]
    EmbedCheck -->|no| Embed[generateEmbedding\nCohere embed-v4.0\ninput_type: search_document]
    Embed --> Importance[calculateImportanceWithWeights]
    Importance --> Contradictions[checkContradictions mutation\npre-computed at write time\ncached in contradictsWith field]
    Contradictions --> WriteBack[updateEnrichment mutation\nembedding + importanceScore]
    WriteBack --> Route[routeToAgents action\nnotifications for relevant agents]
    WriteBack --> Mirror[mirrorToVault action\nmarkdown sync]
```

# Feedback Loop

```mermaid
flowchart TD
    Recall --> RecallId[recallId generated]
    RecallId --> Feedback[record_feedback tool]
    Feedback --> Signals[signals table]
    Signals --> OS[outcomeScore\nrunning EMA alpha=0.25]
    OS --> WeeklyRerank[learningSynthesis cron\nSunday 7:30 UTC]
    WeeklyRerank --> BoostTop[Boost top-10 recalled facts\nctx.db.get direct lookup]
    BoostTop --> IS[importanceScore updated]
    IS --> Better[Better Recall\nnext week]
```

# Scope Lookup — Join Table Pattern

```mermaid
flowchart TD
    Agent[agentId] --> JoinTable[scope_memberships\nby_agent index]
    JoinTable --> MemberScopeIds[Member Scope IDs\nO memberships]
    Agent --> PublicScopes[memory_scopes\nby_read_policy index\nO public scopes]
    MemberScopeIds --> Dedup[Deduplicate]
    PublicScopes --> Dedup
    Dedup --> PermittedScopes[Permitted Scopes]
    PermittedScopes --> Cache[5-min TTL cache\nMCP client]
```

# Memory Lifecycle

```mermaid
flowchart LR
    active --> dormant[dormant\ncompact cron]
    active --> merged[merged\ndedup cron]
    active --> archived[archived\nforget cron]
    archived --> pruned[pruned\ncleanup cron]
    active -->|consolidation| themes[themes table\nweekly Sunday]
```

# Philosophy Loop

```mermaid
flowchart LR
    P1[Primitive Tools] --> C1[Agent Composition]
    C1 --> O1[Observable Outcomes]
    O1 --> F1[Signals and Feedback]
    F1 --> L1[Ranking and Policy Updates]
    L1 --> P1
```

# Sync Topology

```mermaid
flowchart LR
    NodeA[Node A\nMCP Server] --> Convex
    NodeB[Node B\nMCP Server] --> Convex
    Convex --> SyncLog[sync_log table]
    SyncLog --> Lance[LanceDB Local\nmergeInsert upsert]
    Lance --> LR[Local Recall\nfallback when Convex unavailable]
    Lance -.idle backoff 30s→5min.- SyncLoop[Sync Loop\nsyncOnce + setTimeout]
```

# LanceDB Backoff Pattern

```mermaid
flowchart TD
    syncOnce[syncOnce] --> facts{facts synced > 0?}
    facts -->|yes| resetInterval[reset interval to 30s\nconsecutiveEmptySyncs = 0]
    facts -->|no| incEmpty[consecutiveEmptySyncs++]
    incEmpty --> threshold{>= 3 empty syncs?}
    threshold -->|yes| doubleInterval[currentInterval = min currentInterval×2 max5min]
    threshold -->|no| keep[keep current interval]
    resetInterval --> scheduleNext[setTimeout syncAndSchedule\ncurrentInterval]
    doubleInterval --> scheduleNext
    keep --> scheduleNext
```
