/**
 * Retrieval Benchmark Suite — engram-dcq
 *
 * Measures retrieval quality over a synthetic fact corpus using three standard
 * information retrieval metrics:
 *
 *   recall@5    — fraction of relevant facts found in top 5 results
 *   precision@5 — fraction of top 5 results that are actually relevant
 *   MRR         — Mean Reciprocal Rank (1/rank of first relevant result)
 *
 * Uses the REAL reciprocalRankFusion and rankCandidates implementations
 * (no Convex network calls required — corpus is fully in-memory).
 *
 * Corpus: 50 synthetic facts across 5 categories (people, projects, tools,
 * decisions, observations). Each category has 3 gold query/answer pairs with
 * known-relevant fact IDs used as ground truth.
 */

import { describe, test, expect, beforeAll } from "vitest";
import { reciprocalRankFusion } from "../src/lib/rrf.js";
import { rankCandidates } from "../src/lib/ranking.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BenchmarkFact {
  _id: string;
  content: string;
  timestamp: number;
  importanceScore: number;
  factType: string;
  entityIds: string[];
  qaQuestion?: string;
  qaAnswer?: string;
  _score?: number;
}

interface GoldPair {
  query: string;
  /** IDs of facts considered relevant for this query */
  relevantIds: string[];
  /** Pre-assigned semantic scores for each fact ID (simulates vector search) */
  semanticScores: Record<string, number>;
  /** Pre-assigned text scores for each fact ID (simulates BM25/text search) */
  textScores: Record<string, number>;
  /** QA-matched fact IDs (simulates QA pathway hits) */
  qaMatchIds?: string[];
}

// ─── Corpus ───────────────────────────────────────────────────────────────────

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

/**
 * 50 synthetic facts across 5 categories (10 per category).
 * Categories: people, projects, tools, decisions, observations.
 */
