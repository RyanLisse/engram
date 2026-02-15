import { callTool } from "../../src/index.ts";

type HookEvent = {
  event?: string;
  payload?: {
    agentId?: string;
    name?: string;
  };
};

export default async function handler(event: HookEvent) {
  if (event?.event !== "gateway:startup") {
    return;
  }

  const agentId = event.payload?.agentId || process.env.ENGRAM_AGENT_ID || "openclaw-agent";
  const name = event.payload?.name || agentId;

  try {
    await callTool("memory_register_agent", {
      agentId,
      name,
      capabilities: ["openclaw", "memory"],
      defaultScope: "shared-personal",
    });
  } catch (error) {
    console.error("[engram-openclaw][hook:session-register]", error);
  }
}
