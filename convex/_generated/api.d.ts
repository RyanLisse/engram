/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

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
