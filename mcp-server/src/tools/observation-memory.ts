/**
 * Observation Memory tools — manual triggers and status for the Observer/Reflector pipeline.
 *
 * Three primitives:
 * - memory_om_status: observation window state
 * - memory_observe_compress: manually trigger Observer
 * - memory_reflect: manually trigger Reflector
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

// ── memory_om_status ──────────────────────────────────

export const omStatusSchema = z.object({
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent's private scope)"),
});

export async function omStatus(
  input: z.infer<typeof omStatusSchema>,
  agentId: string
) {
  const scopeId = await resolveScopeId(input.scopeId, agentId);
  if (!scopeId) {
    return { isError: true, message: "Could not resolve scope" };
  }

  const session = await convex.getObservationSession(scopeId, agentId);

  if (!session) {
    return {
      active: false,
      message: "No observation session found. Observations will auto-create one.",
    };
  }

  return {
    active: true,
    pendingTokens: session.pendingTokenEstimate,
    summaryTokens: session.summaryTokenEstimate,
    observerThreshold: session.observerThreshold,
    reflectorThreshold: session.reflectorThreshold,
    compressionLevel: session.compressionLevel,
    observerGeneration: session.observerGeneration,
    reflectorGeneration: session.reflectorGeneration,
    bufferReady: session.bufferReady,
    lastObserverRun: session.lastObserverRun
      ? new Date(session.lastObserverRun).toISOString()
      : null,
    lastReflectorRun: session.lastReflectorRun
      ? new Date(session.lastReflectorRun).toISOString()
      : null,
    pendingPercentage: session.observerThreshold > 0
      ? Math.round((session.pendingTokenEstimate / session.observerThreshold) * 100)
      : 0,
    summaryPercentage: session.reflectorThreshold > 0
      ? Math.round((session.summaryTokenEstimate / session.reflectorThreshold) * 100)
      : 0,
  };
}

// ── memory_observe_compress ───────────────────────────

export const observeCompressSchema = z.object({
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent's private scope)"),
  compressionLevel: z.number().min(0).max(3).optional().describe("Compression level 0-3 (default: auto from session)"),
});

export async function observeCompress(
  input: z.infer<typeof observeCompressSchema>,
  agentId: string
) {
  const scopeId = await resolveScopeId(input.scopeId, agentId);
  if (!scopeId) {
    return { isError: true, message: "Could not resolve scope" };
  }

  try {
    const result = await convex.runObserver(scopeId, agentId, input.compressionLevel);
    return result;
  } catch (error: any) {
    return { isError: true, message: `Observer failed: ${error.message}` };
  }
}

// ── memory_reflect ────────────────────────────────────

export const reflectSchema = z.object({
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent's private scope)"),
});

export async function reflect(
  input: z.infer<typeof reflectSchema>,
  agentId: string
) {
  const scopeId = await resolveScopeId(input.scopeId, agentId);
  if (!scopeId) {
    return { isError: true, message: "Could not resolve scope" };
  }

  try {
    const result = await convex.runReflector(scopeId, agentId);
    return result;
  } catch (error: any) {
    return { isError: true, message: `Reflector failed: ${error.message}` };
  }
}

// ── Helpers ───────────────────────────────────────────

async function resolveScopeId(scopeId: string | undefined, agentId: string): Promise<string | null> {
  if (scopeId) {
    if (scopeId.startsWith("j") || scopeId.startsWith("k")) return scopeId; // Convex ID
    const scope = await convex.getScopeByName(scopeId);
    return scope?._id ?? null;
  }

  // Default to agent's private scope
  const agent = await convex.getAgentByAgentId(agentId);
  if (agent?.defaultScope) return agent.defaultScope;

  const privateScope = await convex.getScopeByName(`private-${agentId}`);
  return privateScope?._id ?? null;
}
