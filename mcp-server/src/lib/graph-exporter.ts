import fs from "node:fs/promises";
import path from "node:path";
import { parseWikiLinks } from "./wiki-link-parser.js";

export interface GraphNode {
  id: string;
  path: string;
  title: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface VaultGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generatedAt: number;
}

export async function exportVaultGraph(vaultRoot: string, files: { relativePath: string; content: string }[]) {
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const file of files) {
    const id = file.relativePath;
    const title = path.basename(file.relativePath, ".md");
    nodeMap.set(id, { id, path: file.relativePath, title });
  }

  for (const file of files) {
    const links = parseWikiLinks(file.content);
    for (const link of links) {
      const targetPath = [...nodeMap.values()].find((n) => n.title === link.target)?.id;
      if (!targetPath) continue;
      edges.push({ source: file.relativePath, target: targetPath });
    }
  }

  const graph: VaultGraph = {
    nodes: [...nodeMap.values()],
    edges,
    generatedAt: Date.now(),
  };

  const outputPath = path.join(vaultRoot, ".obsidian", "graph.json");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(graph), "utf8");
  return { outputPath, nodeCount: graph.nodes.length, edgeCount: graph.edges.length };
}
