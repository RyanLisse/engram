/**
 * Convex HTTP Client — Entities domain
 */

import { query, mutate, PATHS } from "./core.js";

export async function upsertEntity(args: {
  entityId: string;
  name: string;
  type: string;
  metadata?: Record<string, any>;
  createdBy: string;
}) {
  return await mutate(PATHS.entities.upsert, args);
}

export async function getEntityByEntityId(entityId: string) {
  return await query(PATHS.entities.getByEntityId, { entityId });
}

export async function deleteEntity(args: { entityId: string; hardDelete?: boolean }) {
  return await mutate(PATHS.entities.deleteEntity, args);
}

export async function searchEntities(args: {
  query: string;
  type?: string;
  limit?: number;
}) {
  return await query(PATHS.entities.search, args);
}

export async function addRelationship(args: {
  entityId: string;
  targetId: string;
  relationType: string;
}) {
  return await mutate(PATHS.entities.addRelationship, args);
}

export async function updateBacklinks(args: {
  factId: string;
  entityNames: string[];
}) {
  return await mutate(PATHS.entities.updateBacklinks, args);
}
