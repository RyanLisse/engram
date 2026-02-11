import { internalMutation } from "../_generated/server";

/**
 * Seed the database with initial scopes, entities, and sample facts.
 * Run via: npx convex run functions/seed:seedAll
 *
 * Uses a single atomic transaction for each batch (Institutional Learning #4).
 */

export const seedAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    // ─── 1. Create Default Scopes ──────────────────────────────────
    const globalScope = await ctx.db.insert("memory_scopes", {
      name: "global",
      description: "Shared memory visible to all agents",
      members: [],
      readPolicy: "all",
      writePolicy: "all",
    });

    const privateIndy = await ctx.db.insert("memory_scopes", {
      name: "private-indy",
      description: "Indy's private memory scope",
      members: ["indy"],
      readPolicy: "members",
      writePolicy: "members",
    });

    // ─── 2. Create Initial Entities ────────────────────────────────
    const now = Date.now();

    const entityDefs = [
      {
        entityId: "entity-ryan",
        name: "Ryan",
        type: "person",
        metadata: { role: "creator", github: "RyanLisse" },
        relationships: [
          { targetId: "entity-openclaw", relationType: "created_by", since: "2024" },
          { targetId: "entity-engram", relationType: "created_by", since: "2026" },
        ],
        importanceScore: 1.0,
        createdBy: "indy",
      },
      {
        entityId: "entity-indy",
        name: "Indy",
        type: "person",
        metadata: { role: "primary-agent", model: "claude-opus-4-6" },
        relationships: [
          { targetId: "entity-ryan", relationType: "works_with" },
          { targetId: "entity-engram", relationType: "works_with", since: "2026" },
        ],
        importanceScore: 1.0,
        createdBy: "indy",
      },
      {
        entityId: "entity-openclaw",
        name: "OpenClaw",
        type: "project",
        metadata: { description: "Multi-agent system" },
        relationships: [
          { targetId: "entity-ryan", relationType: "created_by" },
          { targetId: "entity-engram", relationType: "depends_on" },
        ],
        importanceScore: 0.9,
        createdBy: "indy",
      },
      {
        entityId: "entity-engram",
        name: "Engram",
        type: "project",
        metadata: { description: "Unified multi-agent memory system", repo: "RyanLisse/engram" },
        relationships: [
          { targetId: "entity-convex", relationType: "depends_on" },
          { targetId: "entity-lancedb", relationType: "depends_on" },
          { targetId: "entity-cohere", relationType: "depends_on" },
        ],
        importanceScore: 1.0,
        createdBy: "indy",
      },
      {
        entityId: "entity-convex",
        name: "Convex",
        type: "tool",
        metadata: { description: "Cloud backend with native vector search", url: "convex.dev" },
        relationships: [
          { targetId: "entity-engram", relationType: "part_of" },
        ],
        importanceScore: 0.8,
        createdBy: "indy",
      },
      {
        entityId: "entity-lancedb",
        name: "LanceDB",
        type: "tool",
        metadata: { description: "Local vector database for sub-10ms offline search" },
        relationships: [
          { targetId: "entity-engram", relationType: "part_of" },
        ],
        importanceScore: 0.7,
        createdBy: "indy",
      },
      {
        entityId: "entity-cohere",
        name: "Cohere",
        type: "tool",
        metadata: { description: "Embed 4 multimodal embeddings (1024-dim)", model: "embed-4" },
        relationships: [
          { targetId: "entity-engram", relationType: "part_of" },
        ],
        importanceScore: 0.7,
        createdBy: "indy",
      },
    ];

    const entityIds: Record<string, any> = {};
    for (const def of entityDefs) {
      const id = await ctx.db.insert("entities", {
        ...def,
        firstSeen: now,
        lastSeen: now,
        accessCount: 0,
      });
      entityIds[def.entityId] = id;
    }

    // ─── 3. Register Default Agent ─────────────────────────────────
    await ctx.db.insert("agents", {
      agentId: "indy",
      name: "Indy",
      capabilities: ["memory", "code", "research", "planning"],
      lastSeen: now,
      factCount: 0,
      defaultScope: "private",
      telos: "Magnify Ryan's capabilities across all projects",
    });

    // ─── 4. Insert Sample Facts ────────────────────────────────────
    const sampleFacts = [
      {
        content: "Engram uses Convex as its cloud backend with 10 tables, native vector search, and scheduled functions for memory lifecycle management.",
        source: "direct" as const,
        entityIds: ["entity-engram", "entity-convex"],
        tags: ["architecture", "tech-stack"],
        factType: "decision",
        scopeId: globalScope,
        createdBy: "indy",
        importanceScore: 0.9,
      },
      {
        content: "Cohere Embed 4 was chosen for multimodal embeddings (1024 dimensions) — supports text, images, and code in a single embedding space.",
        source: "direct" as const,
        entityIds: ["entity-cohere", "entity-engram"],
        tags: ["embeddings", "tech-stack"],
        factType: "decision",
        scopeId: globalScope,
        createdBy: "indy",
        importanceScore: 0.85,
      },
      {
        content: "Memory lifecycle follows a 5-state machine: active -> dormant -> merged -> archived -> pruned. Merge before delete. Never true-delete facts.",
        source: "direct" as const,
        entityIds: ["entity-engram"],
        tags: ["architecture", "lifecycle"],
        factType: "insight",
        scopeId: globalScope,
        createdBy: "indy",
        importanceScore: 0.8,
      },
      {
        content: "Ryan created OpenClaw as a multi-agent system. Engram is the shared memory layer that all OpenClaw agents plug into.",
        source: "direct" as const,
        entityIds: ["entity-ryan", "entity-openclaw", "entity-engram"],
        tags: ["context", "people"],
        factType: "observation",
        scopeId: globalScope,
        createdBy: "indy",
        importanceScore: 0.75,
      },
    ];

    for (const fact of sampleFacts) {
      await ctx.db.insert("facts", {
        ...fact,
        timestamp: now,
        relevanceScore: 1.0,
        accessedCount: 0,
        lifecycleState: "active",
      });
    }

    return {
      scopes: { global: globalScope, privateIndy: privateIndy },
      entities: Object.keys(entityIds).length,
      facts: sampleFacts.length,
      agents: 1,
    };
  },
});