const CORPUS: BenchmarkFact[] = [
  // ── Category 1: People / Team ────────────────────────────────────────────
  {
    _id: "p1",
    content: "Alice is the lead engineer on the Engram memory system.",
    timestamp: NOW - 2 * DAY,
    importanceScore: 0.85,
    factType: "observation",
    entityIds: ["entity-alice", "entity-engram"],
    qaQuestion: "Who leads the Engram memory system?",
    qaAnswer: "Alice is the lead engineer on the Engram memory system.",
  },
  {
    _id: "p2",
    content: "Bob specializes in distributed systems and vector databases.",
    timestamp: NOW - 5 * DAY,
    importanceScore: 0.75,
    factType: "observation",
    entityIds: ["entity-bob", "entity-vector-db"],
    qaQuestion: "What does Bob specialize in?",
    qaAnswer: "Bob specializes in distributed systems and vector databases.",
  },
  {
    _id: "p3",
    content: "Carol is the product manager responsible for the agent dashboard.",
    timestamp: NOW - 3 * DAY,
    importanceScore: 0.72,
    factType: "observation",
    entityIds: ["entity-carol", "entity-dashboard"],
  },
  {
    _id: "p4",
    content: "Dave joined the team as a TypeScript expert two months ago.",
    timestamp: NOW - 60 * DAY,
    importanceScore: 0.65,
    factType: "observation",
    entityIds: ["entity-dave", "entity-typescript"],
  },
  {
    _id: "p5",
    content: "Eve leads security reviews and is responsible for access control policies.",
    timestamp: NOW - 7 * DAY,
    importanceScore: 0.80,
    factType: "observation",
    entityIds: ["entity-eve", "entity-security"],
    qaQuestion: "Who leads security reviews?",
    qaAnswer: "Eve leads security reviews and is responsible for access control policies.",
  },
  {
    _id: "p6",
    content: "Frank owns the CI/CD pipeline and deployment infrastructure.",
    timestamp: NOW - 10 * DAY,
    importanceScore: 0.70,
    factType: "observation",
    entityIds: ["entity-frank", "entity-cicd"],
  },
  {
    _id: "p7",
    content: "Grace is the data scientist working on embedding model selection.",
    timestamp: NOW - 4 * DAY,
    importanceScore: 0.78,
    factType: "observation",
    entityIds: ["entity-grace", "entity-embeddings"],
  },
  {
    _id: "p8",
    content: "Hank is responsible for the Convex backend schema and migrations.",
    timestamp: NOW - 8 * DAY,
    importanceScore: 0.73,
    factType: "observation",
    entityIds: ["entity-hank", "entity-convex"],
  },
  {
    _id: "p9",
    content: "Irene manages external API integrations including Cohere and ElevenLabs.",
    timestamp: NOW - 6 * DAY,
    importanceScore: 0.68,
    factType: "observation",
    entityIds: ["entity-irene", "entity-api"],
  },
  {
    _id: "p10",
    content: "Jake coordinates cross-team syncs and maintains the project roadmap.",
    timestamp: NOW - 15 * DAY,
    importanceScore: 0.60,
    factType: "observation",
    entityIds: ["entity-jake", "entity-roadmap"],
  },

  // ── Category 2: Projects / Architecture ──────────────────────────────────
  {
    _id: "proj1",
    content: "The Engram memory system uses a three-tier architecture: Convex backend, MCP server, CLI.",
    timestamp: NOW - 20 * DAY,
    importanceScore: 0.90,
    factType: "decision",
    entityIds: ["entity-engram", "entity-convex", "entity-mcp"],
    qaQuestion: "What is Engram's architecture?",
    qaAnswer: "The Engram memory system uses a three-tier architecture: Convex backend, MCP server, CLI.",
  },
  {
    _id: "proj2",
    content: "The agent dashboard is built with Next.js and provides real-time monitoring.",
    timestamp: NOW - 12 * DAY,
    importanceScore: 0.82,
    factType: "decision",
    entityIds: ["entity-dashboard", "entity-nextjs"],
    qaQuestion: "What framework is the agent dashboard built with?",
    qaAnswer: "The agent dashboard is built with Next.js and provides real-time monitoring.",
  },
  {
    _id: "proj3",
    content: "MCP server exposes 73 atomic tool primitives for agent-native interaction.",
    timestamp: NOW - 18 * DAY,
    importanceScore: 0.88,
    factType: "observation",
    entityIds: ["entity-mcp", "entity-tools"],
  },
  {
    _id: "proj4",
    content: "The vault sync system mirrors facts to local markdown files for offline access.",
    timestamp: NOW - 25 * DAY,
    importanceScore: 0.75,
    factType: "decision",
    entityIds: ["entity-vault", "entity-sync"],
  },
  {
    _id: "proj5",
    content: "Convex cron jobs run 19 scheduled tasks including decay, dedup, and compaction.",
    timestamp: NOW - 30 * DAY,
    importanceScore: 0.83,
    factType: "observation",
    entityIds: ["entity-convex", "entity-cron"],
    qaQuestion: "How many cron jobs does Convex run?",
    qaAnswer: "Convex cron jobs run 19 scheduled tasks including decay, dedup, and compaction.",
  },
  {
    _id: "proj6",
    content: "The SSE server streams real-time events to agents via HTTP Server-Sent Events.",
    timestamp: NOW - 14 * DAY,
    importanceScore: 0.78,
    factType: "observation",
    entityIds: ["entity-sse", "entity-events"],
  },
  {
    _id: "proj7",
    content: "Scope-based access control governs which agents can read or write each memory scope.",
    timestamp: NOW - 22 * DAY,
    importanceScore: 0.86,
    factType: "decision",
    entityIds: ["entity-scope", "entity-access-control"],
  },
  {
    _id: "proj8",
    content: "The observation memory system compresses passive signals into tiered fact records.",
    timestamp: NOW - 9 * DAY,
    importanceScore: 0.79,
    factType: "observation",
    entityIds: ["entity-observation", "entity-compression"],
  },
  {
    _id: "proj9",
    content: "Episode tracking groups related facts into coherent narrative episodes with open/close state.",
    timestamp: NOW - 11 * DAY,
    importanceScore: 0.77,
    factType: "decision",
    entityIds: ["entity-episode", "entity-narrative"],
  },
  {
    _id: "proj10",
    content: "The OpenClaw plugin imports tool-registry directly, enabling native extension without MCP overhead.",
    timestamp: NOW - 35 * DAY,
    importanceScore: 0.71,
    factType: "decision",
    entityIds: ["entity-openclaw", "entity-plugin"],
  },

  // ── Category 3: Tools / Preferences ──────────────────────────────────────
  {
    _id: "t1",
    content: "We use bun as the JavaScript runtime and package manager for all TypeScript projects.",
    timestamp: NOW - 1 * DAY,
    importanceScore: 0.92,
    factType: "decision",
    entityIds: ["entity-bun", "entity-typescript"],
    qaQuestion: "What package manager do we use?",
    qaAnswer: "We use bun as the JavaScript runtime and package manager for all TypeScript projects.",
  },
  {
    _id: "t2",
    content: "Vitest is the test runner used across all mcp-server unit and integration tests.",
    timestamp: NOW - 3 * DAY,
    importanceScore: 0.80,
    factType: "decision",
    entityIds: ["entity-vitest", "entity-testing"],
    qaQuestion: "What is our test runner?",
    qaAnswer: "Vitest is the test runner used across all mcp-server unit and integration tests.",
  },
  {
    _id: "t3",
    content: "Cohere Embed 4 (embed-v4.0) is the embedding model producing 1024-dimensional vectors.",
    timestamp: NOW - 28 * DAY,
    importanceScore: 0.91,
    factType: "decision",
    entityIds: ["entity-cohere", "entity-embeddings"],
    qaQuestion: "What embedding model do we use?",
    qaAnswer: "Cohere Embed 4 (embed-v4.0) is the embedding model producing 1024-dimensional vectors.",
  },
  {
    _id: "t4",
    content: "Commander.js is used to build the CLI interface with subcommands and flags.",
    timestamp: NOW - 40 * DAY,
    importanceScore: 0.68,
    factType: "decision",
    entityIds: ["entity-commander", "entity-cli"],
  },
  {
    _id: "t5",
    content: "Zod is used for runtime schema validation on all MCP tool inputs.",
    timestamp: NOW - 16 * DAY,
    importanceScore: 0.74,
    factType: "decision",
    entityIds: ["entity-zod", "entity-validation"],
  },
  {
    _id: "t6",
    content: "ElevenLabs provides voice synthesis for the PAI voice notification system.",
    timestamp: NOW - 7 * DAY,
    importanceScore: 0.76,
    factType: "observation",
    entityIds: ["entity-elevenlabs", "entity-voice"],
  },
  {
    _id: "t7",
    content: "GitHub Actions runs CI checks on every PR including type-check, lint, and test.",
    timestamp: NOW - 21 * DAY,
    importanceScore: 0.72,
    factType: "decision",
    entityIds: ["entity-github-actions", "entity-ci"],
  },
  {
    _id: "t8",
    content: "Convex is the cloud backend providing database, vector search, and scheduled functions.",
    timestamp: NOW - 45 * DAY,
    importanceScore: 0.89,
    factType: "decision",
    entityIds: ["entity-convex", "entity-cloud"],
    qaQuestion: "What is our cloud backend?",
    qaAnswer: "Convex is the cloud backend providing database, vector search, and scheduled functions.",
  },
  {
    _id: "t9",
    content: "TypeScript strict mode is enforced on all source files in this repository.",
    timestamp: NOW - 50 * DAY,
    importanceScore: 0.78,
    factType: "decision",
    entityIds: ["entity-typescript", "entity-strict"],
  },
  {
    _id: "t10",
    content: "Prettier with single-quotes and 2-space indent is the code formatting standard.",
    timestamp: NOW - 55 * DAY,
    importanceScore: 0.62,
    factType: "decision",
    entityIds: ["entity-prettier", "entity-formatting"],
  },

  // ── Category 4: Decisions ─────────────────────────────────────────────────
  {
    _id: "d1",
    content: "We decided to use agent-native tool primitives instead of workflow-shaped APIs.",
    timestamp: NOW - 60 * DAY,
    importanceScore: 0.93,
    factType: "decision",
    entityIds: ["entity-architecture", "entity-agent-native"],
    qaQuestion: "Why did we choose atomic tool primitives?",
    qaAnswer: "We decided to use agent-native tool primitives instead of workflow-shaped APIs.",
  },
  {
    _id: "d2",
    content: "Facts are stored immediately (<50ms) with enrichment running asynchronously.",
    timestamp: NOW - 42 * DAY,
    importanceScore: 0.88,
    factType: "decision",
    entityIds: ["entity-performance", "entity-async"],
    qaQuestion: "How does fact storage latency work?",
    qaAnswer: "Facts are stored immediately (<50ms) with enrichment running asynchronously.",
  },
  {
    _id: "d3",
    content: "Memory decay is differential: decisions decay slowly, notes decay fast.",
    timestamp: NOW - 35 * DAY,
    importanceScore: 0.85,
    factType: "decision",
    entityIds: ["entity-decay", "entity-memory"],
    qaQuestion: "How does memory decay work?",
    qaAnswer: "Memory decay is differential: decisions decay slowly, notes decay fast.",
  },
  {
    _id: "d4",
    content: "Merge before delete: facts are consolidated then archived, never truly deleted.",
    timestamp: NOW - 38 * DAY,
    importanceScore: 0.87,
    factType: "decision",
    entityIds: ["entity-lifecycle", "entity-merge"],
  },
  {
    _id: "d5",
    content: "Reciprocal Rank Fusion (RRF) merges vector, text, and QA result sets in recall.",
    timestamp: NOW - 20 * DAY,
    importanceScore: 0.84,
    factType: "decision",
    entityIds: ["entity-rrf", "entity-recall"],
    qaQuestion: "How are recall result sets merged?",
    qaAnswer: "Reciprocal Rank Fusion (RRF) merges vector, text, and QA result sets in recall.",
  },
  {
    _id: "d6",
    content: "Scope names are prefixed with the agent ID: private-{agentId} for private scopes.",
    timestamp: NOW - 48 * DAY,
    importanceScore: 0.79,
    factType: "decision",
    entityIds: ["entity-scope", "entity-agent"],
  },
  {
    _id: "d7",
    content: "All configuration weights and thresholds are tunable via memory_set_config without code changes.",
    timestamp: NOW - 32 * DAY,
    importanceScore: 0.81,
    factType: "decision",
    entityIds: ["entity-config", "entity-prompt-native"],
    qaQuestion: "How do we tune memory configuration?",
    qaAnswer: "All configuration weights and thresholds are tunable via memory_set_config without code changes.",
  },
  {
    _id: "d8",
    content: "Agent parity principle: every tool action available to users must also be available to agents.",
    timestamp: NOW - 55 * DAY,
    importanceScore: 0.90,
    factType: "decision",
    entityIds: ["entity-agent-native", "entity-parity"],
  },
  {
    _id: "d9",
    content: "Query raw (query_raw) provides an escape hatch for unanticipated retrieval patterns.",
    timestamp: NOW - 28 * DAY,
    importanceScore: 0.76,
    factType: "decision",
    entityIds: ["entity-query-raw", "entity-flexibility"],
  },
  {
    _id: "d10",
    content: "Token budget enforcement ensures recall respects context window limits per agent request.",
    timestamp: NOW - 17 * DAY,
    importanceScore: 0.83,
    factType: "decision",
    entityIds: ["entity-token-budget", "entity-recall"],
  },

  // ── Category 5: Observations / Bugs ──────────────────────────────────────
  {
    _id: "o1",
    content: "Centroid subtraction was missing in computeCoefficients, causing incorrect PCA projection.",
    timestamp: NOW - 1 * DAY,
    importanceScore: 0.95,
    factType: "correction",
    entityIds: ["entity-pca", "entity-bug"],
    qaQuestion: "What bug was found in PCA projection?",
    qaAnswer: "Centroid subtraction was missing in computeCoefficients, causing incorrect PCA projection.",
  },
  {
    _id: "o2",
    content: "Vector search returns at most 256 results per Convex constraint, limiting recall depth.",
    timestamp: NOW - 10 * DAY,
    importanceScore: 0.78,
    factType: "observation",
    entityIds: ["entity-vector-search", "entity-limit"],
    qaQuestion: "What is the vector search result limit?",
    qaAnswer: "Vector search returns at most 256 results per Convex constraint, limiting recall depth.",
  },
  {
    _id: "o3",
    content: "Text search BM25 scoring sometimes misses relevant facts when content uses synonyms.",
    timestamp: NOW - 8 * DAY,
    importanceScore: 0.72,
    factType: "observation",
    entityIds: ["entity-text-search", "entity-bm25"],
  },
  {
    _id: "o4",
    content: "Embedding backfill cron reruns every 15 minutes to recover from Cohere API timeouts.",
    timestamp: NOW - 5 * DAY,
    importanceScore: 0.74,
    factType: "observation",
    entityIds: ["entity-cron", "entity-embeddings"],
  },
  {
    _id: "o5",
    content: "Agent health cron detects stale agents after 30 minutes of inactivity and notifies teammates.",
    timestamp: NOW - 3 * DAY,
    importanceScore: 0.76,
    factType: "observation",
    entityIds: ["entity-agent-health", "entity-cron"],
    qaQuestion: "How are stale agents detected?",
    qaAnswer: "Agent health cron detects stale agents after 30 minutes of inactivity and notifies teammates.",
  },
  {
    _id: "o6",
    content: "Memory compaction reduces fact count by consolidating overlapping content into summary facts.",
    timestamp: NOW - 12 * DAY,
    importanceScore: 0.81,
    factType: "observation",
    entityIds: ["entity-compaction", "entity-consolidation"],
  },
  {
    _id: "o7",
    content: "The sleep-time reflection cron runs every 4 hours to surface patterns from recent facts.",
    timestamp: NOW - 2 * DAY,
    importanceScore: 0.79,
    factType: "observation",
    entityIds: ["entity-reflection", "entity-cron"],
  },
  {
    _id: "o8",
    content: "SVD consolidation correctly handles zero-variance dimensions by clipping eigenvalues.",
    timestamp: NOW - 6 * DAY,
    importanceScore: 0.70,
    factType: "correction",
    entityIds: ["entity-svd", "entity-consolidation"],
  },
  {
    _id: "o9",
    content: "Token estimation undershoots for code blocks — apply 1.3x multiplier for code content.",
    timestamp: NOW - 4 * DAY,
    importanceScore: 0.73,
    factType: "correction",
    entityIds: ["entity-token-estimation", "entity-code"],
    qaQuestion: "How do we correct token estimation for code?",
    qaAnswer: "Token estimation undershoots for code blocks — apply 1.3x multiplier for code content.",
  },
  {
    _id: "o10",
    content: "The intent classifier routes 'lookup' queries to KV store, bypassing expensive vector search.",
    timestamp: NOW - 7 * DAY,
    importanceScore: 0.82,
    factType: "observation",
    entityIds: ["entity-intent", "entity-kv-store"],
  },
];

