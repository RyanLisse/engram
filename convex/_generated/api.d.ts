/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_classifyObservation from "../actions/classifyObservation.js";
import type * as actions_compressBackground from "../actions/compressBackground.js";
import type * as actions_embed from "../actions/embed.js";
import type * as actions_embedAgentCapabilities from "../actions/embedAgentCapabilities.js";
import type * as actions_embedEpisode from "../actions/embedEpisode.js";
import type * as actions_enrich from "../actions/enrich.js";
import type * as actions_importance from "../actions/importance.js";
import type * as actions_mirrorToVault from "../actions/mirrorToVault.js";
import type * as actions_observer from "../actions/observer.js";
import type * as actions_reconcileFromVault from "../actions/reconcileFromVault.js";
import type * as actions_reflector from "../actions/reflector.js";
import type * as actions_regenerateIndices from "../actions/regenerateIndices.js";
import type * as actions_route from "../actions/route.js";
import type * as actions_vectorSearch from "../actions/vectorSearch.js";
import type * as actions_vectorSearchEpisodes from "../actions/vectorSearchEpisodes.js";
import type * as crons from "../crons.js";
import type * as crons_actionRecommendations from "../crons/actionRecommendations.js";
import type * as crons_agentHealth from "../crons/agentHealth.js";
import type * as crons_cleanup from "../crons/cleanup.js";
import type * as crons_compact from "../crons/compact.js";
import type * as crons_consolidate from "../crons/consolidate.js";
import type * as crons_consolidateSubspaces from "../crons/consolidateSubspaces.js";
import type * as crons_decay from "../crons/decay.js";
import type * as crons_dedup from "../crons/dedup.js";
import type * as crons_defrag from "../crons/defrag.js";
import type * as crons_embeddingBackfill from "../crons/embeddingBackfill.js";
import type * as crons_forget from "../crons/forget.js";
import type * as crons_forgetPipeline from "../crons/forgetPipeline.js";
import type * as crons_learningSynthesis from "../crons/learningSynthesis.js";
import type * as crons_observerSweep from "../crons/observerSweep.js";
import type * as crons_qualityScan from "../crons/qualityScan.js";
import type * as crons_reflection from "../crons/reflection.js";
import type * as crons_regenerateIndices from "../crons/regenerateIndices.js";
import type * as crons_rerank from "../crons/rerank.js";
import type * as crons_rules from "../crons/rules.js";
import type * as crons_subspaceRemerge from "../crons/subspaceRemerge.js";
import type * as crons_sync from "../crons/sync.js";
import type * as crons_updateGoldenPrinciples from "../crons/updateGoldenPrinciples.js";
import type * as crons_usageAnalytics from "../crons/usageAnalytics.js";
import type * as forget from "../forget.js";
import type * as functions_adapterMemory from "../functions/adapterMemory.js";
import type * as functions_agentProfiles from "../functions/agentProfiles.js";
import type * as functions_agents from "../functions/agents.js";
import type * as functions_config from "../functions/config.js";
import type * as functions_conversations from "../functions/conversations.js";
import type * as functions_entities from "../functions/entities.js";
import type * as functions_episodes from "../functions/episodes.js";
import type * as functions_events from "../functions/events.js";
import type * as functions_factVersions from "../functions/factVersions.js";
import type * as functions_facts from "../functions/facts.js";
import type * as functions_hierarchicalRecall from "../functions/hierarchicalRecall.js";
import type * as functions_kv_store from "../functions/kv_store.js";
import type * as functions_memoryBlocks from "../functions/memoryBlocks.js";
import type * as functions_notifications from "../functions/notifications.js";
import type * as functions_performance from "../functions/performance.js";
import type * as functions_recallFeedback from "../functions/recallFeedback.js";
import type * as functions_retroactiveEnrich from "../functions/retroactiveEnrich.js";
import type * as functions_scopes from "../functions/scopes.js";
import type * as functions_seed from "../functions/seed.js";
import type * as functions_sessions from "../functions/sessions.js";
import type * as functions_signals from "../functions/signals.js";
import type * as functions_subspaces from "../functions/subspaces.js";
import type * as functions_sync from "../functions/sync.js";
import type * as functions_themes from "../functions/themes.js";
import type * as lib_configResolver from "../lib/configResolver.js";
import type * as lib_temporal from "../lib/temporal.js";
import type * as lib_vaultIndex from "../lib/vaultIndex.js";
import type * as migrations_001_seed_system_config from "../migrations/001_seed_system_config.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/classifyObservation": typeof actions_classifyObservation;
  "actions/compressBackground": typeof actions_compressBackground;
  "actions/embed": typeof actions_embed;
  "actions/embedAgentCapabilities": typeof actions_embedAgentCapabilities;
  "actions/embedEpisode": typeof actions_embedEpisode;
  "actions/enrich": typeof actions_enrich;
  "actions/importance": typeof actions_importance;
  "actions/mirrorToVault": typeof actions_mirrorToVault;
  "actions/observer": typeof actions_observer;
  "actions/reconcileFromVault": typeof actions_reconcileFromVault;
  "actions/reflector": typeof actions_reflector;
  "actions/regenerateIndices": typeof actions_regenerateIndices;
  "actions/route": typeof actions_route;
  "actions/vectorSearch": typeof actions_vectorSearch;
  "actions/vectorSearchEpisodes": typeof actions_vectorSearchEpisodes;
  crons: typeof crons;
  "crons/actionRecommendations": typeof crons_actionRecommendations;
  "crons/agentHealth": typeof crons_agentHealth;
  "crons/cleanup": typeof crons_cleanup;
  "crons/compact": typeof crons_compact;
  "crons/consolidate": typeof crons_consolidate;
  "crons/consolidateSubspaces": typeof crons_consolidateSubspaces;
  "crons/decay": typeof crons_decay;
  "crons/dedup": typeof crons_dedup;
  "crons/defrag": typeof crons_defrag;
  "crons/embeddingBackfill": typeof crons_embeddingBackfill;
  "crons/forget": typeof crons_forget;
  "crons/forgetPipeline": typeof crons_forgetPipeline;
  "crons/learningSynthesis": typeof crons_learningSynthesis;
  "crons/observerSweep": typeof crons_observerSweep;
  "crons/qualityScan": typeof crons_qualityScan;
  "crons/reflection": typeof crons_reflection;
  "crons/regenerateIndices": typeof crons_regenerateIndices;
  "crons/rerank": typeof crons_rerank;
  "crons/rules": typeof crons_rules;
  "crons/subspaceRemerge": typeof crons_subspaceRemerge;
  "crons/sync": typeof crons_sync;
  "crons/updateGoldenPrinciples": typeof crons_updateGoldenPrinciples;
  "crons/usageAnalytics": typeof crons_usageAnalytics;
  forget: typeof forget;
  "functions/adapterMemory": typeof functions_adapterMemory;
  "functions/agentProfiles": typeof functions_agentProfiles;
  "functions/agents": typeof functions_agents;
  "functions/config": typeof functions_config;
  "functions/conversations": typeof functions_conversations;
  "functions/entities": typeof functions_entities;
  "functions/episodes": typeof functions_episodes;
  "functions/events": typeof functions_events;
  "functions/factVersions": typeof functions_factVersions;
  "functions/facts": typeof functions_facts;
  "functions/hierarchicalRecall": typeof functions_hierarchicalRecall;
  "functions/kv_store": typeof functions_kv_store;
  "functions/memoryBlocks": typeof functions_memoryBlocks;
  "functions/notifications": typeof functions_notifications;
  "functions/performance": typeof functions_performance;
  "functions/recallFeedback": typeof functions_recallFeedback;
  "functions/retroactiveEnrich": typeof functions_retroactiveEnrich;
  "functions/scopes": typeof functions_scopes;
  "functions/seed": typeof functions_seed;
  "functions/sessions": typeof functions_sessions;
  "functions/signals": typeof functions_signals;
  "functions/subspaces": typeof functions_subspaces;
  "functions/sync": typeof functions_sync;
  "functions/themes": typeof functions_themes;
  "lib/configResolver": typeof lib_configResolver;
  "lib/temporal": typeof lib_temporal;
  "lib/vaultIndex": typeof lib_vaultIndex;
  "migrations/001_seed_system_config": typeof migrations_001_seed_system_config;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
