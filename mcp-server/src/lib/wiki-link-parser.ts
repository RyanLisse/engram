export interface WikiLink {
  target: string;
  alias?: string;
  start: number;
  end: number;
}

export function parseWikiLinks(content: string): WikiLink[] {
  const links: WikiLink[] = [];
  const regex = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    links.push({
      target: match[1].trim(),
      alias: match[2]?.trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return links;
}
