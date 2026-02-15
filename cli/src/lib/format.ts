/**
 * Rich terminal output formatting
 */

import chalk from "chalk";

export function header(text: string): string {
  return chalk.bold.cyan(`\n  ${text}\n`);
}

export function success(text: string): string {
  return chalk.green(`  ✓ ${text}`);
}

export function error(text: string): string {
  return chalk.red(`  ✗ ${text}`);
}

export function warn(text: string): string {
  return chalk.yellow(`  ⚠ ${text}`);
}

export function dim(text: string): string {
  return chalk.dim(`  ${text}`);
}

export function label(key: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  return `  ${chalk.gray(key + ":")} ${value}`;
}

export function factRow(fact: any, index?: number): string {
  const prefix = index !== undefined ? chalk.gray(`${index + 1}.`) : chalk.gray("•");
  const type = fact.factType ? chalk.magenta(`[${fact.factType}]`) : "";
  const importance = fact.importanceScore
    ? chalk.yellow(`★${(fact.importanceScore as number).toFixed(2)}`)
    : "";
  const content =
    fact.content.length > 120 ? fact.content.slice(0, 120) + chalk.dim("…") : fact.content;
  const tags =
    fact.tags && fact.tags.length > 0
      ? chalk.cyan(fact.tags.map((t: string) => `#${t}`).join(" "))
      : "";

  const parts = [prefix, type, importance, content, tags].filter(Boolean);
  return `  ${parts.join(" ")}`;
}

export function entityRow(entity: any): string {
  const type = chalk.blue(`[${entity.type || "unknown"}]`);
  const name = chalk.bold(entity.name || entity.entityId);
  const score = entity.importanceScore
    ? chalk.yellow(`★${(entity.importanceScore as number).toFixed(2)}`)
    : "";
  return `  • ${type} ${name} ${score}`;
}

export function scopeRow(scope: any): string {
  const name = chalk.bold(scope.name);
  const members = chalk.gray(`(${scope.members?.length || 0} members)`);
  const policy = chalk.dim(`r:${scope.readPolicy} w:${scope.writePolicy}`);
  return `  • ${name} ${members} ${policy}`;
}

export function agentRow(agent: any): string {
  const name = chalk.bold(agent.name || agent.agentId);
  const id = chalk.gray(`(${agent.agentId})`);
  const caps = agent.capabilities?.length
    ? chalk.dim(agent.capabilities.join(", "))
    : "";
  const facts = chalk.yellow(`${agent.factCount || 0} facts`);
  return `  • ${name} ${id} ${facts} ${caps}`;
}

export function divider(): string {
  return chalk.gray("  " + "─".repeat(60));
}

export function table(rows: string[][]): string {
  if (rows.length === 0) return "";
  const colWidths = rows[0].map((_, i) =>
    Math.max(...rows.map((r) => stripAnsi(r[i] || "").length))
  );
  return rows
    .map((row) =>
      "  " +
      row.map((cell, i) => cell.padEnd(colWidths[i] + stripAnsi(cell).length - cell.length + 2)).join("")
    )
    .join("\n");
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
