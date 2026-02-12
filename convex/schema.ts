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
    source: v.string(), // "direct"|"observation"|"import"|"consolidation"
    entityIds: v.array(v.string()),
    relevanceScore: v.float64(),
    accessedCount: v.number(),
    importanceScore: v.float64(),
    outcomeScore: v.optional(v.float64()), // MemRL: learned utility from outcomes
    createdBy: v.string(), // agent ID
    contributingAgents: v.optional(v.array(v.string())), // Collaborative Memory provenance
    conversationId: v.optional(v.id("conversations")),
    scopeId: v.id("memory_scopes"),
    tags: v.array(v.string()),
    factType: v.string(), // decision|observation|plan|error|insight|correction|steering_rule|learning|session_summary
    embedding: v.optional(v.array(v.float64())),

    // Lifecycle (SimpleMem + ALMA)
    lifecycleState: v.string(), // active|dormant|merged|archived|pruned
    mergedInto: v.optional(v.id("facts")), // pointer if merged into consolidated fact
    consolidatedFrom: v.optional(v.array(v.id("facts"))), // originals this consolidated
    supersededBy: v.optional(v.id("facts")), // newer fact that replaced this
    forgetScore: v.optional(v.float64()), // 0.0=keep, 1.0=forget (ALMA)

    // Emotional memory (GIZIN)
    emotionalContext: v.optional(v.string()), // frustrated|proud|embarrassed|surprised|confident
    emotionalWeight: v.optional(v.float64()), // 0.0-1.0, affects decay resistance

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
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["scopeId", "factType", "createdBy"],
    })
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
  }).index("by_agent_id", ["agentId"]),

  // ─── memory_scopes ───────────────────────────────────────────────────
  // Access control groups. Scope-based, not per-fact ACLs.
  memory_scopes: defineTable({
    name: v.string(), // "project-briefly", "team-ml", "global"
    description: v.string(),
    members: v.array(v.string()), // agent IDs
    readPolicy: v.string(), // "members"|"all"
    writePolicy: v.string(), // "members"|"creator"|"all"
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
  }).index("by_name", ["name"]),

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
});
