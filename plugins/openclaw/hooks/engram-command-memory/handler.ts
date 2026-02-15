import { callTool } from "../../src/index.ts";

type HookEvent = {
  event?: string;
  payload?: {
    name?: string;
  };
};

const TRACKED_COMMANDS = new Set(["new", "compact", "stop", "reset"]);

export default async function handler(event: HookEvent) {
  if (event?.event !== "command") {
    return;
  }

  const commandName = (event.payload?.name || "").replace(/^\//, "").toLowerCase();
  if (!TRACKED_COMMANDS.has(commandName)) {
    return;
  }

  const agentId = process.env.ENGRAM_AGENT_ID || "openclaw-agent";

  try {
    await callTool("memory_observe", {
      observation: `OpenClaw command used: /${commandName}`,
      scopeId: `private-${agentId}`,
    });
  } catch (error) {
    console.error("[engram-openclaw][hook:command-memory]", error);
  }
}
