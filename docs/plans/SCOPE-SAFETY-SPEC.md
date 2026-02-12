# Scope Safety Specification

## Rules

### Rule 1
All recall queries MUST include scope filtering.

### Rule 2
Multi-scope recall must explicitly pass `scopeIds[]`.

### Rule 3
Filtering MUST occur in Convex layer (server-side).

### Rule 4
Client-side filtering is NOT sufficient.

---

## Implementation

### New Convex Query: `searchFactsMulti`
```typescript
// convex/functions/facts.ts
export const searchFactsMulti = query({
  args: {
    query: v.string(),
    scopeIds: v.array(v.id("memory_scopes")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Fan-out per scope, merge results
    const results = await Promise.all(
      args.scopeIds.map(scopeId =>
        ctx.db.query("facts")
          .withSearchIndex("search_content", q => 
            q.search("content", args.query).eq("scopeId", scopeId))
          .take(args.limit ?? 20)
      )
    );
    return dedupeAndMerge(results.flat());
  },
});
```

### New Convex Query: `vectorRecall`
```typescript
export const vectorRecall = query({
  args: {
    embedding: v.array(v.float64()),
    scopeIds: v.array(v.id("memory_scopes")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const results = await Promise.all(
      args.scopeIds.map(scopeId =>
        ctx.vectorSearch("facts", "vector_search", {
          vector: args.embedding,
          filter: q => q.eq("scopeId", scopeId),
          limit: args.limit ?? 20,
        })
      )
    );
    return dedupeAndMerge(results.flat());
  },
});
```

---

## Required Tests

- [ ] Agent A cannot recall from private scope of Agent B
- [ ] `readPolicy: "all"` allows recall across agents
- [ ] `writePolicy` enforced on `storeFact`
- [ ] Multi-scope recall merges only permitted scopes
- [ ] Single-scope recall uses same code path (consistency)
- [ ] Empty scopeIds returns empty results (never unfiltered)