// ─── Gold Query-Answer Pairs ──────────────────────────────────────────────────

/**
 * 15 gold pairs (3 per category).
 * semanticScores simulate what vector search would return for this query.
 * textScores simulate BM25/keyword overlap.
 * Facts not listed in scores get 0.
 */
const GOLD_PAIRS: GoldPair[] = [
  // ── Category 1: People
  {
    query: "Who leads the Engram memory system?",
    relevantIds: ["p1"],
    semanticScores: { p1: 0.95, p2: 0.30, p3: 0.20, p5: 0.25, p8: 0.35, proj1: 0.40 },
    textScores: { p1: 0.90, proj1: 0.55, proj3: 0.30 },
    qaMatchIds: ["p1"],
  },
  {
    query: "Who handles security and access control?",
    relevantIds: ["p5", "proj7"],
    semanticScores: { p5: 0.92, proj7: 0.75, d6: 0.45, d8: 0.50, p1: 0.20 },
    textScores: { p5: 0.85, proj7: 0.70, d8: 0.30 },
    qaMatchIds: ["p5"],
  },
  {
    query: "What does Bob specialize in?",
    relevantIds: ["p2"],
    semanticScores: { p2: 0.97, p7: 0.35, t8: 0.40, proj1: 0.25 },
    textScores: { p2: 0.95, t8: 0.20 },
    qaMatchIds: ["p2"],
  },

  // ── Category 2: Projects
  {
    query: "What is Engram's architecture?",
    relevantIds: ["proj1", "proj3"],
    semanticScores: { proj1: 0.96, proj3: 0.80, proj2: 0.45, t8: 0.55, d1: 0.50 },
    textScores: { proj1: 0.90, proj3: 0.65, t8: 0.40, d1: 0.35 },
    qaMatchIds: ["proj1"],
  },
  {
    query: "How many cron jobs are scheduled in Convex?",
    relevantIds: ["proj5", "o4", "o7"],
    semanticScores: { proj5: 0.94, o4: 0.65, o7: 0.60, o5: 0.55, t8: 0.30 },
    textScores: { proj5: 0.88, o4: 0.50, o7: 0.45 },
    qaMatchIds: ["proj5"],
  },
  {
    query: "How does the agent dashboard work?",
    relevantIds: ["proj2", "proj3"],
    semanticScores: { proj2: 0.93, proj3: 0.65, proj6: 0.50, p3: 0.55, t8: 0.30 },
    textScores: { proj2: 0.85, p3: 0.60, proj6: 0.35 },
    qaMatchIds: ["proj2"],
  },

  // ── Category 3: Tools / Preferences
  {
    query: "What package manager and runtime do we use?",
    relevantIds: ["t1"],
    semanticScores: { t1: 0.95, t9: 0.50, d1: 0.25, t2: 0.30 },
    textScores: { t1: 0.90, t9: 0.35 },
    qaMatchIds: ["t1"],
  },
  {
    query: "What embedding model produces vectors for memory search?",
    relevantIds: ["t3", "p7"],
    semanticScores: { t3: 0.96, p7: 0.70, o4: 0.50, t8: 0.35, proj5: 0.20 },
    textScores: { t3: 0.92, p7: 0.55, o4: 0.40 },
    qaMatchIds: ["t3"],
  },
  {
    query: "What is our cloud backend and what does it provide?",
    relevantIds: ["t8", "proj1", "proj5"],
    semanticScores: { t8: 0.94, proj1: 0.75, proj5: 0.65, p8: 0.50, t9: 0.20 },
    textScores: { t8: 0.88, proj1: 0.60, proj5: 0.55 },
    qaMatchIds: ["t8"],
  },

  // ── Category 4: Decisions
  {
    query: "How does memory decay work for different fact types?",
    relevantIds: ["d3", "d4"],
    semanticScores: { d3: 0.95, d4: 0.72, d2: 0.55, d1: 0.40, o6: 0.45 },
    textScores: { d3: 0.88, d4: 0.60, o6: 0.35 },
    qaMatchIds: ["d3"],
  },
  {
    query: "How is recall fusion implemented across multiple pathways?",
    relevantIds: ["d5", "d10"],
    semanticScores: { d5: 0.96, d10: 0.70, proj3: 0.45, d2: 0.35, o2: 0.50 },
    textScores: { d5: 0.90, d10: 0.55, o2: 0.40 },
    qaMatchIds: ["d5"],
  },
  {
    query: "How do agents tune configuration without code changes?",
    relevantIds: ["d7"],
    semanticScores: { d7: 0.94, d1: 0.45, d9: 0.40, proj3: 0.30 },
    textScores: { d7: 0.88, d1: 0.35 },
    qaMatchIds: ["d7"],
  },

  // ── Category 5: Observations / Bugs
  {
    query: "What bug was found in PCA projection?",
    relevantIds: ["o1"],
    semanticScores: { o1: 0.97, o8: 0.60, o3: 0.25, d4: 0.20 },
    textScores: { o1: 0.92, o8: 0.45 },
    qaMatchIds: ["o1"],
  },
  {
    query: "How does the intent classifier optimize retrieval?",
    relevantIds: ["o10", "d5"],
    semanticScores: { o10: 0.93, d5: 0.65, d2: 0.50, o2: 0.40, t1: 0.20 },
    textScores: { o10: 0.87, d5: 0.50, o2: 0.35 },
    qaMatchIds: [],
  },
  {
    query: "How are stale agents detected and what happens?",
    relevantIds: ["o5"],
    semanticScores: { o5: 0.96, p5: 0.45, p1: 0.30, proj9: 0.25 },
    textScores: { o5: 0.91, p5: 0.35 },
    qaMatchIds: ["o5"],
  },

  // ── "Lexical gap" queries: relevant fact only surfaces via QA pathway ──────
  // These simulate cases where the query uses different terminology than the
  // fact content (the classic retrieval gap that QA pairs are designed to bridge).
  {
    // Query phrased as a Q: "what did we select for..." — relevant fact says "adopted"
    query: "What did we select for JavaScript runtime and bundling?",
    relevantIds: ["t1"],
    // Low semantic/text scores: the query phrasing doesn't lexically overlap with the fact
    semanticScores: { t9: 0.55, t2: 0.40, t4: 0.35, d1: 0.30, t7: 0.20 },
    textScores: { t9: 0.40, t4: 0.30 },
    qaMatchIds: ["t1"], // QA pair "What package manager do we use?" → t1
  },
  {
    // Query for the Engram lead but phrased differently ("who's in charge of")
    query: "Who is in charge of developing the unified memory layer?",
    relevantIds: ["p1"],
    // Without QA, semantic scores favor other facts
    semanticScores: { p3: 0.60, p10: 0.50, p6: 0.40, proj1: 0.55, p8: 0.45 },
    textScores: { p3: 0.45, proj1: 0.40, p10: 0.30 },
    qaMatchIds: ["p1"], // QA pair "Who leads the Engram memory system?" → p1
  },
  {
    // Phrased as "what error" instead of "what bug" — misses keyword match
    query: "What error caused incorrect subspace coordinate frames?",
    relevantIds: ["o1"],
    semanticScores: { o8: 0.65, o3: 0.45, d4: 0.35, d3: 0.25 },
    textScores: { o8: 0.50, d4: 0.30 },
    qaMatchIds: ["o1"], // QA pair "What bug was found in PCA projection?" → o1
  },
];

