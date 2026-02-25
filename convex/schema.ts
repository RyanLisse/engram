import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const metadataValue = v.union(v.string(), v.number(), v.boolean(), v.null());

export default defineSchema({
  // ─── facts ───────────────────────────────────────────────────────────
  // Atomic memory units. The core table of Engram.
  // All optional fields are future-phase placeholders deployed on day 1
  // to avoid schema migrations. They cost nothing until populated.
  facts: defineTable({
    content: v.string(),
    factualSummary: v.optional(v.string()), // Compressed representation (SimpleMem)
    timestamp: v.number(),
    updatedAt: v.optional(v.number()), // Track modifications for sync
    vaultPath: v.optional(v.string()), // Relative vault path (e.g., private-indy/foo.md)
    vaultSyncedAt: v.optional(v.number()), // Last successful mirror sync timestamp
    confidence: v.optional(v.float64()), // 0.0-1.0 confidence score
    importanceTier: v.optional(v.string()), // structural|potential|contextual
    observationTier: v.optional(v.string()), // critical|notable|background
    observationCompressed: v.optional(v.boolean()), // whether background compression ran
    observationGeneration: v.optional(v.number()), // Observer generation that compressed this
    observationSessionId: v.optional(v.id("observation_sessions")),
    assertionType: v.optional(v.string()), // assertion|question|neutral
    referencedDate: v.optional(v.number()), // three-date temporal model
    observationOriginalContent: v.optional(v.string()), // original pre-compression text
    source: v.string(), // "direct"|"observation"|"import"|"consolidation"
    entityIds: v.array(v.string()),
    relevanceScore: v.float64(),
    accessedCount: v.number(),
    importanceScore: v.float64(),
    mergedContent: v.optional(v.string()), // dedup merged representation
    outcomeScore: v.optional(v.float64()), // MemRL: learned utility from outcomes
    createdBy: v.string(), // agent ID
    contributingAgents: v.optional(v.array(v.string())), // Collaborative Memory provenance
    conversationId: v.optional(v.id("conversations")),
    scopeId: v.id("memory_scopes"),
    tags: v.array(v.string()),
    factType: v.string(), // decision|observation|plan|error|insight|correction|steering_rule|learning|session_summary
    embedding: v.optional(v.array(v.float64())),
    compactEmbedding: v.optional(v.array(v.float64())), // k-dim subspace coefficients

    // Lifecycle (SimpleMem + ALMA)
    lifecycleState: v.string(), // active|dormant|merged|archived|pruned
    mergedInto: v.optional(v.id("facts")), // pointer if merged into consolidated fact
    consolidatedFrom: v.optional(v.array(v.id("facts"))), // originals this consolidated
    supersededBy: v.optional(v.id("facts")), // newer fact that replaced this
    forgetScore: v.optional(v.float64()), // 0.0=keep, 1.0=forget (ALMA)
    tokenEstimate: v.optional(v.number()), // estimated tokens for budgeted recall

    // Emotional memory (GIZIN)
    emotionalContext: v.optional(v.string()), // frustrated|proud|embarrassed|surprised|confident
    emotionalWeight: v.optional(v.float64()), // 0.0-1.0, affects decay resistance

    // Contradiction tracking (pre-computed by enrichment pipeline)
    lastContradictionCheck: v.optional(v.number()),
    contradictsWith: v.optional(v.array(v.id("facts"))),

    // Multi-graph links (MAGMA)
    temporalLinks: v.optional(
      v.array(
        v.object({
          targetFactId: v.id("facts"),
          relation: v.string(), // before|after|during|caused_by|led_to
          confidence: v.float64(),
        })
      )
    ),
  })
    .index("by_scope", ["scopeId", "timestamp"])
    .index("by_agent", ["createdBy", "timestamp"])
    .index("by_type", ["factType", "timestamp"])
    .index("by_importance", ["importanceScore"])
    .index("by_lifecycle", ["lifecycleState", "timestamp"])
    .index("by_vault_path", ["vaultPath"])
    .index("by_vault_synced", ["vaultSyncedAt"])
    .index("by_observation_tier", ["observationTier", "timestamp"])
    .index("unmirrored", ["vaultPath", "lifecycleState"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["scopeId", "factType", "createdBy"],
    })
    .index("by_observation_session", ["observationSessionId", "timestamp"])
    .vectorIndex("vector_search", {
      vectorField: "embedding",
      dimensions: 1024, // Cohere Embed 4 output
      filterFields: ["scopeId"],
    }),

  // ─── entities ────────────────────────────────────────────────────────
  // Named concepts: people, projects, companies, tools, concepts.
  // Relationship graph connects entities.
  entities: defineTable({
    entityId: v.string(), // "entity-ryan", "entity-briefly"
    name: v.string(),
    type: v.string(), // person|project|company|concept|tool
    firstSeen: v.number(),
    lastSeen: v.number(),
    metadata: v.record(v.string(), metadataValue), // flexible key-value
    backlinks: v.optional(v.array(v.id("facts"))), // facts that reference this entity
    relationships: v.array(
      v.object({
        targetId: v.string(),
        relationType: v.string(), // created_by|depends_on|works_with|part_of|related_to
        since: v.optional(v.string()),
      })
    ),
    importanceScore: v.float64(),
    accessCount: v.number(),
    createdBy: v.string(),
  })
    .index("by_entity_id", ["entityId"])
    .index("by_type", ["type"])
    .index("by_importance", ["importanceScore"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["type"],
    }),

  // ─── conversations ───────────────────────────────────────────────────
  // Thread facts together. Track participants and agent handoffs.
  conversations: defineTable({
    sessionId: v.id("sessions"),
    participants: v.array(v.string()), // agent IDs
    threadFacts: v.array(v.id("facts")),
    contextSummary: v.string(),
    importance: v.float64(),
    tags: v.array(v.string()),
    handoffs: v.array(
      v.object({
        fromAgent: v.string(),
        toAgent: v.string(),
        timestamp: v.number(),
        contextSummary: v.string(),
      })
    ),
  })
    .index("by_session", ["sessionId"])
    .index("by_importance", ["importance"]),

  // ─── sessions ────────────────────────────────────────────────────────
  // Agent work sessions. Links to conversations.
  sessions: defineTable({
    agentId: v.string(),
    startTime: v.number(),
    lastActivity: v.number(),
    conversationIds: v.array(v.id("conversations")),
    factCount: v.number(),
    contextSummary: v.string(),
    parentSession: v.optional(v.id("sessions")),
    nodeId: v.optional(v.string()), // OpenClaw node
  })
    .index("by_agent", ["agentId", "startTime"])
    .index("by_node", ["nodeId"]),

  // ─── agents ──────────────────────────────────────────────────────────
  // Registered agents with capabilities and default scope.
  agents: defineTable({
    agentId: v.string(), // "indy", "coder-1", "ml-worker"
    name: v.string(),
    nodeId: v.optional(v.string()),
    capabilities: v.array(v.string()),
    lastSeen: v.number(),
    factCount: v.number(),
    defaultScope: v.string(), // "private"|"team"|"public"
    telos: v.optional(v.string()), // Purpose/goal (PAI: "Ship code faster")
    settings: v.optional(v.record(v.string(), metadataValue)), // agent-specific memory config
    isInnerCircle: v.optional(v.boolean()), // Auto-join shared-personal scope
    capabilityEmbedding: v.optional(v.array(v.float64())), // Pre-computed for routing (Phase 2)
    identityContext: v.optional(v.string()), // Prompt-injected identity blurb
    promptStyle: v.optional(v.string()), // concise|balanced|verbose
  }).index("by_agent_id", ["agentId"]),

  // ─── memory_scopes ───────────────────────────────────────────────────
  // Access control groups. Scope-based, not per-fact ACLs.
  memory_scopes: defineTable({
    name: v.string(), // "project-briefly", "team-ml", "global"
    description: v.string(),
    members: v.array(v.string()), // agent IDs
    readPolicy: v.string(), // "members"|"all"
    writePolicy: v.string(), // "members"|"creator"|"all"
    adminPolicy: v.optional(v.string()), // "creator"|"members"|"admin_only"
    retentionDays: v.optional(v.number()),

    // Task-specific policies (ALMA)
    memoryPolicy: v.optional(
      v.object({
        maxFacts: v.optional(v.number()),
        decayRate: v.optional(v.float64()), // scope-specific (0.95-0.99)
        prioritizeTypes: v.optional(v.array(v.string())),
        autoForget: v.optional(v.boolean()),
        compressionStrategy: v.optional(v.string()), // summarize|prune|merge
        compactionThresholdBytes: v.optional(v.number()),
        dedupThreshold: v.optional(v.float64()),
      })
    ),

    // ISC for projects (PAI)
    idealStateCriteria: v.optional(
      v.array(
        v.object({
          criterion: v.string(),
          status: v.string(), // pending|met|failed
          evidence: v.optional(v.string()),
        })
      )
    ),
  })
    .index("by_name", ["name"])
    .index("by_read_policy", ["readPolicy"]),

  // ─── signals ─────────────────────────────────────────────────────────
  // PAI feedback loop. Explicit ratings + implicit sentiment.
  signals: defineTable({
    factId: v.optional(v.id("facts")),
    sessionId: v.optional(v.id("sessions")),
    agentId: v.string(),
    signalType: v.string(), // explicit_rating|implicit_sentiment|failure
    value: v.number(), // 1-10 for ratings, -1.0 to 1.0 for sentiment
    comment: v.optional(v.string()),
    confidence: v.optional(v.float64()),
    context: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_fact", ["factId", "timestamp"])
    .index("by_agent", ["agentId", "timestamp"])
    .index("by_type", ["signalType", "timestamp"]),

  // ─── themes ──────────────────────────────────────────────────────────
  // Thematic fact clusters (EverMemOS MemScenes pattern).
  // Hierarchical memory: themes group related facts.
  themes: defineTable({
    name: v.string(),
    description: v.string(),
    factIds: v.array(v.id("facts")),
    entityIds: v.array(v.id("entities")),
    scopeId: v.id("memory_scopes"),
    importance: v.float64(),
    lastUpdated: v.number(),
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_scope", ["scopeId"])
    .index("by_importance", ["importance"])
    .vectorIndex("theme_search", {
      vectorField: "embedding",
      dimensions: 1024, // Cohere Embed 4
      filterFields: ["scopeId"],
    }),

  // ─── sync_log ────────────────────────────────────────────────────────
  // Tracks per-node LanceDB sync status.
  sync_log: defineTable({
    nodeId: v.string(),
    lastSyncTimestamp: v.number(),
    factsSynced: v.number(),
    status: v.string(), // ok|error|syncing
  }).index("by_node", ["nodeId"]),

  // ─── notifications ───────────────────────────────────────────────────
  // Agent routing notifications generated from enriched facts.
  notifications: defineTable({
    agentId: v.string(),
    factId: v.id("facts"),
    reason: v.string(),
    read: v.boolean(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_agent_read", ["agentId", "read", "createdAt"])
    .index("by_expires", ["expiresAt"])
    .index("by_fact", ["factId"]),

  // ─── recall_feedback ────────────────────────────────────────────────
  // Mapping between recall sessions and fact usage signals.
  recall_feedback: defineTable({
    recallId: v.string(),
    factId: v.id("facts"),
    used: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_recall", ["recallId", "createdAt"])
    .index("by_fact", ["factId"])
    .index("by_created", ["createdAt"]),

  // ─── system_config ────────────────────────────────────────────────
  system_config: defineTable({
    key: v.string(),
    value: metadataValue,
    category: v.string(),
    description: v.string(),
    version: v.number(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_category", ["category"])
    .index("by_key", ["key"]),

  // ─── memory_policies ──────────────────────────────────────────────
  memory_policies: defineTable({
    scopeId: v.id("memory_scopes"),
    policyKey: v.string(),
    policyValue: metadataValue,
    priority: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_scope_key", ["scopeId", "policyKey"]),

  // ─── memory_events ────────────────────────────────────────────────
  memory_events: defineTable({
    eventType: v.string(),
    factId: v.optional(v.id("facts")),
    scopeId: v.optional(v.id("memory_scopes")),
    agentId: v.optional(v.string()),
    payload: v.optional(v.record(v.string(), metadataValue)),
    watermark: v.number(),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_scope_created", ["scopeId", "createdAt"])
    .index("by_watermark", ["watermark"])
    .index("by_agent_watermark", ["agentId", "watermark"])
    .index("by_scope_watermark", ["scopeId", "watermark"]),

  // ─── agent_performance ────────────────────────────────────────────
  // Tracks completion outcomes and pattern effectiveness for feedback loops.
  agent_performance: defineTable({
    agentId: v.string(),
    taskType: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    success: v.boolean(),
    linesChanged: v.number(),
    testsAdded: v.number(),
    violations: v.array(v.string()),
    qualityGradeBefore: v.string(),
    qualityGradeAfter: v.string(),
    templateUsed: v.optional(v.string()),
    patternsFollowed: v.array(v.string()),
    patternsViolated: v.array(v.string()),
    mergedAt: v.optional(v.number()),
    reviewTime: v.optional(v.number()),
    rollbackRequired: v.boolean(),
    wasHelpful: v.optional(v.boolean()),
    reusedCount: v.number(),
  })
    .index("by_agent", ["agentId", "startTime"])
    .index("by_task_type", ["taskType", "success"])
    .index("by_success", ["success", "endTime"]),

  // ─── scope_memberships ────────────────────────────────────────────
  // Join table for fast scope membership lookups (O(memberships) not O(all scopes)).
  scope_memberships: defineTable({
    agentId: v.string(),
    scopeId: v.id("memory_scopes"),
    role: v.union(v.literal("creator"), v.literal("member")),
    createdAt: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_scope", ["scopeId"])
    .index("by_agent_scope", ["agentId", "scopeId"]),

  // ─── observation_sessions ──────────────────────────────────────────
  // Per-scope, per-agent compression state tracker for Observer/Reflector pipeline.
  observation_sessions: defineTable({
    scopeId: v.id("memory_scopes"),
    agentId: v.string(),
    pendingTokenEstimate: v.number(),       // tokens of uncompressed observations
    summaryTokenEstimate: v.number(),       // tokens of accumulated summaries
    observerThreshold: v.number(),          // default 10000
    reflectorThreshold: v.number(),         // default 20000
    lastObserverRun: v.optional(v.number()),
    lastReflectorRun: v.optional(v.number()),
    observerGeneration: v.number(),         // increments each Observer run
    reflectorGeneration: v.number(),
    compressionLevel: v.number(),           // 0-3 escalating
    bufferFactId: v.optional(v.id("facts")),
    bufferReady: v.boolean(),
    bufferTokenEstimate: v.optional(v.number()),
    lastObserverFingerprint: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scope_agent", ["scopeId", "agentId"])
    .index("by_agent", ["agentId"]),

  // ─── key_value_facts ──────────────────────────────────────────
  // Deterministic key-value store for agent preferences, config, identity.
  key_value_facts: defineTable({
    key: v.string(),
    value: v.string(), // JSON-encoded for flexibility
    agentId: v.string(),
    scopeId: v.id("memory_scopes"),
    category: v.optional(v.string()), // "preference"|"config"|"identity"|"tool_state"
    metadata: v.optional(v.object({ source: v.optional(v.string()), confidence: v.optional(v.float64()) })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key_scope", ["key", "scopeId"])
    .index("by_agent", ["agentId", "scopeId"])
    .index("by_category", ["category", "scopeId"]),

  // ─── episodes ──────────────────────────────────────────────────
  // Episodic memory: group related facts into coherent episodes (e.g., daily summaries, workflows).
  episodes: defineTable({
    title: v.string(),
    summary: v.optional(v.string()),
    agentId: v.string(),
    scopeId: v.id("memory_scopes"),
    factIds: v.array(v.id("facts")),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    tags: v.array(v.string()),
    importanceScore: v.float64(),
    embedding: v.optional(v.array(v.float64())),
    createdAt: v.number(),
  })
    .index("by_agent_time", ["agentId", "startTime"])
    .index("by_scope", ["scopeId", "startTime"])
    .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 1024, filterFields: ["scopeId", "agentId"] }),

  // ─── knowledge_subspaces ──────────────────────────────────────
  // Semantic subspaces in memory: clustered fact regions with centroid vectors.
  knowledge_subspaces: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    agentId: v.string(),
    scopeId: v.id("memory_scopes"),
    factIds: v.array(v.id("facts")),
    centroid: v.optional(v.array(v.float64())),
    principalVectors: v.optional(v.array(v.array(v.float64()))),
    k: v.optional(v.number()),
    version: v.optional(v.number()),
    noveltyThreshold: v.optional(v.float64()),
    dimensionality: v.optional(v.number()),
    variance: v.optional(v.float64()),
    /** Per-component singular values from SVD (σ_i = sqrt(compVariance_i · totalVariance · n)). */
    singularValues: v.optional(v.array(v.float64())),
    /** Per-component explained variance fractions (each component's share of totalVariance). */
    componentVariances: v.optional(v.array(v.float64())),
    /** L1 singular value ratio: sum(kept σ_i) / sqrt(totalVariance · n). */
    singularValueRatio: v.optional(v.float64()),
    /** Compact embedding coefficients keyed by fact ID (Record<factId, number[]>). */
    compactEmbeddingsByFactId: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agent_scope", ["agentId", "scopeId"])
    .index("by_scope", ["scopeId"])
    .index("by_name", ["name", "scopeId"])
    .vectorIndex("by_centroid", { vectorField: "centroid", dimensions: 1024, filterFields: ["scopeId", "agentId"] }),

  // ─── agent_knowledge_profiles ──────────────────────────────
  // Per-agent learned embeddings and axis weights in knowledge subspaces.
  agent_knowledge_profiles: defineTable({
    agentId: v.string(),
    scopeId: v.id("memory_scopes"),
    subspaceId: v.id("knowledge_subspaces"),
    axisWeights: v.array(v.float64()),
    learnedFrom: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agent_scope", ["agentId", "scopeId"])
    .index("by_subspace", ["subspaceId"]),
});
