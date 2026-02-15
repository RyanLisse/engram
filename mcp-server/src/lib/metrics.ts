/**
 * Tool Performance Metrics Tracker
 *
 * Harness engineering: observability as scaffolding.
 * Tracks per-tool call counts, latency percentiles, error rates.
 * Exposes via memory_health tool and periodic log dumps.
 */

export interface ToolMetric {
  calls: number;
  errors: number;
  totalMs: number;
  maxMs: number;
  minMs: number;
  /** Track recent latencies for p50/p95/p99 */
  recentMs: number[];
}

const RECENT_WINDOW = 100; // Keep last 100 latencies per tool

class MetricsTracker {
  private metrics = new Map<string, ToolMetric>();
  private startedAt = Date.now();

  record(tool: string, durationMs: number, isError: boolean): void {
    let m = this.metrics.get(tool);
    if (!m) {
      m = { calls: 0, errors: 0, totalMs: 0, maxMs: 0, minMs: Infinity, recentMs: [] };
      this.metrics.set(tool, m);
    }
    m.calls++;
    if (isError) m.errors++;
    m.totalMs += durationMs;
    m.maxMs = Math.max(m.maxMs, durationMs);
    m.minMs = Math.min(m.minMs, durationMs);
    m.recentMs.push(durationMs);
    if (m.recentMs.length > RECENT_WINDOW) m.recentMs.shift();
  }

  getSnapshot(): {
    uptimeMs: number;
    totalCalls: number;
    totalErrors: number;
    tools: Record<string, {
      calls: number;
      errors: number;
      avgMs: number;
      p50Ms: number;
      p95Ms: number;
      maxMs: number;
    }>;
    slowTools: string[];
  } {
    const tools: Record<string, any> = {};
    let totalCalls = 0;
    let totalErrors = 0;
    const slowTools: string[] = [];

    for (const [name, m] of this.metrics) {
      totalCalls += m.calls;
      totalErrors += m.errors;
      const sorted = [...m.recentMs].sort((a, b) => a - b);
      const p50 = percentile(sorted, 0.5);
      const p95 = percentile(sorted, 0.95);
      const avgMs = m.calls > 0 ? Math.round(m.totalMs / m.calls) : 0;

      tools[name] = {
        calls: m.calls,
        errors: m.errors,
        avgMs,
        p50Ms: p50,
        p95Ms: p95,
        maxMs: m.maxMs,
      };

      // Flag tools exceeding golden principle targets
      if (p95 > 200) slowTools.push(name);
    }

    return {
      uptimeMs: Date.now() - this.startedAt,
      totalCalls,
      totalErrors,
      tools,
      slowTools,
    };
  }

  /** Top N tools by call count */
  getTopTools(n: number): Array<{ name: string; calls: number; avgMs: number }> {
    return [...this.metrics.entries()]
      .sort((a, b) => b[1].calls - a[1].calls)
      .slice(0, n)
      .map(([name, m]) => ({
        name,
        calls: m.calls,
        avgMs: m.calls > 0 ? Math.round(m.totalMs / m.calls) : 0,
      }));
  }

  reset(): void {
    this.metrics.clear();
    this.startedAt = Date.now();
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, idx)];
}

export const metrics = new MetricsTracker();
