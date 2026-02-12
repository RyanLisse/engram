// Cohere Embed 4 client for MCP server
// Generates 1024-dim embeddings for text, images, and code

export async function generateEmbedding(
  text: string,
  inputType: "search_document" | "search_query" = "search_document"
): Promise<number[]> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    console.error("[embeddings] COHERE_API_KEY not set, returning zero vector");
    return new Array(1024).fill(0);
  }

  const response = await fetch("https://api.cohere.com/v2/embed", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      texts: [text],
      model: "embed-v4.0",
      input_type: inputType,
      embedding_types: ["float"],
    }),
  });

  if (!response.ok) {
    console.error(`[embeddings] Cohere API error: ${response.status}`);
    return new Array(1024).fill(0);
  }

  const data = await response.json();
  return data.embeddings.float[0];
}

export async function generateBatchEmbeddings(
  texts: string[],
  inputType: "search_document" | "search_query" = "search_document"
): Promise<number[][]> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    return texts.map(() => new Array(1024).fill(0));
  }

  // Cohere batch limit is 96 texts
  const batchSize = 96;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await fetch("https://api.cohere.com/v2/embed", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        texts: batch,
        model: "embed-v4.0",
        input_type: inputType,
        embedding_types: ["float"],
      }),
    });

    if (!response.ok) {
      results.push(...batch.map(() => new Array(1024).fill(0)));
      continue;
    }

    const data = await response.json();
    results.push(...data.embeddings.float);
  }

  return results;
}
