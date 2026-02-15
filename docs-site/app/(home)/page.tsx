import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center text-center px-4 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm text-fd-muted-foreground mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          Phases 1-6 complete — System operational
        </div>

        <h1 className="text-5xl font-bold tracking-tight mb-6 bg-gradient-to-b from-fd-foreground to-fd-foreground/70 bg-clip-text text-transparent">
          An elephant never forgets.
          <br />
          Neither should your agents.
        </h1>

        <p className="text-lg text-fd-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
          Engram is a unified multi-agent memory system. Store facts, recall
          context, build knowledge — across agents, devices, and sessions.
          Local-first vector search via LanceDB, cloud-synced through Convex.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/docs"
            className="rounded-lg bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground shadow-sm transition-colors hover:bg-fd-primary/90"
          >
            Get Started
          </Link>
          <Link
            href="/docs/architecture"
            className="rounded-lg border border-fd-border px-6 py-3 text-sm font-medium text-fd-foreground shadow-sm transition-colors hover:bg-fd-accent"
          >
            Architecture
          </Link>
          <a
            href="https://github.com/RyanLisse/engram"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-fd-border px-6 py-3 text-sm font-medium text-fd-foreground shadow-sm transition-colors hover:bg-fd-accent"
          >
            GitHub
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-20 text-left">
          <div className="rounded-xl border border-fd-border p-6 bg-fd-card">
            <div className="text-2xl mb-3">🧠</div>
            <h3 className="font-semibold mb-2">Multi-Agent Memory</h3>
            <p className="text-sm text-fd-muted-foreground">
              Every agent shares one brain. Scope-based access control lets
              agents share or isolate knowledge.
            </p>
          </div>
          <div className="rounded-xl border border-fd-border p-6 bg-fd-card">
            <div className="text-2xl mb-3">🔍</div>
            <h3 className="font-semibold mb-2">Semantic Search</h3>
            <p className="text-sm text-fd-muted-foreground">
              Vector search finds what matters, not just what matches. Powered by
              Cohere Embed 4 with 1024-dim embeddings.
            </p>
          </div>
          <div className="rounded-xl border border-fd-border p-6 bg-fd-card">
            <div className="text-2xl mb-3">🔄</div>
            <h3 className="font-semibold mb-2">Cross-Device Sync</h3>
            <p className="text-sm text-fd-muted-foreground">
              Cloud-synced through Convex with local LanceDB fallback. Works
              across all your machines.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6 text-left">
          <div className="rounded-xl border border-fd-border p-6 bg-fd-card">
            <div className="text-2xl mb-3">📊</div>
            <h3 className="font-semibold mb-2">12 MCP Tools</h3>
            <p className="text-sm text-fd-muted-foreground">
              Atomic primitives for store, recall, search, link, observe, and
              more. Composable by design.
            </p>
          </div>
          <div className="rounded-xl border border-fd-border p-6 bg-fd-card">
            <div className="text-2xl mb-3">🗑️</div>
            <h3 className="font-semibold mb-2">Smart Forgetting</h3>
            <p className="text-sm text-fd-muted-foreground">
              Differential decay by fact type. Corrections persist, notes fade.
              Memory quality improves over time.
            </p>
          </div>
          <div className="rounded-xl border border-fd-border p-6 bg-fd-card">
            <div className="text-2xl mb-3">⚡</div>
            <h3 className="font-semibold mb-2">Async Enrichment</h3>
            <p className="text-sm text-fd-muted-foreground">
              Store facts in &lt;50ms. Embeddings, entities, importance scoring
              happen in the background.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
