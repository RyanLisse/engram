# Codebase Structure

## Current State (Planning Phase)
```
engram/
├── PLAN.md                 # Master build plan (10 tables, 12 tools, 6 phases)
├── CLAUDE.md               # AI assistant instructions
├── README.md               # Project overview (note: still says "OpenAI" — needs Cohere update)
├── RESEARCH.md             # Research summary
├── CRONS.md                # Cron job specifications
├── SKILLS.md               # Skill package spec
├── HOOKS.md                # Hook system spec
├── package.json            # Node.js config (minimal, planning phase)
├── docs/
│   ├── research/           # 8 research documents informing architecture
│   │   ├── README.md       # Research index with cross-cutting insights
│   │   ├── tech-stack-best-practices.md  # 1297-line implementation guide
│   │   ├── simplemem-cross-session.md
│   │   ├── letta-deep-dive.md
│   │   ├── letta-patterns-for-engram.md
│   │   ├── pai-daniel-miessler.md
│   │   ├── alma-meta-memory.md
│   │   └── field-observations.md
│   ├── research-2026-02-agent-memory.md  # Feb 2026 research synthesis (14 papers)
│   ├── plans/
│   │   └── 2026-02-11-feat-engram-unified-memory-system-plan.md  # Detailed implementation plan
│   └── diagrams/           # 6 SVG architecture diagrams
└── scripts/                # (empty, will hold migrate.ts and seed.ts)
```

## Planned Structure (Post-Build)
```
engram/
├── convex/                 # Convex backend
│   ├── schema.ts           # 10 table definitions
│   ├── functions/          # CRUD + search (facts, entities, conversations, sessions, agents, scopes, signals, themes, sync)
│   ├── actions/            # Async: embed, compress, synthesize, extract, summarize, importance
│   └── crons/              # Scheduled: decay, forget, compact, consolidate, rerank, rules, cleanup
├── mcp-server/src/         # MCP server
│   ├── index.ts            # Entry point
│   ├── tools/              # 12 MCP tool implementations
│   └── lib/                # convex-client, lance-sync, embeddings
├── skill/                  # OpenClaw skill package
└── scripts/                # migrate.ts, seed.ts
```
