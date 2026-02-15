# Usage Examples

Practical examples for common Engram workflows.

## Example 1: Register Agent and Bootstrap Scope

Every agent must register on first use:

```typescript
// Register the agent
const registration = await memory_register_agent({
  agentId: "researcher",
  name: "Research Agent",
  capabilities: ["research", "synthesis", "analysis"],
  defaultScope: "private-researcher",  // Auto-created
  telos: "Conduct thorough research and synthesize findings",
  isInnerCircle: false  // Set true for personal agent ecosystem
})

console.log("Agent registered:", registration.agentId)
console.log("Default scope:", registration.defaultScope)
```

## Example 2: Store Facts and Observations

### Basic Fact Storage

```typescript
// Store an atomic fact
const fact = await memory_store_fact({
  content: "Found excellent paper on memory consolidation by Smith et al. 2024",
  source: "research-session",
  factType: "insight",
  tags: ["research", "memory-systems", "consolidation"],
  emotionalContext: "excited"
})

console.log("Stored fact:", fact.factId)
```

### Fire-and-Forget Observation

```typescript
// For passive observations (doesn't block)
await memory_observe({
  observation: "User prefers TypeScript over JavaScript for this project",
  emotionalContext: "neutral"
})

// Continues immediately, observation processed async
```

### Fact with Entity Links

```typescript
// Store fact and link to entities
await memory_store_fact({
  content: "Met with John Smith to discuss Q3 roadmap",
  source: "meeting-notes",
  factType: "decision",
  entityIds: ["person:john-smith", "project:q3-roadmap"]
})

// Create/update entity if doesn't exist
await memory_link_entity({
  entityId: "person:john-smith",
  name: "John Smith",
  type: "person",
  metadata: { role: "Product Manager", team: "Engineering" }
})
```

## Example 3: Semantic Recall

### Basic Recall

```typescript
// Semantic search returns most relevant facts
const results = await memory_recall({
  query: "memory consolidation research",
  limit: 10
})

results.facts.forEach(fact => {
  console.log(`[${fact.importanceScore.toFixed(2)}] ${fact.content}`)
})

console.log("Recall ID:", results.recallId)  // For feedback tracking
```

### Scoped Recall

```typescript
// Search within specific scope
const projectFacts = await memory_recall({
  query: "authentication implementation",
  scopeId: "project-api-refactor",
  limit: 20
})
```

### Multi-Factor Recall

```typescript
// Combine filters for precise results
const decisions = await memory_recall({
  query: "database migration decisions",
  factType: "decision",
  minImportance: 0.7,
  limit: 5
})
```

## Example 4: Primitive Recall Composition

For advanced control, combine primitives:

```typescript
// Step 1: Text search for broad matches
const textResults = await memory_text_search({
  query: "API authentication",
  scopeId: "project-api"
})

// Step 2: Vector search for semantic similarity
const vectorResults = await memory_vector_search({
  query: "API authentication",
  scopeId: "project-api"
})

// Step 3: Merge and deduplicate
const allFactIds = [...new Set([
  ...textResults.map(f => f.factId),
  ...vectorResults.map(f => f.factId)
])]

// Step 4: Record recall for feedback
const recallId = await memory_record_recall({
  factIds: allFactIds,
  query: "API authentication"
})

console.log("Custom recall ID:", recallId)
```

## Example 5: Context Warm-Start

Get comprehensive context for a topic:

```typescript
// Load context with facts + entities + themes
const context = await memory_get_context({
  topic: "user authentication system",
  maxFacts: 30,
  tokenBudget: 6000,
  profile: "planning",  // Optimized for architecture planning
  includeEntities: true,
  includeThemes: true
})

console.log("Summary:", context.summary)
console.log("Facts:", context.facts.length)
console.log("Entities:", context.entities.length)
console.log("Themes:", context.themes.length)

// Inject into LLM context
const prompt = `
Context about user authentication:
${context.summary}

Key entities: ${context.entities.map(e => e.name).join(", ")}

Relevant facts:
${context.facts.map(f => `- ${f.content}`).join("\n")}

Now let's plan the implementation...
`
```

## Example 6: Feedback Loop

### Explicit Ratings

```typescript
// Rate a fact (1-10)
await memory_record_signal({
  factId: "fact_abc123",
  signalType: "rating",
  value: 9,
  comment: "Critical decision that shaped entire architecture",
  context: "architecture-review"
})

// Sentiment feedback (-1 to 1)
await memory_record_signal({
  factId: "fact_xyz789",
  signalType: "sentiment",
  value: 0.8,  // Positive
  context: "user-feedback"
})
```

### Post-Recall Usefulness Tracking

