import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import * as convex from "../lib/convex-client.js";

const CHECKPOINT_DIR = process.env.CHECKPOINT_DIR || path.resolve(process.cwd(), ".checkpoints");

export const checkpointSchema = z.object({
  name: z.string().optional(),
  scopeId: z.string().optional(),
  summary: z.string().optional(),
});

export type CheckpointInput = z.infer<typeof checkpointSchema>;

export async function checkpoint(input: CheckpointInput, agentId: string) {
  await fs.mkdir(CHECKPOINT_DIR, { recursive: true });
  const createdAt = Date.now();
  const id = `${input.name || "checkpoint"}-${createdAt}`;
  const scopeId = input.scopeId || `private-${agentId}`;

  const context = await convex.searchFacts({
    query: input.summary || "checkpoint",
    limit: 30,
    scopeIds: [scopeId],
  });

  const checkpointFile = path.join(CHECKPOINT_DIR, `${id}.json`);
  await fs.writeFile(
    checkpointFile,
    JSON.stringify({ id, createdAt, agentId, scopeId, summary: input.summary, context }, null, 2),
    "utf8"
  );

  return { checkpointId: id, checkpointFile, factCount: Array.isArray(context) ? context.length : 0 };
}
