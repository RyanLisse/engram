import { z } from "zod";

export const bootstrapVerifyLineSchema = z.object({
  line: z.string().describe("Single JSONL line from a session file"),
});

export type BootstrapVerifyLineInput = z.infer<typeof bootstrapVerifyLineSchema>;

export async function bootstrapVerifyLine(args: BootstrapVerifyLineInput) {
  try {
    const { line } = args;
    const parsed = JSON.parse(line);
    const msg = parsed.message;
    if (!msg || msg.role !== "user" || msg.content.length < 10) {
      return {
        content: [{ type: "text", text: "Line ignored: not a significant user message." }],
      };
    }

    // Mirroring Rust classification logic in TS for verification
    const lower = msg.content.toLowerCase();
    let factType = "note";
    let importance = 0.4;

    if (
      lower.includes("actually,") ||
      lower.includes("no, i") ||
      lower.includes("that's wrong") ||
      lower.includes("scratch that") ||
      lower.includes("revert") ||
      lower.includes("incorrect") ||
      lower.includes("mistake")
    ) {
      factType = "correction";
      importance = 0.95;
    } else if (
      lower.includes("i prefer") ||
      lower.includes("i like") ||
      lower.includes("always use") ||
      lower.includes("never use") ||
      lower.includes("strictly") ||
      lower.includes("constraint") ||
      lower.includes("requirement") ||
      lower.includes("must be") ||
      lower.includes("should be")
    ) {
      factType = "preference";
      importance = 0.85;
    } else if (
      lower.includes("architecture") ||
      lower.includes("implementation") ||
      lower.includes("endpoint") ||
      lower.includes("schema") ||
      lower.includes("interface") ||
      lower.includes("module") ||
      lower.includes("crate") ||
      lower.includes("dependency") ||
      lower.includes("layer")
    ) {
      factType = "technical_spec";
      importance = 0.75;
    } else if (
      lower.includes("let's go with") ||
      lower.includes("we'll use") ||
      lower.includes("decided to") ||
      lower.includes("implement this") ||
      lower.includes("go with") ||
      lower.includes("choice")
    ) {
      factType = "decision";
      importance = 0.7;
    }

    return {
      content: [
        {
          type: "text",
          text: `Successfully parsed fact:\n- Type: ${factType}\n- Importance: ${importance}\n- Content: ${msg.content.substring(
            0,
            100
          )}...`,
        },
      ],
    };
  } catch (e: any) {
    return {
      isError: true,
      content: [{ type: "text", text: `Failed to parse line: ${e.message}` }],
    };
  }
}
