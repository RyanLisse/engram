/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_embed from "../actions/embed.js";
import type * as actions_enrich from "../actions/enrich.js";
import type * as actions_importance from "../actions/importance.js";
import type * as actions_vectorSearch from "../actions/vectorSearch.js";
import type * as crons from "../crons.js";
import type * as crons_cleanup from "../crons/cleanup.js";
import type * as crons_compact from "../crons/compact.js";
import type * as crons_consolidate from "../crons/consolidate.js";
import type * as crons_decay from "../crons/decay.js";
import type * as crons_forget from "../crons/forget.js";
import type * as crons_rerank from "../crons/rerank.js";
import type * as crons_rules from "../crons/rules.js";
import type * as functions_agents from "../functions/agents.js";
import type * as functions_conversations from "../functions/conversations.js";
import type * as functions_entities from "../functions/entities.js";
import type * as functions_facts from "../functions/facts.js";
import type * as functions_scopes from "../functions/scopes.js";
import type * as functions_seed from "../functions/seed.js";
import type * as functions_sessions from "../functions/sessions.js";
import type * as functions_signals from "../functions/signals.js";
import type * as functions_sync from "../functions/sync.js";
import type * as functions_themes from "../functions/themes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/embed": typeof actions_embed;
  "actions/enrich": typeof actions_enrich;
  "actions/importance": typeof actions_importance;
  "actions/vectorSearch": typeof actions_vectorSearch;
  crons: typeof crons;
  "crons/cleanup": typeof crons_cleanup;
  "crons/compact": typeof crons_compact;
  "crons/consolidate": typeof crons_consolidate;
  "crons/decay": typeof crons_decay;
  "crons/forget": typeof crons_forget;
  "crons/rerank": typeof crons_rerank;
  "crons/rules": typeof crons_rules;
  "functions/agents": typeof functions_agents;
  "functions/conversations": typeof functions_conversations;
  "functions/entities": typeof functions_entities;
  "functions/facts": typeof functions_facts;
  "functions/scopes": typeof functions_scopes;
  "functions/seed": typeof functions_seed;
  "functions/sessions": typeof functions_sessions;
  "functions/signals": typeof functions_signals;
  "functions/sync": typeof functions_sync;
  "functions/themes": typeof functions_themes;
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