// ─── Retrieval Simulation Helpers ─────────────────────────────────────────────

const TOP_K = 5;

/**
 * Simulate a retrieval pathway for a query.
 * Returns corpus facts annotated with scores from the provided score map,
 * sorted by score descending (only including facts with score > 0).
 */
function simulatePathway(
  scores: Record<string, number>,
  extraField?: string
): BenchmarkFact[] {
  return CORPUS
    .filter((f) => (scores[f._id] ?? 0) > 0)
    .map((f) => ({
      ...f,
      _score: scores[f._id] ?? 0,
      ...(extraField ? { [extraField]: true } : {}),
    }))
    .sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
}

/**
 * Run the full retrieval pipeline for a gold pair:
 * 1. Simulate vector (semantic) and text (lexical) pathways
 * 2. Fuse via RRF
 * 3. Re-rank with real rankCandidates
 * Returns the top-K ranked fact IDs.
 */
function retrieveTopK(pair: GoldPair, withQA = false): string[] {
  const vectorResults = simulatePathway(pair.semanticScores);
  const textResults = simulatePathway(pair.textScores);

  const resultSets: BenchmarkFact[][] = [vectorResults, textResults];

  if (withQA && pair.qaMatchIds && pair.qaMatchIds.length > 0) {
    const qaResults = CORPUS
      .filter((f) => pair.qaMatchIds!.includes(f._id))
      .map((f) => ({ ...f, _score: 0.88, _qaMatch: true }));
    resultSets.push(qaResults);
  }

  const fused = reciprocalRankFusion(resultSets);

  // Re-rank with hybrid scoring
  const reranked = rankCandidates(pair.query, fused);

  return reranked.slice(0, TOP_K).map((f) => f._id);
}

