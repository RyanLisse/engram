/**
 * QMD Manager — Local-first search engine integration for Engram vault.
 *
 * QMD (github.com/tobi/qmd) provides BM25 + vector + LLM reranking search
 * over markdown files, all on-device. This module manages the QMD lifecycle:
 *   - Detection: check if qmd binary is available
 *   - Collection management: create/verify the engram-vault collection
 *   - Indexing: trigger reindex and embedding generation
 *   - Search: three modes (BM25, vector, LLM-reranked query)
 *   - Status: health check and collection info
 *
 * Design principles:
 *   - Never throws when QMD is not installed — returns typed errors
 *   - Uses execFile (not exec) for subprocess safety
 *   - Caches installation check for process lifetime
 *   - All search commands use --json for parseable output
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCb);

// ── Types ────────────────────────────────────────────

export interface QmdResult {
  path: string;
  docId: string;
  title: string;
  score: number;
  snippet: string;
  context?: string;
  /** Extracted from YAML frontmatter `id` field when available */
  factId?: string;
}

export interface QmdSearchOpts {
  /** Maximum results to return (default: 10) */
  limit?: number;
  /** Minimum relevance score threshold (default: 0.2) */
  minScore?: number;
  /** Filter results by scope path prefix */
  scope?: string;
  /** Return full document content instead of snippet */
  full?: boolean;
}

export interface QmdStatus {
  installed: boolean;
  version?: string;
  enabled: boolean;
  collectionExists: boolean;
  collectionName: string;
  documentCount: number;
  embeddingCount: number;
  lastIndexed?: Date;
}

export type QmdError =
  | { type: "not_installed"; message: string }
  | { type: "disabled"; message: string }
  | { type: "collection_missing"; message: string }
  | { type: "timeout"; message: string; timeoutMs: number }
  | { type: "parse_error"; message: string; raw: string }
  | { type: "execution_error"; message: string; exitCode: number };

/** Discriminated result type for operations that can fail gracefully */
export type QmdOperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: QmdError };

// ── Constants ────────────────────────────────────────

const DEFAULT_COLLECTION = "engram-vault";
const SEARCH_TIMEOUT_MS = 30_000;
const EMBED_TIMEOUT_MS = 120_000;
const DEFAULT_LIMIT = 10;
const DEFAULT_MIN_SCORE = 0.2;

// ── QmdManager ───────────────────────────────────────

export class QmdManager {
  private static instance: QmdManager | null = null;

  /** Cached installation probe — null means not yet checked */
  private installedCache: boolean | null = null;
  private versionCache: string | null = null;
  private collectionName: string = DEFAULT_COLLECTION;
  private vaultRoot: string | null = null;

  private constructor() {}

  /** Get the singleton QmdManager instance. */
  static getInstance(): QmdManager {
    if (!QmdManager.instance) {
      QmdManager.instance = new QmdManager();
    }
    return QmdManager.instance;
  }

  // ── Detection ────────────────────────────────────

  /**
   * Check whether the `qmd` binary is available on PATH.
   * Result is cached for the process lifetime after first probe.
   */
  async isInstalled(): Promise<boolean> {
    if (this.installedCache !== null) return this.installedCache;

    try {
      const { stdout } = await execFileAsync("qmd", ["--version"], {
        timeout: 5_000,
      });
      this.installedCache = true;
      this.versionCache = stdout.trim() || null;
      return true;
    } catch {
      this.installedCache = false;
      this.versionCache = null;
      return false;
    }
  }

  /**
   * Return the QMD version string, or null if not installed.
   * Probes installation if not yet checked.
   */
  async getVersion(): Promise<string | null> {
    if (this.installedCache === null) await this.isInstalled();
    return this.versionCache;
  }

  // ── Enabled state ────────────────────────────────

  /**
   * Whether QMD integration is enabled via `ENGRAM_QMD_ENABLED` env var.
   * Default: false (opt-in).
   */
  isEnabled(): boolean {
    return process.env.ENGRAM_QMD_ENABLED === "true";
  }

  // ── Collection management ────────────────────────

  /**
   * Ensure the QMD collection exists for the given vault root.
   * Creates the collection if it does not exist.
   *
   * @param vaultRoot - Absolute path to the vault directory
   * @param collectionName - Collection name (default: "engram-vault")
   */
  async ensureCollection(
    vaultRoot: string,
    collectionName?: string
  ): Promise<QmdOperationResult<void>> {
    if (!this.isEnabled()) {
      return { ok: false, error: { type: "disabled", message: "QMD integration is disabled. Set ENGRAM_QMD_ENABLED=true to enable." } };
    }

    const installed = await this.isInstalled();
    if (!installed) {
      return { ok: false, error: { type: "not_installed", message: "qmd binary not found on PATH. Install from github.com/tobi/qmd." } };
    }

    this.vaultRoot = vaultRoot;
    if (collectionName) this.collectionName = collectionName;

    const exists = await this.collectionExists();
    if (exists) return { ok: true, value: undefined };

    // Create collection pointing at the vault root
    const result = await this.execQmd(
      ["collection", "create", this.collectionName, "--path", vaultRoot],
      SEARCH_TIMEOUT_MS
    );

    if (!result.ok) return result as QmdOperationResult<void>;
    return { ok: true, value: undefined };
  }

