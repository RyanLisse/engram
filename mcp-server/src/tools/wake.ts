import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const CHECKPOINT_DIR = process.env.CHECKPOINT_DIR || path.resolve(process.cwd(), ".checkpoints");

export const wakeSchema = z.object({
  checkpointId: z.string(),
});

export type WakeInput = z.infer<typeof wakeSchema>;

export async function wake(input: WakeInput) {
  const checkpointFile = path.join(CHECKPOINT_DIR, `${input.checkpointId}.json`);
  const raw = await fs.readFile(checkpointFile, "utf8");
  const checkpoint = JSON.parse(raw);
  return {
    checkpointId: checkpoint.id,
    createdAt: checkpoint.createdAt,
    summary: checkpoint.summary,
    context: checkpoint.context,
  };
}
