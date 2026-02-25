/**
 * memory_store_fact — Store atomic fact with async enrichment
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";
import { autoLinkEntities } from "../lib/auto-linker.js";

// ── Deterministic fact classification and KV extraction ─────────────────────
// Patterns that identify facts with a single authoritative value suitable for
// KV storage (point-lookup) rather than vector search. Runs in <0.1ms per call.

interface KvPair {
  key: string;
  value: string;
}

/**
 * Try to parse a KV pair from a single-line content string.
 *
 * Handles patterns:
 *   "key = value"   "key: value"   "key -> value"
 *   "my name is Alice"  "I prefer dark mode"
 *   "setting_name: val"
 *
 * Returns null if no parseable KV structure is found.
 */
function parseKvPair(line: string): KvPair | null {
  // Explicit assignment: "key = value" or "key: value" or "key -> value"
  const assignMatch = line.match(/^([\w.\-/ ]{1,60}?)\s*(?:=|->|=>)\s*(.+)$/i);
  if (assignMatch) {
    return { key: assignMatch[1].trim().toLowerCase().replace(/\s+/g, "_"), value: assignMatch[2].trim() };
  }

  // "my <noun> is <value>" → key="noun", value="value"
  const identityMatch = line.match(/^(?:my|the|this)\s+([\w\s]{1,30}?)\s+(?:is|are|was)\s+(.+)$/i);
  if (identityMatch) {
    return { key: identityMatch[1].trim().toLowerCase().replace(/\s+/g, "_"), value: identityMatch[2].trim() };
  }

  // "I prefer <value>" → key="preference", value="value"
  const preferMatch = line.match(/^(?:i|we)\s+prefer\s+(.+)$/i);
  if (preferMatch) {
    return { key: "preference", value: preferMatch[1].trim() };
  }

  // Config declarations: "setting: value" (short key, any value)
  const colonMatch = line.match(/^([\w.\-]{1,40}):\s+(\S.*)$/);
  if (colonMatch) {
    return { key: colonMatch[1].toLowerCase(), value: colonMatch[2].trim() };
  }

  return null;
}

/**
 * Classify whether content describes a deterministic (KV-style) fact.
 *
 * Returns the parsed KV pair when classifiable, null otherwise.
 * Only single-line short content is classified — multi-line is always narrative.
 */
function classifyDeterministic(content: string): KvPair | null {
  const line = content.trim();
  if (line.includes("\n") || line.length > 300) return null;
  return parseKvPair(line);
}

export const storeFactSchema = z.object({
  content: z.string().max(10_000_000).describe("The fact content to store"),
  source: z.string().optional().describe("Source of the fact (e.g., conversation, observation)"),
  entityIds: z.array(z.string()).optional().describe("Entity IDs related to this fact"),
  tags: z.array(z.string().max(100)).optional().describe("Tags for categorization"),
  factType: z.string().optional().describe("Type of fact (e.g., decision, observation, insight)"),
  scopeId: z.string().optional().describe("Scope ID or name (defaults to agent's private scope)"),
  emotionalContext: z.string().optional().describe("Emotional context or sentiment"),
});

export type StoreFactInput = z.infer<typeof storeFactSchema>;

export async function storeFact(
  input: StoreFactInput,
  agentId: string
): Promise<{ factId: string; importanceScore: number; deterministic: boolean } | { isError: true; message: string }> {
  try {
    // ── Deterministic classification ──
    const kvPair = classifyDeterministic(input.content);
    const isDeterministic = kvPair !== null;

    // Resolve scopeId - find a scope reference, then resolve name to ID
    let resolvedScopeId = input.scopeId;

    if (!resolvedScopeId) {
      const agent = await convex.getAgentByAgentId(agentId);
      if (agent && agent.defaultScope) {
        resolvedScopeId = agent.defaultScope;
      }
      if (!resolvedScopeId) {
        const privateScope = await convex.getScopeByName(`private-${agentId}`);
        if (privateScope) {
          resolvedScopeId = privateScope._id;
        } else {
          return {
            isError: true,
            message: `Agent ${agentId} has no default scope and private scope not found`,
          };
        }
      }
    }

    // Resolve name to Convex ID if needed
    if (resolvedScopeId && !resolvedScopeId.startsWith("j")) {
      const scope = await convex.getScopeByName(resolvedScopeId);
      if (!scope) {
        return {
          isError: true,
          message: `Scope "${resolvedScopeId}" not found`,
        };
      }
      resolvedScopeId = scope._id;
    }

    const entityIds = input.entityIds ?? [];
    const entities = await Promise.all(
      entityIds.map((id) => convex.getEntityByEntityId(id))
    );
    const entityNames = entityIds.map((id, i) => entities[i]?.name ?? id);
    const linkedContent = autoLinkEntities(input.content, entityNames);

    // ── KV routing for deterministic facts ──
    // When a KV pair was extracted, route to the KV store for point-lookup
    // semantics. Falls through to the normal pipeline on any error so that
    // memory is never silently dropped.
    if (kvPair !== null) {
      try {
        const kvResult = await convex.kvSet({
          key: kvPair.key,
          value: kvPair.value,
          agentId,
          scopeId: resolvedScopeId as string,
          metadata: { source: input.source },
        });
        if (kvResult) {
          return {
            factId: (kvResult as any).factId ?? kvPair.key,
            importanceScore: 1.0,
            deterministic: true,
          };
        }
      } catch (kvErr: any) {
        console.error("[store-fact] kvSet failed, falling through to normal pipeline:", kvErr?.message ?? kvErr);
      }
    }

    // Store the fact via normal pipeline
    const result = await convex.storeFact({
      content: linkedContent,
      source: input.source || "direct",
      createdBy: agentId,
      scopeId: resolvedScopeId as string,
      factType: input.factType || "observation",
      entityIds: input.entityIds,
      tags: input.tags,
      emotionalContext: input.emotionalContext,
    });

    if (!result || typeof result !== "object") {
      return {
        isError: true,
        message: "Failed to store fact: invalid response from server",
      };
    }

    if (result.factId && entityNames.length > 0) {
      await convex.updateBacklinks({
        factId: result.factId,
        entityNames,
      });
    }

    return {
      factId: result.factId,
      importanceScore: result.importanceScore ?? 0.5,
      deterministic: isDeterministic,
    };
  } catch (error: any) {
    console.error("[store-fact] Error:", error);
    return {
      isError: true,
      message: `Failed to store fact: ${error.message}`,
    };
  }
}