  /**
   * Check if the named collection already exists.
   *
   * @param name - Collection name to check (defaults to current collection)
   */
  async collectionExists(name?: string): Promise<boolean> {
    const target = name ?? this.collectionName;
    const result = await this.execQmd(
      ["collection", "list", "--json"],
      SEARCH_TIMEOUT_MS
    );

    if (!result.ok) return false;

    try {
      const parsed = JSON.parse(result.value.stdout);
      const collections: string[] = Array.isArray(parsed)
        ? parsed.map((c: any) => c.name ?? c)
        : [];
      return collections.includes(target);
    } catch {
      return false;
    }
  }

  // ── Indexing ─────────────────────────────────────

  /**
   * Trigger a full reindex of the current collection.
   * Returns the number of files indexed and elapsed time.
   */
  async reindex(): Promise<QmdOperationResult<{ filesIndexed: number; durationMs: number }>> {
    const guard = this.guardEnabled();
    if (guard) return guard;

    const start = Date.now();
    const result = await this.execQmd(
      ["index", "--collection", this.collectionName, "--json"],
      EMBED_TIMEOUT_MS
    );

    if (!result.ok) return result as QmdOperationResult<{ filesIndexed: number; durationMs: number }>;

    const durationMs = Date.now() - start;
    try {
      const parsed = JSON.parse(result.value.stdout);
      return {
        ok: true,
        value: {
          filesIndexed: parsed.files_indexed ?? parsed.filesIndexed ?? 0,
          durationMs,
        },
      };
    } catch {
      // Index succeeded but output was not JSON — still a success
      return { ok: true, value: { filesIndexed: 0, durationMs } };
    }
  }

  /**
   * Ensure embeddings are generated for all indexed documents.
   * This can take significant time for large vaults.
   */
  async ensureEmbeddings(): Promise<QmdOperationResult<void>> {
    const guard = this.guardEnabled();
    if (guard) return guard;

    const result = await this.execQmd(
      ["embed", "--collection", this.collectionName, "--json"],
      EMBED_TIMEOUT_MS
    );

    if (!result.ok) return result as QmdOperationResult<void>;
    return { ok: true, value: undefined };
  }

  // ── Search ───────────────────────────────────────

  /**
   * Search the vault using QMD's search capabilities.
   *
   * Three modes:
   *   - `search`: BM25 keyword search (fast, no ML)
   *   - `vsearch`: Vector similarity search (requires embeddings)
   *   - `query`: LLM-reranked search (highest quality, slowest)
   *
   * @param query - The search query string
   * @param mode - Search mode: 'search' | 'vsearch' | 'query'
   * @param opts - Optional search parameters
   */
  async search(
    query: string,
    mode: "search" | "vsearch" | "query",
    opts?: QmdSearchOpts
  ): Promise<QmdOperationResult<QmdResult[]>> {
    const guard = this.guardEnabled();
    if (guard) return guard;

    const limit = opts?.limit ?? DEFAULT_LIMIT;
    const minScore = opts?.minScore ?? DEFAULT_MIN_SCORE;

    const args = [
      mode,
      query,
      "--collection", this.collectionName,
      "--limit", String(limit),
      "--json",
    ];

    if (opts?.full) args.push("--full");

    const result = await this.execQmd(args, SEARCH_TIMEOUT_MS);
    if (!result.ok) return result as QmdOperationResult<QmdResult[]>;

    try {
      const parsed = JSON.parse(result.value.stdout);
      const rawResults: any[] = Array.isArray(parsed)
        ? parsed
        : parsed.results ?? parsed.documents ?? [];

      let results: QmdResult[] = rawResults.map((r: any) => ({
        path: r.path ?? r.file ?? "",
        docId: r.doc_id ?? r.docId ?? r.id ?? "",
        title: r.title ?? "",
        score: r.score ?? r.relevance ?? 0,
        snippet: r.snippet ?? r.excerpt ?? r.content ?? "",
        context: r.context,
        factId: r.metadata?.id ?? r.frontmatter?.id ?? undefined,
      }));

      // Filter by minimum score
      results = results.filter((r) => r.score >= minScore);

      // Filter by scope prefix if specified
      if (opts?.scope) {
        const prefix = opts.scope.endsWith("/") ? opts.scope : opts.scope + "/";
        results = results.filter((r) => r.path.startsWith(prefix));
      }

      return { ok: true, value: results };
    } catch {
      return {
        ok: false,
        error: {
          type: "parse_error",
          message: "Failed to parse QMD search output as JSON",
          raw: result.value.stdout.slice(0, 500),
        },
      };
    }
  }

