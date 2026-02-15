"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Brain,
  Activity,
  Database,
  Users,
  Bell,
  Zap,
  RefreshCw,
  Circle,
} from "lucide-react";

interface AgentInfo {
  agentId: string;
  name: string;
  capabilities: string[];
  telos?: string;
  lastActiveAt?: number;
}

interface SSEEvent {
  type: string;
  agentId: string;
  scopeId?: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

interface HealthData {
  ok: boolean;
  watermark: number;
  totalSubscriptions: number;
  totalListeners: number;
  uptime: number;
}

const SSE_URL = process.env.NEXT_PUBLIC_ENGRAM_SSE_URL || "http://localhost:3940";

function useSSE(agentId: string) {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!agentId) return;
    const source = new EventSource(`${SSE_URL}/events/${agentId}`);

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 100));
      } catch {}
    };

    // Listen to typed events
    const types = [
      "fact_stored",
      "recall",
      "signal_recorded",
      "session_ended",
      "vault_sync_completed",
    ];
    for (const type of types) {
      source.addEventListener(type, (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data);
          setEvents((prev) => [event, ...prev].slice(0, 100));
        } catch {}
      });
    }

    return () => source.close();
  }, [agentId]);

  return { events, connected };
}

function useHealth() {
  const [health, setHealth] = useState<HealthData | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${SSE_URL}/health`);
      if (res.ok) setHealth(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { health, refresh };
}

function StatCard({
  icon: Icon,
  label,
  value,
  color = "text-zinc-400",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-zinc-500 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function EventRow({ event }: { event: SSEEvent }) {
  const typeColors: Record<string, string> = {
    fact_stored: "text-emerald-400",
    recall: "text-blue-400",
    signal_recorded: "text-amber-400",
    session_ended: "text-purple-400",
    vault_sync_completed: "text-cyan-400",
    connected: "text-zinc-500",
  };

  const ago = Math.round((Date.now() - event.timestamp) / 1000);
  const agoStr = ago < 60 ? `${ago}s` : `${Math.round(ago / 60)}m`;

  return (
    <div className="flex items-center gap-3 py-2 px-3 border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors">
      <Circle
        className={`w-2 h-2 fill-current ${typeColors[event.type] ?? "text-zinc-600"}`}
      />
      <span
        className={`text-xs font-mono ${typeColors[event.type] ?? "text-zinc-400"}`}
      >
        {event.type}
      </span>
      <span className="text-xs text-zinc-600 flex-1 truncate">
        {event.agentId}
        {event.scopeId ? ` → ${event.scopeId}` : ""}
      </span>
      <span className="text-xs text-zinc-600 tabular-nums">{agoStr} ago</span>
    </div>
  );
}

export default function DashboardPage() {
  const [agentId, setAgentId] = useState("indy");
  const { events, connected } = useSSE(agentId);
  const { health, refresh } = useHealth();

  const factEvents = events.filter((e) => e.type === "fact_stored").length;
  const recallEvents = events.filter((e) => e.type === "recall").length;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Brain className="w-8 h-8 text-violet-400" />
          <div>
            <h1 className="text-xl font-semibold">Engram Dashboard</h1>
            <p className="text-xs text-zinc-500">
              Real-time agent memory monitoring
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Agent:</label>
            <input
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Circle
              className={`w-2 h-2 fill-current ${connected ? "text-emerald-400" : "text-red-400"}`}
            />
            <span className="text-xs text-zinc-500">
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <button
            onClick={refresh}
            className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Database}
          label="Facts Stored"
          value={factEvents}
          color="text-emerald-400"
        />
        <StatCard
          icon={Zap}
          label="Recalls"
          value={recallEvents}
          color="text-blue-400"
        />
        <StatCard
          icon={Users}
          label="Subscriptions"
          value={health?.totalSubscriptions ?? 0}
          color="text-violet-400"
        />
        <StatCard
          icon={Activity}
          label="Uptime"
          value={
            health?.uptime
              ? `${Math.round(health.uptime / 60)}m`
              : "—"
          }
          color="text-amber-400"
        />
      </div>

      {/* Event Stream */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium">Live Event Stream</span>
          </div>
          <span className="text-xs text-zinc-600">
            {events.length} events
          </span>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {events.length === 0 ? (
            <div className="py-12 text-center text-zinc-600 text-sm">
              {connected
                ? "Waiting for events…"
                : `Connect to SSE server at ${SSE_URL}`}
            </div>
          ) : (
            events.map((event, i) => <EventRow key={i} event={event} />)
          )}
        </div>
      </div>

      {/* Health Info */}
      {health && (
        <div className="mt-4 text-xs text-zinc-600 flex items-center gap-4">
          <span>
            Watermark:{" "}
            {new Date(health.watermark).toLocaleTimeString()}
          </span>
          <span>Listeners: {health.totalListeners}</span>
          <span>
            SSE:{" "}
            <code className="text-zinc-500">{SSE_URL}</code>
          </span>
        </div>
      )}
    </div>
  );
}
