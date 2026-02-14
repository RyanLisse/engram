function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function autoLinkEntities(content: string, entityNames: string[]): string {
  let output = content;
  for (const name of entityNames) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 3) continue;
    if (output.includes(`[[${trimmed}]]`)) continue;
    const regex = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "g");
    output = output.replace(regex, `[[${trimmed}]]`);
  }
  return output;
}
