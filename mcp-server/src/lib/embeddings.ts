/**
 * Embedding client with graceful fallback chain:
 *   1. Cohere Embed v4 (cloud, best quality, 1024-dim via MRL)
 *   2. Ollama mxbai-embed-large (local, good quality, native 1024-dim)
 *   3. Zero vector (no semantic search, text-only fallback)
 *
 * The fallback is automatic — no configuration needed beyond having
 * Ollama running locally with `ollama pull mxbai-embed-large`.
 */

const DIMENSIONS = 1024;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.ENGRAM_OLLAMA_EMBED_MODEL || "mxbai-embed-large";

// Cache which provider is available to avoid repeated probe failures
let _ollamaAvailable: boolean | null = null;

// ── Cohere (primary) ─────────────────────────────────

async function cohereEmbed(
  texts: string[],
  inputType: "search_document" | "search_query"
): Promise<number[][] | null> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.cohere.com/v2/embed", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        texts,
        model: "embed-v4.0",
        input_type: inputType,
        embedding_types: ["float"],
        output_dimension: DIMENSIONS,
      }),
    });

    if (!response.ok) {
      console.error(`[embeddings] Cohere API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.embeddings.float;
  } catch (err: any) {
    console.error(`[embeddings] Cohere request failed: ${err.message}`);
    return null;
  }
}

// ── Ollama (local fallback) ──────────────────────────

async function ollamaEmbed(texts: string[]): Promise<number[][] | null> {
  // Fast-reject if we already know Ollama is down
  if (_ollamaAvailable === false) return null;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_MODEL, input: texts }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      if (_ollamaAvailable === null) {
        console.error(`[embeddings] Ollama not available (${response.status}), will use zero vectors`);
        _ollamaAvailable = false;
      }
      return null;
    }

    const data = await response.json();
    if (_ollamaAvailable === null) {
      console.error(`[embeddings] Ollama fallback active (${OLLAMA_MODEL}, ${DIMENSIONS}-dim)`);
      _ollamaAvailable = true;
    }
    return data.embeddings;
  } catch (err: any) {
    if (_ollamaAvailable === null) {
      console.error(`[embeddings] Ollama unreachable: ${err.message}. Zero-vector fallback.`);
      _ollamaAvailable = false;
    }
    return null;
  }
}

// ── Public API ───────────────────────────────────────

export async function generateEmbedding(
  text: string,
  inputType: "search_document" | "search_query" = "search_document"
): Promise<number[]> {
  // 1. Try Cohere
  const cohere = await cohereEmbed([text], inputType);
  if (cohere?.[0]) return cohere[0];

  // 2. Try Ollama
  const ollama = await ollamaEmbed([text]);
  if (ollama?.[0]) return ollama[0];

  // 3. Zero vector (text-only search will still work)
  return new Array(DIMENSIONS).fill(0);
}

export async function generateBatchEmbeddings(
  texts: string[],
  inputType: "search_document" | "search_query" = "search_document"
): Promise<number[][]> {
  if (texts.length === 0) return [];

  // 1. Try Cohere (batch limit 96)
  const batchSize = 96;
  const allCohere: number[][] = [];
  let cohereWorking = true;

  for (let i = 0; i < texts.length && cohereWorking; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const result = await cohereEmbed(batch, inputType);
    if (result) {
      allCohere.push(...result);
    } else {
      cohereWorking = false;
    }
  }
  if (cohereWorking && allCohere.length === texts.length) return allCohere;

  // 2. Try Ollama for remaining/all texts
  const ollama = await ollamaEmbed(texts);
  if (ollama && ollama.length === texts.length) return ollama;

  // 3. Partial results + zero vectors for failures
  const merged: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    merged.push(
      allCohere[i] ?? ollama?.[i] ?? new Array(DIMENSIONS).fill(0)
    );
  }
  return merged;
}

/** Check which embedding provider is active (for health/diagnostics) */
export function getEmbeddingProvider(): string {
  if (process.env.COHERE_API_KEY) return "cohere";
  if (_ollamaAvailable === true) return "ollama";
  if (_ollamaAvailable === null) return "unknown (not probed yet)";
  return "none (zero vectors)";
}
