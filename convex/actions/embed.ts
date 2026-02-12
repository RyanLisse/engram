"use node";

/**
 * Cohere Embed 4 integration for generating 1024-dim embeddings.
 */

const COHERE_API_URL = "https://api.cohere.com/v2/embed";
const EMBEDDING_MODEL = "embed-v4.0";
const EMBEDDING_DIMENSIONS = 1024;

interface CohereEmbedRequest {
  texts: string[];
  model: string;
  input_type: "search_document" | "search_query";
  embedding_types: ["float"];
}

interface CohereEmbedResponse {
  embeddings: {
    float: number[][];
  };
}

/**
 * Generate embedding for a document (fact content).
 * Use this when storing facts.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  return await generateEmbeddingWithType(text, "search_document");
}

/**
 * Generate embedding for a search query.
 * Use this when recalling facts via semantic search.
 */
export async function generateQueryEmbedding(text: string): Promise<number[]> {
  return await generateEmbeddingWithType(text, "search_query");
}

/**
 * Internal helper to generate embeddings with specified input_type.
 */
async function generateEmbeddingWithType(
  text: string,
  inputType: "search_document" | "search_query"
): Promise<number[]> {
  const apiKey = process.env.COHERE_API_KEY;

  if (!apiKey) {
    console.error("COHERE_API_KEY not set, returning zero vector");
    return new Array(EMBEDDING_DIMENSIONS).fill(0);
  }

  try {
    const requestBody: CohereEmbedRequest = {
      texts: [text],
      model: EMBEDDING_MODEL,
      input_type: inputType,
      embedding_types: ["float"],
    };

    const response = await fetch(COHERE_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Cohere API error (${response.status}): ${errorText}`
      );
      return new Array(EMBEDDING_DIMENSIONS).fill(0);
    }

    const data: CohereEmbedResponse = await response.json();

    if (!data.embeddings?.float?.[0]) {
      console.error("Invalid Cohere response format");
      return new Array(EMBEDDING_DIMENSIONS).fill(0);
    }

    return data.embeddings.float[0];
  } catch (error) {
    console.error("Error generating embedding:", error);
    return new Array(EMBEDDING_DIMENSIONS).fill(0);
  }
}