  // ── Document retrieval ───────────────────────────

  /**
   * Retrieve the full content of a document by path or doc ID.
   *
   * @param pathOrDocId - File path or QMD document identifier
   */
  async getDocument(pathOrDocId: string): Promise<QmdOperationResult<string>> {
    const guard = this.guardEnabled();
    if (guard) return guard;

    const result = await this.execQmd(
      ["doc", "get", pathOrDocId, "--collection", this.collectionName],
      SEARCH_TIMEOUT_MS
    );

    if (!result.ok) return result as QmdOperationResult<string>;
    return { ok: true, value: result.value.stdout };
  }

  // ── Status ───────────────────────────────────────

  /**
   * Return a comprehensive status snapshot of the QMD integration.
   * Safe to call even when QMD is not installed.
   */
  async getStatus(): Promise<QmdStatus> {
    const installed = await this.isInstalled();
    const enabled = this.isEnabled();

    const base: QmdStatus = {
      installed,
      version: this.versionCache ?? undefined,
      enabled,
      collectionExists: false,
      collectionName: this.collectionName,
      documentCount: 0,
      embeddingCount: 0,
    };

    if (!installed || !enabled) return base;

    // Try to get collection info
    const result = await this.execQmd(
      ["collection", "info", this.collectionName, "--json"],
      SEARCH_TIMEOUT_MS
    );

    if (!result.ok) return base;

    try {
      const info = JSON.parse(result.value.stdout);
      return {
        ...base,
        collectionExists: true,
        documentCount: info.document_count ?? info.documentCount ?? info.docs ?? 0,
        embeddingCount: info.embedding_count ?? info.embeddingCount ?? info.embeddings ?? 0,
        lastIndexed: info.last_indexed
          ? new Date(info.last_indexed)
          : info.lastIndexed
            ? new Date(info.lastIndexed)
            : undefined,
      };
    } catch {
      return base;
    }
  }

  // ── Private helpers ──────────────────────────────

  /**
   * Guard that checks both enabled state and installation.
   * Returns an error result if the guard fails, or null if clear.
   */
  private guardEnabled(): QmdOperationResult<any> | null {
    if (!this.isEnabled()) {
      return {
        ok: false,
        error: {
          type: "disabled",
          message: "QMD integration is disabled. Set ENGRAM_QMD_ENABLED=true to enable.",
        },
      };
    }
    // Installation check is async, so callers use execQmd which handles it.
    // This guard only catches the synchronous "disabled" case.
    return null;
  }

  /**
   * Execute a QMD subprocess with timeout handling and typed errors.
   *
   * @param args - Arguments to pass to the qmd binary
   * @param timeoutMs - Maximum execution time (default: 30s)
   * @returns Typed result with stdout/stderr or an error
   */
  private async execQmd(
    args: string[],
    timeoutMs: number = SEARCH_TIMEOUT_MS
  ): Promise<QmdOperationResult<{ stdout: string; stderr: string }>> {
    const installed = await this.isInstalled();
    if (!installed) {
      return {
        ok: false,
        error: {
          type: "not_installed",
          message: "qmd binary not found on PATH. Install from github.com/tobi/qmd.",
        },
      };
    }

    try {
      const { stdout, stderr } = await execFileAsync("qmd", args, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        env: { ...process.env },
      });
      return { ok: true, value: { stdout, stderr } };
    } catch (err: any) {
      // Timeout detection: Node sets err.killed when timeout triggers
      if (err.killed || err.signal === "SIGTERM") {
        return {
          ok: false,
          error: {
            type: "timeout",
            message: `QMD command timed out after ${timeoutMs}ms: qmd ${args.join(" ")}`,
            timeoutMs,
          },
        };
      }

      // Non-zero exit code
      if (typeof err.code === "number" || err.status !== undefined) {
        const exitCode = err.code ?? err.status ?? 1;
        return {
          ok: false,
          error: {
            type: "execution_error",
            message: err.stderr?.trim() || err.message || `qmd exited with code ${exitCode}`,
            exitCode,
          },
        };
      }

      // Generic execution failure (e.g., ENOENT after cache invalidation)
      return {
        ok: false,
        error: {
          type: "execution_error",
          message: err.message || "Unknown QMD execution error",
          exitCode: 1,
        },
      };
    }
  }
}
