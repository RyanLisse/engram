import { renderMermaid } from 'beautiful-mermaid'
import { writeFileSync, mkdirSync } from 'fs'

mkdirSync('docs/diagrams', { recursive: true })

const diagrams: Record<string, { mermaid: string; theme: string }> = {

  // 1. High-Level Architecture
  'architecture': {
    theme: 'dark',
    mermaid: `
graph TB
    subgraph Cloud["☁️ Convex Cloud"]
        direction TB
        Facts[(Facts)]
        Entities[(Entities)]
        Convos[(Conversations)]
        Sessions[(Sessions)]
        Agents[(Agents)]
        Scopes[(Memory Scopes)]
        SyncLog[(Sync Log)]
        
        subgraph Actions["⚡ Async Actions"]
            Embed["Generate Embeddings"]
            Extract["Extract Entities"]
            Score["Importance Scoring"]
            Summarize["Summarize"]
        end
        
        subgraph Crons["⏰ Scheduled"]
            Decay["Daily: Relevance Decay"]
            Rerank["Weekly: Rerank Importance"]
            GC["Daily: Garbage Collect"]
        end
    end

    subgraph Node1["🖥️ Mac Mini — Orchestrator"]
        MCP1["MCP Server"]
        Lance1["LanceDB Cache"]
    end

    subgraph Node2["💻 MacBook Air — GPU/ML"]
        Agent1["🦁 Indy"]
        MCP2["MCP Server"]
        Lance2["LanceDB Cache"]
    end

    subgraph Node3["💻 MacBook Pro — Coder"]
        Agent2["🔧 Coder Agent"]
        MCP3["MCP Server"]
        Lance3["LanceDB Cache"]
    end

    Agent1 --> MCP2
    Agent2 --> MCP3
    MCP1 <-->|"HTTP API"| Cloud
    MCP2 <-->|"HTTP API"| Cloud
    MCP3 <-->|"HTTP API"| Cloud
    Lance1 <-.->|"5min sync"| SyncLog
    Lance2 <-.->|"5min sync"| SyncLog
    Lance3 <-.->|"5min sync"| SyncLog

    style Cloud fill:#1a1a2e,stroke:#e94560,stroke-width:2px,color:#eee
    style Node1 fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style Node2 fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style Node3 fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#eee
    style Actions fill:#0f3460,stroke:#e94560,stroke-width:1px,color:#eee
    style Crons fill:#0f3460,stroke:#533483,stroke-width:1px,color:#eee
`
  },

  // 2. Data Flow — Store & Recall
  'data-flow': {
    theme: 'dark',
    mermaid: `
sequenceDiagram
    participant A as 🤖 Agent
    participant M as 🔌 MCP Server
    participant C as ☁️ Convex
    participant E as ⚡ Enrichment
    participant L as 💾 LanceDB

    Note over A,L: === STORE FLOW ===
    A->>M: memory_store_fact("Ryan prefers Convex")
    M->>C: mutation: insertFact(raw)
    C-->>M: { factId, ack }
    M-->>A: { factId } ✅ (~50ms)
    
    Note over C,E: Async (agent doesn't wait)
    C->>E: action: generateEmbedding
    E-->>C: [0.23, -0.41, ...]
    C->>E: action: extractEntities
    E-->>C: ["entity-ryan", "entity-convex"]
    C->>E: action: calculateImportance
    E-->>C: 0.72
    C->>C: mutation: updateFact(enriched)
    
    Note over C,L: Background sync
    C->>L: sync: new fact → embed locally

    Note over A,L: === RECALL FLOW ===
    A->>M: memory_recall("What does Ryan prefer?")
    M->>L: vector search (local, <10ms)
    L-->>M: top 5 results
    M->>C: bump accessedCount
    M-->>A: { facts: [...] } ✅ (~50ms)
`
  },

  // 3. Memory Scopes
  'memory-scopes': {
    theme: 'dark',
    mermaid: `
graph TB
    subgraph Global["🌍 Global Scope"]
        direction TB
        GF1["System preferences"]
        GF2["User identity facts"]
        GF3["Tool configurations"]
    end

    subgraph Team["👥 Team Scopes"]
        direction TB
        subgraph ML["team-ml"]
            MLF1["Model benchmarks"]
            MLF2["Training configs"]
        end
        subgraph Dev["team-dev"]
            DevF1["Architecture decisions"]
            DevF2["Code patterns learned"]
        end
    end

    subgraph Project["📁 Project Scopes"]
        direction TB
        subgraph PB["project-briefly"]
            PBF1["API integration notes"]
            PBF2["Bug patterns"]
        end
        subgraph PE["project-engram"]
            PEF1["Schema decisions"]
            PEF2["Performance benchmarks"]
        end
    end

    subgraph Private["🔒 Private Scopes"]
        direction TB
        subgraph Indy["indy-private"]
            IF1["Personal corrections"]
            IF2["Scratchpad notes"]
        end
        subgraph Coder["coder-private"]
            CF1["Build cache paths"]
            CF2["Error workarounds"]
        end
    end

    Indy -->|"read: all"| Global
    Coder -->|"read: all"| Global
    Indy -->|"read+write: members"| ML
    Indy -->|"read+write: members"| PB
    Indy -->|"read+write: members"| PE
    Coder -->|"read+write: members"| Dev
    Coder -->|"read+write: members"| PB

    style Global fill:#1b4332,stroke:#2d6a4f,stroke-width:2px,color:#eee
    style Team fill:#3a0ca3,stroke:#4361ee,stroke-width:2px,color:#eee
    style Project fill:#7b2cbf,stroke:#9d4edd,stroke-width:2px,color:#eee
    style Private fill:#6a040f,stroke:#9d0208,stroke-width:2px,color:#eee
`
  },

  // 4. Importance Scoring
  'importance-scoring': {
    theme: 'dark',
    mermaid: `
graph LR
    subgraph Input["📝 Raw Fact"]
        Fact["'Switched to Convex<br/>for cloud sync'"]
    end

    subgraph Scoring["🧮 Multi-Factor Scoring"]
        direction TB
        C["📄 Content Analysis<br/><b>40% weight</b><br/>Keywords: 'switched' → 0.6"]
        E["🔗 Entity Centrality<br/><b>30% weight</b><br/>2 entities → 0.7"]
        T["⏳ Temporal<br/><b>20% weight</b><br/>Today → 1.0"]
        A["👁️ Access Freq<br/><b>10% weight</b><br/>New → 0.0"]
    end

    subgraph Result["📊 Final Score"]
        Score["<b>importance = 0.58</b><br/>(0.6×0.4)+(0.7×0.3)<br/>+(1.0×0.2)+(0.0×0.1)"]
    end

    subgraph Decay["📉 Over Time"]
        D7["Day 7: 0.58"]
        D30["Day 30: 0.52"]
        D90["Day 90: 0.41"]
        D365["Day 365: 0.15"]
        Floor["Floor: 0.10"]
    end

    Fact --> C
    Fact --> E
    Fact --> T
    Fact --> A
    C --> Score
    E --> Score
    T --> Score
    A --> Score
    Score --> D7 --> D30 --> D90 --> D365 --> Floor

    style Input fill:#264653,stroke:#2a9d8f,stroke-width:2px,color:#eee
    style Scoring fill:#1a1a2e,stroke:#e76f51,stroke-width:2px,color:#eee
    style Result fill:#2a9d8f,stroke:#264653,stroke-width:2px,color:#eee
    style Decay fill:#6a040f,stroke:#9d0208,stroke-width:1px,color:#eee
`
  },

  // 5. Agent Lifecycle
  'agent-lifecycle': {
    theme: 'dark',
    mermaid: `
stateDiagram-v2
    [*] --> Register: Agent starts
    Register --> WarmStart: memory_register_agent
    
    WarmStart --> Active: memory_get_context(topic)
    note right of WarmStart: Load relevant facts,\\nentities, recent sessions
    
    Active --> Storing: memory_store_fact / memory_observe
    Active --> Recalling: memory_recall / memory_search
    Active --> Linking: memory_link_entity
    
    Storing --> Enriching: Async pipeline
    Enriching --> Active: Embedding + entities + score
    
    Recalling --> Active: Return top-K facts
    Linking --> Active: Entity graph updated
    
    Active --> Handoff: Spawn sub-agent
    Handoff --> Active: Conversation handoff recorded
    
    Active --> SessionEnd: Agent session ends
    SessionEnd --> Summary: Auto-summarize session
    Summary --> [*]: Context stored for next warm start
`
  },

  // 6. Enrichment Pipeline
  'enrichment-pipeline': {
    theme: 'dark',
    mermaid: `
graph TD
    subgraph Trigger["🎯 Trigger"]
        Store["memory_store_fact()"]
        Observe["memory_observe()"]
    end

    subgraph Step1["Step 1: Store Raw — <50ms"]
        Raw["Insert raw fact<br/>content + source + tags"]
    end

    subgraph Step2["Step 2: Embed — ~200ms"]
        Emb["OpenAI text-embedding-3-small<br/>1536 dimensions"]
    end

    subgraph Step3["Step 3: Extract — ~500ms"]
        Ent["Entity extraction<br/>GLM-4.5-air (free)"]
    end

    subgraph Step4["Step 4: Score — ~10ms"]
        Imp["Importance calculator<br/>content 40% + centrality 30%<br/>+ temporal 20% + access 10%"]
    end

    subgraph Step5["Step 5: Update"]
        Upd["Update fact with:<br/>• embedding vector<br/>• entity links<br/>• importance score"]
    end

    subgraph Step6["Step 6: Sync Signal"]
        Sync["Mark in sync_log<br/>for all registered nodes"]
    end

    Store --> Raw
    Observe --> Raw
    Raw -->|"async"| Emb
    Emb --> Ent
    Ent --> Imp
    Imp --> Upd
    Upd --> Sync

    style Trigger fill:#264653,stroke:#2a9d8f,stroke-width:2px,color:#eee
    style Step1 fill:#2a9d8f,stroke:#264653,stroke-width:2px,color:#eee
    style Step2 fill:#e9c46a,stroke:#f4a261,stroke-width:2px,color:#222
    style Step3 fill:#f4a261,stroke:#e76f51,stroke-width:2px,color:#222
    style Step4 fill:#e76f51,stroke:#264653,stroke-width:2px,color:#eee
    style Step5 fill:#7b2cbf,stroke:#9d4edd,stroke-width:2px,color:#eee
    style Step6 fill:#3a86a7,stroke:#264653,stroke-width:2px,color:#eee
`
  }
}

async function main() {
  for (const [name, { mermaid, theme }] of Object.entries(diagrams)) {
    console.log(`Rendering ${name}...`)
    try {
      const svg = await renderMermaid(mermaid, { theme })
      writeFileSync(`docs/diagrams/${name}.svg`, svg)
      console.log(`  ✅ docs/diagrams/${name}.svg`)
    } catch (err) {
      console.error(`  ❌ ${name}: ${err}`)
    }
  }
  console.log('\nDone!')
}

main()
