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
        metadata: z.record(z.any()).optional(),
      })
    )
    .optional()
    .describe("Relationships to create/update"),
});

export type LinkEntityInput = z.infer<typeof linkEntitySchema>;

export async function linkEntity(
  input: LinkEntityInput
): Promise<{ entity: any; created: boolean } | { isError: true; message: string }> {
  try {
    // Upsert the entity
    const result = await convex.upsertEntity({
      entityId: input.entityId,
      name: input.name,
      type: input.type,
      metadata: input.metadata,
    });

    if (!result) {
      return {
        isError: true,
        message: "Failed to upsert entity",
      };
    }

    const created = result.created ?? false;
    const entity = result.entity ?? result;

    // Add relationships if provided
    if (input.relationships && input.relationships.length > 0) {
      await Promise.all(
        input.relationships.map((rel) =>
          convex.addRelationship({
            fromEntityId: input.entityId,
            toEntityId: rel.toEntityId,
            relationType: rel.relationType,
            metadata: rel.metadata,
          })
        )
      );
    }

    return {
      entity,
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
