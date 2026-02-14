/**
 * memory_register_agent — Agent self-registration with capabilities and scopes
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const registerAgentSchema = z.object({
  agentId: z.string().max(128).describe("Unique agent identifier"),
  name: z.string().max(256).describe("Human-readable agent name"),
  capabilities: z.array(z.string()).optional().describe("Agent capabilities/skills"),
  defaultScope: z.string().optional().describe("Default scope name (will create if not exists)"),
  telos: z.string().optional().describe("Agent's telos/purpose"),
  isInnerCircle: z.boolean().optional().describe("Whether agent is part of inner circle (auto-join shared-personal scope)"),
});

export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;

export async function registerAgent(
  input: RegisterAgentInput
): Promise<{ agent: any; scopes: any[] } | { isError: true; message: string }> {
  try {
    // Ensure private scope exists (using dash convention: private-{agentId})
    const privateScopeName = `private-${input.agentId}`;
    let privateScope = await convex.getScopeByName(privateScopeName);

    if (!privateScope) {
      // Create private scope with correct args matching Convex mutation
      await convex.createScope({
        name: privateScopeName,
        description: `Private scope for ${input.name}`,
        members: [input.agentId],
        readPolicy: "members",
        writePolicy: "members",
      });

      // Re-fetch to get the full scope object with _id
      privateScope = await convex.getScopeByName(privateScopeName);

      if (!privateScope) {
        return {
          isError: true,
          message: "Failed to create private scope",
        };
      }
    }

    // Convex agents table stores defaultScope as scope name (string)
    const defaultScopeName = input.defaultScope ?? privateScopeName;

    // Register agent
    const agent = await convex.registerAgent({
      agentId: input.agentId,
      name: input.name,
      capabilities: input.capabilities || [],
      defaultScope: defaultScopeName,
      telos: input.telos,
      isInnerCircle: input.isInnerCircle,
    });

    if (!agent) {
      return {
        isError: true,
        message: "Failed to register agent",
      };
    }

    await convex.embedAgentCapabilities(input.agentId).catch((error) => {
      console.error("[register-agent] capability embedding failed:", error);
    });

    // Get all permitted scopes
    const scopes = await convex.getPermittedScopes(input.agentId);

    return {
      agent,
      scopes: Array.isArray(scopes) ? scopes : [privateScope],
    };
  } catch (error: any) {
    console.error("[register-agent] Error:", error);
    return {
      isError: true,
      message: `Failed to register agent: ${error.message}`,
    };
  }
}