```typescript
// After using recall results
const recallId = results.recallId

// Mark which facts were actually useful
await memory_record_feedback({
  recallId: recallId,
  usedFactIds: ["fact_1", "fact_3", "fact_7"],  // These helped
  unusedFactIds: ["fact_2", "fact_4", "fact_5", "fact_6"]  // These didn't
})

// System learns which facts to prioritize
```

## Example 7: Scope Management

### Create Project Scope

```typescript
// Multi-agent project scope
await memory_scope_create({
  name: "project-mobile-app",
  type: "project",
  members: ["frontend-agent", "backend-agent", "qa-agent"],
  readPolicy: "members",
  writePolicy: "members",
  retentionDays: 365
})
```

### Scope Policy Overrides

```typescript
// Never decay decisions in this scope
await memory_policy_set({
  scopeId: "project-mobile-app",
  policyKey: "decay_rate_decision",
  value: 0
})

// Higher recall limit for research scope
await memory_policy_set({
  scopeId: "research-papers",
  policyKey: "recall_limit",
  value: 50
})
```

## Example 8: Event Polling (Watermark Pattern)

Real-time memory events:

```typescript
let watermark = 0

// Poll loop
setInterval(async () => {
  const events = await memory_events_poll({
    watermark: watermark,
    limit: 100
  })

  for (const event of events.events) {
    console.log(`Event ${event.watermark}: ${event.type} - ${event.factId}`)

    if (event.type === "fact_stored") {
      // React to new facts
      console.log("New fact:", event.data.content)
    } else if (event.type === "fact_archived") {
      // React to archival
      console.log("Fact archived:", event.factId)
    }

    watermark = event.watermark
  }
}, 5000)  // Poll every 5 seconds
```

## Example 9: Theme Creation and Graph Export

### Consolidate Facts into Theme

```typescript
// Merge related facts about a topic
const theme = await memory_summarize({
  topic: "authentication implementation",
  maxFacts: 50
})

console.log("Theme created:", theme.themeId)
console.log("Consolidated:", theme.consolidatedCount, "facts")
```

### Export Memory Graph

```typescript
// Export Obsidian-style graph
const graph = await memory_export_graph({
  includeContent: true  // Include fact content for edge detection
})

console.log("Nodes:", graph.nodes.length)
console.log("Edges:", graph.edges.length)

// Save to JSON
fs.writeFileSync("memory-graph.json", JSON.stringify(graph, null, 2))
```

## Example 10: Vault Sync Maintenance

### Export to Obsidian

```typescript
// Export facts as markdown files
await memory_vault_sync({
  direction: "export",
  scopeId: "project-mobile-app",  // Optional: filter by scope
  dryRun: false
})

// Files created in $VAULT_ROOT/engram/facts/
```

### Import from Obsidian

```typescript
// Import markdown files back to Engram
await memory_vault_sync({
  direction: "import",
  dryRun: true  // Preview first
})

// Check preview, then actually import
await memory_vault_sync({
  direction: "import",
  dryRun: false
})
```

### Bidirectional Sync

```typescript
// Export then import (full sync)
await memory_vault_sync({
  direction: "both",
  force: true  // Override safety checks for large batches
})
```

## Example 11: Session Checkpoint/Wake

### Create Checkpoint

```typescript
// Save durable session snapshot
const checkpoint = await memory_checkpoint({
  name: "research-session-2024-02-15",
  summary: "Completed literature review on memory systems",
  scopeId: "research-papers"
})

console.log("Checkpoint ID:", checkpoint.checkpointId)
```

### Restore from Checkpoint

```typescript
// Resume from previous session
const context = await memory_wake({
  checkpointId: "checkpoint_abc123"
})

console.log("Restored facts:", context.facts.length)
console.log("Session summary:", context.summary)

// Continue working with context
```

## Example 12: Admin Operations

### Re-embed All Facts

```typescript
// Force regenerate all embeddings (expensive!)
await memory_admin_reembed_all({
  scopeId: "specific-scope",  // Optional: limit to scope
  batchSize: 100
})
```

### Check System Health

```typescript
// Verify embedding coverage
const health = await memory_admin_check_embeddings()

console.log("Total facts:", health.totalFacts)
console.log("Embedded:", health.embeddedFacts)
console.log("Missing embeddings:", health.missingEmbeddings)
```

### Prune Stale Facts

```typescript
// Preview what will be pruned
const preview = await memory_prune({
  olderThanDays: 90,
  maxForgetScore: 0.3,
  dryRun: true
})

console.log("Would prune:", preview.prunedCount, "facts")

// Actually prune
await memory_prune({
  olderThanDays: 90,
  maxForgetScore: 0.3,
  dryRun: false
})
```

## Next Steps

- Read [API-REFERENCE.md](./API-REFERENCE.md) for complete tool documentation
- See [GETTING-STARTED.md](./GETTING-STARTED.md) for workflow guidance
- Review [PHILOSOPHY.md](./PHILOSOPHY.md) for design principles
- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) if issues arise
