export type QueryIntent = "lookup" | "explore" | "temporal" | "relational";

export function classifyIntent(query: string): QueryIntent {
  const normalized = query.trim().toLowerCase();

  if (
    /^(what is|who is|what does|show me|get|find|lookup)/i.test(normalized) ||
    /\b(preference|rule|email|phone|address|username|key|value)\b/i.test(normalized)
  ) {
    return "lookup";
  }

  if (
    /\b(when|last|yesterday|today|this week|timeline|recent|history|ago|before|after|during)\b/i.test(normalized)
  ) {
    return "temporal";
  }

  if (
    /\b(related|connected|depends|works with|between|relationship|links|associated|part of)\b/i.test(normalized)
  ) {
    return "relational";
  }

  return "explore";
}
