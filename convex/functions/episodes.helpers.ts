export function mergeUniqueFactIds<T extends string>(existing: T[], additions: T[]): T[] {
  const existingSet = new Set(existing);
  const merged = [...existing];
  for (const factId of additions) {
    if (!existingSet.has(factId)) {
      existingSet.add(factId);
      merged.push(factId);
    }
  }
  return merged;
}

export function buildObservationEpisodeTags(
  source: "observer" | "reflector",
  generation: number,
  tags?: string[],
): string[] {
  const merged = [
    "observation-session",
    source,
    `${source}-generation-${generation}`,
    ...(tags ?? []),
  ];
  return Array.from(new Set(merged));
}

export function buildAutoEpisodeTitle(args: {
  source: "observer" | "reflector";
  generation: number;
  startTime: number;
}): string {
  const prefix = args.source === "observer" ? "Observer" : "Reflector";
  const day = new Date(args.startTime).toISOString().slice(0, 10);
  return `${prefix} Episode #${args.generation} (${day})`;
}
