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
  const ageDays = Math.floor((Date.now() - checkpoint.createdAt) / (24 * 60 * 60 * 1000));
  let filteredContext = checkpoint.context ?? [];

  if (ageDays === 0) {
    filteredContext = filteredContext.filter(
      (fact: any) => fact.importanceTier === "structural" || fact.importanceTier === "potential"
    );
  } else if (ageDays === 1) {
    const structural = filteredContext.filter((f: any) => f.importanceTier === "structural");
    const potential = filteredContext
      .filter((f: any) => f.importanceTier === "potential")
      .slice(0, 5);
    filteredContext = [...structural, ...potential];
  } else if (ageDays <= 3) {
    filteredContext = filteredContext.filter((f: any) => f.importanceTier === "structural");
  } else if (ageDays <= 6) {
    filteredContext = filteredContext
      .filter((f: any) => f.importanceTier === "structural")
      .slice(0, 3);
  } else {
    filteredContext = filteredContext.slice(0, 3);
  }

  return {
    checkpointId: checkpoint.id,
    createdAt: checkpoint.createdAt,
    ageDays,
    summary: checkpoint.summary,
    whoIWas: `Recap: ${checkpoint.summary || "No summary"}. Active context items: ${filteredContext.length}.`,
    context: filteredContext,
  };
}
