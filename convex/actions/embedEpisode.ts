"use node";

/**
 * Async embedding generation for episodes.
 * Scheduled by createEpisode mutation after insert.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { generateEmbedding } from "./embed";

export const embedEpisode = internalAction({
  args: { episodeId: v.id("episodes") },
  handler: async (ctx, { episodeId }) => {
    const episode = await ctx.runQuery(
      internal.functions.episodes.getEpisodeInternal,
      { episodeId }
    );

    if (!episode) {
      console.error(`Episode not found: ${episodeId}`);
      return;
    }

    // Skip if already embedded (idempotency)
    if (episode.embedding && episode.embedding.length > 0) {
      console.log(`Episode ${episodeId} already embedded, skipping`);
      return;
    }

    // Compose embedding text from title + summary + tags
    const parts = [episode.title];
    if (episode.summary) parts.push(episode.summary);
    if (episode.tags.length > 0) parts.push(episode.tags.join(", "));
    const text = parts.join(". ");

    console.log(`Generating embedding for episode ${episodeId}`);
    const embedding = await generateEmbedding(text);

    await ctx.runMutation(
      internal.functions.episodes.updateEmbedding,
      { episodeId, embedding }
    );

    console.log(`Episode ${episodeId} embedded (${embedding.length} dims)`);
  },
});
