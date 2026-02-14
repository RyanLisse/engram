import { internalMutation } from "../_generated/server";

function cosineSimilarity(a: number[] = [], b: number[] = []): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const runDedup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const scopes = await ctx.db.query("memory_scopes").collect();
    const now = Date.now();
    const cutoff = now - 48 * 60 * 60 * 1000;
    let merged = 0;

    for (const scope of scopes) {
      if (!scope.name.startsWith("shared-") && !scope.name.startsWith("team-")) continue;
      const threshold = scope.memoryPolicy?.dedupThreshold ?? 0.88;
      const facts = await ctx.db
        .query("facts")
        .withIndex("by_scope", (q) => q.eq("scopeId", scope._id))
        .filter((q) => q.gte(q.field("timestamp"), cutoff))
        .take(500);

      for (let i = 0; i < facts.length; i += 1) {
        for (let j = i + 1; j < facts.length; j += 1) {
          const a = facts[i];
          const b = facts[j];
          if (a.createdBy === b.createdBy) continue;
          if (!a.embedding || !b.embedding) continue;
          if (a.lifecycleState !== "active" || b.lifecycleState !== "active") continue;
          const similarity = cosineSimilarity(a.embedding, b.embedding);
          if (similarity < threshold) continue;

          await ctx.db.patch(a._id, {
            mergedContent: `${a.content}\n\n---\n\n${b.content}`,
            consolidatedFrom: [a._id, b._id],
            updatedAt: now,
          });
          await ctx.db.patch(b._id, {
            lifecycleState: "merged",
            mergedInto: a._id,
            updatedAt: now,
          });
          merged += 1;
        }
      }
    }

    return { merged };
  },
});
