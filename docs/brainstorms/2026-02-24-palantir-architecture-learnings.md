# Palantir Architecture Center — Learnings for Engram

**Date:** 2026-02-24
**Sources:**
- [Interoperability](https://www.palantir.com/docs/foundry/architecture-center/interoperability)
- [Multimodal Data Plane](https://www.palantir.com/docs/foundry/architecture-center/multimodal-data-plane/)
- [Ontology System](https://www.palantir.com/docs/foundry/architecture-center/ontology-system/)

---

## Executive Summary

Palantir's Foundry architecture centers on three pillars: an **Ontology** (semantic knowledge graph that models decisions, not just data), a **Multimodal Data Plane** (federated access to any data format without duplication), and **Interoperability** (open standards, REST APIs, bidirectional sync). Engram already shares several patterns but has gaps in action writeback, decision graph formalization, and federated data access.

---

## 1. Ontology System — "Decisions, Not Just Data"

### What Palantir Does

The Ontology is a four-fold integration:
- **Data**: Unified semantic objects from fragmented sources (ERPs, CRMs, sensors, docs)
- **Logic**: Modular computation (business rules, ML models, LLM functions, multi-step orchestrations)
- **Action**: Full range of writebacks — simple transactions to complex multi-step updates to operational systems
- **Security**: Row/column-level restrictions, granular per-user scopes

The system creates **read-write loops** where data integrations build a "full-fidelity representation of the operational world, shared by humans and AI-enabled agents." Logic connects to actions within **decision graphs** that link fragmented processes.

Three components: **Language** (schema), **Engine** (read/write at scale), **Toolchain** (OSDK + DevOps).

### What Engram Can Learn

| Palantir Concept | Engram Current State | Gap | Implementation |
|---|---|---|---|
| Decision graphs | `decision` factType exists but flat | No causal links between decisions | Add `temporalLinks` with `caused_by`/`led_to` relations between decision facts |
| Read-write loops | Signals + feedback exist | No formalized loop from outcome → updated decision | `record_feedback` → automatically boost/decay related decisions |
| Four-fold integration | Data ✓ Logic ✓ Security ✓ Action ✗ | No writeback to external systems | Action primitives: webhook dispatch, external API calls triggered by memory events |
| Semantic objects | Entities exist with relationships | Entity types are flat strings | Typed entity schemas with required/optional properties per type |
| Ontology SDK (OSDK) | MCP tools are the "SDK" | No typed client libraries | Generate TypeScript types from tool-registry for external consumers |

### Implementable Now (Low Effort)

**1a. Decision Graph Links** — Leverage existing `temporalLinks` field on facts:
```typescript
// When storing a new decision, link it to the decision it supersedes
store_fact({
  content: "Use RRF fusion instead of simple merge",
  factType: "decision",
  temporalLinks: [{
    targetFactId: "previous-decision-id",
    relation: "supersedes",
    confidence: 0.9
  }]
});
```
The field already exists in schema but is never populated by enrichment. Add a step to the enrichment pipeline that detects `decision` facts and searches for related prior decisions to auto-link.

**1b. Feedback → Decision Decay Loop** — When `record_feedback` marks a recall as unhelpful, automatically reduce `importanceScore` on the underlying decision facts. When helpful, boost them. This creates the read-write loop Palantir describes.

---

## 2. Multimodal Data Plane — "Any Data, Any Compute, Anywhere"

### What Palantir Does

- **Virtual tables**: Register external data (Snowflake, Databricks, BigQuery) without duplication
- **Multi-runtime compute**: Spark, Flink, DataFusion, Polars, DuckDB — all on hardened Kubernetes
- **South of Ontology**: Raw data → semantic layer (enrichment)
- **North of Ontology**: Semantic layer → applications (retrieval)
- **Apache Iceberg**: Open table format for interop with standard SQL tools
- **Model Catalog**: Vendor models + custom models with governance controls (token limits)

### What Engram Can Learn

| Palantir Concept | Engram Current State | Gap | Implementation |
|---|---|---|---|
| South/North of Ontology | Enrichment pipeline (south) + context primitives (north) | Not explicitly separated or named | Formalize: "ingestion tier" (store → enrich) and "retrieval tier" (recall → context) |
| Virtual tables | All data must be in Convex | Can't query external memory stores | Virtual scope: register an external URL/API as a read-only scope |
| Model catalog | Hardcoded Cohere Embed 4 | Can't swap embedding models | `system_config` entry for embedding model; support multiple providers |
| Model governance | No token tracking | No per-agent token budgets | Track embedding API calls per agent in `agent_performance` |
| Multi-format support | Text only (content field) | No images, audio, structured data | `factFormat` field: text/json/image-url/code with format-specific enrichment |
| Lazy metadata | All enrichment runs immediately | Can't defer expensive enrichment | Priority queue for enrichment: critical facts first, background deferred |

### Implementable Now (Low Effort)

**2a. Embedding Model Abstraction** — The `embeddings.ts` client already centralizes Cohere calls. Add a `system_config` key `embedding.provider` with values `cohere-v4`, `openai-3-large`, `local-nomic`. Route in `embeddings.ts` based on config. This lets agents experiment with different models without code changes.

**2b. Fact Format Field** — Add optional `factFormat: string` to facts schema (already has many optional fields). Values: `text` (default), `json`, `code`, `url`. The enrichment pipeline can then skip embedding for `json` facts and use code-specific chunking for `code` facts.

**2c. Enrichment Priority Queue** — Currently all facts get enriched in FIFO order. Add `enrichmentPriority` to `system_config`: `critical` (importance > 0.8) runs immediately, `normal` runs within 5min, `background` runs within 30min. Uses existing cron infrastructure.

---

## 3. Interoperability — Open Standards & Bidirectional Sync

### What Palantir Does

- **Open formats**: CSV, Iceberg, Parquet — data stored in original format
- **Standard interfaces**: REST, JDBC, S3-compatible access
- **Metadata services**: Expose metadata across projects, datasets, ontology elements, agents
- **Semantic layer as API**: Ontology objects accessible through REST APIs with JSON-driven authoring
- **Webhooks**: Bidirectional sync with external systems
- **Code integration**: Open languages (Python, Java, SparkSQL) with open runtimes
- **Auth interop**: SAML, Active Directory, role-based + classification-based permissions

### What Engram Can Learn

| Palantir Concept | Engram Current State | Gap | Implementation |
|---|---|---|---|
| REST API surface | MCP stdio only (+ optional SSE) | No REST API for non-MCP clients | HTTP REST wrapper around tool-registry |
| Metadata services | `list_capabilities` exists | No machine-readable schema export | JSON Schema export from Zod schemas |
| Webhook writeback | Event bus is internal only | Can't push to external systems | Webhook subscription: POST to URL on matching events |
| Open format export | Vault sync (markdown) | Only markdown export | Add JSON-lines export, CSV export for facts |
| Multi-auth | Single agent ID per server | No auth federation | Agent token validation for multi-tenant deployment |
| Bidirectional sync | Vault sync is Convex→local | Can import but no real-time bidirectional | Webhook-based ingest from external systems |

### Implementable Now (Low Effort)

**3a. Webhook Subscriptions** — Extend existing `subscribe` tool to support `webhookUrl` parameter. When an event matches a subscription, POST the event payload to the URL. The event bus already dispatches events; adding an HTTP POST is minimal.

```typescript
// Agent subscribes to get webhooks when decisions are stored
memory_subscribe({
  eventTypes: ["fact_stored"],
  filter: { factType: "decision" },
  webhookUrl: "https://my-app.com/hooks/engram"
});
```

**3b. REST API Wrapper** — The SSE server already runs HTTP. Add REST routes that map 1:1 to MCP tools:
- `GET /api/v1/facts?query=...` → `memory_recall`
- `POST /api/v1/facts` → `memory_store_fact`
- `GET /api/v1/health` → `memory_health`

This opens Engram to non-MCP consumers (web apps, mobile, CI/CD pipelines).

**3c. JSON Schema Export** — Add a `GET /api/v1/schema` endpoint that serializes all Zod schemas from tool-registry into JSON Schema format. This enables external tools to auto-generate clients.

---

## 4. Cross-Cutting Patterns

### Pattern: "Ontology-Driven Actions"

Palantir's most powerful pattern is that the Ontology isn't just a read layer — it drives **actions**. In Engram terms:

- When a `decision` fact is stored, it could trigger an **action** (create a GitHub issue, send a Slack message, update a config file)
- When a `contradiction` is detected, it could trigger a **resolution workflow** (notify the agent, create a task)
- When `importance_score` drops below threshold, it could trigger **archival** (already done by crons, but could be event-driven)

**Implementation:** Add an `action_rules` table or config entries that map `(eventType, factType, conditions) → action`. Actions: `webhook`, `store_fact`, `notify`, `archive`. This is the missing "Action" in Engram's four-fold integration.

### Pattern: "Security Scopes as First-Class Objects"

Palantir treats security as deeply integrated, not bolted on. Engram's scopes are good but could be richer:
- **Column-level restrictions**: Hide `emotionalContext` field from certain agents
- **Purpose-based access**: "This agent can read decisions but not observations"
- **Temporal access**: "Read access expires after 7 days"

### Pattern: "Compute Pushdown"

Palantir pushes computation to where the data lives. Engram currently pulls all data to the MCP server for processing. For large fact sets, this is inefficient. Convex actions already run server-side — expose more computation as Convex actions rather than client-side MCP tool logic.

---

## 5. Implementation Priority Matrix

| Feature | Effort | Impact | Priority |
|---|---|---|---|
| Decision graph links (1a) | Low | Medium | P2 |
| Feedback → decision decay loop (1b) | Low | High | P1 |
| Embedding model abstraction (2a) | Medium | High | P1 |
| Fact format field (2b) | Low | Medium | P2 |
| Enrichment priority queue (2c) | Medium | Medium | P3 |
| Webhook subscriptions (3a) | Medium | High | P1 |
| REST API wrapper (3b) | Medium | High | P2 |
| JSON Schema export (3c) | Low | Medium | P3 |
| Action rules engine (4) | High | Very High | P1 (design phase) |
| Column-level scope restrictions | High | Medium | P3 |

### Recommended Implementation Order

1. **Feedback → decision decay loop** (P1, low effort, high impact) — closes the read-write loop
2. **Webhook subscriptions** (P1, medium effort, high impact) — opens action tier
3. **Embedding model abstraction** (P1, medium effort, high impact) — future-proofs retrieval
4. **Action rules engine** (P1, design first) — the "big bet" from Palantir's architecture
5. **Decision graph links** (P2) — leverages existing schema fields
6. **REST API wrapper** (P2) — opens Engram to non-MCP consumers

---

## 6. Key Takeaway

Palantir's biggest insight is that **a knowledge system isn't just storage + retrieval — it's storage + retrieval + ACTION**. Engram excels at storage and retrieval but is missing the action tier. The path forward is:

1. Close the feedback loop (signals → fact updates)
2. Open the action tier (events → webhooks → external systems)
3. Formalize the ontology (typed entities, decision graphs, causal links)

This transforms Engram from a "memory layer" into a "decision engine" — which is exactly what Palantir's Ontology is.
