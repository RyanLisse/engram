/**
 * memory_link_entity — Create/update entities and relationships
 */

import { z } from "zod";
import * as convex from "../lib/convex-client.js";

export const linkEntitySchema = z.object({
  entityId: z.string().describe("Unique entity ID (e.g., person:john, project:engram)"),
  name: z.string().describe("Human-readable name"),
  type: z
    .string()
    .describe("Entity type (person, project, company, concept, tool)"),
  metadata: z.record(z.any()).optional().describe("Additional entity metadata"),
  relationships: z
    .array(
      z.object({
        toEntityId: z.string().describe("Target entity ID"),
        relationType: z.string().describe("Relationship type (e.g., colleague, dependency)"),
      })
    )
    .optional()
    .describe("Relationships to create/update"),
});

export type LinkEntityInput = z.infer<typeof linkEntitySchema>;

export async function linkEntity(
  input: LinkEntityInput,
  agentId: string
): Promise<{ entity: any; created: boolean } | { isError: true; message: string }> {
  try {
    // Upsert the entity with createdBy
    const result = await convex.upsertEntity({
      entityId: input.entityId,
      name: input.name,
      type: input.type,
      metadata: input.metadata,
      createdBy: agentId,
    });

    if (!result) {
      return {
        isError: true,
        message: "Failed to upsert entity",
      };
    }

    // The upsert returns an ID (either existing or new)
    const entityConvexId = result._id || result;
    const created = typeof result === "string"; // New insert returns just the ID

    // Add relationships if provided
    if (input.relationships && input.relationships.length > 0) {
      // Look up the entity to get its Convex _id
      const entity = await convex.getEntityByEntityId(input.entityId);
      if (entity) {
        await Promise.all(
          input.relationships.map((rel) =>
            convex.addRelationship({
              entityId: entity._id,
              targetId: rel.toEntityId,
              relationType: rel.relationType,
            })
          )
        );
      }
    }

    return {
      entity: { _id: entityConvexId, entityId: input.entityId, name: input.name, type: input.type },
      created,
    };
  } catch (error: any) {
    console.error("[link-entity] Error:", error);
    return {
      isError: true,
      message: `Failed to link entity: ${error.message}`,
    };
  }
}
