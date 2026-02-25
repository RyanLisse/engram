"use client";

import { useState } from "react";
import { Clock, User, ChevronDown, ChevronUp, GitBranch, Tag, ArrowDown } from "lucide-react";

export interface VersionEntry {
  versionId: string;
  previousContent: string;
  previousImportance?: number;
  previousTags?: string[];
  changedBy: string;
  changeType: string; // "update" | "merge" | "archive" | "restore" | "pin" | "unpin"
  reason?: string;
  createdAt: number;
}

interface VersionTimelineProps {
  factId: string;
  currentContent: string;
  versions: VersionEntry[];
}

const changeTypeColors: Record<string, { badge: string; dot: string }> = {
  update:   { badge: "bg-blue-500/20 text-blue-400",    dot: "bg-blue-400" },
  rollback: { badge: "bg-amber-500/20 text-amber-400",  dot: "bg-amber-400" },
  archive:  { badge: "bg-zinc-500/20 text-zinc-400",    dot: "bg-zinc-500" },
  restore:  { badge: "bg-emerald-500/20 text-emerald-400", dot: "bg-emerald-400" },
  pin:      { badge: "bg-violet-500/20 text-violet-400", dot: "bg-violet-400" },
  unpin:    { badge: "bg-violet-500/20 text-violet-300", dot: "bg-violet-300" },
  merge:    { badge: "bg-cyan-500/20 text-cyan-400",    dot: "bg-cyan-400" },
};

const DEFAULT_COLORS = { badge: "bg-zinc-500/20 text-zinc-400", dot: "bg-zinc-600" };

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffHr >= 24) {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: diffHr >= 24 * 365 ? "numeric" : undefined,
    });
  }
  if (diffHr >= 1) return `${diffHr}h ago`;
  if (diffMin >= 1) return `${diffMin}m ago`;
  return `${diffSec}s ago`;
}

function VersionEntryRow({ entry, isLast }: { entry: VersionEntry; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const colors = changeTypeColors[entry.changeType] ?? DEFAULT_COLORS;
  const contentPreview = entry.previousContent.slice(0, 80) + (entry.previousContent.length > 80 ? "…" : "");

  return (
    <div className="relative flex gap-4">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center">
        <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${colors.dot}`} />
        {!isLast && <div className="w-px flex-1 bg-zinc-800 mt-1" />}
      </div>

      {/* Entry body */}
      <div className={`pb-5 flex-1 min-w-0 ${isLast ? "" : ""}`}>
        {/* Top row: badge + time + agent */}
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
            {entry.changeType}
          </span>
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(entry.createdAt)}
          </span>
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <User className="w-3 h-3" />
            {entry.changedBy}
          </span>
        </div>

        {/* Content preview */}
        <p className="text-xs text-zinc-400 font-mono leading-relaxed truncate">
          {contentPreview}
        </p>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? "Collapse" : "Expand"}
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-2 bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
            <div>
              <span className="text-xs text-zinc-500 uppercase tracking-wider">Full content</span>
              <p className="mt-1 text-xs text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap break-words">
                {entry.previousContent}
              </p>
            </div>

            {entry.previousTags && entry.previousTags.length > 0 && (
              <div>
                <span className="flex items-center gap-1 text-xs text-zinc-500 uppercase tracking-wider mb-1">
                  <Tag className="w-3 h-3" />
                  Tags
                </span>
                <div className="flex flex-wrap gap-1">
                  {entry.previousTags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {entry.previousImportance !== undefined && (
              <div>
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Importance</span>
                <p className="mt-0.5 text-xs text-zinc-300">{entry.previousImportance}</p>
              </div>
            )}

            {entry.reason && (
              <div>
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Reason</span>
                <p className="mt-0.5 text-xs text-zinc-400 italic">{entry.reason}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function VersionTimeline({ factId, currentContent, versions }: VersionTimelineProps) {
  const truncatedId = factId.length > 20 ? `${factId.slice(0, 10)}…${factId.slice(-8)}` : factId;
  const safeContent = currentContent ?? "";
  const currentPreview = safeContent.slice(0, 120) + (safeContent.length > 120 ? "…" : "");

  return (
    <div className="text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <GitBranch className="w-4 h-4 text-zinc-500" />
        <span className="font-mono text-xs text-zinc-400">{truncatedId}</span>
        <span className="text-xs text-zinc-600">
          {versions.length} {versions.length === 1 ? "version" : "versions"}
        </span>
      </div>

      {/* Current version */}
      <div className="mb-5 bg-zinc-900 border border-zinc-700 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
            current
          </span>
          <ArrowDown className="w-3 h-3 text-zinc-600" />
        </div>
        <p className="text-xs text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap break-words">
          {currentPreview || <span className="text-zinc-600 italic">No content</span>}
        </p>
      </div>

      {/* Timeline */}
      {versions.length === 0 ? (
        <div className="py-6 text-center text-zinc-600 text-xs">
          No version history available for this fact.
        </div>
      ) : (
        <div className="border-l border-zinc-800 pl-0">
          {versions.map((entry, i) => (
            <VersionEntryRow
              key={entry.versionId}
              entry={entry}
              isLast={i === versions.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
