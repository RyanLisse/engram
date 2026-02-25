/**
 * Type-safe Convex function path constants.
 *
 * Eliminates string-literal function paths scattered across convex-client.ts.
 * If a Convex function is renamed, a single update here surfaces all call sites
 * via TypeScript errors — mechanical enforcement per harness engineering.
 */

export const PATHS = {
  // Facts
  facts: {
    storeFact: "functions/facts:storeFact",
    getFact: "functions/facts:getFact",
    getByIds: "functions/facts:getByIds",
    searchFacts: "functions/facts:searchFacts",
    searchFactsMulti: "functions/facts:searchFactsMulti",
    // vectorRecall was removed — use actions/vectorSearch:vectorRecallAction directly
    listByScopePublic: "functions/facts:listByScopePublic",
    getUnmirrored: "functions/facts:getUnmirrored",
    getRecentHandoffs: "functions/facts:getRecentHandoffs",
    updateFact: "functions/facts:updateFact",
    updateVaultPath: "functions/facts:updateVaultPath",
    applyVaultEdit: "functions/facts:applyVaultEdit",
    archiveFactPublic: "functions/facts:archiveFactPublic",
    boostRelevance: "functions/facts:boostRelevance",
    bumpAccess: "functions/facts:bumpAccess",
    markPruned: "functions/facts:markPruned",
    listStaleFacts: "functions/facts:listStaleFacts",
    markFactsMerged: "functions/facts:markFactsMerged",
    bumpAccessBatch: "functions/facts:bumpAccessBatch",
    getObservationSession: "functions/facts:getObservationSession",
    listObservationSummariesPublic: "functions/facts:listObservationSummariesPublic",
    incrementPendingTokensPublic: "functions/facts:incrementPendingTokensPublic",
    upsertObservationSessionPublic: "functions/facts:upsertObservationSessionPublic",
  },

  // Entities
  entities: {
    upsert: "functions/entities:upsert",
    getByEntityId: "functions/entities:getByEntityId",
    deleteEntity: "functions/entities:deleteEntity",
    search: "functions/entities:search",
    addRelationship: "functions/entities:addRelationship",
    updateBacklinks: "functions/entities:updateBacklinks",
  },

  // Agents
  agents: {
    register: "functions/agents:register",
    getByAgentId: "functions/agents:getByAgentId",
    list: "functions/agents:list",
  },

  // Scopes
  scopes: {
    getByName: "functions/scopes:getByName",
    getPermitted: "functions/scopes:getPermitted",
    deleteScope: "functions/scopes:deleteScope",
    create: "functions/scopes:create",
    addMember: "functions/scopes:addMember",
  },

  // Sessions
  sessions: {
    create: "functions/sessions:create",
    getByAgent: "functions/sessions:getByAgent",
    deleteSession: "functions/sessions:deleteSession",
  },

  // Conversations
  conversations: {
    create: "functions/conversations:create",
    addFact: "functions/conversations:addFact",
    addHandoff: "functions/conversations:addHandoff",
    deleteConversation: "functions/conversations:deleteConversation",
  },

  // Signals
  signals: {
    recordSignal: "functions/signals:recordSignal",
    getByFact: "functions/signals:getByFact",
  },

  // Notifications
  notifications: {
    getUnreadByAgent: "functions/notifications:getUnreadByAgent",
    markRead: "functions/notifications:markRead",
  },

  // Recall Feedback
  recallFeedback: {
    recordRecall: "functions/recallFeedback:recordRecall",
    recordUsage: "functions/recallFeedback:recordUsage",
  },

  // Themes
  themes: {
    getByScope: "functions/themes:getByScope",
    create: "functions/themes:create",
    deleteTheme: "functions/themes:deleteTheme",
  },

  // Config
  config: {
    getConfig: "functions/config:getConfig",
    listConfigs: "functions/config:listConfigs",
    setConfig: "functions/config:setConfig",
    setScopePolicy: "functions/config:setScopePolicy",
    listScopePolicies: "functions/config:listScopePolicies",
  },

  // Events
  events: {
    emit: "functions/events:emit",
    logEvent: "functions/events:logEvent",
    poll: "functions/events:poll",
  },

  // Sync
  sync: {
    getFactsSince: "functions/sync:getFactsSince",
    updateSyncLog: "functions/sync:updateSyncLog",
    getSyncStatus: "functions/sync:getSyncStatus",
  },

  // KV Store
  kvStore: {
    kvSet: "functions/kv-store:kvSet",
    kvGet: "functions/kv-store:kvGet",
    kvDelete: "functions/kv-store:kvDelete",
    kvList: "functions/kv-store:kvList",
  },

  // Episodes
  episodes: {
    createEpisode: "functions/episodes:createEpisode",
    getEpisode: "functions/episodes:getEpisode",
    listEpisodes: "functions/episodes:listEpisodes",
    searchEpisodes: "functions/episodes:searchEpisodes",
    updateEpisode: "functions/episodes:updateEpisode",
  },

  // Agent Knowledge Profiles
  agentProfiles: {
    learn: "functions/agentProfiles:learnAgentProfile",
  },

  // Retroactive Enrichment
  retroactiveEnrich: {
    getRecentlyEnrichedFactIds: "functions/retroactiveEnrich:getRecentlyEnrichedFactIds",
  },

  // Subspaces
  subspaces: {
    createSubspace: "functions/subspaces:createSubspace",
    getSubspace: "functions/subspaces:getSubspace",
    listSubspaces: "functions/subspaces:listSubspaces",
    getByName: "functions/subspaces:getByName",
    updateSubspace: "functions/subspaces:updateSubspace",
    deleteSubspace: "functions/subspaces:deleteSubspace",
  },

  // Actions
  actions: {
    vectorRecallAction: "actions/vectorSearch:vectorRecallAction",
    enrich: "actions/enrich:enrichFact",
    embed: "actions/embed:embed",
    classifyObservation: "actions/classifyObservation:classifyObservation",
    embedAgentCapabilities: "actions/embedAgentCapabilities:embedAgentCapabilities",
    reconcileFromVault: "actions/reconcileFromVault:reconcileFromVault",
    mirrorToVault: "actions/mirrorToVault:mirrorToVault",
    observer: "actions/observer:runObserverPublic",
    reflector: "actions/reflector:runReflectorPublic",
    vectorSearchEpisodes: "actions/vectorSearchEpisodes:vectorSearchEpisodes",
  },
} as const;