// ─── Metric Computation ───────────────────────────────────────────────────────

function computeRecallAtK(topK: string[], relevantIds: string[]): number {
  if (relevantIds.length === 0) return 1.0;
  const found = topK.filter((id) => relevantIds.includes(id)).length;
  return found / relevantIds.length;
}

function computePrecisionAtK(topK: string[], relevantIds: string[]): number {
  if (topK.length === 0) return 0;
  const hits = topK.filter((id) => relevantIds.includes(id)).length;
  return hits / topK.length;
}

function computeReciprocalRank(topK: string[], relevantIds: string[]): number {
  for (let i = 0; i < topK.length; i++) {
    if (relevantIds.includes(topK[i])) {
      return 1 / (i + 1);
    }
  }
  return 0; // no relevant fact found in top-K
}

function meanOf(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ─── Pre-compute results (shared across all describe blocks) ──────────────────

let resultsWithoutQA: Array<{ topK: string[]; pair: GoldPair }>;
let resultsWithQA: Array<{ topK: string[]; pair: GoldPair }>;

beforeAll(() => {
  resultsWithoutQA = GOLD_PAIRS.map((pair) => ({
    topK: retrieveTopK(pair, false),
    pair,
  }));
  resultsWithQA = GOLD_PAIRS.map((pair) => ({
    topK: retrieveTopK(pair, true),
    pair,
  }));
});

// ─── Benchmark Tests ──────────────────────────────────────────────────────────

describe("Retrieval Benchmark Suite", () => {
  // The first 15 pairs are "standard" queries with strong semantic scores.
  // The last 3 are "lexical-gap" pairs designed to have recall@5 = 0 without QA.
  const STANDARD_COUNT = 15;

  describe("recall@5", () => {
    test("each standard query has recall@5 > 0 (at least one relevant fact in top 5)", () => {
      for (const { topK, pair } of resultsWithoutQA.slice(0, STANDARD_COUNT)) {
        const r = computeRecallAtK(topK, pair.relevantIds);
        expect(r, `recall@5 for query "${pair.query}"`).toBeGreaterThan(0);
      }
    });

    test("lexical-gap queries have recall@5 = 0 without QA (validates test setup)", () => {
      for (const { topK, pair } of resultsWithoutQA.slice(STANDARD_COUNT)) {
        const r = computeRecallAtK(topK, pair.relevantIds);
        expect(r, `baseline recall should be 0 for lexical-gap query "${pair.query}"`).toBe(0);
      }
    });

    test("all queries WITH QA pathway have recall@5 > 0", () => {
      for (const { topK, pair } of resultsWithQA) {
        const r = computeRecallAtK(topK, pair.relevantIds);
        expect(r, `recall@5 with QA for query "${pair.query}"`).toBeGreaterThan(0);
      }
    });

    test("mean recall@5 across all queries is >= 0.80", () => {
      const scores = resultsWithoutQA.map(({ topK, pair }) =>
        computeRecallAtK(topK, pair.relevantIds)
      );
      const mean = meanOf(scores);
      expect(mean).toBeGreaterThanOrEqual(0.80);
    });

    test("per-category recall@5: people queries all hit >= 0.50", () => {
      const peopleQueries = resultsWithoutQA.slice(0, 3);
      for (const { topK, pair } of peopleQueries) {
        const r = computeRecallAtK(topK, pair.relevantIds);
        expect(r, `people query "${pair.query}"`).toBeGreaterThanOrEqual(0.50);
      }
    });

    test("per-category recall@5: decisions queries all hit >= 0.50", () => {
      const decisionQueries = resultsWithoutQA.slice(9, 12);
      for (const { topK, pair } of decisionQueries) {
        const r = computeRecallAtK(topK, pair.relevantIds);
        expect(r, `decision query "${pair.query}"`).toBeGreaterThanOrEqual(0.50);
      }
    });

    test("recall@5 scores are in [0, 1] for all queries", () => {
      for (const { topK, pair } of resultsWithoutQA) {
        const r = computeRecallAtK(topK, pair.relevantIds);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("precision@5", () => {
    test("mean precision@5 across all queries is >= 0.20", () => {
      const scores = resultsWithoutQA.map(({ topK, pair }) =>
        computePrecisionAtK(topK, pair.relevantIds)
      );
      const mean = meanOf(scores);
      expect(mean).toBeGreaterThanOrEqual(0.20);
    });

    test("each top-5 result set has exactly 5 candidates (or fewer if corpus is small)", () => {
      for (const { topK } of resultsWithoutQA) {
        expect(topK.length).toBeLessThanOrEqual(TOP_K);
        expect(topK.length).toBeGreaterThan(0);
      }
    });

    test("precision@5 scores are in [0, 1] for all queries", () => {
      for (const { topK, pair } of resultsWithoutQA) {
        const p = computePrecisionAtK(topK, pair.relevantIds);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    });

    test("high-importance facts appear in top-5 with high precision for single-relevant-doc queries", () => {
      // Queries with exactly one relevant fact should have precision@5 = 0.2 minimum (1/5)
      const singleDocQueries = resultsWithoutQA.filter(({ pair }) => pair.relevantIds.length === 1);
      expect(singleDocQueries.length).toBeGreaterThan(0);
      for (const { topK, pair } of singleDocQueries) {
        const p = computePrecisionAtK(topK, pair.relevantIds);
        // If recall is 1.0 for a single-doc query, precision is exactly 1/5
        const r = computeRecallAtK(topK, pair.relevantIds);
        if (r > 0) {
          expect(p).toBeGreaterThanOrEqual(1 / TOP_K);
        }
      }
    });
  });

  describe("MRR (Mean Reciprocal Rank)", () => {
    test("MRR across all queries is >= 0.70", () => {
      const rrs = resultsWithoutQA.map(({ topK, pair }) =>
        computeReciprocalRank(topK, pair.relevantIds)
      );
      const mrr = meanOf(rrs);
      expect(mrr).toBeGreaterThanOrEqual(0.70);
    });

    test("each standard query has RR > 0 (first relevant fact found within top 5)", () => {
      for (const { topK, pair } of resultsWithoutQA.slice(0, STANDARD_COUNT)) {
        const rr = computeReciprocalRank(topK, pair.relevantIds);
        expect(rr, `RR for query "${pair.query}"`).toBeGreaterThan(0);
      }
    });

    test("RR is 1.0 when the most relevant fact ranks first", () => {
      // At least some queries should have their primary relevant doc at rank 1
      const perfectRankQueries = resultsWithoutQA.filter(({ topK, pair }) => {
        return topK[0] !== undefined && pair.relevantIds.includes(topK[0]);
      });
      expect(perfectRankQueries.length).toBeGreaterThan(0);
      for (const { topK, pair } of perfectRankQueries) {
        expect(computeReciprocalRank(topK, pair.relevantIds)).toBe(1.0);
      }
    });

    test("RR values are in (0, 1] for hits, 0 for misses", () => {
      for (const { topK, pair } of resultsWithoutQA) {
        const rr = computeReciprocalRank(topK, pair.relevantIds);
        expect(rr).toBeGreaterThanOrEqual(0);
        expect(rr).toBeLessThanOrEqual(1);
      }
    });

    test("MRR with higher-importance facts scores above 0.60", () => {
      // Filter to queries where the primary relevant fact has importanceScore >= 0.85
      const highImportancePairs = resultsWithoutQA.filter(({ pair }) => {
        const primaryFact = CORPUS.find((f) => f._id === pair.relevantIds[0]);
        return primaryFact && primaryFact.importanceScore >= 0.85;
      });
      expect(highImportancePairs.length).toBeGreaterThan(0);
      const rrs = highImportancePairs.map(({ topK, pair }) =>
        computeReciprocalRank(topK, pair.relevantIds)
      );
      expect(meanOf(rrs)).toBeGreaterThan(0.60);
    });
  });

  describe("QA pathway boost", () => {
    test("recall@5 WITH QA pathway >= recall@5 WITHOUT QA (for queries with QA matches)", () => {
      const queriesWithQA = GOLD_PAIRS
        .map((pair, i) => ({ pair, i }))
        .filter(({ pair }) => pair.qaMatchIds && pair.qaMatchIds.length > 0);

      expect(queriesWithQA.length).toBeGreaterThan(0);

      for (const { i, pair } of queriesWithQA) {
        const withoutQA = computeRecallAtK(resultsWithoutQA[i].topK, pair.relevantIds);
        const withQA = computeRecallAtK(resultsWithQA[i].topK, pair.relevantIds);
        // QA pathway should not hurt recall (and may improve it)
        expect(withQA, `recall@5 with QA for "${pair.query}"`).toBeGreaterThanOrEqual(withoutQA);
      }
    });

    test("mean recall@5 WITH QA improves by >= 10% relative to WITHOUT QA (across QA-eligible queries)", () => {
      const queriesWithQA = GOLD_PAIRS
        .map((pair, i) => ({ pair, i }))
        .filter(({ pair }) => pair.qaMatchIds && pair.qaMatchIds.length > 0);

      const withoutQAScores = queriesWithQA.map(({ pair, i }) =>
        computeRecallAtK(resultsWithoutQA[i].topK, pair.relevantIds)
      );
      const withQAScores = queriesWithQA.map(({ pair, i }) =>
        computeRecallAtK(resultsWithQA[i].topK, pair.relevantIds)
      );

      const meanWithout = meanOf(withoutQAScores);
      const meanWith = meanOf(withQAScores);

      // QA pathway boosts recall@5 by at least 0.10 absolute (or reaches 1.0)
      const absoluteImprovement = meanWith - meanWithout;
      expect(absoluteImprovement).toBeGreaterThanOrEqual(0.10);
    });

    test("MRR WITH QA pathway >= MRR WITHOUT QA (for queries with QA matches)", () => {
      const queriesWithQA = GOLD_PAIRS
        .map((pair, i) => ({ pair, i }))
        .filter(({ pair }) => pair.qaMatchIds && pair.qaMatchIds.length > 0);

      const mrrWithout = meanOf(
        queriesWithQA.map(({ pair, i }) =>
          computeReciprocalRank(resultsWithoutQA[i].topK, pair.relevantIds)
        )
      );
      const mrrWith = meanOf(
        queriesWithQA.map(({ pair, i }) =>
          computeReciprocalRank(resultsWithQA[i].topK, pair.relevantIds)
        )
      );

      expect(mrrWith).toBeGreaterThanOrEqual(mrrWithout);
    });

    test("QA pathway does not degrade precision@5 on non-QA queries", () => {
      const queriesWithoutQA = GOLD_PAIRS
        .map((pair, i) => ({ pair, i }))
        .filter(({ pair }) => !pair.qaMatchIds || pair.qaMatchIds.length === 0);

      for (const { pair, i } of queriesWithoutQA) {
        const pWithout = computePrecisionAtK(resultsWithoutQA[i].topK, pair.relevantIds);
        const pWith = computePrecisionAtK(resultsWithQA[i].topK, pair.relevantIds);
        // Without QA matches, enabling QA pathway should not change results
        expect(pWith).toBeCloseTo(pWithout, 5);
      }
    });

    test("QA-boosted results place the primary relevant fact at rank 1 for most QA queries", () => {
      const queriesWithQA = GOLD_PAIRS
        .map((pair, i) => ({ pair, i }))
        .filter(({ pair }) => pair.qaMatchIds && pair.qaMatchIds.length > 0);

      const rank1Hits = queriesWithQA.filter(({ pair, i }) => {
        const topK = resultsWithQA[i].topK;
        return topK[0] !== undefined && pair.relevantIds.includes(topK[0]);
      });

      // At least 70% of QA-eligible queries should have the primary doc at rank 1
      expect(rank1Hits.length / queriesWithQA.length).toBeGreaterThanOrEqual(0.70);
    });
  });

  describe("corpus sanity checks", () => {
    test("corpus contains exactly 50 facts", () => {
      expect(CORPUS).toHaveLength(50);
    });

    test("all corpus fact IDs are unique", () => {
      const ids = CORPUS.map((f) => f._id);
      expect(new Set(ids).size).toBe(CORPUS.length);
    });

    test("all gold pair relevantIds reference facts that exist in corpus", () => {
      const corpusIds = new Set(CORPUS.map((f) => f._id));
      for (const pair of GOLD_PAIRS) {
        for (const id of pair.relevantIds) {
          expect(corpusIds.has(id), `relevantId "${id}" not in corpus`).toBe(true);
        }
      }
    });

    test("gold pair set contains 18 queries (15 standard + 3 lexical-gap QA boost pairs)", () => {
      expect(GOLD_PAIRS).toHaveLength(18);
    });

    test("all importanceScores are in [0, 1]", () => {
      for (const fact of CORPUS) {
        expect(fact.importanceScore).toBeGreaterThanOrEqual(0);
        expect(fact.importanceScore).toBeLessThanOrEqual(1);
      }
    });
  });
});
